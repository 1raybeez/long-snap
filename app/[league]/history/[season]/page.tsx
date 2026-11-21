import { notFound } from "next/navigation";
import { SeasonView, type SeasonPageModel } from "../../../../hq/packages/league-tiles/src/season-view.tsx";
import { pageStyle } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";
import { sitePage } from "@/lib/sitePage";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ season: string }> }) {
  return { title: `${(await params).season} season` };
}

/** One season on the shared season page (same model as the current site). */
export default async function SeasonPage({ params }: { params: Promise<{ league: string; season: string }> }) {
  const { league, theme } = await leagueOr404(params);
  const season = Number((await params).season);
  if (!Number.isInteger(season)) notFound();
  const model = await sitePage<SeasonPageModel>(league, "season", { season });
  if (!model) notFound();
  return (
    <>
      <LeagueNav league={league} active="history" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        <SeasonView model={rewriteLinks(league, model)} theme={theme} />
      </main>
    </>
  );
}
