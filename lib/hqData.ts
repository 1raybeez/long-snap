import "server-only";
import { getStorage } from "firebase-admin/storage";
import { HQ_LEAGUE_REGISTRY } from "../hq/config/leagues/registry.ts";
import { FirestoreDurableCacheStore, MemorySyncCoordinator, TieredProviderCache, type BucketLike, type FirestoreLike } from "../hq/packages/provider-cache/src/index.ts";
import { SleeperDataHub } from "../hq/packages/sleeper-hub/src/index.ts";
import { adminApp, adminFirestore, HQ_PROJECT_ID } from "./auth/firebaseAdmin.ts";

let hub: { hub: SleeperDataHub; store: FirestoreDurableCacheStore; cache: TieredProviderCache } | null = null;

export function hqDataHub() {
  if (hub) return hub;
  const firestore = adminFirestore();
  let bucket: BucketLike | null = null;
  try { bucket = getStorage(adminApp()).bucket(`${HQ_PROJECT_ID}.firebasestorage.app`) as unknown as BucketLike; } catch { bucket = null; }
  const store = new FirestoreDurableCacheStore({ firestore: firestore as unknown as FirestoreLike, bucket });
  const cache = new TieredProviderCache(store);
  hub = { hub: new SleeperDataHub({ registry: HQ_LEAGUE_REGISTRY, cache, coordinator: new MemorySyncCoordinator(cache) }), store, cache };
  return hub;
}
