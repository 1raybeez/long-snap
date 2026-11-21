import { getFreshness } from "./freshness.ts";
import type { CacheLookup, ProviderCache, ProviderCacheEntry } from "./types.ts";

export class MemoryProviderCache implements ProviderCache {
  private readonly entries = new Map<string, ProviderCacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  public async get<T>(key: string, now = new Date()): Promise<CacheLookup<T>> {
    const entry = (this.entries.get(key) as ProviderCacheEntry<T> | undefined) ?? null;
    return { state: getFreshness(entry, now), entry };
  }

  public async set<T>(entry: ProviderCacheEntry<T>): Promise<void> {
    this.entries.set(entry.key, entry);
  }

  public async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  public async clear(): Promise<void> {
    this.entries.clear();
  }

  public async load<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const pending = loader();
    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }
  }
}
