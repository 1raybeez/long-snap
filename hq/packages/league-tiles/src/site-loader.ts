import type { EspnScoreboardLike } from "./nfl-adapter.ts";
import type { SleeperLeagueSnapshot } from "./sleeper-adapter.ts";

/**
 * Shared data loader for league websites (Next.js server components).
 *
 * Reads Sleeper data from the Fantasy Football HQ cache when `hqDataUrl` is set
 * (e.g. https://us-east4-your-firebase-project.cloudfunctions.net/sleeperCache),
 * otherwise straight from Sleeper using short Next.js caching (`next.revalidate`)
 * instead of no-store. Never throws: missing data yields `snapshot: null`.
 */
const SLEEPER = "https://api.sleeper.app/v1";
const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export interface LeagueTileDataInput {
  /** Canonical HQ league id, e.g. "long-country-club". */
  readonly hqLeagueId: string;
  /** Current-season Sleeper league id. */
  readonly sleeperLeagueId: string;
  readonly hqDataUrl?: string | null;
  /** Real names keyed by Sleeper user id. */
  readonly managerNames?: Readonly<Record<string, string>>;
  readonly now?: Date;
}

export interface LeagueTileData {
  readonly snapshot: SleeperLeagueSnapshot | null;
  readonly nflWeek: number;
  readonly scoreboard: EspnScoreboardLike | null;
}

async function getJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    // Live data (a minute or less) is fetched every time: Next serves an expired cached copy first and refreshes it in

    const response = await fetch(url, (revalidate <= 60 ? { cache: "no-store" } : { next: { revalidate } }) as RequestInit);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function loadLeagueTileData(input: LeagueTileDataInput): Promise<LeagueTileData> {
  const hq = input.hqDataUrl?.replace(/\/+$/, "") || null;
  const base = `/v1/leagues/${input.hqLeagueId}`;
  const read = async <T>(hqPath: string, sleeperPath: string, revalidate: number): Promise<{ data: T | null; asOf: string | null; stale: boolean }> => {
    if (hq) {
      const envelope = await getJson<{ data?: T; fetchedAt?: string | null; freshness?: string }>(`${hq}${hqPath}`, revalidate);
      if (envelope?.data !== undefined) return { data: envelope.data, asOf: envelope.fetchedAt ?? null, stale: envelope.freshness === "STALE_BUT_USABLE" };
    }
    const data = await getJson<T>(`${SLEEPER}${sleeperPath}`, revalidate);
    return { data, asOf: data ? (input.now ?? new Date()).toISOString() : null, stale: false };
  };

  const id = input.sleeperLeagueId;
  const [state, league, users, rosters, scoreboard] = await Promise.all([
    read<{ week?: number; display_week?: number; season_type?: string }>("/v1/nfl-state", "/state/nfl", 300),
    read<SleeperLeagueSnapshot["league"]>(`${base}/league`, `/league/${id}`, 300),
    read<SleeperLeagueSnapshot["users"]>(`${base}/users`, `/league/${id}/users`, 300),
    read<SleeperLeagueSnapshot["rosters"]>(`${base}/rosters`, `/league/${id}/rosters`, 120),
    getJson<EspnScoreboardLike>(ESPN_SCOREBOARD, 30), // live scores: 30 s (the page refreshes while a game is on)
  ]);
  const nflWeek = state.data?.week ?? 0;
  const displayWeek = state.data?.display_week ?? null;
  const seasonType = state.data?.season_type ?? null;
  if (!league.data || !users.data || !rosters.data) return { snapshot: null, nflWeek, scoreboard };

  const lastScored = Number((league.data.settings as Record<string, unknown> | undefined)?.last_scored_leg ?? 0);
  const weeks = [...new Set([nflWeek, displayWeek ?? 0, lastScored, lastScored - 1, lastScored - 2, lastScored - 3].filter((week) => week >= 1 && week <= 18))];
  const matchupsByWeek: Record<number, SleeperLeagueSnapshot["matchupsByWeek"][number]> = {};
  await Promise.all(weeks.map(async (week) => {
    const result = await read<SleeperLeagueSnapshot["matchupsByWeek"][number]>(`${base}/matchups?week=${week}`, `/league/${id}/matchups/${week}`, week < nflWeek ? 3600 : 60);
    if (result.data) matchupsByWeek[week] = result.data;
  }));

  return {
    nflWeek,
    scoreboard,
    snapshot: {
      league: league.data, users: users.data, rosters: rosters.data, matchupsByWeek, nflWeek, displayWeek, seasonType,
      asOf: rosters.asOf, stale: rosters.stale || league.stale, managerNames: input.managerNames,
    },
  };
}

