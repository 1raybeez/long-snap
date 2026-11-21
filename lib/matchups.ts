import { rewritePath } from "./links.ts";
import { lastScoredWeek, loadMatchupWeekData, matchupDisplayWeek } from "../hq/packages/league-tiles/src/index.ts";
import { buildMatchupCards, previewEpisode, weekStatus } from "../hq/packages/league-tiles/src/matchup-center.ts";
import type { MatchupCenterViewModel } from "../hq/packages/league-tiles/src/matchup-center-view.tsx";
import { loadLeagueData, seriesBetween, seriesHistory, writtenFor } from "./leagueData.ts";
import { currentSeasonGames, seriesBetweenSides, SERIES_BASIS } from "../hq/packages/league-tiles/src/series.ts";
import type { PlatformLeague } from "./platformLeagues.ts";
import { HQ_DATA_URL } from "./hqDataUrl.ts";

/** A league's Matchups page on the platform: the shared Matchup Center with that league's own data (same as its current site). */
export async function getMatchupCenter(league: PlatformLeague, params: { season?: string | null; week?: string | null }): Promise<MatchupCenterViewModel | null> {
  const data = await loadLeagueData(league.id, league.currentSiteUrl);
  if (!data) return null;
  const ids = data.leagueIdsBySeason;
  const seasons = Object.keys(ids).map(Number).sort((a, b) => b - a);
  const requested = Number(params.season);
  const season = seasons.includes(requested) ? requested : data.season;
  const isCurrent = season === data.season;
  const requestedWeek = Number(params.week);
  const loaded = await loadMatchupWeekData({ hqLeagueId: league.id, sleeperLeagueId: ids[String(season)]!, hqDataUrl: isCurrent ? HQ_DATA_URL : null, managerNames: data.managerNames }, requestedWeek >= 1 && requestedWeek <= 18 ? requestedWeek : null, { fullSeason: isCurrent });
  const snapshot = loaded.snapshot;
  const settings = (snapshot?.league.settings ?? {}) as Record<string, unknown>;
  const lastWeek = Math.min(18, Number(settings.playoff_week_start ?? 15) + 2);
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);
  const defaultWeek = snapshot ? (isCurrent ? matchupDisplayWeek({ stateWeek: snapshot.nflWeek, displayWeek: snapshot.displayWeek, lastScoredWeek: lastScoredWeek(snapshot.league), seasonType: snapshot.seasonType, hasMatchups: (w) => Boolean(snapshot.matchupsByWeek[w]?.length) }) : Math.max(1, lastScoredWeek(snapshot.league))) : 1;
  const week = requestedWeek >= 1 && requestedWeek <= lastWeek ? requestedWeek : defaultWeek;
  const written = isCurrent ? (await writtenFor(league.id, league.currentSiteUrl, season, week)).preview : null;
  const team = (rosterId: number) => data.teams.find((t) => t.rosterId === rosterId);
  // Shared series count (2026-11-13): finished seasons plus this season's finished regular-season weeks.
  const hist = seriesHistory(league.id);
  const scored = snapshot ? lastScoredWeek(snapshot.league) : 0;
  const playoffStart = Number(settings.playoff_week_start ?? 15);
  const seriesGames = hist && snapshot && isCurrent ? [...hist.games, ...currentSeasonGames(season, Object.fromEntries(Object.entries(snapshot.matchupsByWeek).filter(([w]) => Number(w) <= scored && Number(w) < playoffStart)), hist.units)] : hist?.games ?? null;
  const cards = snapshot ? buildMatchupCards(snapshot, week, {
    ownerLabel: (rosterId, fallback) => (isCurrent ? team(rosterId)?.ownerLabel : null) || fallback,
    avatar: (rosterId) => team(rosterId)?.image ?? null,
    h2hHref: (a, b) => { const p = data.h2h[`${Math.min(a, b)}-${Math.max(a, b)}`]; return p ? rewritePath(league, p) : null; },
    series: (a, b) => {
      if (hist && seriesGames) { const r = seriesBetweenSides(seriesGames, hist.units.get(a) ?? [], hist.units.get(b) ?? []); return r ? { aWins: r.aWins, bWins: r.bWins, ties: r.ties } : null; }
      const fa = team(a)?.franchiseId, fb = team(b)?.franchiseId; return fa && fb ? seriesBetween(data.games, fa, fb) : null;
    },
    written,
    previews: isCurrent,
    showRecords: isCurrent,
  }) : [];
  return {
    leagueName: league.name,
    season, week, seasons, weeks,
    defaultSeason: data.season,
    defaultWeek: isCurrent ? defaultWeek : -1,
    basePath: `/${league.slug}/matchups`,
    status: snapshot && cards.length ? weekStatus(snapshot, week) : null,
    cards,
    episode: previewEpisode(written),
    emptyText: snapshot ? "Matchups for this week are not available yet." : "Sleeper is temporarily unavailable. Check back in a few minutes.",
    notes: isCurrent ? [SERIES_BASIS[league.id] === "owner" ? "All-time series is owner vs owner (it follows the person), regular season and playoffs, this season included." : SERIES_BASIS[league.id] ? "All-time series is franchise vs franchise, regular season and playoffs, this season included." : "All-time series counts completed seasons, franchise vs franchise, regular season and playoffs."] : [],
  };
}
