import { GmWaiversView } from "../../../../hq/packages/league-tiles/src/gm-view.tsx";
import { gmPage } from "@/lib/gmPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "GM · Waivers" };

export default function GmWaiversPage({ params }: { params: Promise<{ league: string }> }) {
  return gmPage(params, "waivers", ({ theme, apiBase }) => <GmWaiversView apiBase={apiBase} theme={theme} loginHref="/" />);
}
