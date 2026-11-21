import { notFound } from "next/navigation";
import { PayoutsView } from "../../../../hq/packages/league-tiles/src/payouts-view.tsx";
import { pageStyle } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";
import { sitePage } from "@/lib/sitePage";

export const revalidate = 900;
export const metadata = { title: "Fees & Payouts" };

type Model = { model: Parameters<typeof PayoutsView>[0]["model"]; defaultSeason?: string };
const FEE_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl", "long-country-club", "rva-eskimo-brothers", "lakeview-ffl", "mill-creek-ffl", "harbor-city-ffl", "ironworks-dynasty"]);

/** Fees & Payouts on the platform (2026-11-04): the shared Payouts page with the league site's own model. */
export default async function FeesPage({ params, searchParams }: { params: Promise<{ league: string }>; searchParams?: Promise<{ season?: string }> }) {
  const { league, theme } = await leagueOr404(params);
  if (!FEE_LEAGUES.has(league.id)) notFound();
  const data = await sitePage<Model>(league, "payouts");
  const season = (await searchParams)?.season ?? data?.defaultSeason ?? null;
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        {data ? <PayoutsView model={rewriteLinks(league, data.model)} theme={theme} basePath={`/${league.slug}/league-info/fees`} season={season} /> : <p style={{ color: theme.colors.text }}>Fees and payouts are unavailable right now. Please try again in a few minutes.</p>}
      </main>
    </>
  );
}
