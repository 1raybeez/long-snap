import { TradeAnalyzerView } from "../../../../hq/packages/league-tiles/src/trade-analyzer-view.tsx";
import { gmPage } from "@/lib/gmPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "GM · Trades" };

/** The shared Trade Analyzer, inside the GM tab (same as the league sites). */
export default function GmTradesPage({ params }: { params: Promise<{ league: string }> }) {
  return gmPage(params, "trades", ({ theme, apiBase, base }) => (
    <>
      <TradeAnalyzerView apiBase={apiBase} theme={theme} loginHref="/" />
      <p style={{ fontSize: 12 }}><a href={`${base}/league-info/trades`}>Trade History: every trade since the start, graded</a></p>
    </>
  ));
}
