import { notFound } from "next/navigation";
import { MatchupCenter } from "../../../hq/packages/league-tiles/src/matchup-center-view.tsx";
import { pageStyle } from "../../../hq/packages/league-tiles/src/themes.ts";
import "../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { platformLeague } from "@/lib/platformLeagues";
import { getMatchupCenter } from "@/lib/matchups";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }) {
  const l = platformLeague((await params).league);
  return { title: l ? `Matchups · ${l.shortName}` : "Matchups" };
}

export default async function MatchupsPage({ params, searchParams }: { params: Promise<{ league: string }>; searchParams?: Promise<{ season?: string; week?: string }> }) {
  const league = platformLeague((await params).league);
  if (!league || !league.theme) notFound();
  const q = (await searchParams) ?? {};
  const model = await getMatchupCenter(league, { season: q.season ?? null, week: q.week ?? null });
  if (!model) notFound();
  return (
    <>
      <LeagueNav league={league} active="matchups" />
      <main style={{ ...pageStyle(league.theme), padding: "8px 16px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {league.sleeperLeagueId ? <p style={{ margin: "8px 0", textAlign: "right" }}><a href={`/${league.slug}/matchups/brackets`} style={{ fontWeight: 800 }}>Playoff brackets →</a></p> : null}
          <MatchupCenter model={model} theme={league.theme} />
        </div>
      </main>
    </>
  );
}
