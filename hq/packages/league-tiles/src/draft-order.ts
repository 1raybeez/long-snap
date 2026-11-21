
import type { StandingRow, TeamRef } from "./contract.ts";

export interface DraftOrderRule { readonly nonPlayoff: "maxPf" | "pointsFor" | "standings" }
export interface TradedPickLike { readonly season: string | number; readonly round: number; readonly roster_id: number; readonly owner_id: number }

export interface DraftOrderSlot {
  readonly slot: number;
  readonly team: TeamRef;
  readonly record: string;
  readonly basis: string;
  readonly picks: readonly { readonly round: number; readonly label: string; readonly owner: TeamRef; readonly traded: boolean }[];
}
/** Sleeper's winners bracket rows: round, teams, winner/loser, and `p` on placement games (1 = final, 3 = 3rd place, 5 = 5th place). */
export interface BracketMatch { readonly r: number; readonly m?: number; readonly t1?: number | null; readonly t2?: number | null; readonly w?: number | null; readonly l?: number | null; readonly p?: number | null }

export function playoffFinish(bracket: readonly BracketMatch[]): Map<number, { place: number | null; lostRound: number | null }> {
  const out = new Map<number, { place: number | null; lostRound: number | null }>();
  const teams = new Set(bracket.flatMap((m) => [m.t1, m.t2]).filter((t): t is number => typeof t === "number"));
  for (const t of teams) out.set(t, { place: null, lostRound: null });
  for (const m of bracket) {
    if (!m.w || !m.l) continue;
    if (m.p) { out.set(m.w, { place: m.p, lostRound: out.get(m.w)?.lostRound ?? null }); out.set(m.l, { place: m.p + 1, lostRound: out.get(m.l)?.lostRound ?? m.r }); }
    else if (!out.get(m.l)?.lostRound) out.set(m.l, { place: out.get(m.l)?.place ?? null, lostRound: m.r });
  }
  return out;
}

export interface DraftOrderModel { readonly season: number; readonly throughWeek: number; readonly rounds: number; readonly rule: DraftOrderRule; readonly slots: readonly DraftOrderSlot[] }

