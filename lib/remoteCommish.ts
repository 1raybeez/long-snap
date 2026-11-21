import "server-only";
import type { PlatformLeague } from "./platformLeagues.ts";
import type { PlatformSession } from "./auth/session.ts";
import { identityToken } from "./remoteGm.ts";
import type { CommishHubData } from "../hq/packages/league-tiles/src/commish-hub.ts";
import { RVA_ENGINE } from "./leagueFeatures.ts";

const FEEDS: Record<string, { readonly audience: string; readonly roles: ReadonlySet<string> }> = {
  "river-city-ffl": { audience: "river-city-ffl/platform-commish", roles: new Set(["commissioner", "assistant"]) },
  "long-country-club": { audience: "long-country-club/platform-commish", roles: new Set(["commissioner"]) },
  "rva-eskimo-brothers": { audience: "rva-eskimo-brothers/platform-commish", roles: new Set(RVA_ENGINE.has("commish") ? ["commissioner", "assistant"] : ["commissioner"]) },
};

export const hasCommishHub = (leagueId: string) => Boolean(FEEDS[leagueId]);

/** The viewer's hub role in this league, or null (not signed in, not linked, or not a commissioner here). */
export function commishRole(session: PlatformSession | null, leagueId: string): "commissioner" | "assistant" | null {
  // Membership roles are OWNER/CO_OWNER; the commissioner role is what the league site reported at sign-in.
  const role = session?.account ? session.adminLeagues[leagueId] : undefined;
  return role && FEEDS[leagueId]?.roles.has(role) ? role : null;
}

export type CommishFeedResult = { readonly ok: true; readonly hub: CommishHubData } | { readonly ok: false; readonly message: string };

export async function remoteCommishHub(league: PlatformLeague, role: "commissioner" | "assistant"): Promise<CommishFeedResult> {
  const cfg = FEEDS[league.id];
  if (!cfg || !league.currentSiteUrl) return { ok: false, message: "This league has no Commissioner Hub." };
  const token = await identityToken(cfg.audience);
  if (!token) return { ok: false, message: `The Commissioner Hub can't reach ${league.shortName} right now.` };
  try {
    const r = await fetch(`${league.currentSiteUrl}/api/platform/commish`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ role }), cache: "no-store" });
    const out = (await r.json().catch(() => null)) as { ok?: boolean; hub?: CommishHubData; serviceAccount?: string } | null;
    if (r.status === 401) return { ok: false, message: `The Commissioner Hub isn't connected to ${league.shortName} yet${out?.serviceAccount ? ` (server ${out.serviceAccount})` : ""}.` };
    if (r.status === 404) return { ok: false, message: `${league.shortName}'s site hasn't been updated with the hub feed yet. Try again in a few minutes.` };
    if (!r.ok || !out?.ok || !out.hub) return { ok: false, message: `${league.shortName}'s Commissioner Hub didn't answer. Try again in a minute.` };
    return { ok: true, hub: out.hub };
  } catch {
    return { ok: false, message: `The Commissioner Hub can't reach ${league.shortName} right now.` };
  }
}
