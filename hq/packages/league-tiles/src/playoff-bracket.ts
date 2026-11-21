
import type { StandingRow, TeamRef } from "./contract.ts";

export interface BracketMatchInput {
  readonly r?: number | null;
  readonly m?: number | null;
  readonly p?: number | null;
  readonly t1?: number | null;
  readonly t2?: number | null;
  readonly w?: number | null;
  readonly l?: number | null;
  readonly t1_from?: { readonly w?: number | null; readonly l?: number | null } | null;
  readonly t2_from?: { readonly w?: number | null; readonly l?: number | null } | null;
}

export interface BracketSide {
  readonly team: TeamRef | null;
  /** Shown when the team isn't known yet ("Winner of game 3"). */
  readonly placeholder: string | null;
  readonly seed: number | null;
  readonly points: number | null;
  readonly advanced: boolean;
}

export interface BracketGame {
  readonly id: number;
  readonly title: string;
  readonly week: number | null;
  readonly sides: readonly [BracketSide, BracketSide];
  readonly status: "UPCOMING" | "IN_PROGRESS" | "FINAL";
}

export interface BracketRound { readonly round: number; readonly label: string; readonly week: number | null; readonly games: readonly BracketGame[] }

export interface ProjectedSeed { readonly seed: number; readonly team: TeamRef; readonly record: string; readonly reason: string | null; readonly bye: boolean }

export interface PlayoffBracketModel {
  readonly season: number;
  readonly playoffStartWeek: number | null;
  /** True once the first playoff week has started (Sleeper's bracket is then the bracket). */
  readonly started: boolean;
  readonly championship: readonly BracketRound[];
  readonly losers: readonly BracketRound[];
  readonly losersName: string;
  /** The field if the season ended today (before the playoffs only). */
  readonly projected: readonly ProjectedSeed[] | null;
  readonly projectedOut: readonly ProjectedSeed[];
}

export interface PlayoffBracketInput {
  readonly season: number;
  readonly playoffStartWeek: number | null;
  /** NFL week now (Sleeper state). */
  readonly currentWeek: number;
  readonly winners: readonly BracketMatchInput[];
  readonly losers: readonly BracketMatchInput[];
  readonly teams: ReadonlyMap<number, TeamRef>;
  /** roster id → points, per playoff week. */
  readonly pointsByWeek: Readonly<Record<number, ReadonlyMap<number, number>>>;
  /** Weeks Sleeper has finished scoring. */
  readonly lastScoredWeek: number;
  readonly standings: readonly StandingRow[] | null;
  readonly playoffSpots: number;
  readonly losersName?: string;
}

const REASON: Record<string, string> = { DIVISION: "Division winner", RECORD: "Best record", POINTS: "Points" };

function roundLabel(kind: "championship" | "losers", round: number, rounds: number, name: string): string {
  if (kind === "losers") return rounds - round === 0 ? `${name} final week` : `${name} round ${round}`;
  const fromEnd = rounds - round;
  if (fromEnd === 0) return "Championship week";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
}

function gameTitle(kind: "championship" | "losers", match: BracketMatchInput, label: string, name: string): string {
  const p = match.p ?? null;
  if (kind === "championship") {
    if (p === 1) return "Championship";
    if (p === 3) return "Third place";
    if (p === 5) return "Fifth place";
    return label;
  }
  if (p === 1) return `${name} final`;
  if (p) return `${name} placement game`;
  return label;
}

function source(from: BracketMatchInput["t1_from"]): string | null {
  if (from?.w) return `Winner of game ${from.w}`;
  if (from?.l) return `Loser of game ${from.l}`;
  return null;
}

function rounds(kind: "championship" | "losers", matches: readonly BracketMatchInput[], input: PlayoffBracketInput, seeds: ReadonlyMap<number, number>, name: string): BracketRound[] {
  const byRound = new Map<number, BracketMatchInput[]>();
  for (const m of [...matches].sort((a, b) => (a.r ?? 0) - (b.r ?? 0) || (a.m ?? 0) - (b.m ?? 0))) {
    const r = m.r ?? 0;
    byRound.set(r, [...(byRound.get(r) ?? []), m]);
  }
  const total = Math.max(0, ...byRound.keys());
  return [...byRound.entries()].sort(([a], [b]) => a - b).map(([round, games]) => {
    const week = input.playoffStartWeek ? input.playoffStartWeek + round - 1 : null;
    const label = roundLabel(kind, round, total, name);
    const points = week ? input.pointsByWeek[week] : undefined;
    const status: BracketGame["status"] = week === null ? "UPCOMING" : week <= input.lastScoredWeek ? "FINAL" : week <= input.currentWeek ? "IN_PROGRESS" : "UPCOMING";
    return {
      round, label, week,
      games: games.map((m) => {
        const side = (rid: number | null | undefined, from: BracketMatchInput["t1_from"]): BracketSide => {
          const team = rid ? input.teams.get(rid) ?? null : null;
          const pts = rid && points && status !== "UPCOMING" ? points.get(rid) ?? null : null;
          return { team, placeholder: team ? null : source(from) ?? "To be decided", seed: rid ? seeds.get(rid) ?? null : null, points: pts, advanced: Boolean(rid && m.w === rid && kind === "championship") };
        };
        return { id: m.m ?? 0, title: gameTitle(kind, m, label, name), week, status: m.w || m.l ? "FINAL" : status, sides: [side(m.t1, m.t1_from), side(m.t2, m.t2_from)] as const };
      }),
    };
  });
}

/** Seeds 1..N from the league's standings (its own seeding rules); the top seeds with a first-round bye are marked. */
function projectedField(input: PlayoffBracketInput): { seeds: ProjectedSeed[]; out: ProjectedSeed[] } {
  const rows = input.standings ?? [];
  const firstRoundGames = input.winners.filter((m) => (m.r ?? 0) === 1).length;
  const byes = Math.max(0, input.playoffSpots - firstRoundGames * 2);
  const toSeed = (row: StandingRow, i: number): ProjectedSeed => ({
    seed: i + 1, team: row.team,
    record: `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`,
    reason: row.seedReason ? REASON[row.seedReason] ?? null : null,
    bye: i < byes,
  });
  return { seeds: rows.slice(0, input.playoffSpots).map(toSeed), out: rows.slice(input.playoffSpots).map((r, i) => toSeed(r, i + input.playoffSpots)) };
}

export function buildPlayoffBracket(input: PlayoffBracketInput): PlayoffBracketModel {
  const started = Boolean(input.playoffStartWeek && input.currentWeek >= input.playoffStartWeek);
  const name = input.losersName ?? "Consolation";
  const field = projectedField(input);
  const seeds = new Map(field.seeds.map((s) => [s.team.rosterId, s.seed]));
  return {
    season: input.season,
    playoffStartWeek: input.playoffStartWeek,
    started,
    championship: started ? rounds("championship", input.winners, input, seeds, name) : [],
    losers: started ? rounds("losers", input.losers, input, new Map(), name) : [],
    losersName: name,
    projected: started ? null : field.seeds,
    projectedOut: started ? [] : field.out,
  };
}
