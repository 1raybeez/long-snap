import { notFound } from "next/navigation";
import { DraftOrderBoard, StandingsBoard } from "../../../hq/packages/league-tiles/src/tiles.tsx";
import { draftColumnFromOrder } from "../../../hq/packages/league-tiles/src/draft-order.ts";
import { pageStyle } from "../../../hq/packages/league-tiles/src/themes.ts";
import "../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { loadLeagueData } from "@/lib/leagueData";
import { getDraftOrder, getStandings } from "@/lib/leaguePages";
import { platformLeague } from "@/lib/platformLeagues";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }) {
  const l = platformLeague((await params).league);
  return { title: l ? `Standings · ${l.shortName}` : "Standings" };
}

/** Standings + Draft order tab (same as the league's current site). */
export default async function StandingsPage({ params, searchParams }: { params: Promise<{ league: string }>; searchParams?: Promise<{ view?: string }> }) {
  const league = platformLeague((await params).league);
  const data = league ? await loadLeagueData(league.id, league.currentSiteUrl) : null;
  if (!league || !league.theme || !data) notFound();
  // A redraft league that follows Sleeper has no draft-order rule of its own, so it gets standings only.
  const view = !data.sleeperOnly && (await searchParams)?.view === "draft" ? "draft" : "standings";
  const base = `/${league.slug}/standings`;
  const tabs = data.sleeperOnly ? undefined : [{ label: "Standings", href: base, active: view === "standings" }, { label: "Draft order", href: `${base}?view=draft`, active: view === "draft" }];
  const back = { label: "Back to home", href: `/${league.slug}` };
  return (
    <>
      <LeagueNav league={league} active="standings" />
      <main style={{ ...pageStyle(league.theme), padding: "24px 16px 48px" }}>
        {view === "draft"
          ? <DraftOrderBoard model={await getDraftOrder(league)} theme={league.theme} eyebrow={league.name} title="Standings" backLink={back} tabs={tabs} ruleText={data.rules.draftRuleText} />
          : await (async () => {
            const state = await getStandings(league);

            const draft = data.rules.draftOrder === "maxPf" && state.status === "READY" ? draftColumnFromOrder(await getDraftOrder(league), state.data.playoffSpots, { label: "Full draft order →", href: `${base}?view=draft` }) : null;
            return <StandingsBoard state={state} theme={league.theme!} eyebrow={league.name} title="Standings" backLink={back} tabs={tabs} draft={draft} />;
          })()}
      </main>
    </>
  );
}
