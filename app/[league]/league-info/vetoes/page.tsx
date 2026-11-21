import { notFound } from "next/navigation";
import { VetoLogView } from "../../../../hq/packages/league-tiles/src/veto-log-view.tsx";
import type { VetoLogModel } from "../../../../hq/packages/league-tiles/src/veto-log.ts";
import { pageStyle } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { VETO_LOG_LEAGUES } from "@/lib/leagueFeatures";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewritePath } from "@/lib/links";
import { riverCityPublicVetoLog } from "@/lib/riverCityVetoes";
import { leaguePublicVetoLog } from "@/lib/leagueVetoes";

import { demoVetoLog } from "@/lib/demo/demoGovernance";
import { DEMO_SLUGS } from "@/lib/demo/demoLeagues";
export const revalidate = 300;
export const metadata = { title: "Veto Log" };

export default async function VetoLogPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, theme } = await leagueOr404(params);
  if (!VETO_LOG_LEAGUES.has(league.id)) notFound();
  const m: { model: VetoLogModel; constitutionHref: string } | null = await (DEMO_SLUGS.includes(league.id) ? Promise.resolve(demoVetoLog(league.id)) : league.id === "river-city-ffl" ? riverCityPublicVetoLog() : leaguePublicVetoLog(league.id)).catch(() => null);
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 56px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          {m ? <VetoLogView model={m.model} theme={theme} leagueName={league.shortName} constitutionHref={rewritePath(league, m.constitutionHref)} /> : <p style={{ color: theme.colors.text }}>The Veto Log is unavailable right now. Please try again in a few minutes.</p>}
        </div>
      </main>
    </>
  );
}
