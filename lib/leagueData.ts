import { readFileSync } from "node:fs";
import { historySeriesGames, rosterUnits, SERIES_BASIS, type LeagueExportLike, type SeriesGame } from "../hq/packages/league-tiles/src/series.ts";
import { join } from "node:path";
import type { LeagueOverviewModel } from "../hq/packages/league-tiles/src/league-overview.tsx";
import type { DirectoryFranchise, DirectoryOwner } from "../hq/packages/league-tiles/src/managers-directory.tsx";
import type { OwnerProfileModel } from "../hq/packages/league-tiles/src/owner-profile.tsx";
import type { FranchisePageModel } from "../hq/packages/league-tiles/src/franchise.tsx";
import type { HistoryOwner, HistorySeasonResult } from "../hq/packages/league-tiles/src/index.ts";
import type { HistoryHubConfig } from "../hq/packages/league-tiles/src/history-hub.tsx";
import lvLeague from "../data/demo/redraft/site/league.json" with { type: "json" };
import lvGames from "../data/demo/redraft/site/games.json" with { type: "json" };
import lvHistory from "../data/demo/redraft/site/history.json" with { type: "json" };
import lvPeople from "../data/demo/redraft/site/people.json" with { type: "json" };
import mcLeague from "../data/demo/keeper/site/league.json" with { type: "json" };
import mcGames from "../data/demo/keeper/site/games.json" with { type: "json" };
import mcHistory from "../data/demo/keeper/site/history.json" with { type: "json" };
import mcPeople from "../data/demo/keeper/site/people.json" with { type: "json" };
import hcLeague from "../data/demo/auction/site/league.json" with { type: "json" };
import hcGames from "../data/demo/auction/site/games.json" with { type: "json" };
import hcHistory from "../data/demo/auction/site/history.json" with { type: "json" };
import hcPeople from "../data/demo/auction/site/people.json" with { type: "json" };
import iwLeague from "../data/demo/dynasty/site/league.json" with { type: "json" };
import iwGames from "../data/demo/dynasty/site/games.json" with { type: "json" };
import iwHistory from "../data/demo/dynasty/site/history.json" with { type: "json" };
import iwPeople from "../data/demo/dynasty/site/people.json" with { type: "json" };
import { wadeRoastFor } from "./wadeRoast.ts";
import type { WeeklyRoastFile } from "../hq/packages/league-tiles/src/weekly-roast.ts";
import type { WrittenPreviewFile } from "../hq/packages/league-tiles/src/matchup-center.ts";
import { HQ_LEAGUE_REGISTRY } from "../hq/config/leagues/registry.ts";
import { sleeperOnlyData } from "./sleeperOnly.ts";
import { LCC_ENGINE, RIVER_CITY_ENGINE, RVA_ENGINE } from "./leagueFeatures.ts";
import { sleeperFeedFetch } from "./sleeperFeed.ts";

export type LeagueTeam = { rosterId: number; franchiseId: string; name: string | null; ownerLabel: string | null; image: string | null };
export type LeagueGame = { season: number; week: number | null; sideA: string; sideB: string; scoreA: number; scoreB: number; stage: string };
export type LeagueData = {

  sleeperOnly?: boolean;
  season: number;
  leagueIdsBySeason: Record<string, string>;
  managerNames: Record<string, string>;
  teams: LeagueTeam[];
  games: LeagueGame[];
  /** Path on the league's current site for a head-to-head page, keyed "a-b" with a < b. */
  h2h: Record<string, string>;
  preview(season: number, week: number): WrittenPreviewFile | null;
  /** The written weekly recap (roast) for a finished week, if there is one. */
  recap(season: number, week: number): WeeklyRoastFile | null;
  champion: { season: number; teamName: string; managerName: string; image: string | null } | null;
  finances: { entryFee: number | null; teamCount: number; weeklyHighPayout: number | null; payouts: { championBase?: number | null; runnerUp?: number | null; thirdPlace?: number | null; fourthPlace?: number | null } };
  history: { results: HistorySeasonResult[]; owners: HistoryOwner[]; config: Omit<HistoryHubConfig, "seasonHref"> };
  people: { overview: LeagueOverviewModel; ownerPages: Record<string, OwnerProfileModel>; franchisePages: Record<string, Omit<FranchisePageModel, "ownerName">>; ownerNames: Record<string, string>; sides: { id: string; name: string; photo: string | null; href: string | null; active: boolean }[]; h2hByFranchise: Record<string, string>;  rivalryGames?: LeagueGame[];  recordSides?: Record<string, { name: string; href: string | null; photo: string | null }>; /** Old franchise ids → the franchise page they now live on. */ franchiseRedirects?: Record<string, string>; directory: { owners: DirectoryOwner[]; franchises: DirectoryFranchise[]; staff?: unknown[]; groupLabel?: string } };
  /** Wording that differs by league (each league's own site says it this way). */
  copy: { rivalrySideLabel: "owner" | "franchise"; rivalryCoverage: string; recordsCoverage: string[]; draftLine: string; draftTabs: "dynasty" | "auction"; /** Fees & payouts page on the league's current site. */ feesPath?: string };
  /** Regular-season length (the predictor simulates through it). */
  regularSeasonWeeks: number;
  /** Birthday list key in the kit (birthdays.ts). */
  birthdays: "rc" | "lcc" | "rva" | null;
  /** League rules the pages need (each league's own; never assumed from another league). */
  rules: {

    draftOrder: "maxPf" | "pointsFor" | "standings";
    draftRuleText: string;
    /** Dynasty roster values (FantasyCalc) for power rankings. */
    dynasty: boolean;
  };
};

