export type CacheResource =
  | "NFL_STATE"
  | "PLAYERS"
  | "LEAGUE"
  | "LEAGUE_USERS"
  | "ROSTERS"
  | "MATCHUPS"
  | "TRANSACTIONS"
  | "WINNERS_BRACKET"
  | "LOSERS_BRACKET"
  | "DRAFTS"
  | "DRAFT_PICKS"
  | "USER";

export type CacheFreshness = "FRESH" | "STALE" | "MISS";

export interface CacheScope {
  readonly canonicalLeagueId?: string;
  readonly season?: number;
  readonly externalLeagueId?: string;
  readonly week?: number;
  readonly draftId?: string;
  readonly userId?: string;
}

export interface CacheSourceMetadata {
  readonly provider: string;
  readonly endpoint: string;
  readonly url?: string;
  readonly fetchedAt: string;
}

export interface ProviderCacheEntry<T> {
  readonly key: string;
  readonly value: T;
  readonly provider: string;
  readonly resource: CacheResource;
  readonly scope: CacheScope;
  readonly fetchedAt: string;
  readonly cachedAt?: string;
  readonly expiresAt: string;
  readonly source: CacheSourceMetadata;
}

export interface CacheLookup<T> {
  readonly state: CacheFreshness;
  readonly entry: ProviderCacheEntry<T> | null;
}

export interface ProviderCache {
  get<T>(key: string, now?: Date): Promise<CacheLookup<T>>;
  set<T>(entry: ProviderCacheEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export type CacheTtlPolicy = Readonly<Partial<Record<CacheResource, number>>>;

export interface SyncSuccess<T> {
  readonly ok: true;
  readonly value: T;
  readonly source: CacheSourceMetadata;
}

export interface SyncFailure {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly source: CacheSourceMetadata;
}

export type SyncLoadResult<T> = SyncSuccess<T> | SyncFailure;

export type SyncRefreshPolicy = "IF_STALE" | "FORCE";

export interface SyncRequest<T> {
  readonly key: string;
  readonly provider: string;
  readonly resource: CacheResource;
  readonly scope: CacheScope;
  readonly ttlMs: number;
  readonly refreshPolicy: SyncRefreshPolicy;
  readonly loader: () => Promise<SyncLoadResult<T>>;
}

export interface SyncStatus {
  readonly key: string;
  readonly resource: CacheResource;
  readonly provider: string;
  readonly freshness: CacheFreshness;
  readonly lastSuccessfulSync: string | null;
  readonly lastAttemptedSync: string | null;
  readonly error: SyncFailure["error"] | null;
}

export type SyncOutcome<T> =
  | {
      readonly status: "CACHE_HIT" | "SYNCED";
      readonly freshness: "FRESH" | "STALE";
      readonly value: T;
      readonly entry: ProviderCacheEntry<T>;
      readonly sync: SyncStatus;
    }
  | {
      readonly status: "FAILED";
      readonly freshness: CacheFreshness;
      readonly value: null;
      readonly entry: ProviderCacheEntry<T> | null;
      readonly sync: SyncStatus;
    };
