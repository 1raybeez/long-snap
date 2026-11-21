import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { getFreshness } from "./freshness.ts";
import { MemoryProviderCache } from "./memory-cache.ts";
import type { CacheLookup, ProviderCacheEntry } from "./types.ts";

/**
 * Durable (cross-process) storage for provider cache entries. Implementations
 * must never throw for a simple miss; they return null.
 */
export interface DurableCacheStore {
  read<T>(key: string): Promise<ProviderCacheEntry<T> | null>;
  write<T>(entry: ProviderCacheEntry<T>): Promise<void>;
}

/** Append-only historical snapshots (for example a final week's matchups). */
export interface SnapshotStore {
  /** Returns false when a snapshot with this id already exists (never overwrites). */
  writeOnce<T>(snapshotId: string, entry: ProviderCacheEntry<T>): Promise<boolean>;
  readSnapshot<T>(snapshotId: string): Promise<ProviderCacheEntry<T> | null>;
}

export function durableDocumentId(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 40);
}

export class MemoryDurableCacheStore implements DurableCacheStore, SnapshotStore {
  public readonly entries = new Map<string, string>();
  public readonly snapshots = new Map<string, string>();
  public reads = 0;
  public writes = 0;

  public async read<T>(key: string): Promise<ProviderCacheEntry<T> | null> {
    this.reads += 1;
    const raw = this.entries.get(key);
    return raw ? (JSON.parse(raw) as ProviderCacheEntry<T>) : null;
  }

  public async readSnapshot<T>(snapshotId: string): Promise<ProviderCacheEntry<T> | null> {
    const raw = this.snapshots.get(snapshotId);
    return raw ? (JSON.parse(raw) as ProviderCacheEntry<T>) : null;
  }

  public async write<T>(entry: ProviderCacheEntry<T>): Promise<void> {
    this.writes += 1;
    this.entries.set(entry.key, JSON.stringify(entry));
  }

  public async writeOnce<T>(snapshotId: string, entry: ProviderCacheEntry<T>): Promise<boolean> {
    if (this.snapshots.has(snapshotId)) return false;
    this.snapshots.set(snapshotId, JSON.stringify(entry));
    return true;
  }
}

/**
 * Two-tier cache: process memory (L1) in front of a durable store (L2).
 * - Reads hit memory first; on a miss or stale L1 the durable copy is consulted
 *   and hydrated into memory when it is newer.
 * - Writes go to both tiers. A failing durable write never breaks the read path;
 *   it is recorded in `durableErrors` so diagnostics can surface it.
 * Extends MemoryProviderCache so the existing MemorySyncCoordinator (and its
 * in-flight request de-duplication) works unchanged.
 */
export class TieredProviderCache extends MemoryProviderCache {
  private readonly durable: DurableCacheStore;
  public readonly durableErrors: { readonly operation: "read" | "write"; readonly key: string; readonly message: string }[] = [];

  public constructor(durable: DurableCacheStore) {
    super();
    this.durable = durable;
  }

  public override async get<T>(key: string, now = new Date()): Promise<CacheLookup<T>> {
    const memory = await super.get<T>(key, now);
    if (memory.state === "FRESH") return memory;
    let stored: ProviderCacheEntry<T> | null = null;
    try {
      stored = await this.durable.read<T>(key);
    } catch (error) {
      this.recordError("read", key, error);
      return memory;
    }
    if (!stored) return memory;
    const memoryCachedAt = memory.entry?.cachedAt ?? memory.entry?.fetchedAt ?? "";
    const storedCachedAt = stored.cachedAt ?? stored.fetchedAt;
    if (memory.entry && memoryCachedAt >= storedCachedAt) return memory;
    await super.set(stored);
    return { state: getFreshness(stored, now), entry: stored };
  }

  public override async set<T>(entry: ProviderCacheEntry<T>): Promise<void> {
    await super.set(entry);
    try {
      await this.durable.write(entry);
    } catch (error) {
      this.recordError("write", entry.key, error);
    }
  }

  private recordError(operation: "read" | "write", key: string, error: unknown): void {
    this.durableErrors.push({ operation, key, message: error instanceof Error ? error.message : String(error) });
    if (this.durableErrors.length > 50) this.durableErrors.shift();
  }
}

// ---------------------------------------------------------------------------
// Firestore + Cloud Storage implementation (structural types so this package
// does not depend on firebase-admin; pass in getFirestore(app) / getStorage(app).bucket()).
// ---------------------------------------------------------------------------

export interface FirestoreDocSnapshotLike { readonly exists: boolean; data(): Record<string, unknown> | undefined }
export interface FirestoreDocRefLike {
  get(): Promise<FirestoreDocSnapshotLike>;
  set(data: Record<string, unknown>): Promise<unknown>;
  create(data: Record<string, unknown>): Promise<unknown>;
}
export interface FirestoreLike { collection(name: string): { doc(id: string): FirestoreDocRefLike } }
export interface BucketFileLike { save(data: Buffer, options?: Record<string, unknown>): Promise<unknown>; download(): Promise<[Buffer]> }
export interface BucketLike { file(path: string): BucketFileLike }

