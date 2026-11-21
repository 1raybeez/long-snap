import { MemoryProviderCache } from "./memory-cache.ts";
import { getFreshness } from "./freshness.ts";
import type {
  CacheFreshness,
  ProviderCacheEntry,
  SyncFailure,
  SyncLoadResult,
  SyncOutcome,
  SyncRequest,
  SyncStatus,
} from "./types.ts";

class SyncFailureError extends Error {
  public readonly failure: SyncFailure;

  public constructor(failure: SyncFailure) {
    super(failure.error.message);
    this.failure = failure;
  }
}

export function createCacheEntry<T>(input: {
  readonly key: string;
  readonly value: T;
  readonly provider: string;
  readonly resource: ProviderCacheEntry<T>["resource"];
  readonly scope: ProviderCacheEntry<T>["scope"];
  readonly source: ProviderCacheEntry<T>["source"];
  readonly ttlMs: number;
  readonly now?: Date;
}): ProviderCacheEntry<T> {
  const now = input.now ?? new Date();
  return {
    key: input.key,
    value: input.value,
    provider: input.provider,
    resource: input.resource,
    scope: input.scope,
    fetchedAt: input.source.fetchedAt,
    cachedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
    source: input.source,
  };
}

export class MemorySyncCoordinator {
  private readonly statuses = new Map<string, SyncStatus>();
  private readonly cache: MemoryProviderCache;
  private readonly now: () => Date;

  public constructor(cache: MemoryProviderCache, now: () => Date = () => new Date()) {
    this.cache = cache;
    this.now = now;
  }

  public getStatus(key: string): SyncStatus | null {
    return this.statuses.get(key) ?? null;
  }

  public async sync<T>(request: SyncRequest<T>): Promise<SyncOutcome<T>> {
    const now = this.now();
    const existing = await this.cache.get<T>(request.key, now);
    if (request.refreshPolicy === "IF_STALE" && existing.state === "FRESH" && existing.entry) {
      const sync = this.updateStatus(request, "FRESH", existing.entry, null, null);
      return { status: "CACHE_HIT", freshness: "FRESH", value: existing.entry.value, entry: existing.entry, sync };
    }

    const attemptedAt = now.toISOString();
    try {
      const entry = await this.cache.load(request.key, async () => {
        const loaded = await request.loader();
        if (!loaded.ok) throw new SyncFailureError(loaded);
        const entry = createCacheEntry({
          key: request.key,
          value: loaded.value,
          provider: request.provider,
          resource: request.resource,
          scope: request.scope,
          source: loaded.source,
          ttlMs: request.ttlMs,
          now: this.now(),
        });
        await this.cache.set(entry);
        return entry;
      });
      const sync = this.updateStatus(request, "FRESH", entry, attemptedAt, null);
      return { status: "SYNCED", freshness: "FRESH", value: entry.value, entry, sync };
    } catch (error) {
      const failure = error instanceof SyncFailureError
        ? error.failure
        : {
            ok: false as const,
            error: { code: "SYNC_ERROR", message: error instanceof Error ? error.message : "sync failed", retryable: true },
            source: { provider: request.provider, endpoint: request.resource, fetchedAt: attemptedAt },
          };
      const status = this.updateStatus(request, getFreshness(existing.entry, now), existing.entry, attemptedAt, failure.error);
      return { status: "FAILED", freshness: getFreshness(existing.entry, now), value: null, entry: existing.entry, sync: status };
    }
  }

  private updateStatus<T>(
    request: SyncRequest<T>,
    freshness: CacheFreshness,
    entry: ProviderCacheEntry<T> | null,
    attemptedAt: string | null,
    error: SyncFailure["error"] | null,
  ): SyncStatus {
    const prior = this.statuses.get(request.key);
    const status: SyncStatus = {
      key: request.key,
      resource: request.resource,
      provider: request.provider,
      freshness,
      lastSuccessfulSync: entry?.fetchedAt ?? prior?.lastSuccessfulSync ?? null,
      lastAttemptedSync: attemptedAt ?? prior?.lastAttemptedSync ?? null,
      error,
    };
    this.statuses.set(request.key, status);
    return status;
  }
}
