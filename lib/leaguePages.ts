import { LEAGUE_PLAYOFF_FORMATS, autoWeeklyRecapTile, empty, lastScoredWeek, loadFantasyCalcRosterStrength, loadLeagueTileData, nflGameCenterTile, playoffRaceTile, powerRankingsTile, ready, unavailable, weeklyHighScoreTile, weeklyMatchupsTile, type LeagueHomeTiles, type PlayoffRaceData, type PowerRankingsData, type TileLinks, type TileState } from "../hq/packages/league-tiles/src/index.ts";
import { roastTeaser } from "../hq/packages/league-tiles/src/weekly-roast.ts";
import { legislativePolicy } from "../hq/packages/league-governance/src/policy.ts";
import { draftOrderFromSnapshot, type BracketMatch, type DraftOrderModel, type TradedPickLike } from "../hq/packages/league-tiles/src/draft-order.ts";
import { buildPlayoffBracket, type BracketMatchInput, type PlayoffBracketModel } from "../hq/packages/league-tiles/src/playoff-bracket.ts";
import { teamRefs } from "../hq/packages/league-tiles/src/sleeper-adapter.ts";
import { loadRosterStrengthDetail, type RosterDetail } from "../hq/packages/league-tiles/src/roster-detail.ts";
import { loadLeagueData, writtenFor } from "./leagueData.ts";
import type { PlatformLeague } from "./platformLeagues.ts";
import { sitePage } from "./sitePage.ts";
import { leagueAssetUrl } from "./links.ts";
import type { RosterStrength } from "../hq/packages/league-tiles/src/sleeper-adapter.ts";
import { FANTASYCALC_CREDIT } from "../hq/packages/league-tiles/src/roster-strength.ts";
import { HQ_DATA_URL } from "./hqDataUrl.ts";
import { columnRecapFor } from "./hostColumn.ts";
import { COLUMN_LEAGUES } from "./leagueFeatures.ts";
import { COLUMN_HOSTS } from "../hq/packages/league-tiles/src/host-column.ts";
import { sleeperFeedFetch } from "./sleeperFeed.ts";

const SITE_ROSTER_MODEL: ReadonlySet<string> = new Set(["river-city-ffl"]);

async function rosterStrengthFor(league: PlatformLeague, snapshot: Parameters<typeof loadFantasyCalcRosterStrength>[0], dynasty: boolean): Promise<RosterStrength | null> {
  if (!SITE_ROSTER_MODEL.has(league.id)) return loadFantasyCalcRosterStrength(snapshot, { dynasty });
  const m = await sitePage<{ scores: Record<string, number>; label: string }>(league, "roster-strength");
  return m ? { scores: new Map(Object.entries(m.scores).map(([k, v]) => [Number(k), v] as const)), label: m.label, credit: FANTASYCALC_CREDIT } : null;
}

/** Standings, draft order and power rankings for a league on the platform, the same way its current site builds them. */
const SLEEPER = "https://api.sleeper.app/v1";
const DOWN = "Sleeper is temporarily unavailable. Check back in a few minutes.";

export const linksFor = (league: PlatformLeague): TileLinks => ({
  matchups: { label: "Open matchups", href: `/${league.slug}/matchups` },
  standings: { label: "Full standings", href: `/${league.slug}/standings` },
  rankings: { label: "Full power rankings", href: `/${league.slug}/power-rankings` },
  weeklyResults: { label: "View results", href: `/${league.slug}/matchups` },
  history: { label: "League history", href: `/${league.slug}/history` },
});

async function snapshotFor(league: PlatformLeague) {
  const data = await loadLeagueData(league.id, league.currentSiteUrl);
  if (!data || !league.sleeperLeagueId) return { data, snapshot: null };
  const { snapshot } = await loadLeagueTileData({ hqLeagueId: league.id, sleeperLeagueId: league.sleeperLeagueId, hqDataUrl: HQ_DATA_URL, managerNames: data.managerNames });
  return { data, snapshot };
}

export async function getStandings(league: PlatformLeague): Promise<TileState<PlayoffRaceData>> {
  const { snapshot } = await snapshotFor(league);
  return snapshot ? playoffRaceTile(snapshot, linksFor(league), LEAGUE_PLAYOFF_FORMATS[league.id]) : unavailable(DOWN);
}

async function json<T>(url: string): Promise<T | null> {
  try { const r = await sleeperFeedFetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) } as RequestInit); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

