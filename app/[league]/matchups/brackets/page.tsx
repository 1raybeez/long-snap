import { notFound } from "next/navigation";
import { PlayoffBracketView } from "../../../../hq/packages/league-tiles/src/playoff-bracket-view.tsx";
import { pageStyle } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { getPlayoffBrackets } from "@/lib/leaguePages";
import { platformLeague } from "@/lib/platformLeagues";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }) {
  const l = platformLeague((await params).league);
  return { title: l ? `Playoff brackets · ${l.shortName}` : "Playoff brackets" };
}

export default async function BracketsPage({ params }: { params: Promise<{ league: string }> }) {
  const league = platformLeague((await params).league);
  if (!league || !league.theme || !league.sleeperLeagueId) notFound();
  const model = await getPlayoffBrackets(league);
  if (!model) notFound();
  return (
    <>
      <LeagueNav league={league} active="matchups" />
      <main style={{ ...pageStyle(league.theme), padding: "24px 16px 48px" }}>
        <PlayoffBracketView model={model} theme={league.theme} leagueName={league.name} standingsHref={`/${league.slug}/standings`} matchupsHref={`/${league.slug}/matchups`} />
      </main>
    </>
  );
}