type SiteFiles = { league: { season: number; leagueIdsBySeason: Record<string, string>; managerNames: Record<string, string>; teams: unknown[]; h2h: Record<string, string>; champion: LeagueData["champion"]; finances: LeagueData["finances"] }; games: unknown[]; history: unknown; people: unknown; previews: Record<string, unknown>; recaps: Record<string, unknown> };
const weekKey = (season: number, week: number) => `${season}-week-${String(week).padStart(2, "0")}`;

/** A league with its own site: its exported files plus the few rules the pages need (each league's own). */
function siteLeague(f: SiteFiles, extra: Pick<LeagueData, "birthdays" | "regularSeasonWeeks" | "rules" | "copy">): LeagueData {
  return {
    season: f.league.season,
    leagueIdsBySeason: f.league.leagueIdsBySeason,
    managerNames: f.league.managerNames,
    teams: f.league.teams as LeagueTeam[],
    games: f.games as LeagueGame[],
    h2h: f.league.h2h,
    preview: (season, week) => (f.previews[weekKey(season, week)] as WrittenPreviewFile | undefined) ?? null,
    recap: (season, week) => {
      const r = f.recaps[weekKey(season, week)] as WeeklyRoastFile | undefined;
      return r && Number(r.week) === week && Number(r.season) === season ? r : null;
    },
    champion: f.league.champion,
    finances: f.league.finances,
    history: f.history as LeagueData["history"],
    people: f.people as LeagueData["people"],
    ...extra,
  };
}

// Long Snap demo leagues (made up): their league files are built by the demo generator (data/demo/<type>/site).
const demoCopy = (draftTabs: "dynasty" | "auction"): LeagueData["copy"] => ({
  rivalrySideLabel: "owner",
  rivalryCoverage: "Head-to-head games are on record from 2022 onward (the league's Sleeper seasons); earlier seasons have final standings only.",
  recordsCoverage: ["Games come from the league's Sleeper history (2022 onward), each game counted once per team; teams are shown by their owners.", "Titles and finishes cover every season on record."],
  draftLine: draftTabs === "auction" ? "Every auction pick by pick, keeper prices, and the league's best and worst bids." : "Every draft pick by pick, who owns the future picks, and how each team drafted.",
  draftTabs,
});
const demoRules = (draftOrder: LeagueData["rules"]["draftOrder"], draftRuleText: string, dynasty: boolean): LeagueData["rules"] => ({ draftOrder, draftRuleText, dynasty });
const demoSite = (f: { league: unknown; games: unknown; history: unknown; people: unknown }, rules: LeagueData["rules"], draftTabs: "dynasty" | "auction") =>
  siteLeague({ league: f.league as SiteFiles["league"], games: f.games as unknown[], history: f.history, people: f.people, previews: {}, recaps: {} }, { birthdays: null, regularSeasonWeeks: 14, rules, copy: demoCopy(draftTabs) });

const DATA: Record<string, LeagueData> = {
  "lakeview-ffl": demoSite({ league: lvLeague, games: lvGames, history: lvHistory, people: lvPeople }, demoRules("standings", "Lakeview drafts in reverse order of last season's final standings.", false), "dynasty"),
  "mill-creek-ffl": demoSite({ league: mcLeague, games: mcGames, history: mcHistory, people: mcPeople }, demoRules("standings", "Mill Creek drafts in reverse order of last season's final standings.", false), "dynasty"),
  "harbor-city-ffl": demoSite({ league: hcLeague, games: hcGames, history: hcHistory, people: hcPeople }, demoRules("standings", "Harbor City drafts by auction, so there is no pick order. Nomination order follows the league's draft-night rules.", false), "auction"),
  "ironworks-dynasty": demoSite({ league: iwLeague, games: iwGames, history: iwHistory, people: iwPeople }, demoRules("maxPf", "Ironworks rookie draft: the six teams that miss the playoffs pick 1–6 by Max PF, lowest first. Playoff teams pick 7–12 by playoff finish.", true), "dynasty"),
};

