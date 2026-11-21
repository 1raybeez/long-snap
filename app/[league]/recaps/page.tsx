import { redirect } from "next/navigation";
import { lastScoredWeek, loadLeagueTileData } from "../../../hq/packages/league-tiles/src/index.ts";
import { leagueOr404 } from "@/lib/leaguePage";
import { HQ_DATA_URL } from "@/lib/hqDataUrl";

export const revalidate = 900;

/** Recaps open on the last finished week. */
export default async function RecapsIndex({ params }: { params: Promise<{ league: string }> }) {
  const { league, data } = await leagueOr404(params);
  const { snapshot } = league.sleeperLeagueId ? await loadLeagueTileData({ hqLeagueId: league.id, sleeperLeagueId: league.sleeperLeagueId, hqDataUrl: HQ_DATA_URL, managerNames: data.managerNames }) : { snapshot: null };
  const week = snapshot ? lastScoredWeek(snapshot.league) : 0;
  redirect(week ? `/${league.slug}/recaps/week/${week}` : `/${league.slug}`);
}
