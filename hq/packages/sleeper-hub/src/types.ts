import type { CacheResource, ProviderCacheEntry } from "../../provider-cache/src/types.ts";
import type { SleeperEndpoint, SleeperResult } from "../../sleeper-provider/src/types.ts";

export type SleeperHubResource = "NFL_STATE" | "LEAGUE" | "USERS" | "ROSTERS" | "MATCHUPS" | "TRANSACTIONS" | "WINNERS_BRACKET" | "LOSERS_BRACKET" | "DRAFTS" | "DRAFT_PICKS" | "PLAYERS" | "USER";
export type HubFreshness = "FRESH" | "STALE_BUT_USABLE" | "UNAVAILABLE";
export type HubSourceState = "CACHE" | "PROVIDER" | "STALE_CACHE" | "NONE";

export interface SleeperHubRequest {
  readonly canonicalLeagueId?: string;
  readonly season?: number;
  readonly resource: SleeperHubResource;
  readonly week?: number;
  readonly draftId?: string;
  readonly userId?: string;
  readonly refreshPolicy?: "IF_STALE" | "FORCE";
}

export interface SleeperHubProvenance {
  readonly provider: "SLEEPER";
  readonly resource: SleeperHubResource;
  readonly cacheResource: CacheResource;
  readonly canonicalLeagueId: string | null;
  readonly providerLeagueId: string | null;
  readonly providerResourceId: string | null;
  readonly season: number | null;
  readonly week: number | null;
  readonly fetchedAt: string | null;
  readonly cachedAt: string | null;
  readonly sourceState: HubSourceState;
  readonly sourceEndpoint: string | null;
}

export interface SleeperHubResult<T> {
  readonly ok: boolean;
  readonly data: T | null;
  readonly freshness: HubFreshness;
  readonly cacheKey: string;
  readonly provenance: SleeperHubProvenance;
  readonly entry: ProviderCacheEntry<T> | null;
  readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean };
  readonly warnings: readonly string[];
  readonly providerRequestPerformed: boolean;
}

export type HubLoaderResult<T> = SleeperResult<T>;
export type HubEndpoint = SleeperEndpoint;
