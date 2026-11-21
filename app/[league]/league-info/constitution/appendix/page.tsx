import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoringAppendixView } from "../../../../../hq/packages/league-tiles/src/scoring-appendix-view.tsx";
import { loadScoringAppendix } from "../../../../../hq/packages/league-tiles/src/scoring-appendix.ts";
import { pageStyle, themeCssVariables } from "../../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { SCORING_APPENDIX_LEAGUES } from "@/lib/leagueFeatures";

import { isDemoMode } from "@/lib/demo/demoLeagues";
export const revalidate = 86400;
export const metadata = { title: "Constitution Appendix B" };
const APPENDIX_NAMES: Readonly<Record<string, string>> = {};

export default async function ConstitutionAppendixPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, theme } = await leagueOr404(params);
  if (!SCORING_APPENDIX_LEAGUES.has(league.id) || !league.sleeperLeagueId) notFound();
  const leagueId = league.sleeperLeagueId;
  const appendix = await loadScoringAppendix(leagueId, { leagueName: APPENDIX_NAMES[league.id] ?? league.name, init: { next: { revalidate: 86400 } } as RequestInit });
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 56px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
          <nav className="league-tiles" style={{ ...(themeCssVariables(theme) as CSSProperties), display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }} aria-label="Appendix">
            <Link href={`/${league.slug}/league-info/constitution`} style={{ color: "var(--tile-accent)" }}>← Rules of Play</Link>
            <a href="#appendix-b" style={{ color: "var(--tile-muted)" }}>B · Scoring &amp; Roster</a>
          </nav>
          {appendix ? (
            <ScoringAppendixView appendix={appendix} theme={theme} sleeperUrl={isDemoMode() ? "https://sleeper.com" : `https://sleeper.com/leagues/${leagueId}`} />
          ) : (
            <section id="appendix-b"><p>Appendix B: Sleeper&rsquo;s scoring settings couldn&rsquo;t be loaded right now. Please try again in a few minutes.</p></section>
          )}
        </div>
      </main>
    </>
  );
}
