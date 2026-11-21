import { notFound } from "next/navigation";
import { PowerRankingsBoard } from "../../../hq/packages/league-tiles/src/tiles.tsx";
import { RosterDetailView } from "../../../hq/packages/league-tiles/src/roster-detail-view.tsx";
import { pageStyle } from "../../../hq/packages/league-tiles/src/themes.ts";
import "../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { loadLeagueData } from "@/lib/leagueData";
import { getPowerRankings } from "@/lib/leaguePages";
import { platformLeague } from "@/lib/platformLeagues";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }) {
  const l = platformLeague((await params).league);
  return { title: l ? `Power Rankings · ${l.shortName}` : "Power Rankings" };
}

/** Power rankings + roster strength (same as the league's current site). */
export default async function PowerRankingsPage({ params }: { params: Promise<{ league: string }> }) {
  const league = platformLeague((await params).league);
  const data = league ? await loadLeagueData(league.id, league.currentSiteUrl) : null;
  if (!league || !league.theme || !data) notFound();
  const { state, detail } = await getPowerRankings(league);
  const teams = state.status === "READY" ? Object.fromEntries(state.data.rows.map((row) => [row.team.rosterId, { teamName: row.team.teamName, managerName: row.team.managerName }])) : {};
  return (
    <>
      <LeagueNav league={league} active="power-rankings" />
      <main style={{ ...pageStyle(league.theme), padding: "24px 16px 48px" }}>
        <PowerRankingsBoard
          state={state}
          theme={league.theme}
          eyebrow={league.name}
          title="Power Rankings"
          intro={`Every team, ranked by results (record, points and the last three weeks) blended with ${data.rules.dynasty ? "dynasty " : ""}roster value. Results count more as the season goes on.`}
          backLink={{ label: "Back to home", href: `/${league.slug}` }}
          predictorLink={{ label: "Open predictor: playoff and title odds", href: `/${league.slug}/predictor` }}
        />
        {detail ? <RosterDetailView detail={detail} teams={teams} theme={league.theme} dynasty={data.rules.dynasty} /> : null}
      </main>
    </>
  );
}
