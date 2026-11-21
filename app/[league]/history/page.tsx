import { notFound } from "next/navigation";
import { HistoryHub, type HistoryHubConfig } from "../../../hq/packages/league-tiles/src/history-hub.tsx";
import { pageStyle } from "../../../hq/packages/league-tiles/src/themes.ts";
import "../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { loadLeagueData } from "@/lib/leagueData";
import { platformLeague } from "@/lib/platformLeagues";
import { rewritePath } from "@/lib/links";

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }) {
  const l = platformLeague((await params).league);
  return { title: l ? `History · ${l.shortName}` : "History" };
}

/** The shared History page with the league's own results. Pages not on the platform yet open on the current site. */
export default async function HistoryPage({ params, searchParams }: { params: Promise<{ league: string }>; searchParams?: Promise<{ view?: string; scope?: string; tab?: string }> }) {
  const league = platformLeague((await params).league);

  const data = league?.fullSite ? await loadLeagueData(league.id, league.currentSiteUrl).catch(() => null) : null;
  if (!league || !league.theme || !data) notFound();
  const q = (await searchParams) ?? {};
  const abs = (href: string) => rewritePath(league, href);
  const h = data.history;
  const config: HistoryHubConfig = {
    ...h.config,
    seasonHref: (season: number) => `/${league.slug}/history/${season}`,
    exploreLinks: (h.config.exploreLinks ?? []).map((l) => ({ ...l, href: abs(l.href) })),
    backLink: { label: "Back to home", href: `/${league.slug}` },
  };
  const owners = h.owners.map((o) => ({ ...o, photo: o.photo ? abs(o.photo) : null }));
  return (
    <>
      <LeagueNav league={league} active="history" />
      <main style={{ ...pageStyle(league.theme), padding: "24px 16px 48px" }}>
        <HistoryHub results={h.results} owners={owners} config={config} theme={league.theme} basePath={`/${league.slug}/history`} view={q.view} scope={q.scope} tab={q.tab} />
      </main>
    </>
  );
}
