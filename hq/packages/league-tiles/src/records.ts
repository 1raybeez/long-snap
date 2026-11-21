
import type { HistorySeasonResult } from "./league-history.ts";
import type { MeetingStage, RivalryMeeting } from "./rivalries.ts";
import { lastScoredWeek, matchupPoints, type SleeperLeagueSnapshot } from "./sleeper-adapter.ts";

export interface RecordEntry {
  /** The side(s) the record belongs to (owners or franchises, as the league's games compare). */
  readonly sideIds: readonly string[];
  /** Opponent side for game records. */
  readonly opponentId?: string | null;
  readonly value: number;
  readonly display: string;
  readonly season: number | null;
  readonly week: number | null;
  /** Short context, e.g. "beat X 182.40–90.12" is built in the view; this is extra text like "2019 Wk 5 – 2020 Wk 2". */
  readonly detail?: string | null;
  readonly stage?: MeetingStage | null;
  readonly score?: { readonly for: number; readonly against: number } | null;
  readonly active?: boolean;
}

export interface RecordBoard {
  readonly key: string;
  readonly title: string;
  readonly note?: string | null;
  readonly kind: "game" | "season" | "streak" | "career";
  readonly entries: readonly RecordEntry[];
}

export interface RecordSection {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly boards: readonly RecordBoard[];
}

export interface RecordsModel {
  readonly sections: readonly RecordSection[];
  readonly gameSeasons: readonly [number, number] | null;
  readonly resultSeasons: readonly [number, number] | null;
  readonly gamesCounted: number;
}

