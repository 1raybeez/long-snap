import { LeagueOverview } from "../../../hq/packages/league-tiles/src/league-overview.tsx";
import { pageStyle } from "../../../hq/packages/league-tiles/src/themes.ts";
import "../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";

export const metadata = { title: "League Info" };

/** League Info overview (same model as the league's current site; rule book, Legislative Hub and fees open here). */
export default async function LeagueInfoPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, data, theme } = await leagueOr404(params);
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main style={{ ...pageStyle(theme), padding: "0 16px 48px" }}>
        <LeagueOverview model={rewriteLinks(league, data.people.overview)} theme={theme} />
      </main>
    </>
  );
}