export const PROVIDER_CACHE_COLLECTION = "hqProviderCache" as const;
export const PROVIDER_SNAPSHOT_COLLECTION = "hqProviderSnapshots" as const;
/** Payloads above this size (serialized JSON bytes) go to Cloud Storage; Firestore documents cap at ~1 MiB. */
export const INLINE_PAYLOAD_LIMIT_BYTES = 700_000;

interface StoredDocument {
  readonly key: string;
  readonly provider: string;
  readonly resource: string;
  readonly scopeJson: string;
  readonly fetchedAt: string;
  readonly cachedAt: string | null;
  readonly expiresAt: string;
  readonly sourceJson: string;
  readonly payloadEncoding: "inline-json" | "storage-gzip-json";
  readonly payloadJson?: string;
  readonly payloadPath?: string;
  readonly payloadBytes: number;
}

export class FirestoreDurableCacheStore implements DurableCacheStore, SnapshotStore {
  private readonly firestore: FirestoreLike;
  private readonly bucket: BucketLike | null;

  public constructor(input: { readonly firestore: FirestoreLike; readonly bucket?: BucketLike | null }) {
    this.firestore = input.firestore;
    this.bucket = input.bucket ?? null;
  }

  public async read<T>(key: string): Promise<ProviderCacheEntry<T> | null> {
    return this.readFrom<T>(PROVIDER_CACHE_COLLECTION, durableDocumentId(key));
  }

  public async write<T>(entry: ProviderCacheEntry<T>): Promise<void> {
    const id = durableDocumentId(entry.key);
    await this.firestore.collection(PROVIDER_CACHE_COLLECTION).doc(id).set(await this.toDocument(entry, `provider-cache/${id}.json.gz`) as unknown as Record<string, unknown>);
  }

  public async writeOnce<T>(snapshotId: string, entry: ProviderCacheEntry<T>): Promise<boolean> {
    const id = durableDocumentId(snapshotId);
    const ref = this.firestore.collection(PROVIDER_SNAPSHOT_COLLECTION).doc(id);
    const existing = await ref.get();
    if (existing.exists) return false;
    try {
      await ref.create({ ...(await this.toDocument(entry, `provider-snapshots/${id}.json.gz`)), snapshotId } as unknown as Record<string, unknown>);
      return true;
    } catch (error) {
      // ALREADY_EXISTS from a concurrent writer is not a failure: the snapshot is immutable.
      if (String((error as { code?: unknown })?.code) === "6" || /already exists/i.test(String((error as Error)?.message))) return false;
      throw error;
    }
  }

  public async readSnapshot<T>(snapshotId: string): Promise<ProviderCacheEntry<T> | null> {
    return this.readFrom<T>(PROVIDER_SNAPSHOT_COLLECTION, durableDocumentId(snapshotId));
  }

  private async toDocument<T>(entry: ProviderCacheEntry<T>, storagePath: string): Promise<StoredDocument> {
    const payloadJson = JSON.stringify(entry.value);
    const payloadBytes = Buffer.byteLength(payloadJson, "utf8");
    const base = {
      key: entry.key,
      provider: entry.provider,
      resource: entry.resource,
      scopeJson: JSON.stringify(entry.scope),
      fetchedAt: entry.fetchedAt,
      cachedAt: entry.cachedAt ?? null,
      expiresAt: entry.expiresAt,
      sourceJson: JSON.stringify(entry.source),
      payloadBytes,
    };
    if (payloadBytes <= INLINE_PAYLOAD_LIMIT_BYTES) return { ...base, payloadEncoding: "inline-json", payloadJson };
    if (!this.bucket) throw new Error(`PAYLOAD_TOO_LARGE_FOR_FIRESTORE: ${entry.key} is ${payloadBytes} bytes and no storage bucket is configured.`);
    await this.bucket.file(storagePath).save(gzipSync(Buffer.from(payloadJson, "utf8")), { contentType: "application/json", metadata: { contentEncoding: "gzip" }, resumable: false });
    return { ...base, payloadEncoding: "storage-gzip-json", payloadPath: storagePath };
  }

  private async readFrom<T>(collection: string, id: string): Promise<ProviderCacheEntry<T> | null> {
    const snapshot = await this.firestore.collection(collection).doc(id).get();
    if (!snapshot.exists) return null;
    const doc = snapshot.data() as unknown as StoredDocument | undefined;
    if (!doc) return null;
    let payloadJson: string;
    if (doc.payloadEncoding === "inline-json" && typeof doc.payloadJson === "string") {
      payloadJson = doc.payloadJson;
    } else if (doc.payloadEncoding === "storage-gzip-json" && doc.payloadPath && this.bucket) {
      const [buffer] = await this.bucket.file(doc.payloadPath).download();
      payloadJson = gunzipSync(buffer).toString("utf8");
    } else {
      return null;
    }
    return {
      key: doc.key,
      value: JSON.parse(payloadJson) as T,
      provider: doc.provider,
      resource: doc.resource as ProviderCacheEntry<T>["resource"],
      scope: JSON.parse(doc.scopeJson),
      fetchedAt: doc.fetchedAt,
      ...(doc.cachedAt ? { cachedAt: doc.cachedAt } : {}),
      expiresAt: doc.expiresAt,
      source: JSON.parse(doc.sourceJson),
    };
  }
}