/**
 * Full-season data for recap pages: the same snapshot as `loadLeagueTileData`, with matchups for
 * every week from 1 through the week after the last scored one (records, streaks, week ahead).
 */
/** Every week through the last scored week + 1, or through `throughWeek` (e.g. the end of the regular season for a simulator). */
export async function loadLeagueSeasonData(input: LeagueTileDataInput, throughWeek?: number): Promise<LeagueTileData> {
  const base = await loadLeagueTileData(input);
  if (!base.snapshot) return base;
  const lastScored = Number((base.snapshot.league.settings as Record<string, unknown> | undefined)?.last_scored_leg ?? 0);
  const hq = input.hqDataUrl?.replace(/\/+$/, "") || null;
  const matchupsByWeek: Record<number, SleeperLeagueSnapshot["matchupsByWeek"][number]> = { ...base.snapshot.matchupsByWeek };
  const missing = Array.from({ length: Math.min(18, Math.max(lastScored + 1, throughWeek ?? 0)) }, (_, i) => i + 1).filter((week) => !matchupsByWeek[week]);
  await Promise.all(missing.map(async (week) => {
    const fromHq = hq ? await getJson<{ data?: SleeperLeagueSnapshot["matchupsByWeek"][number] }>(`${hq}/v1/leagues/${input.hqLeagueId}/matchups?week=${week}`, 3600) : null;
    const rows = fromHq?.data ?? await getJson<SleeperLeagueSnapshot["matchupsByWeek"][number]>(`${SLEEPER}/league/${input.sleeperLeagueId}/matchups/${week}`, week <= lastScored ? 3600 : 300);
    if (rows) matchupsByWeek[week] = rows;
  }));
  return { ...base, snapshot: { ...base.snapshot, matchupsByWeek } };
}

/**
 * Data for the Matchups page: the season so far (records, form and the preview model need every scored week) plus
 * the requested week if it is not loaded yet. Past seasons pass `fullSeason: false` and load only that week.
 */
export async function loadMatchupWeekData(input: LeagueTileDataInput, week: number | null, options: { readonly fullSeason: boolean }): Promise<LeagueTileData> {
  const base = options.fullSeason ? await loadLeagueSeasonData(input) : await loadLeagueTileData(input);
  if (!base.snapshot || !week || base.snapshot.matchupsByWeek[week]) return base;
  const lastScored = Number((base.snapshot.league.settings as Record<string, unknown> | undefined)?.last_scored_leg ?? 0);
  const hq = input.hqDataUrl?.replace(/\/+$/, "") || null;
  const fromHq = hq ? await getJson<{ data?: SleeperLeagueSnapshot["matchupsByWeek"][number] }>(`${hq}/v1/leagues/${input.hqLeagueId}/matchups?week=${week}`, 3600) : null;
  const rows = fromHq?.data ?? await getJson<SleeperLeagueSnapshot["matchupsByWeek"][number]>(`${SLEEPER}/league/${input.sleeperLeagueId}/matchups/${week}`, week <= lastScored ? 3600 : 60);
  return rows ? { ...base, snapshot: { ...base.snapshot, matchupsByWeek: { ...base.snapshot.matchupsByWeek, [week]: rows } } } : base;
}