export async function getDraftOrder(league: PlatformLeague): Promise<DraftOrderModel | null> {
  const { data, snapshot } = await snapshotFor(league);
  if (!data || !snapshot) return null;
  const standings = playoffRaceTile(snapshot, linksFor(league), LEAGUE_PLAYOFF_FORMATS[league.id]);
  if (standings.status !== "READY") return null;
  const [tradedPicks, bracket] = await Promise.all([
    json<TradedPickLike[]>(`${SLEEPER}/league/${league.sleeperLeagueId}/traded_picks`),
    json<BracketMatch[]>(`${SLEEPER}/league/${league.sleeperLeagueId}/winners_bracket`),
  ]);
  return draftOrderFromSnapshot({ bracket, snapshot, rows: standings.data.rows, playoffSpots: standings.data.playoffSpots, throughWeek: standings.data.throughWeek, rule: { nonPlayoff: data.rules.draftOrder }, tradedPicks: tradedPicks ?? [] });
}

export async function getPowerRankings(league: PlatformLeague): Promise<{ state: TileState<PowerRankingsData>; detail: RosterDetail | null }> {
  const { data, snapshot } = await snapshotFor(league);
  if (!data || !snapshot) return { state: unavailable(DOWN), detail: null };
  // A league with its own roster model gets no FantasyCalc detail table (it would rank teams differently).
  const [rosterStrength, detail] = await Promise.all([rosterStrengthFor(league, snapshot, data.rules.dynasty), SITE_ROSTER_MODEL.has(league.id) ? Promise.resolve(null) : loadRosterStrengthDetail(snapshot, { dynasty: data.rules.dynasty })]);
  return { state: powerRankingsTile(snapshot, { links: linksFor(league), rosterStrength }), detail };
}

/**
 * The league's home tiles on the platform: the same nine tiles as its current site. Two differences until the
 * league's own database is connected (decision pending): League Voice links to the current site's Legislative Hub
 * instead of listing open proposals, and the Tuesday awards run on the current site only.
 */
export async function getHomeTiles(league: PlatformLeague, now = new Date()): Promise<LeagueHomeTiles | null> {
  const data = await loadLeagueData(league.id, league.currentSiteUrl);
  if (!data || !league.sleeperLeagueId) return null;
  const links = linksFor(league);
  const { snapshot, nflWeek, scoreboard } = await loadLeagueTileData({ hqLeagueId: league.id, sleeperLeagueId: league.sleeperLeagueId, hqDataUrl: HQ_DATA_URL, managerNames: data.managerNames });
  const rosterStrength = await rosterStrengthFor(league, snapshot, data.rules.dynasty);
  const down = <T,>(): TileState<T> => unavailable(DOWN);
  const lastWeek = snapshot ? lastScoredWeek(snapshot.league) : 0;
  const written = snapshot && lastWeek ? await writtenFor(league.id, league.currentSiteUrl, data.season, lastWeek) : null;
  const recapFile = written?.recap ?? null;
  const outsideRoast = written?.roast ?? null;

  const columnHost = COLUMN_LEAGUES[league.id];
  const columnRecap = columnHost && lastWeek ? columnRecapFor(league.id, data.season, lastWeek) : null;
  const c = data.champion; const f = data.finances; const p = f.payouts;
  return {
    NFL_GAME_CENTER: nflGameCenterTile({ scoreboard, now, scoresLink: nflWeek ? { label: `NFL week ${nflWeek} scores`, href: `/${league.slug}/nfl/week/${nflWeek}` } : undefined }),
    REIGNING_CHAMPION: c ? ready({ season: c.season, team: { rosterId: 0, teamName: c.teamName, managerName: c.managerName, avatarUrl: c.image ? (c.image.startsWith("http") ? c.image : leagueAssetUrl(league, c.image)) : null }, record: null, note: `The latest verified ${league.shortName} champion.`, historyLink: links.history ?? null }) : empty("No champion on record yet."),
    WEEKLY_HIGH_SCORE: snapshot ? weeklyHighScoreTile(snapshot, { prize: f.weeklyHighPayout ? `$${f.weeklyHighPayout} weekly winner` : undefined, links }) : down(),
    PLAYOFF_RACE: snapshot ? playoffRaceTile(snapshot, links, LEAGUE_PLAYOFF_FORMATS[league.id]) : down(),
    WEEKLY_MATCHUPS: snapshot ? weeklyMatchupsTile(snapshot, links) : down(),
    POWER_RANKINGS: snapshot ? powerRankingsTile(snapshot, { links, rosterStrength }) : down(),
    WEEKLY_RECAP: snapshot
      ? (recapFile
        ? ready({ week: lastWeek, headline: recapFile.title, summary: roastTeaser(recapFile as never), author: recapFile.author || "Claude", publishedAt: recapFile.writtenAt ?? null, recapLink: { label: "Read the full recap", href: `/${league.slug}/recaps/week/${lastWeek}` } }, snapshot.asOf, snapshot.stale)
        : columnRecap && columnHost
          ? ready({ week: lastWeek, headline: columnRecap.title, summary: columnRecap.dek, author: COLUMN_HOSTS[columnHost]?.columnName ?? null, publishedAt: columnRecap.date, recapLink: { label: "Read the recap", href: `/${league.slug}/column/${columnRecap.slug}` } }, snapshot.asOf, snapshot.stale)
        : outsideRoast

          ? ready({ week: outsideRoast.week, headline: outsideRoast.title, summary: outsideRoast.description ?? "", author: "Wade", publishedAt: null, recapLink: { label: "Read the Roast", href: `/${league.slug}/recaps/week/${outsideRoast.week}` } }, snapshot.asOf, snapshot.stale)
          : autoWeeklyRecapTile(snapshot, (week) => ({ label: "Read full recap", href: `/${league.slug}/recaps/week/${week}` })))
      : down(),
    LEAGUE_VOICE: ready({ openItems: [], latestDecision: null, meetingLabel: (() => { try { const pol = legislativePolicy(league.id); return `the spring ${pol.meetingName.toLowerCase()} (${pol.meetingWindow})`; } catch { return "the spring owners meeting"; } })(), submitLink: { label: "Submit a proposal", href: `/${league.slug}/league-info/legislative/new` }, hubLink: { label: "Legislative Hub", href: `/${league.slug}/league-info/legislative` } }),
    LEAGUE_FINANCES: ready({
      season: data.season,
      prizePool: f.entryFee ? f.entryFee * f.teamCount : null,
      currency: "USD",
      payouts: ([["Champion", p.championBase], ["Runner-up", p.runnerUp], ["Third place", p.thirdPlace], ["Fourth place", p.fourthPlace]] as const).flatMap(([label, amount]) => (typeof amount === "number" ? [{ label: label as string, amount }] : [])),
      weeklyPrize: f.weeklyHighPayout,
      duesStatus: null,
      financesLink: { label: "View fees & payouts", href: `/${league.slug}/league-info/fees` },
    }),
  };
}

