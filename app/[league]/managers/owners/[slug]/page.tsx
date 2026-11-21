import { notFound, permanentRedirect } from "next/navigation";
import { OwnerProfileView } from "../../../../../hq/packages/league-tiles/src/owner-profile.tsx";
import { pageStyle } from "../../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { CONTACT_LEAGUES, PUBLISHED_POST_DRAFT_LEAGUES } from "@/lib/leagueFeatures";
import { rewriteLinks } from "@/lib/links";
import { riverCityTeamOutlook } from "@/lib/riverCityPublished";
import { renamedOwnerPagePath } from "@/lib/renamedOwners";

export const revalidate = 300;

export default async function OwnerPage({ params }: { params: Promise<{ league: string; slug: string }> }) {
  const p = await params;
  const { league, data, theme } = await leagueOr404(Promise.resolve(p));
  const exported = data.people.ownerPages[p.slug];
  if (!exported) {

    const moved = renamedOwnerPagePath(league, p.slug);
    if (moved) permanentRedirect(moved);
    notFound();
  }
  const model = PUBLISHED_POST_DRAFT_LEAGUES.has(league.id) ? { ...exported, outlook: await riverCityTeamOutlook(p.slug) } : exported;

  const withContact = (m: typeof model): typeof model => (CONTACT_LEAGUES.has(league.id) ? { ...m, contact: { methods: m.contact?.methods ?? [], quote: m.contact?.quote ?? null, actions: { endpoint: `/api/${league.slug}/members/contact/${p.slug}`, signInHref: "/" } } } : m);
  return (
    <>
      <LeagueNav league={league} active="managers" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        <OwnerProfileView model={withContact(rewriteLinks(league, model))} theme={theme} />
      </main>
    </>
  );
}
