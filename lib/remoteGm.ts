import "server-only";
import type { PlatformLeague } from "./platformLeagues.ts";

const REMOTE: Record<string, { path: string; audience: string }> = {
  "river-city-ffl": { path: "/api/platform/gm", audience: "river-city-ffl/platform-gm" },
};

export const hasRemoteGm = (leagueId: string) => Boolean(REMOTE[leagueId]);

export async function identityToken(audience: string): Promise<string | null> {
  try {
    const r = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}&format=full`, { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" });
    return r.ok ? (await r.text()).trim() : null;
  } catch {
    return null;
  }
}

export async function remoteGm(league: PlatformLeague, method: "GET" | "POST", body: Record<string, unknown> | null, teamId: string | null): Promise<{ status: number; body: unknown }> {
  const cfg = REMOTE[league.id];
  if (!cfg || !league.currentSiteUrl) return { status: 404, body: { ok: false, error: "Unknown league." } };
  const token = await identityToken(cfg.audience);
  if (!token) return { status: 503, body: { ok: false, error: "The GM tools can't reach the league right now." } };
  try {
    const r = await fetch(`${league.currentSiteUrl}${cfg.path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ method, body, teamId }), cache: "no-store" });
    const out = (await r.json().catch(() => ({ ok: false, error: "The analyzer is unavailable right now." }))) as { ok?: boolean; error?: string; serviceAccount?: string };
    // The league site refused this server: say which account, so it can be added to the league site's allow list.
    if (r.status === 401) return { status: 503, body: { ok: false, error: `The GM tools aren't connected to ${league.shortName} yet${out.serviceAccount ? ` (server ${out.serviceAccount})` : ""}.` } };
    return { status: r.status, body: out };
  } catch {
    return { status: 503, body: { ok: false, error: "The analyzer is unavailable right now." } };
  }
}
