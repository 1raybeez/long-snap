import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./auth/session.ts";
import type { PlatformLeague } from "./platformLeagues.ts";

/**
 * Call a league site's own API as the signed-in owner (2026-11-04): the owner's platform sign-in goes in the site's
 * sign-in cookie with the "hq." prefix (the same hand-over the sites accept for /go), so the site applies its usual
 * member checks. Signed out here → the site sees a signed-out visitor. Used for pages whose data still lives in the
 * league site's own database (Legislative Hub, Ask the Constitution) until switch-over.
 */
export async function forwardAsOwner(league: PlatformLeague, path: string, init: { method: "GET" | "POST"; body?: string; timeoutMs?: number }): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!league.currentSiteUrl || !path.startsWith("/api/")) return { status: 404, body: { ok: false, error: "Not available for this league." } };
  const platform = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    const r = await fetch(`${league.currentSiteUrl}${path}`, {
      method: init.method, body: init.body, cache: "no-store",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(platform ? { Cookie: `__session=hq.${platform}` } : {}) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 15000),
    });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: r.status, body };
  } catch {
    return { status: 503, body: { ok: false, error: `${league.shortName}'s site can't be reached right now.` } };
  }
}

/** The platform's own addresses (for same-site checks on POSTs). */
export const OWN_ORIGINS: ReadonlySet<string> = new Set<string>([]);

/** JSON from this site's own pages only (same rule as the league sites). Returns an error message, or null when fine. */
export function unsafePost(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin && !OWN_ORIGINS.has(origin) && origin !== `https://${request.headers.get("x-forwarded-host") ?? ""}`) return "Cross-origin request denied.";
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return "JSON request required.";
  return null;
}

export function crossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const allowed = new Set<string>([...OWN_ORIGINS, new URL(request.url).origin]);
  if (host) allowed.add(`${protocol || "https"}://${host}`);
  return !allowed.has(origin);
}
