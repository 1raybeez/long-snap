import { HQ_LEAGUE_REGISTRY } from "../hq/config/leagues/registry.ts";
import type { SleeperHubRequest, SleeperHubResource } from "../hq/packages/sleeper-hub/src/types.ts";

const BASE = /^https:\/\/api\.sleeper\.(app|com)\/v1(\/[^?#]*)/;

const bySleeperLeague = (() => {
  const out = new Map<string, { canonicalLeagueId: string; season: number }>();
  for (const league of HQ_LEAGUE_REGISTRY.leagues) {
    for (const s of league.seasons) {
      for (const b of s.providerBindings) if (b.provider === "SLEEPER" && b.externalLeagueId) out.set(b.externalLeagueId, { canonicalLeagueId: league.id, season: s.season });
    }
  }
  return out;
})();

const LEAGUE_PARTS: Readonly<Record<string, SleeperHubResource>> = {
  rosters: "ROSTERS", users: "USERS", matchups: "MATCHUPS", transactions: "TRANSACTIONS",
  winners_bracket: "WINNERS_BRACKET", losers_bracket: "LOSERS_BRACKET", drafts: "DRAFTS",
};

/** The feed request for a Sleeper API path, or null when it should go to Sleeper directly. */
export function feedRequestFor(url: string): SleeperHubRequest | null {
  const m = BASE.exec(url);
  if (!m) return null;
  const parts = m[2]!.split("/").filter(Boolean);
  if (parts[0] === "state" && parts[1] === "nfl" && parts.length === 2) return { resource: "NFL_STATE" };
  if (parts[0] === "players" && parts[1] === "nfl" && parts.length === 2) return { resource: "PLAYERS" };
  if (parts[0] === "user" && parts.length === 2 && /^\d+$/.test(parts[1]!)) return { resource: "USER", userId: parts[1] };
  if (parts[0] === "league" && parts.length >= 3) {
    const scope = bySleeperLeague.get(parts[1]!);
    const resource = LEAGUE_PARTS[parts[2]!];
    if (!scope || !resource) return null;
    if (resource === "MATCHUPS" || resource === "TRANSACTIONS") {
      const week = Number(parts[3]);
      if (parts.length !== 4 || !Number.isInteger(week) || week < 0 || week > 25) return null;
      return { ...scope, resource, week };
    }
    return parts.length === 3 ? { ...scope, resource } : null;
  }
  return null;
}

const wantsFresh = (init?: RequestInit) => {
  const next = (init as { next?: { revalidate?: number | false } } | undefined)?.next;
  return init?.cache === "no-store" || init?.cache === "reload" || next?.revalidate === 0;
};

/** The same cached object is served many times (the player list is ~10 MB): serialize it once. */
const bodies = new WeakMap<object, string>();
const body = (data: unknown) => {
  if (data && typeof data === "object") { let b = bodies.get(data); if (!b) { b = JSON.stringify(data); bodies.set(data, b); } return b; }
  return JSON.stringify(data);
};

const feedReachable = () => Boolean(process.env.FIREBASE_CONFIG || process.env.GOOGLE_APPLICATION_CREDENTIALS);

export async function sleeperFeedFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const req = feedReachable() && (!init?.method || init.method === "GET") && !wantsFresh(init) ? feedRequestFor(url) : null;
  if (req) {
    try {
      // Loaded on first use so plain Node tests of pages that import this never load the database client.
      const { hqDataHub } = await import("./hqData.ts");
      const r = await hqDataHub().hub.read(req);
      if (r.ok && r.data !== null) return new Response(body(r.data), { status: 200, headers: { "content-type": "application/json", "x-hq-feed": r.provenance.sourceState } });
    } catch {
      /* fall through to Sleeper */
    }
  }
  return fetch(input, init);
}
