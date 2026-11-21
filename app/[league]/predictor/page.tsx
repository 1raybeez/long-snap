import { notFound } from "next/navigation";
import { LEAGUE_PLAYOFF_FORMATS, loadLeagueSeasonData, simulateSeason } from "../../../hq/packages/league-tiles/src/index.ts";
import { SimulatorView } from "../../../hq/packages/league-tiles/src/simulator-view.tsx";
import { pageStyle } from "../../../hq/packages/league-tiles/src/themes.ts";
import "../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { loadLeagueData } from "@/lib/leagueData";
import { platformLeague } from "@/lib/platformLeagues";
import { HQ_DATA_URL } from "@/lib/hqDataUrl";

export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }) {
  const l = platformLeague((await params).league);
  return { title: l ? `Predictor · ${l.shortName}` : "Predictor" };
}

/** Playoff, bye and title odds from the shared season simulator, with the league's own seeding rules. */
export default async function PredictorPage({ params }: { params: Promise<{ league: string }> }) {
  const league = platformLeague((await params).league);
  const data = league ? await loadLeagueData(league.id, league.currentSiteUrl) : null;
  const format = league ? LEAGUE_PLAYOFF_FORMATS[league.id] : undefined;
  if (!league || !league.theme || !data || !format || !league.sleeperLeagueId) notFound();
  const { snapshot } = await loadLeagueSeasonData({ hqLeagueId: league.id, sleeperLeagueId: league.sleeperLeagueId, hqDataUrl: HQ_DATA_URL, managerNames: data.managerNames }, data.regularSeasonWeeks).catch(() => ({ snapshot: null }));
  const result = snapshot ? simulateSeason(snapshot, format) : null;
  return (
    <>
      <LeagueNav league={league} active="predictor" />
      <main style={{ ...pageStyle(league.theme), padding: "24px 16px 48px" }}>
        <SimulatorView leagueName={league.name} result={result} theme={league.theme} backLink={{ label: "← Power rankings", href: `/${league.slug}/power-rankings` }} />
      </main>
    </>
  );
}
