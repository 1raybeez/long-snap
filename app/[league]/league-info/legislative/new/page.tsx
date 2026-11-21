import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalForm } from "../../../../../hq/packages/league-site-pages/src/ProposalForm.tsx";
import { legislativePolicy } from "../../../../../hq/packages/league-governance/src/policy.ts";
import { pageStyle, themeCssVariables } from "../../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../../hq/packages/league-tiles/src/tiles.css";
import "@/app/hq-pages.css";
import { LeagueNav } from "@/app/league-nav";
import { hasLegislativeHub, legislativeApiBase, loadLegislativeHub } from "@/lib/legislativeHub";
import { leagueOr404 } from "@/lib/leaguePage";

import { isDemoMode } from "@/lib/demo/demoLeagues";
export const dynamic = "force-dynamic";
export const metadata = { title: "Submit a proposal" };

/** Submit a proposal on the platform: the shared form; the league site saves it with the signed-in owner as proposer. */
export default async function NewProposalPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, theme } = await leagueOr404(params);
  if (!hasLegislativeHub(league.id)) notFound();
  const policy = legislativePolicy(league.id);
  const hub = `/${league.slug}/league-info/legislative`;
  const { viewer, rules } = await loadLegislativeHub(league, { meetingName: policy.meetingName, ruleChangeThreshold: policy.ruleChangeThreshold });
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main className="hq-lcc" style={{ ...pageStyle(theme), ...themeCssVariables(theme), padding: "24px 16px 56px" }}>
        <div className="lcc2-page-container max-w-3xl">
          <Link href={hub} className="lcc2-button lcc2-button--secondary">← Legislative Hub</Link>
          <h1 className="lcc2-home-identity__title mt-6">Submit a proposal</h1>
          <p className="lcc2-home-identity__supporting">You&apos;re the proposer (from your sign-in). The whole league votes at the {policy.meetingName}; if it passes, the Constitution updates automatically.</p>
          {viewer.voterId ? (
            <ProposalForm rules={rules} apiBase={legislativeApiBase(league)} afterSubmitHref={hub} />
          ) : (
            <div className="lcc2-card mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
              <p className="lcc2-body">{isDemoMode() ? "Demo: pick a team to try the proposal form as its owner." : viewer.signedIn ? `Your account isn't linked to a current ${league.shortName} team. Ask the commissioner.` : "Sign in on My Leagues with the Google account linked to your team."}</p>
              {isDemoMode() ? <a href={`/demo-owner?team=1&next=${encodeURIComponent(`/${league.slug}/league-info/legislative/new`)}`} className="lcc2-button lcc2-button--primary">Try it as an owner</a> : viewer.signedIn ? null : <a href="/" className="lcc2-button lcc2-button--primary">Sign in</a>}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
