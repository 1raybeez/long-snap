import { notFound } from "next/navigation";
import { LeagueLegislativeHub } from "../../../../hq/packages/league-site-pages/src/LeagueLegislativeHub.tsx";
import { legislativePolicy } from "../../../../hq/packages/league-governance/src/policy.ts";
import { pageStyle, themeCssVariables } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import "@/app/hq-pages.css";
import { LeagueNav } from "@/app/league-nav";
import { hasLegislativeHub, legislativeApiBase, loadLegislativeHub } from "@/lib/legislativeHub";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks, rewritePath } from "@/lib/links";

import { isDemoMode } from "@/lib/demo/demoLeagues";
export const dynamic = "force-dynamic";
export const metadata = { title: "Legislative Hub" };

const AMENDMENTS: Readonly<Record<string, string>> = { "river-city-ffl": "/history/version-history" };

/**
 * Legislative Hub on the platform (2026-11-04): the shared hub page (HQ league-site-pages) for all three leagues,
 * reading and voting through each league's own Legislative Hub as the signed-in owner (lib/legislativeHub.ts).
 */
export default async function LegislativeHubPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, theme } = await leagueOr404(params);
  if (!hasLegislativeHub(league.id)) notFound();
  const policy = legislativePolicy(league.id);
  const data = rewriteLinks(league, await loadLegislativeHub(league, { meetingName: policy.meetingName, ruleChangeThreshold: policy.ruleChangeThreshold }));
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main className="hq-lcc" style={{ ...pageStyle(theme), ...themeCssVariables(theme), padding: "24px 16px 56px" }}>
        <LeagueLegislativeHub
          data={data}
          policy={policy}
          constitutionHref={`/${league.slug}/league-info/constitution`}
          amendmentHistoryHref={AMENDMENTS[league.id] ? rewritePath(league, AMENDMENTS[league.id]!) : `/${league.slug}/league-info/constitution#amendment-history`}
          apiBase={legislativeApiBase(league)}
          newProposalHref={`/${league.slug}/league-info/legislative/new`}
          signInHref={isDemoMode() ? `/demo-owner?team=1&next=${encodeURIComponent(`/${league.slug}/league-info/legislative`)}` : "/"}
        />
      </main>
    </>
  );
}
