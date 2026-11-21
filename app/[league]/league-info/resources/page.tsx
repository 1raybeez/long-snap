import { ResourcesView, type ResourceGroup } from "../../../../hq/packages/league-tiles/src/resources-view.tsx";
import { pageStyle } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";
import { sitePage } from "@/lib/sitePage";

export const revalidate = 3600;
export const metadata = { title: "Resources" };

type Model = { groups: ResourceGroup[]; playlists?: Parameters<typeof ResourcesView>[0]["playlists"]; leagueLinks: { name: string; description: string; url: string }[] };

/** The shared Resources page (same catalog and league links as the current site). */
export default async function ResourcesPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, theme } = await leagueOr404(params);
  const model = await sitePage<Model>(league, "resources");
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        {model ? <ResourcesView leagueName={league.name} theme={theme} groups={model.groups} playlists={model.playlists} leagueLinks={model.leagueLinks.map((l) => ({ ...l, url: rewriteLinks(league, l.url) }))} /> : <p style={{ color: theme.colors.text }}>Resources are unavailable right now. Please try again in a few minutes.</p>}
      </main>
    </>
  );
}