/** Names the league uses for its losers bracket (only where the league itself uses the name). */
const LOSERS_BRACKET_NAME: Readonly<Record<string, string>> = { "river-city-ffl": "Toilet Bowl" };

/** Playoff brackets: the field if the season ended today (league seeding rules), then Sleeper's brackets with scores. */
export async function getPlayoffBrackets(league: PlatformLeague): Promise<PlayoffBracketModel | null> {
  const { snapshot } = await snapshotFor(league);
  if (!snapshot || !league.sleeperLeagueId) return null;
  const standings = playoffRaceTile(snapshot, linksFor(league), LEAGUE_PLAYOFF_FORMATS[league.id]);
  const settings = (snapshot.league.settings ?? {}) as Record<string, unknown>;
  const start = Number(settings.playoff_week_start) || null;
  const spots = Number(settings.playoff_teams) || (standings.status === "READY" ? standings.data.playoffSpots : 0);
  const [winners, losers] = await Promise.all([
    json<BracketMatchInput[]>(`${SLEEPER}/league/${league.sleeperLeagueId}/winners_bracket`),
    json<BracketMatchInput[]>(`${SLEEPER}/league/${league.sleeperLeagueId}/losers_bracket`),
  ]);
  const pointsByWeek: Record<number, Map<number, number>> = {};
  if (start && snapshot.nflWeek >= start) {
    const weeks = [0, 1, 2, 3].map((i) => start + i).filter((w) => w <= snapshot.nflWeek);
    const rows = await Promise.all(weeks.map((w) => json<{ roster_id: number; points?: number | null; custom_points?: number | null }[]>(`${SLEEPER}/league/${league.sleeperLeagueId}/matchups/${w}`)));
    weeks.forEach((w, i) => { pointsByWeek[w] = new Map((rows[i] ?? []).map((m) => [m.roster_id, Number(m.custom_points ?? m.points ?? 0)])); });
  }
  return buildPlayoffBracket({
    season: Number(snapshot.league.season) || league.season,
    playoffStartWeek: start,
    currentWeek: snapshot.nflWeek,
    winners: winners ?? [],
    losers: losers ?? [],
    teams: teamRefs(snapshot),
    pointsByWeek,
    lastScoredWeek: lastScoredWeek(snapshot.league),
    standings: standings.status === "READY" ? standings.data.rows : null,
    playoffSpots: spots,
    losersName: LOSERS_BRACKET_NAME[league.id],
  });
}
