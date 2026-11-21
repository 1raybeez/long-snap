import type { CacheFreshness, CacheResource, CacheTtlPolicy, ProviderCacheEntry } from "./types.ts";

export const DEFAULT_CACHE_TTL_POLICY: CacheTtlPolicy = {
  NFL_STATE: 60_000,
  PLAYERS: 86_400_000,
  LEAGUE: 3_600_000,
  LEAGUE_USERS: 900_000,
  ROSTERS: 300_000,
  MATCHUPS: 60_000,
  TRANSACTIONS: 60_000,
  WINNERS_BRACKET: 300_000,
  LOSERS_BRACKET: 300_000,
  DRAFTS: 3_600_000,
  DRAFT_PICKS: 3_600_000,
  USER: 3_600_000,
};

export function getFreshness<T>(entry: ProviderCacheEntry<T> | null, now = new Date()): CacheFreshness {
  if (!entry) return "MISS";
  return Date.parse(entry.expiresAt) > now.getTime() ? "FRESH" : "STALE";
}

export function getTtlMs(resource: CacheResource, policy: CacheTtlPolicy = DEFAULT_CACHE_TTL_POLICY): number {
  const ttlMs = policy[resource];
  if (ttlMs === undefined || !Number.isFinite(ttlMs) || ttlMs < 0) {
    throw new Error(`No valid cache TTL configured for ${resource}`);
  }
  return ttlMs;
}