const SLEEPER_ONLY_IDS: ReadonlySet<string> = new Set<string>([]);
const SLEEPER_ONLY: Record<string, string> = Object.fromEntries(
  HQ_LEAGUE_REGISTRY.leagues.filter((l) => SLEEPER_ONLY_IDS.has(l.id)).flatMap((l) => {
    const id = l.seasons.find((s) => s.season === l.currentSeason)?.providerBindings.find((b) => b.provider === "SLEEPER")?.externalLeagueId;
    return id ? [[l.id, id] as const] : [];
  }),
);

export function isSleeperOnly(leagueId: string): boolean {
  return Boolean(SLEEPER_ONLY[leagueId]);
}

export function leagueData(leagueId: string): LeagueData | null {
  return DATA[leagueId] ?? null;
}

export function seriesHistory(leagueId: string): { games: SeriesGame[]; units: Map<number, string[]> } | null {
  if (!(leagueId in SERIES_BASIS)) return null;
  const cached = seriesCache.get(leagueId);
  if (cached !== undefined) return cached;
  const x = builtExport(leagueId as "long-country-club" | "rva-eskimo-brothers" | "river-city-ffl");
  const out = x ? { games: historySeriesGames(leagueId, x as unknown as LeagueExportLike), units: rosterUnits(leagueId, x as unknown as LeagueExportLike) } : null;
  seriesCache.set(leagueId, out);
  return out;
}
const seriesCache = new Map<string, { games: SeriesGame[]; units: Map<number, string[]> } | null>();

/** All-time series between two franchises (completed seasons; regular season + playoffs, not consolation). */
export function seriesBetween(games: readonly LeagueGame[], a: string, b: string) {
  let aWins = 0, bWins = 0, ties = 0;
  for (const g of games) {
    if (g.stage === "other") continue;
    const [x, y] = g.sideA === a && g.sideB === b ? [g.scoreA, g.scoreB] : g.sideA === b && g.sideB === a ? [g.scoreB, g.scoreA] : [null, null];
    if (x === null || y === null) continue;
    if (x > y) aWins += 1; else if (y > x) bWins += 1; else ties += 1;
  }
  return { aWins, bWins, ties };
}

/**
 * The week's written preview and recap. Read live from the league's current site (its /api/platform/written
 * endpoint) so new Tuesday recaps and Wednesday previews show up on their own; the copies exported into HQ are the
 * fallback. At cutover the files move into HQ for good.
 */

export type OutsideRoast = { readonly url: string; readonly week: number; readonly title: string; readonly description: string | null; readonly image: string | null };

export async function writtenFor(leagueId: string, siteUrl: string | null, season: number, week: number): Promise<{ preview: WrittenPreviewFile | null; recap: WeeklyRoastFile | null; roast: OutsideRoast | null }> {
  const data = DATA[leagueId];

  const wade = leagueId === "river-city-ffl" && season === data?.season ? await wadeRoastFor(season, week) : null;
  const fallback = { preview: data?.preview(season, week) ?? null, recap: data?.recap(season, week) ?? null, roast: wade };

  // they are still read live from there (/api/platform/written); HQ's leagues/rva-eskimo-brothers copies are the fallback.

  if (!siteUrl || leagueId === "river-city-ffl" || (leagueId === "long-country-club" && LCC_ENGINE.has("written")) || (leagueId === "rva-eskimo-brothers" && RVA_ENGINE.has("written"))) return fallback;
  try {
    const r = await sleeperFeedFetch(`${siteUrl}/api/platform/written?season=${season}&week=${week}`, { next: { revalidate: 600 }, signal: AbortSignal.timeout(8000) } as RequestInit);
    if (!r.ok) return fallback;
    const j = (await r.json()) as { preview?: WrittenPreviewFile | null; recap?: WeeklyRoastFile | null; roast?: OutsideRoast | null };
    const recap = j.recap && Number(j.recap.week) === week && Number(j.recap.season) === season ? j.recap : null;
    const roast = j.roast && Number(j.roast.week) === week && /^https:\/\//.test(j.roast.url) ? j.roast : null;
    return { preview: j.preview ?? fallback.preview, recap: recap ?? fallback.recap, roast: wade ?? roast };
  } catch {
    return fallback;
  }
}

