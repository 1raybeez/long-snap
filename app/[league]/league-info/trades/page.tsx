import { unstable_cache } from "next/cache";
import { dailyStamp } from "../../../../hq/packages/league-tiles/src/sleeper-schedule.ts";
import { loadTradeOutcomes } from "../../../../hq/packages/league-tiles/src/trade-outcomes.ts";
import { buildTradeHistoryModel } from "../../../../hq/packages/league-tiles/src/trade-history.ts";
import { TradeHistoryView } from "../../../../hq/packages/league-tiles/src/trade-history-view.tsx";
import { pageStyle } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trade History" };

/** Trades in Sleeper settle once a day (12:30 PM ET), so the graded history is rebuilt at most once a day per league. */
const outcomesFor = unstable_cache(
  (leagueId: string, kind: "dynasty" | "keeper" | "redraft", rosterToTeam: Record<string, string>, _day: string) => loadTradeOutcomes({ leagueId, rosterToTeam, kind }),
  ["platform-trade-outcomes-v1"], { revalidate: false },
);

/** All-time Trade History: every trade back to the league's first Sleeper season, graded after the fact (same kit page as the current site). */
export default async function TradeHistoryPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, data, theme } = await leagueOr404(params);
  const kind = league.format === "Dynasty" ? "dynasty" : league.format === "Auction keeper" ? "keeper" : "redraft";
  const rosterToTeam = Object.fromEntries(data.teams.map((t) => [String(t.rosterId), t.franchiseId]));
  const model = league.sleeperLeagueId
    ? await outcomesFor(league.sleeperLeagueId, kind, rosterToTeam, dailyStamp())
        .then((o) => buildTradeHistoryModel(o, data.teams.map((t) => ({ id: t.franchiseId, name: t.name ?? t.franchiseId }))))
        .catch((error) => { console.error("Trade history failed", error); return null; })
    : null;
  return (
    <>
      <LeagueNav league={league} active={data.sleeperOnly ? "trades" : "league-info"} />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        {model ? <TradeHistoryView leagueName={league.name} model={model} theme={theme} /> : <p style={{ color: theme.colors.text }}>Trade history is unavailable right now. Please try again in a few minutes.</p>}
      </main>
    </>
  );
}
