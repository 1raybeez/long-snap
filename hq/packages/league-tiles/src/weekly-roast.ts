
import { PLAYER_NAMES } from "./player-names.ts";
import type { TeamRef } from "./contract.ts";
import { lastScoredWeek, matchupPoints, resultsThrough, teamRefs, type SleeperLeagueSnapshot, type SleeperMatchupLike } from "./sleeper-adapter.ts";

/** The file Claude writes. Games are matched by their two Sleeper roster ids, in either order. */
export interface WeeklyRoastFile {
  readonly season: number;
  readonly week: number;
  readonly writtenAt: string;
  readonly author: string;
  readonly title: string;
  readonly intro: string;
  readonly survivorsLine?: string | null;
  readonly games: readonly { readonly rosterIds: readonly number[]; readonly headline?: string | null; readonly verdict: { readonly tag: string; readonly note?: string | null }; readonly roast: string }[];
  readonly awards: readonly { readonly title: string; readonly text: string }[];
  readonly signoff?: string | null;
}

export interface RoastSide {
  readonly team: TeamRef;
  readonly points: number;
  readonly record: string;
  /** Best possible lineup minus the lineup actually started (never negative). */
  readonly benchLeft: number;
  readonly optimal: number;
}

export interface RoastGame {
  readonly number: number;
  readonly margin: number;
  readonly winner: RoastSide;
  readonly loser: RoastSide;
  readonly verdict: { readonly tag: string; readonly note: string | null };
  readonly headline: string | null;
  readonly roast: string;
}

export interface WeeklyRoastModel {
  readonly season: number;
  readonly week: number;
  readonly title: string;
  readonly intro: string;
  readonly survivorsLine: string | null;
  readonly author: string;
  readonly writtenAt: string;
  readonly games: readonly RoastGame[];
  readonly awards: readonly { readonly title: string; readonly text: string }[];
  readonly signoff: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Which player positions each lineup slot accepts (Sleeper slot codes). Bench/IR/taxi slots are ignored. */
const SLOT_ELIGIBILITY: Readonly<Record<string, readonly string[]>> = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"], WRRB_FLEX: ["RB", "WR"], REC_FLEX: ["WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

export function playerPosition(playerId: string): string | null {
  const raw = PLAYER_NAMES[playerId];
  if (raw) return raw.split("|")[1] ?? null;
  return /^[A-Z]{2,3}$/.test(playerId) ? "DEF" : null;
}

/**
 * Best possible score from the players a team had that week, respecting the league's lineup slots. Slots
 * are filled most-restrictive first (single positions, then the narrowest flex), which is exact for
 * standard QB/RB/WR/TE/FLEX/SUPER_FLEX/K/DEF lineups. Players whose position is unknown are left out.
 */
export function optimalLineupPoints(
  players: readonly string[],
  playerPoints: Readonly<Record<string, number>>,
  rosterPositions: readonly string[],
  positionOf: (playerId: string) => string | null = playerPosition,
): number {
  const slots = rosterPositions.filter((slot) => SLOT_ELIGIBILITY[slot]).sort((a, b) => SLOT_ELIGIBILITY[a]!.length - SLOT_ELIGIBILITY[b]!.length);
  const pool = players.map((id) => ({ id, pos: positionOf(id), pts: playerPoints[id] ?? 0 })).filter((p) => p.pos).sort((a, b) => b.pts - a.pts);
  const used = new Set<string>();
  let total = 0;
  for (const slot of slots) {
    const allowed = SLOT_ELIGIBILITY[slot]!;
    const best = pool.find((p) => !used.has(p.id) && allowed.includes(p.pos!));
    if (!best) continue;
    used.add(best.id);
    total += best.pts;
  }
  return round2(total);
}

/** True when a written game entry refers to these two rosters, in either order. */
export function sameMatchup(rosterIds: readonly number[], a: number, b: number): boolean {
  return rosterIds.length === 2 && ((rosterIds[0] === a && rosterIds[1] === b) || (rosterIds[0] === b && rosterIds[1] === a));
}

type FullRow = SleeperMatchupLike & { starters?: readonly string[] | null; players?: readonly string[] | null; players_points?: Readonly<Record<string, number>> | null };

/**
 * Joins the written roast to the week's Sleeper results. Returns null when the week isn't final yet or the
 * file is for another season/week. Games keep the order they were written in; a written game that doesn't
 * match a real matchup is dropped.
 */
export function buildWeeklyRoast(snapshot: SleeperLeagueSnapshot, file: WeeklyRoastFile, positionOf: (playerId: string) => string | null = playerPosition): WeeklyRoastModel | null {
  const finished = lastScoredWeek(snapshot.league);
  if (file.week < 1 || file.week > finished) return null;
  if (snapshot.league.season && Number(snapshot.league.season) !== Number(file.season)) return null;
  const rows = (snapshot.matchupsByWeek[file.week] ?? []) as readonly FullRow[];
  const refs = teamRefs(snapshot);
  const rosterPositions = (snapshot.league as { roster_positions?: readonly string[] }).roster_positions ?? [];
  const results = resultsThrough(snapshot, finished, file.week) ?? [];
  const recordOf = new Map(results.map((r) => [r.rosterId, `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`]));
  const rowOf = new Map(rows.map((row) => [row.roster_id, row]));

  const side = (rosterId: number): RoastSide | null => {
    const row = rowOf.get(rosterId); const team = refs.get(rosterId);
    if (!row || !team) return null;
    const points = matchupPoints(row);
    const optimal = rosterPositions.length && row.players?.length ? optimalLineupPoints(row.players, row.players_points ?? {}, rosterPositions, positionOf) : points;
    return { team, points, record: recordOf.get(rosterId) ?? "", optimal, benchLeft: round2(Math.max(0, optimal - points)) };
  };

  const games: RoastGame[] = [];
  for (const written of file.games) {
    const [a, b] = written.rosterIds;
    if (a === undefined || b === undefined) continue;
    const rowA = rowOf.get(a), rowB = rowOf.get(b);
    if (!rowA || !rowB || !rowA.matchup_id || rowA.matchup_id !== rowB.matchup_id) continue;
    const sa = side(a), sb = side(b);
    if (!sa || !sb) continue;
    const [winner, loser] = sa.points >= sb.points ? [sa, sb] : [sb, sa];
    games.push({ number: games.length + 1, margin: round2(winner.points - loser.points), winner, loser, verdict: { tag: written.verdict.tag, note: written.verdict.note ?? null }, headline: written.headline ?? null, roast: written.roast });
  }
  return {
    season: Number(file.season), week: file.week, title: file.title, intro: file.intro, survivorsLine: file.survivorsLine ?? null,
    author: file.author, writtenAt: file.writtenAt, games, awards: file.awards, signoff: file.signoff ?? null,
  };
}

/** First sentence of the intro, for the homepage card. */
export function roastTeaser(model: Pick<WeeklyRoastModel, "intro">): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(model.intro.trim());
  return (match?.[1] ?? model.intro).trim();
}
