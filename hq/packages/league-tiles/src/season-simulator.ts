
import type { PlayoffFormat, StandingRow } from "./contract.ts";
import { lastScoredWeek, matchupPoints, seedPlayoffs, standings, type SleeperLeagueSnapshot } from "./sleeper-adapter.ts";

export interface SimulatorRow {
  readonly rosterId: number;
  readonly teamName: string;
  readonly managerName: string;
  readonly avatarUrl: string | null;
  readonly division: string | null;
  readonly record: string;
  readonly pointsFor: number;
  readonly averageScore: number | null;
  readonly projectedWins: number;
  readonly projectedLosses: number;
  readonly playoffPct: number;
  readonly byePct: number;
  readonly divisionPct: number | null;
  readonly titlePct: number;
}

export interface SimulatorResult {
  readonly throughWeek: number;
  readonly regularSeasonWeeks: number;
  readonly remainingGames: number;
  readonly simulations: number;
  readonly playoffSpots: number;
  readonly hasDivisions: boolean;
  readonly rows: readonly SimulatorRow[];
}

/** Small seeded PRNG (mulberry32) + Box–Muller normal draws. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { normal: (mu: number, sd: number) => { const u = Math.max(next(), 1e-12), v = next(); return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); } };
}

const PRIOR_GAMES = 3;
const MIN_SD = 15;

/** Each team's points per scored week, weeks 1..through. */
export function scoringHistory(snapshot: SleeperLeagueSnapshot, through: number): Map<number, number[]> {
  const scores = new Map<number, number[]>();
  for (let week = 1; week <= through; week += 1) {
    for (const row of snapshot.matchupsByWeek[week] ?? []) {
      const points = matchupPoints(row);
      if (points > 0) scores.set(row.roster_id, [...(scores.get(row.roster_id) ?? []), points]);
    }
  }
  return scores;
}

/**
 * The per-game model the Predictor uses: a team's expected score is its average so far, pulled toward the league
 * average by three "prior" games; every game score varies with the league-wide spread (at least 15 points).
 */
export function scoringModel(snapshot: SleeperLeagueSnapshot, through: number, rosterIds: readonly number[]): { readonly mu: Map<number, number>; readonly leagueMean: number; readonly leagueSd: number } {
  const scores = scoringHistory(snapshot, through);
  const all = [...scores.values()].flat();
  const leagueMean = all.length ? all.reduce((t, x) => t + x, 0) / all.length : 110;
  const leagueSd = all.length > 1 ? Math.max(MIN_SD, Math.sqrt(all.reduce((t, x) => t + (x - leagueMean) ** 2, 0) / (all.length - 1))) : 25;
  const mu = new Map(rosterIds.map((id) => { const s = scores.get(id) ?? []; return [id, (s.reduce((t, x) => t + x, 0) + PRIOR_GAMES * leagueMean) / (s.length + PRIOR_GAMES)]; }));
  return { mu, leagueMean, leagueSd };
}

