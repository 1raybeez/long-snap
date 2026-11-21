import { buildRecords, gamesFromSnapshot, LEAGUE_PLAYOFF_FORMATS, loadLeagueSeasonData } from "../../../../hq/packages/league-tiles/src/index.ts";
import { RecordsView, type RecordSideInfo } from "../../../../hq/packages/league-tiles/src/records-view.tsx";
import type { RivalryMeeting } from "../../../../hq/packages/league-tiles/src/rivalries.ts";
import { pageStyle } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";
import { HQ_DATA_URL } from "@/lib/hqDataUrl";

export const revalidate = 900;
export const metadata = { title: "Records" };

/** The shared Record Book: saved games of completed seasons + this season's finished weeks from Sleeper. */
export default async function RecordsPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, data, theme } = await leagueOr404(params);
  const team = (rosterId: number) => data.teams.find((t) => t.rosterId === rosterId)?.franchiseId ?? `roster-${rosterId}`;
  const { snapshot } = league.sleeperLeagueId ? await loadLeagueSeasonData({ hqLeagueId: league.id, sleeperLeagueId: league.sleeperLeagueId, hqDataUrl: HQ_DATA_URL, managerNames: data.managerNames }).catch(() => ({ snapshot: null })) : { snapshot: null };
  const current = snapshot ? gamesFromSnapshot(snapshot, data.season, team) : [];
  const format = LEAGUE_PLAYOFF_FORMATS[league.id];
  const model = buildRecords({ games: [...(data.games as RivalryMeeting[]), ...current], results: data.history.results, currentSeason: data.season, playoffSpots: format ? format.divisionWinners + format.recordSeeds + format.pointsSeeds : null });
  const sides: Record<string, RecordSideInfo> = {};
  const people = rewriteLinks(league, { owners: data.history.owners, sides: data.people.sides });
  for (const o of people.owners) sides[o.id] = { name: o.name, photo: o.photo ?? null };
  for (const s of people.sides) sides[s.id] = { name: s.name, href: s.href, photo: s.photo };
  for (const [id, s] of Object.entries(rewriteLinks(league, data.people.recordSides ?? {}))) sides[id] = s;
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        <RecordsView leagueName={league.name} model={model} sides={sides} theme={theme} coverage={data.copy.recordsCoverage} />
      </main>
    </>
  );
}