type LiveExport = { league?: { season?: number; managerNames?: Record<string, string>; teams?: LeagueTeam[]; h2h?: Record<string, string>; champion?: LeagueData["champion"]; finances?: LeagueData["finances"] }; games?: LeagueGame[]; history?: LeagueData["history"]; people?: LeagueData["people"] };

/**
 * The league's data, refreshed from its current site's /api/platform/export (hourly) so owner pages, history and
 * rivalries stay current until the switch-over. Falls back to the copy exported into HQ if the site can't be read.
 */
export async function loadLeagueData(leagueId: string, siteUrl: string | null): Promise<LeagueData | null> {
  const base = DATA[leagueId];
  if (!base && SLEEPER_ONLY[leagueId]) return sleeperOnlyData(SLEEPER_ONLY[leagueId]);
  if (!base) return null;

  const merged = leagueId === "long-country-club" && LCC_ENGINE.has("export") ? await lccLiveExport(base) : leagueId === "rva-eskimo-brothers" && RVA_ENGINE.has("export") ? await rvaLiveExport(base) : leagueId === "river-city-ffl" && RIVER_CITY_ENGINE.has("export") ? builtMerge(base, "river-city-ffl") : siteUrl ? await liveExport(base, siteUrl) : base;
  return { ...merged, teams: await withSleeperNames(merged) };
}

async function liveExport(base: LeagueData, siteUrl: string): Promise<LeagueData> {
  try {
    const r = await sleeperFeedFetch(`${siteUrl}/api/platform/export`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) } as RequestInit);
    if (!r.ok) return base;
    return mergeExport(base, (await r.json()) as LiveExport);
  } catch {
    return base;
  }
}

// Read from disk once (not compiled into the bundle: importing them as modules ran the site build out of memory).
const builtExports = new Map<string, LiveExport | null>();
function builtExport(name: "long-country-club" | "rva-eskimo-brothers" | "river-city-ffl"): LiveExport | null {
  if (!builtExports.has(name)) {
    try { builtExports.set(name, JSON.parse(readFileSync(join(process.cwd(), "lib", "generated", `${name}-export.json`), "utf8")) as LiveExport); }
    catch (error) { console.error("BUILT_EXPORT_MISSING", name, error instanceof Error ? error.name : "unknown"); builtExports.set(name, null); }
  }
  return builtExports.get(name) ?? null;
}

function builtMerge(base: LeagueData, name: "river-city-ffl"): LeagueData {
  const x = builtExport(name);
  return x ? mergeExport(base, x) : base;
}

async function lccLiveExport(base: LeagueData): Promise<LeagueData> {
  const x = builtExport("long-country-club");
  return x ? mergeExport(base, x) : base;
}

async function rvaLiveExport(base: LeagueData): Promise<LeagueData> {
  const x = builtExport("rva-eskimo-brothers");
  return x ? mergeExport(base, x) : base;
}

function mergeExport(base: LeagueData, x: LiveExport): LeagueData {
  const l = x.league ?? {};
  return {
    ...base,
    managerNames: l.managerNames ?? base.managerNames,
    teams: l.teams?.length ? l.teams : base.teams,
    h2h: l.h2h ?? base.h2h,
    champion: l.champion ?? base.champion,
    finances: l.finances ?? base.finances,
    games: x.games?.length ? x.games : base.games,
    history: x.history?.results?.length ? x.history : base.history,
    people: x.people?.ownerPages ? x.people : base.people,
  };
}

/** Team names as owners set them in Sleeper right now (5-minute cache), so a rename shows up without a new export. */
async function withSleeperNames(d: LeagueData): Promise<LeagueTeam[]> {
  const id = d.leagueIdsBySeason[String(d.season)];
  if (!id) return d.teams;
  try {
    const opts = { next: { revalidate: 300 } } as RequestInit;
    const [rosters, users] = (await Promise.all([
      sleeperFeedFetch(`https://api.sleeper.app/v1/league/${id}/rosters`, opts).then((r) => (r.ok ? r.json() : [])),
      sleeperFeedFetch(`https://api.sleeper.app/v1/league/${id}/users`, opts).then((r) => (r.ok ? r.json() : [])),
    ])) as [{ roster_id: number; owner_id: string | null }[], { user_id: string; display_name?: string; metadata?: { team_name?: string } }[]];
    return d.teams.map((t) => {
      const owner = rosters.find((r) => r.roster_id === t.rosterId)?.owner_id;
      const u = owner ? users.find((x) => x.user_id === owner) : undefined;
      const name = u?.metadata?.team_name?.trim();
      return name ? { ...t, name } : t;
    });
  } catch {
    return d.teams;
  }
}
