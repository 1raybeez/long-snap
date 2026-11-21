import { GmMyTeamView } from "../../../hq/packages/league-tiles/src/gm-view.tsx";
import { gmPage } from "@/lib/gmPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "GM · My Team" };

export default function GmMyTeamPage({ params }: { params: Promise<{ league: string }> }) {
  return gmPage(params, "my-team", ({ theme, apiBase, base }) => <GmMyTeamView apiBase={apiBase} theme={theme} loginHref="/" tradesHref={`${base}/gm/trades`} />);
}
