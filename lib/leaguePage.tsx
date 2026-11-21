import { notFound } from "next/navigation";
import { loadLeagueData, type LeagueData } from "./leagueData.ts";
import { platformLeague, type PlatformLeague } from "./platformLeagues.ts";
import type { LeagueTileTheme } from "../hq/packages/league-tiles/src/themes.ts";

/** Common lookup for a league page on the platform: the league, its exported data and theme, or 404. */
export async function leagueOr404(params: Promise<{ league: string }>): Promise<{ league: PlatformLeague; data: LeagueData; theme: LeagueTileTheme }> {
  const league = platformLeague((await params).league);
  const data = league ? await loadLeagueData(league.id, league.currentSiteUrl) : null;
  if (!league || !data || !league.theme) notFound();
  return { league, data, theme: league.theme };
}
