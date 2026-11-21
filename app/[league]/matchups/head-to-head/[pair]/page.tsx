import { notFound, permanentRedirect } from "next/navigation";
import { buildH2h, HeadToHeadView, type H2hSide } from "../../../../../hq/packages/league-tiles/src/head-to-head-view.tsx";
import { pageStyle } from "../../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";
import { renamedHeadToHeadPath } from "@/lib/renamedOwners";

export const revalidate = 3600;
export const metadata = { title: "Head to head" };

/** All-time series between two franchises ("<a>-vs-<b>", the same address as the league's current site). */
export default async function HeadToHeadPage({ params }: { params: Promise<{ league: string; pair: string }> }) {
  const { league, data, theme } = await leagueOr404(params);
  const [aId, bId] = decodeURIComponent((await params).pair).split("-vs-");
  if (!aId || !bId || aId === bId) notFound();
  const sides = rewriteLinks(league, data.people.sides);
  const side = (id: string): H2hSide | null => {
    const s = sides.find((x) => x.id === id);
    const t = data.teams.find((x) => x.franchiseId === id);
    return s ? { id, name: s.name, photo: s.photo, href: s.href } : t ? { id, name: t.name ?? id, photo: t.image, href: null } : null;
  };
  const a = side(aId), b = side(bId);
  if (!a || !b) {
    const moved = renamedHeadToHeadPath(league, (await params).pair); // renamed owner id (2026-11-08)
    if (moved) permanentRedirect(moved);
    notFound();
  }
  return (
    <>
      <LeagueNav league={league} active="matchups" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        <HeadToHeadView model={buildH2h(data.games, a, b)} theme={theme} leagueName={league.name} backLink={{ label: "Rivalries", href: `/${league.slug}/league-info/rivalries` }} />
      </main>
    </>
  );
}
