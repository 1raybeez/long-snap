import { buildRivalries, type RivalryMeeting } from "../../../../hq/packages/league-tiles/src/rivalries.ts";
import { rivalryRecognitions, type RivalryPicks } from "../../../../hq/packages/league-tiles/src/rivalry-picks.ts";
import rivalryPicks from "@/lib/generated/rivalry-picks.json" with { type: "json" };
import { RivalryHub } from "../../../../hq/packages/league-tiles/src/rivalry-hub.tsx";
import { pageStyle } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks, rewritePath } from "@/lib/links";

export const metadata = { title: "Rivalries" };

export default async function RivalriesPage({ params, searchParams }: { params: Promise<{ league: string }>; searchParams?: Promise<{ side?: string; scope?: string; category?: string; more?: string }> }) {
  const { league, data, theme } = await leagueOr404(params);
  const q = (await searchParams) ?? {};

  const recognized = rivalryRecognitions((rivalryPicks as Record<string, RivalryPicks>)[league.id]);
  const rivalries = buildRivalries((data.people.rivalryGames ?? data.games) as RivalryMeeting[], recognized);
  const sides = rewriteLinks(league, data.people.sides);
  const h2h = (a: string, b: string) => { const p = data.people.h2hByFranchise[a < b ? `${a}|${b}` : `${b}|${a}`]; return p ? rewritePath(league, p) : `/${league.slug}/league-info/rivalries`; };
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        <RivalryHub leagueName={league.name} rivalries={rivalries} sides={sides} theme={theme} basePath={`/${league.slug}/league-info/rivalries`} sideLabel={data.copy.rivalrySideLabel} coverageNote={data.copy.rivalryCoverage} headToHeadHref={h2h} params={q} />
      </main>
    </>
  );
}
