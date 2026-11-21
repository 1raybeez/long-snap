import type { Firestore } from "firebase-admin/firestore";
import type { PersistedOwner } from "../../persistence/src/types.ts";
import { readPlatformAccessState } from "./link-pilot.ts";
import type { OwnerLink } from "./types.ts";
import { SIGN_IN_COLLECTIONS, type OwnerLinkEvidence, type SignInLinkConflict, type SignInLinkState, type SignInLinkStore } from "./sign-in-link.ts";

/** Firestore side of the sign-in link (HQ database). Only `applySignInLinkPlan` writes, through `transact`. */
export async function readSignInLinkState(db: Firestore): Promise<SignInLinkState> {
  const read = async <T>(collection: string): Promise<T[]> => (await db.collection(collection).get()).docs.map((doc) => doc.data() as T);
  const [access, owners, evidence, conflicts] = await Promise.all([
    readPlatformAccessState(db),
    read<PersistedOwner>("owners"),
    read<OwnerLinkEvidence>(SIGN_IN_COLLECTIONS.ownerLinkEvidence),
    read<SignInLinkConflict>(SIGN_IN_COLLECTIONS.signInLinkConflicts),
  ]);
  return { schemaVersion: 1, accounts: access.accounts, authIdentities: access.authIdentities, ownerLinks: access.ownerLinks, permissionGrants: access.permissionGrants, owners, evidence, conflicts };
}

export function firestoreSignInLinkStore(db: Firestore): SignInLinkStore {
  return {
    transact: (fn) => db.runTransaction(async (tx) => fn({
      get: async (collection, id) => { const snap = await tx.get(db.collection(collection).doc(id)); return snap.exists ? (snap.data() as object) : null; },
      verifiedOwnerLinksFor: async (ownerId) => (await tx.get(db.collection(SIGN_IN_COLLECTIONS.ownerLinks).where("ownerId", "==", ownerId))).docs.map((d) => d.data() as OwnerLink).filter((l) => l.state === "VERIFIED"),
      create: (collection, id, data) => { tx.create(db.collection(collection).doc(id), data as Record<string, unknown>); },
      set: (collection, id, data) => { tx.set(db.collection(collection).doc(id), data as Record<string, unknown>); },
    })),
  };
}