/** P(team A outscores team B) under that model: both scores normal with the same spread. */
export function gameWinProbability(muA: number, muB: number, sd: number): number {
  const z = (muA - muB) / (sd * Math.SQRT2);
  // Normal CDF via erf (Abramowitz–Stegun 7.1.26).
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

export function simulateSeason(snapshot: SleeperLeagueSnapshot, format: PlayoffFormat, options: { readonly simulations?: number; readonly seed?: number } = {}): SimulatorResult | null {
  const table = standings(snapshot);
  if (table.length < 4) return null;
  const settings = (snapshot.league.settings ?? {}) as Record<string, unknown>;
  const playoffStart = Number(settings.playoff_week_start) || 15;
  const regularWeeks = playoffStart - 1;
  const through = Math.min(lastScoredWeek(snapshot.league), regularWeeks);
  const sims = options.simulations ?? 10_000;

  // Scoring so far (shared with the matchup previews, so their win odds match the Predictor).
  const { mu, leagueMean, leagueSd } = scoringModel(snapshot, through, table.map((row) => row.team.rosterId));
  const scores = scoringHistory(snapshot, through);

  // Remaining regular-season games from Sleeper's schedule (the in-progress week is replayed in full).
  const games: [number, number][] = [];
  for (let week = through + 1; week <= regularWeeks; week += 1) {
    const byMatchup = new Map<number, number[]>();
    for (const row of snapshot.matchupsByWeek[week] ?? []) if (row.matchup_id) byMatchup.set(row.matchup_id, [...(byMatchup.get(row.matchup_id) ?? []), row.roster_id]);
    for (const pair of byMatchup.values()) if (pair.length === 2) games.push([pair[0]!, pair[1]!]);
  }
  // Records only count finished weeks: rebuild them from scored weeks so a live week is not double counted.
  const base = new Map(table.map((row) => [row.team.rosterId, { wins: 0, losses: 0, ties: 0, pf: 0 }]));
  for (let week = 1; week <= through; week += 1) {
    const byMatchup = new Map<number, { id: number; pts: number }[]>();
    for (const row of snapshot.matchupsByWeek[week] ?? []) if (row.matchup_id) byMatchup.set(row.matchup_id, [...(byMatchup.get(row.matchup_id) ?? []), { id: row.roster_id, pts: matchupPoints(row) }]);
    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair as [{ id: number; pts: number }, { id: number; pts: number }];
      const ra = base.get(a.id), rb = base.get(b.id);
      if (!ra || !rb) continue;
      ra.pf += a.pts; rb.pf += b.pts;
      if (a.pts > b.pts) { ra.wins += 1; rb.losses += 1; } else if (b.pts > a.pts) { rb.wins += 1; ra.losses += 1; } else { ra.ties += 1; rb.ties += 1; }
    }
  }
  const hasScoredRecords = [...base.values()].some((r) => r.wins + r.losses + r.ties > 0);

  const random = rng(options.seed ?? (through * 7919 + table.length));
  const tally = new Map(table.map((row) => [row.team.rosterId, { wins: 0, playoff: 0, bye: 0, division: 0, title: 0 }]));
  const rowsById = new Map(table.map((row) => [row.team.rosterId, row]));
  const draw = (id: number) => Math.max(0, random.normal(mu.get(id) ?? leagueMean, leagueSd));

  for (let i = 0; i < sims; i += 1) {
    const rec = new Map([...base].map(([id, r]) => [id, hasScoredRecords ? { ...r } : (() => { const t = rowsById.get(id)!; return { wins: t.wins, losses: t.losses, ties: t.ties, pf: t.pointsFor }; })()]));
    for (const [a, b] of games) {
      const sa = draw(a), sb = draw(b), ra = rec.get(a), rb = rec.get(b);
      if (!ra || !rb) continue;
      ra.pf += sa; rb.pf += sb;
      if (sa >= sb) { ra.wins += 1; rb.losses += 1; } else { rb.wins += 1; ra.losses += 1; }
    }
    const simTable = [...rec].map(([id, r]) => ({ ...rowsById.get(id)!, wins: r.wins, losses: r.losses, ties: r.ties, pointsFor: r.pf }));
    const seeded: readonly StandingRow[] = seedPlayoffs(simTable, format);
    const field = seeded.filter((row) => row.status === "IN").map((row) => row.team.rosterId);
    for (const [id, r] of rec) tally.get(id)!.wins += r.wins;
    field.forEach((id, idx) => { const t = tally.get(id)!; t.playoff += 1; if (idx < 2) t.bye += 1; });
    for (const row of seeded) if (row.seedReason === "DIVISION") tally.get(row.team.rosterId)!.division += 1;
    // Bracket: 3v6, 4v5; 1 v (4/5), 2 v (3/6); final.
    if (field.length >= 6) {
      const play = (a: number, b: number) => (draw(a) >= draw(b) ? a : b);
      const w45 = play(field[3]!, field[4]!), w36 = play(field[2]!, field[5]!);
      const champ = play(play(field[0]!, w45), play(field[1]!, w36));
      tally.get(champ)!.title += 1;
    } else if (field.length) {
      tally.get(field.reduce((best, id) => ((mu.get(id) ?? 0) > (mu.get(best) ?? 0) ? id : best)))!.title += 1;
    }
  }

  const pct = (n: number) => Math.round((n / sims) * 1000) / 10;
  const hasDivisions = format.divisionWinners > 0 && table.some((row) => row.division);
  const rows: SimulatorRow[] = table.map((row) => {
    const id = row.team.rosterId, t = tally.get(id)!, r = hasScoredRecords ? base.get(id)! : { wins: row.wins, losses: row.losses, ties: row.ties, pf: row.pointsFor };
    const s = scores.get(id) ?? [];
    const projectedWins = Math.round((t.wins / sims) * 10) / 10;
    return {
      rosterId: id, teamName: row.team.teamName, managerName: row.team.managerName, avatarUrl: row.team.avatarUrl ?? null, division: row.division ?? null,
      record: `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`, pointsFor: Math.round(r.pf * 100) / 100,
      averageScore: s.length ? Math.round((s.reduce((x, y) => x + y, 0) / s.length) * 10) / 10 : null,
      projectedWins, projectedLosses: Math.round((regularWeeks - projectedWins - r.ties) * 10) / 10,
      playoffPct: pct(t.playoff), byePct: pct(t.bye), divisionPct: hasDivisions ? pct(t.division) : null, titlePct: pct(t.title),
    };
  }).sort((a, b) => b.playoffPct - a.playoffPct || b.titlePct - a.titlePct || b.projectedWins - a.projectedWins);
  return { throughWeek: through, regularSeasonWeeks: regularWeeks, remainingGames: games.length, simulations: sims, playoffSpots: format.divisionWinners + format.recordSeeds + format.pointsSeeds, hasDivisions, rows };
}