export interface RecordsInput {
  readonly games: readonly RivalryMeeting[];
  readonly results: readonly HistorySeasonResult[];
  /** The season in progress: its games count for game records and active streaks, not season records. */
  readonly currentSeason: number;
  /** Playoff spots per season, for "playoff appearances" (omit to skip that board). */
  readonly playoffSpots?: number | null;
  /** Entries per board (default 5). */
  readonly limit?: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const pts = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Sort and keep the top `limit`, plus anything tied with the last kept value. */
function top<T extends { value: number }>(rows: T[], limit: number, ascending = false): T[] {
  const sorted = [...rows].sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
  if (sorted.length <= limit) return sorted;
  const cutoff = sorted[limit - 1]!.value;
  return sorted.filter((row, i) => i < limit || row.value === cutoff).slice(0, limit + 3);
}

const isPlayed = (g: RivalryMeeting) => Number.isFinite(g.scoreA) && Number.isFinite(g.scoreB) && g.scoreA + g.scoreB > 0;

interface SideGame { readonly side: string; readonly opp: string; readonly for: number; readonly against: number; readonly season: number; readonly week: number | null; readonly stage: MeetingStage }
function sideGames(games: readonly RivalryMeeting[]): SideGame[] {
  return games.flatMap((g) => [
    { side: g.sideA, opp: g.sideB, for: g.scoreA, against: g.scoreB, season: g.season, week: g.week, stage: g.stage },
    { side: g.sideB, opp: g.sideA, for: g.scoreB, against: g.scoreA, season: g.season, week: g.week, stage: g.stage },
  ]);
}
const chrono = (a: { season: number; week: number | null }, b: { season: number; week: number | null }) => a.season - b.season || (a.week ?? 0) - (b.week ?? 0);
const wk = (season: number, week: number | null) => `${season}${week ? ` Wk ${week}` : ""}`;

export function buildRecords(input: RecordsInput): RecordsModel {
  const limit = input.limit ?? 5;
  const games = input.games.filter(isPlayed);
  const all = sideGames(games);
  const regular = all.filter((g) => g.stage === "regular");
  const completedRegular = regular.filter((g) => g.season < input.currentSeason);

  // ---- Single game ----
  const gameEntry = (g: SideGame, value: number, display: string): RecordEntry => ({ sideIds: [g.side], opponentId: g.opp, value: r2(value), display, season: g.season, week: g.week, stage: g.stage, score: { for: g.for, against: g.against } });
  const winners = games.map((g) => (g.scoreA >= g.scoreB ? { side: g.sideA, opp: g.sideB, for: g.scoreA, against: g.scoreB } : { side: g.sideB, opp: g.sideA, for: g.scoreB, against: g.scoreA }));
  const winnerGames: SideGame[] = games.map((g, i) => ({ ...winners[i]!, season: g.season, week: g.week, stage: g.stage }));
  const gameBoards: RecordBoard[] = [
    { key: "high-score", title: "Highest score", kind: "game", entries: top(all.map((g) => gameEntry(g, g.for, pts(g.for))), limit) },
    { key: "low-score", title: "Lowest score", kind: "game", entries: top(all.filter((g) => g.for > 0).map((g) => gameEntry(g, g.for, pts(g.for))), limit, true) },
    { key: "blowout", title: "Biggest blowout", kind: "game", note: "Winning margin", entries: top(winnerGames.map((g) => gameEntry(g, g.for - g.against, `+${pts(g.for - g.against)}`)), limit) },
    { key: "closest", title: "Closest game", kind: "game", note: "Winning margin", entries: top(winnerGames.filter((g) => g.for !== g.against).map((g) => gameEntry(g, g.for - g.against, `+${pts(g.for - g.against)}`)), limit, true) },
    { key: "combined", title: "Most combined points", kind: "game", entries: top(winnerGames.map((g) => gameEntry(g, g.for + g.against, pts(g.for + g.against))), limit) },
    { key: "high-loss", title: "Highest score in a loss", kind: "game", note: "Bad luck", entries: top(all.filter((g) => g.for < g.against).map((g) => gameEntry(g, g.for, pts(g.for))), limit) },
    { key: "low-win", title: "Lowest score in a win", kind: "game", note: "Good luck", entries: top(all.filter((g) => g.for > g.against && g.for > 0).map((g) => gameEntry(g, g.for, pts(g.for))), limit, true) },
  ];

  // ---- Single season (regular season, completed seasons) ----
  const seasonKey = (g: SideGame) => `${g.season}|${g.side}`;
  const seasons = new Map<string, { side: string; season: number; w: number; l: number; t: number; pf: number; pa: number; n: number }>();
  for (const g of completedRegular) {
    const s = seasons.get(seasonKey(g)) ?? { side: g.side, season: g.season, w: 0, l: 0, t: 0, pf: 0, pa: 0, n: 0 };
    s.n += 1; s.pf += g.for; s.pa += g.against;
    if (g.for > g.against) s.w += 1; else if (g.for < g.against) s.l += 1; else s.t += 1;
    seasons.set(seasonKey(g), s);
  }
  const seasonRows = [...seasons.values()].filter((s) => s.n >= 6);
  const rec = (s: { w: number; l: number; t: number }) => `${s.w}-${s.l}${s.t ? `-${s.t}` : ""}`;
  const sEntry = (s: (typeof seasonRows)[number], value: number, display: string): RecordEntry => ({ sideIds: [s.side], value: r2(value), display, season: s.season, week: null, detail: `${rec(s)} · ${pts(s.pf)} PF` });
  const winPct = (s: { w: number; l: number; t: number }) => (s.w + s.t / 2) / Math.max(1, s.w + s.l + s.t);
  const seasonBoards: RecordBoard[] = [
    { key: "season-points", title: "Most points in a season", kind: "season", entries: top(seasonRows.map((s) => sEntry(s, s.pf, pts(s.pf))), limit) },
    { key: "season-fewest", title: "Fewest points in a season", kind: "season", entries: top(seasonRows.map((s) => sEntry(s, s.pf, pts(s.pf))), limit, true) },
    { key: "season-best", title: "Best record", kind: "season", note: "Win %, then points", entries: top(seasonRows.map((s) => sEntry(s, winPct(s) * 1e6 + s.pf / 1e3, rec(s))), limit) },
    { key: "season-worst", title: "Worst record", kind: "season", note: "Win %, then points", entries: top(seasonRows.map((s) => sEntry(s, winPct(s) * 1e6 + s.pf / 1e3, rec(s))), limit, true) },
    { key: "season-average", title: "Best scoring average", kind: "season", note: "Points per game", entries: top(seasonRows.map((s) => sEntry(s, s.pf / s.n, pts(s.pf / s.n))), limit) },
    { key: "season-against", title: "Most points against", kind: "season", note: "Toughest schedule", entries: top(seasonRows.map((s) => sEntry(s, s.pa, pts(s.pa))), limit) },
  ];

  // ---- Streaks (regular season, across seasons, current season included) ----
  const bySide = new Map<string, SideGame[]>();
  for (const g of regular) bySide.set(g.side, [...(bySide.get(g.side) ?? []), g]);
  const streaks = (want: "W" | "L"): RecordEntry[] => {
    const out: RecordEntry[] = [];
    for (const [side, list] of bySide) {
      const ordered = [...list].sort(chrono);
      let run: SideGame[] = [];
      const flush = () => {
        if (run.length >= 3) {
          const first = run[0]!, last = run[run.length - 1]!;
          const sideLast = ordered[ordered.length - 1]!;
          out.push({ sideIds: [side], value: run.length, display: `${run.length} games`, season: first.season, week: first.week, detail: `${wk(first.season, first.week)} – ${wk(last.season, last.week)}`, active: last === sideLast && last.season === input.currentSeason });
        }
        run = [];
      };
      for (const g of ordered) {
        const result = g.for > g.against ? "W" : g.for < g.against ? "L" : "T";
        if (result === want) run.push(g); else flush();
      }
      flush();
    }
    return top(out, limit);
  };
  const streakBoards: RecordBoard[] = [
    { key: "win-streak", title: "Longest winning streak", kind: "streak", note: "Regular season, can span seasons", entries: streaks("W") },
    { key: "loss-streak", title: "Longest losing streak", kind: "streak", note: "Regular season, can span seasons", entries: streaks("L") },
  ];

  // ---- Weekly high scores (regular season weeks) ----
  const weeks = new Map<string, SideGame[]>();
  for (const g of regular) if (g.week) weeks.set(`${g.season}|${g.week}`, [...(weeks.get(`${g.season}|${g.week}`) ?? []), g]);
  const highCount = new Map<string, number>();
  const highSeason = new Map<string, { side: string; season: number; n: number }>();
  for (const list of weeks.values()) {
    const best = Math.max(...list.map((g) => g.for));
    const winnersOfWeek = list.filter((g) => g.for === best);
    if (winnersOfWeek.length !== 1) continue; // ties are not credited
    const g = winnersOfWeek[0]!;
    highCount.set(g.side, (highCount.get(g.side) ?? 0) + 1);
    const k = `${g.season}|${g.side}`;
    highSeason.set(k, { side: g.side, season: g.season, n: (highSeason.get(k)?.n ?? 0) + 1 });
  }
  const weeklyBoards: RecordBoard[] = [
    { key: "weekly-highs", title: "Most weekly high scores", kind: "career", note: "Top score of the week, all time", entries: top([...highCount].map(([side, n]) => ({ sideIds: [side], value: n, display: String(n), season: null, week: null })), limit) },
    { key: "weekly-highs-season", title: "Most weekly high scores in a season", kind: "season", entries: top([...highSeason.values()].map((s) => ({ sideIds: [s.side], value: s.n, display: String(s.n), season: s.season, week: null })), limit) },
  ];

  // ---- Career (games: regular season incl. current; postseason) ----
  const career = new Map<string, { w: number; l: number; t: number; pf: number; seasons: Set<number>; pw: number; pl: number }>();
  for (const g of all) {
    const c = career.get(g.side) ?? { w: 0, l: 0, t: 0, pf: 0, seasons: new Set<number>(), pw: 0, pl: 0 };
    if (g.stage === "regular") {
      c.pf += g.for; c.seasons.add(g.season);
      if (g.for > g.against) c.w += 1; else if (g.for < g.against) c.l += 1; else c.t += 1;
    } else if (g.stage === "playoff" || g.stage === "championship") {
      if (g.for > g.against) c.pw += 1; else if (g.for < g.against) c.pl += 1;
    }
    career.set(g.side, c);
  }
  const careerRows = [...career].map(([side, c]) => ({ side, ...c }));
  const cEntry = (side: string, value: number, display: string, detail?: string): RecordEntry => ({ sideIds: [side], value: r2(value), display, season: null, week: null, detail: detail ?? null });
  const minGames = 20;

  // ---- Career finishes (results: owners) ----
  const finishes = new Map<string, { titles: number; finals: number; playoffs: number; seasons: number; placeSum: number }>();
  for (const r of input.results) {
    if (r.season >= input.currentSeason) continue;
    for (const owner of r.ownerIds) {
      const f = finishes.get(owner) ?? { titles: 0, finals: 0, playoffs: 0, seasons: 0, placeSum: 0 };
      f.seasons += 1; f.placeSum += r.place;
      if (r.champion ?? r.place === 1) f.titles += 1;
      if (r.place <= 2 || r.champion) f.finals += 1;
      if (input.playoffSpots && r.place <= input.playoffSpots) f.playoffs += 1;
      finishes.set(owner, f);
    }
  }
  const finishRows = [...finishes].map(([owner, f]) => ({ owner, ...f }));
  const fEntry = (owner: string, value: number, display: string, detail?: string): RecordEntry => ({ sideIds: [owner], value, display, season: null, week: null, detail: detail ?? null });
  const careerBoards: RecordBoard[] = [
    { key: "titles", title: "Most championships", kind: "career", entries: top(finishRows.filter((f) => f.titles > 0).map((f) => fEntry(f.owner, f.titles, String(f.titles), `${f.seasons} seasons`)), limit) },
    { key: "finals", title: "Most title-game appearances", kind: "career", entries: top(finishRows.filter((f) => f.finals > 0).map((f) => fEntry(f.owner, f.finals, String(f.finals))), limit) },
    ...(input.playoffSpots ? [{ key: "playoffs", title: "Most playoff appearances", kind: "career" as const, note: `Top ${input.playoffSpots} finishes`, entries: top(finishRows.filter((f) => f.playoffs > 0).map((f) => fEntry(f.owner, f.playoffs, String(f.playoffs), `${f.seasons} seasons`)), limit) }] : []),
    { key: "avg-finish", title: "Best average finish", kind: "career", note: "At least 3 seasons", entries: top(finishRows.filter((f) => f.seasons >= 3).map((f) => fEntry(f.owner, r2(f.placeSum / f.seasons), (f.placeSum / f.seasons).toFixed(2), `${f.seasons} seasons`)), limit, true) },
    { key: "wins", title: "Most regular-season wins", kind: "career", entries: top(careerRows.map((c) => cEntry(c.side, c.w, String(c.w), `${c.w}-${c.l}${c.t ? `-${c.t}` : ""}`)), limit) },
    { key: "win-pct", title: "Best winning percentage", kind: "career", note: `At least ${minGames} regular-season games`, entries: top(careerRows.filter((c) => c.w + c.l + c.t >= minGames).map((c) => cEntry(c.side, winPct(c), pct(winPct(c)), `${c.w}-${c.l}${c.t ? `-${c.t}` : ""}`)), limit) },
    { key: "points", title: "Most regular-season points", kind: "career", entries: top(careerRows.map((c) => cEntry(c.side, c.pf, pts(c.pf), `${c.seasons.size} seasons`)), limit) },
    { key: "playoff-wins", title: "Most playoff wins", kind: "career", note: "Playoff and title games", entries: top(careerRows.filter((c) => c.pw > 0).map((c) => cEntry(c.side, c.pw, String(c.pw), `${c.pw}-${c.pl}`)), limit) },
  ];

  const gameYears = games.map((g) => g.season);
  const resultYears = input.results.map((r) => r.season);
  const range = (ys: number[]): readonly [number, number] | null => (ys.length ? [Math.min(...ys), Math.max(...ys)] : null);
  const nonEmpty = (boards: RecordBoard[]) => boards.filter((b) => b.entries.length);
  return {
    sections: [
      { id: "career", eyebrow: "All time", title: "Career leaders", intro: "Titles and finishes cover every season on record; wins, points and playoff wins come from the game history.", boards: nonEmpty(careerBoards) },
      { id: "game", eyebrow: "One game", title: "Single-game records", intro: "Every completed game, playoffs included.", boards: nonEmpty(gameBoards) },
      { id: "season", eyebrow: "One season", title: "Single-season records", intro: "Regular season only, completed seasons.", boards: nonEmpty([...seasonBoards, weeklyBoards[1]!]) },
      { id: "streaks", eyebrow: "Hot and cold", title: "Streaks and weekly highs", intro: "Streaks run across seasons; an active streak is still going this season.", boards: nonEmpty([...streakBoards, weeklyBoards[0]!]) },
    ].filter((s) => s.boards.length),
    gameSeasons: range(gameYears),
    resultSeasons: range(resultYears),
    gamesCounted: games.length,
  };
}

/**
 * This season's finished regular-season games from a live Sleeper snapshot (scored weeks only), for leagues
 * whose saved game history stops at the last completed season. `sideOf` maps a roster to the league's side id
 * (owner or franchise); games with an unmapped side are skipped.
 */
export function gamesFromSnapshot(snapshot: SleeperLeagueSnapshot, season: number, sideOf: (rosterId: number, ownerUserId: string | null) => string | null): RivalryMeeting[] {
  const settings = (snapshot.league.settings ?? {}) as Record<string, unknown>;
  const regularWeeks = (Number(settings.playoff_week_start) || 15) - 1;
  const through = Math.min(lastScoredWeek(snapshot.league), regularWeeks);
  const owners = new Map(snapshot.rosters.map((r) => [r.roster_id, (r as { owner_id?: string | null }).owner_id ?? null]));
  const out: RivalryMeeting[] = [];
  for (let week = 1; week <= through; week += 1) {
    const pairs = new Map<number, { roster: number; points: number }[]>();
    for (const row of snapshot.matchupsByWeek[week] ?? []) if (row.matchup_id) pairs.set(row.matchup_id, [...(pairs.get(row.matchup_id) ?? []), { roster: row.roster_id, points: matchupPoints(row) }]);
    for (const pair of pairs.values()) {
      if (pair.length !== 2) continue;
      const a = sideOf(pair[0]!.roster, owners.get(pair[0]!.roster) ?? null), b = sideOf(pair[1]!.roster, owners.get(pair[1]!.roster) ?? null);
      if (!a || !b) continue;
      out.push({ season, week, sideA: a, sideB: b, scoreA: pair[0]!.points, scoreB: pair[1]!.points, stage: "regular" });
    }
  }
  return out;
}