const rec = (r: StandingRow) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`;

export function projectDraftOrder(input: {
  rows: readonly StandingRow[];
  playoffSpots: number;
  rule: DraftOrderRule;
  maxPfByRoster: ReadonlyMap<number, number>;
  tradedPicks: readonly TradedPickLike[];
  draftSeason: number;
  rounds: number;
  throughWeek: number;
  /** Sleeper winners bracket; once games are played, playoff teams pick by finish instead of seed. */
  bracket?: readonly BracketMatch[] | null;
}): DraftOrderModel {
  const seeded = [...input.rows].sort((a, b) => a.rank - b.rank);
  const playoff = seeded.slice(0, input.playoffSpots);
  const out = seeded.slice(input.playoffSpots);
  const maxPf = (r: StandingRow) => input.maxPfByRoster.get(r.team.rosterId) ?? 0;
  const outOrder = input.rule.nonPlayoff === "maxPf" ? [...out].sort((a, b) => maxPf(a) - maxPf(b)) : input.rule.nonPlayoff === "pointsFor" ? [...out].sort((a, b) => a.pointsFor - b.pointsFor) : [...out].reverse();
  const n = seeded.length;
  const teams = new Map(seeded.map((r) => [r.team.rosterId, r.team] as const));
  const owner = (round: number, original: number) => {
    const moved = input.tradedPicks.find((p) => Number(p.season) === input.draftSeason && p.round === round && p.roster_id === original);
    return moved ? moved.owner_id : original;
  };
  const build = (r: StandingRow, slot: number, basis: string): DraftOrderSlot => ({
    slot, team: r.team, record: rec(r), basis,
    picks: Array.from({ length: input.rounds }, (_, i) => {
      const round = i + 1;
      const o = owner(round, r.team.rosterId);
      return { round, label: `${round}.${String(slot).padStart(2, "0")}`, owner: teams.get(o) ?? r.team, traded: o !== r.team.rosterId };
    }),
  });
  // Playoff teams: by finish once the bracket has results (worst finish picks first, champion last), else by seed.
  const finish = input.bracket?.some((m) => m.w) ? playoffFinish(input.bracket) : null;
  const playoffOrder = finish
    ? [...playoff].sort((a, b) => {
        const fa = finish.get(a.team.rosterId), fb = finish.get(b.team.rosterId);
        const key = (f: typeof fa, r: StandingRow) => (f?.place ? 1000 - f.place : f?.lostRound ? 100 + f.lostRound : 500 + (playoff.length - r.rank));
        return key(fa, a) - key(fb, b);
      })
    : [...playoff].reverse();
  const playoffBasis = (r: StandingRow) => {
    if (!finish) return `Playoff seed ${r.rank} (set by playoff finish)`;
    const f = finish.get(r.team.rosterId);
    return f?.place ? `Playoff finish: ${f.place === 1 ? "champion" : ordinal(f.place)}` : f?.lostRound ? `Out in playoff round ${f.lostRound} · seed ${r.rank}` : `Still alive · seed ${r.rank}`;
  };
  const slots = [
    ...outOrder.map((r, i) => build(r, i + 1, input.rule.nonPlayoff === "maxPf" ? `Missed playoffs · Max PF ${maxPf(r).toFixed(2)}` : input.rule.nonPlayoff === "pointsFor" ? `Missed playoffs · ${r.pointsFor.toFixed(2)} PF` : `Missed playoffs · ${ordinal(r.rank)} place`)),
    ...playoffOrder.map((r, i) => build(r, out.length + i + 1, playoffBasis(r))),
  ];
  return { season: input.draftSeason, throughWeek: input.throughWeek, rounds: input.rounds, rule: input.rule, slots: slots.slice(0, n) };
}

function ordinal(n: number) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/** Builds the model from a league snapshot, its standings rows and Sleeper's traded picks. */
export function draftOrderFromSnapshot(input: {
  snapshot: { league: { season?: string | number | null; settings?: Record<string, unknown> | null }; rosters: readonly { roster_id: number; settings?: Record<string, unknown> | null }[] };
  rows: readonly StandingRow[];
  playoffSpots: number;
  throughWeek: number;
  rule: DraftOrderRule;
  tradedPicks: readonly TradedPickLike[];
  bracket?: readonly BracketMatch[] | null;
}): DraftOrderModel {
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const maxPf = new Map(input.snapshot.rosters.map((r) => [r.roster_id, n(r.settings?.ppts) + n(r.settings?.ppts_decimal) / 100] as const));
  return projectDraftOrder({
    rows: input.rows, playoffSpots: input.playoffSpots, rule: input.rule, maxPfByRoster: maxPf, tradedPicks: input.tradedPicks,
    draftSeason: n(input.snapshot.league.season) + 1, rounds: n(input.snapshot.league.settings?.draft_rounds) || 4, throughWeek: input.throughWeek, bracket: input.bracket ?? null,
  });
}

/**
 * The trending picks for teams that miss the playoffs (picks 1..N), as a standings column: "Pick 1" with the reason
 * (e.g. "Max PF 1052.16"). Playoff teams get no entry; their picks wait for the playoffs.
 */
export function draftColumnFromOrder(model: DraftOrderModel | null, playoffSpots: number, link?: { label: string; href: string } | null): { label: string; note: string; byRoster: Record<number, { pick: string; detail: string }>; link: { label: string; href: string } | null } | null {
  if (!model) return null;
  const nonPlayoff = model.slots.length - playoffSpots;
  if (nonPlayoff <= 0) return null;
  const byRoster: Record<number, { pick: string; detail: string }> = {};
  for (const s of model.slots.slice(0, nonPlayoff)) byRoster[s.team.rosterId] = { pick: `Pick ${s.slot}`, detail: s.basis.replace(/^Missed playoffs · /, "") };
  const how = model.rule.nonPlayoff === "maxPf" ? "Max PF, lowest first" : model.rule.nonPlayoff === "pointsFor" ? "points for, lowest first" : "regular-season finish";
  return { label: `${model.season} pick`, note: `${model.season} rookie draft, if the season ended today: the ${nonPlayoff} teams below the cut pick 1–${nonPlayoff} by ${how}.`, byRoster, link: link ?? null };
}
