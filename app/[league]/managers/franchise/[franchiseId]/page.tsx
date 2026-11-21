import { notFound, redirect } from "next/navigation";
import { FranchisePageView } from "../../../../../hq/packages/league-tiles/src/franchise.tsx";
import { pageStyle } from "../../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";

/** A franchise's page: who held the seat and how it finished each season. */
export default async function FranchisePage({ params }: { params: Promise<{ league: string; franchiseId: string }> }) {
  const p = await params;
  const { league, data, theme } = await leagueOr404(Promise.resolve(p));
  const moved = data.people.franchiseRedirects?.[p.franchiseId];
  if (moved && moved !== p.franchiseId) redirect(`/${league.slug}/managers/franchise/${moved}`);
  const model = data.people.franchisePages[p.franchiseId];
  if (!model) notFound();
  return (
    <>
      <LeagueNav league={league} active="managers" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        <FranchisePageView model={{ ...rewriteLinks(league, model), ownerName: (id: string) => data.people.ownerNames[id] ?? id }} theme={theme} />
      </main>
    </>
  );
}
