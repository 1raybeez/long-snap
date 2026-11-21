import { notFound, permanentRedirect } from "next/navigation";
import { buildH2h, HeadToHeadView, type H2hSide } from "../../../../../../../hq/packages/league-tiles/src/head-to-head-view.tsx";
import { pageStyle } from "../../../../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";
import { ownerVsOpponent } from "@/lib/ownerOpponents";
import { renamedOwnerPagePath } from "@/lib/renamedOwners";

export const revalidate = 3600;
export const metadata = { title: "Head to head" };

export default async function OwnerOpponentPage({ params }: { params: Promise<{ league: string; slug: string; opponent: string }> }) {
  const { league, data, theme } = await leagueOr404(params);
  const p = await params;
  const pair = ownerVsOpponent(data, decodeURIComponent(p.slug), decodeURIComponent(p.opponent));
  if (!pair) {
    const moved = renamedOwnerPagePath(league, p.slug, p.opponent); // renamed owner id (2026-11-08)
    if (moved) permanentRedirect(moved);
    notFound();
  }
  const [a, b] = rewriteLinks(league, pair.sides) as [H2hSide, H2hSide];
  return (
    <>
      <LeagueNav league={league} active="managers" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        <HeadToHeadView model={buildH2h(pair.games, a, b)} theme={theme} leagueName={league.name} backLink={{ label: `Back to ${a.name}`, href: a.href ?? `/${league.slug}/managers` }} />
      </main>
    </>
  );
}
