import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { OwnerIdentityRegistry } from "../../owner-identity/src/types.ts";
import type { PersistedMembership } from "../../persistence/src/types.ts";
import type { AuthIdentityMapping, OwnerLink, PermissionGrant, PlatformAccessRegistry, PlatformAccount } from "./types.ts";

const ACCESS_COLLECTIONS = { platformAccounts: "platformAccounts", authIdentityMappings: "authIdentityMappings", ownerLinks: "ownerLinks", permissionGrants: "permissionGrants", leagueMemberships: "leagueMemberships" } as const;

export const PILOT_PLATFORM_ACCOUNT_ID = "commissioner-account";
export const PILOT_OWNER_ID = "commissioner";
export const PILOT_SLEEPER_ID = "";
export const PILOT_STAGING_PROJECT_ID = "";
export const PILOT_ACCESS_LINK_OPT_IN = "I_APPROVE_RAY_PLATFORM_LINK";

export type AccessPlanAction = "CREATE" | "REUSE_IDENTICAL" | "CONFLICT";
export interface AccessClassification { readonly domain: "platformAccounts" | "authIdentityMappings" | "ownerLinks"; readonly id: string; readonly action: AccessPlanAction; readonly reason?: string; }
export interface AuthUserCandidate { readonly uid: string; readonly email: string | null; readonly displayName: string | null; }
export interface AuthResolution { readonly status: "RESOLVED" | "UNRESOLVED" | "AMBIGUOUS"; readonly user: AuthUserCandidate | null; readonly reason: string; }
export interface PlatformAccessState extends PlatformAccessRegistry { readonly memberships: readonly PersistedMembership[]; }
export interface PilotPlatformLinkRecords { readonly account: PlatformAccount; readonly authIdentity: AuthIdentityMapping; readonly ownerLink: OwnerLink; }
export interface PilotPlatformLinkPlan { readonly projectId: string; readonly records: PilotPlatformLinkRecords; readonly classifications: readonly AccessClassification[]; readonly conflicts: readonly AccessClassification[]; readonly rayCanonicalOwnerExists: boolean; readonly c4gMembershipExists: boolean; }

function candidate(user: Pick<UserRecord, "uid" | "email" | "displayName">): AuthUserCandidate { return { uid: user.uid, email: user.email ?? null, displayName: user.displayName ?? null }; }

export function resolveExplicitAuthUsers(users: readonly AuthUserCandidate[], input: { readonly uid?: string; readonly email?: string }): AuthResolution {
  const uid = input.uid?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!uid && !email) return { status: "UNRESOLVED", user: null, reason: "Supply HQ_RAY_AUTH_EMAIL or --firebase-uid; display-name matching is not allowed." };
  const matches = users.filter((user) => (uid ? user.uid === uid : user.email?.toLowerCase() === email));
  if (matches.length === 1) return { status: "RESOLVED", user: matches[0], reason: "Explicit Firebase Auth identity resolved." };
  if (matches.length > 1) return { status: "AMBIGUOUS", user: null, reason: "The explicit Firebase Auth selector matched more than one user." };
  return { status: "UNRESOLVED", user: null, reason: "No Firebase Auth user matched the explicit selector." };
}

export async function resolvePilotAuthUser(auth: Auth, input: { readonly uid?: string; readonly email?: string }): Promise<AuthResolution> {
  if (input.uid?.trim()) {
    try { return { status: "RESOLVED", user: candidate(await auth.getUser(input.uid.trim())), reason: "Explicit Firebase UID resolved." }; }
    catch { return { status: "UNRESOLVED", user: null, reason: "No Firebase Auth user matched the explicit Firebase UID." }; }
  }
  if (!input.email?.trim()) return resolveExplicitAuthUsers([], input);
  const matches: AuthUserCandidate[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    matches.push(...page.users.filter((user) => user.email?.toLowerCase() === input.email!.trim().toLowerCase()).map(candidate));
    pageToken = page.pageToken;
  } while (pageToken);
  return resolveExplicitAuthUsers(matches, input);
}

function metadata(now: string) { return { createdAt: now, updatedAt: now }; }
function core(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(core);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !["createdAt", "updatedAt", "verifiedAt"].includes(key)).map(([key, child]) => [key, core(child)]));
  return value;
}
function identical(left: unknown, right: unknown): boolean { return JSON.stringify(core(left)) === JSON.stringify(core(right)); }
function classify(domain: AccessClassification["domain"], id: string, proposed: object, existing: object | null): AccessClassification { if (!existing) return { domain, id, action: "CREATE" }; return identical(existing, proposed) ? { domain, id, action: "REUSE_IDENTICAL" } : { domain, id, action: "CONFLICT", reason: "Existing access record differs from the reviewed Ray pilot record." }; }

export function buildPilotPlatformLinkPlan(input: { readonly authUid: string; readonly state: PlatformAccessState; readonly owners: OwnerIdentityRegistry; readonly projectId: string; readonly now?: string }): PilotPlatformLinkPlan {
  if (input.projectId !== PILOT_STAGING_PROJECT_ID) throw new Error(`Ray platform linking requires Firebase project ${PILOT_STAGING_PROJECT_ID}.`);
  const now = input.now ?? new Date().toISOString();
  const ray = input.owners.owners.find((owner) => owner.ownerId === PILOT_OWNER_ID);
  const rayMapping = ray?.providerIdentities.filter((identity) => identity.provider === "SLEEPER" && identity.externalUserId === PILOT_SLEEPER_ID && identity.state === "CONFIRMED") ?? [];
  if (!ray || ray.displayName !== "the commissioner" || ray.lifecycle !== "ACTIVE" || rayMapping.length !== 1) throw new Error("Ray canonical identity is missing or does not have exactly one confirmed Sleeper mapping.");
  if (input.owners.owners.some((owner) => owner.ownerId !== PILOT_OWNER_ID && owner.providerIdentities.some((identity) => identity.provider === "SLEEPER" && identity.externalUserId === PILOT_SLEEPER_ID))) throw new Error("Ray's confirmed Sleeper ID is assigned to another canonical owner.");
  if (!input.authUid.trim() || input.authUid === PILOT_OWNER_ID || input.authUid === PILOT_SLEEPER_ID) throw new Error("Firebase Auth UID must be explicit and distinct from OwnerId and Sleeper ID.");
  const records: PilotPlatformLinkRecords = {
    account: { accountId: PILOT_PLATFORM_ACCOUNT_ID as never, state: "ACTIVE", displayName: "the commissioner", verified: true, ...metadata(now) },
    authIdentity: { mappingId: `firebase-auth:${input.authUid}` as never, accountId: PILOT_PLATFORM_ACCOUNT_ID as never, provider: "FIREBASE_AUTH", externalSubject: input.authUid, state: "VERIFIED", ...metadata(now), verifiedAt: now, sourceRef: "manual-reviewed-staging-pilot" },
    ownerLink: { linkId: `owner-link:${PILOT_PLATFORM_ACCOUNT_ID}:${PILOT_OWNER_ID}` as never, accountId: PILOT_PLATFORM_ACCOUNT_ID as never, ownerId: PILOT_OWNER_ID as never, state: "VERIFIED", verificationMethod: "MANUAL_CORRECTION", ...metadata(now), createdBy: "manual-reviewed-staging-pilot", verifiedAt: now, sourceRef: "manual-reviewed-staging-pilot", reason: "Explicit Ray staging pilot link." },
  };
  const classifications = [
    classify("platformAccounts", records.account.accountId, records.account, input.state.accounts.find((record) => record.accountId === records.account.accountId) ?? null),
    classify("authIdentityMappings", records.authIdentity.mappingId, records.authIdentity, input.state.authIdentities.find((record) => record.mappingId === records.authIdentity.mappingId) ?? null),
    classify("ownerLinks", records.ownerLink.linkId, records.ownerLink, input.state.ownerLinks.find((record) => record.linkId === records.ownerLink.linkId) ?? null),
  ];
  const conflicts = [...classifications.filter((item) => item.action === "CONFLICT")];
  if (input.state.authIdentities.some((identity) => identity.provider === "FIREBASE_AUTH" && identity.externalSubject === input.authUid && identity.accountId !== PILOT_PLATFORM_ACCOUNT_ID)) conflicts.push({ domain: "authIdentityMappings", id: input.authUid, action: "CONFLICT", reason: "Firebase Auth subject is already mapped to another PlatformAccount." });
  if (input.state.ownerLinks.some((link) => link.ownerId === PILOT_OWNER_ID && link.accountId !== PILOT_PLATFORM_ACCOUNT_ID && link.state === "VERIFIED")) conflicts.push({ domain: "ownerLinks", id: PILOT_OWNER_ID, action: "CONFLICT", reason: "Ray already has a verified OwnerLink to another PlatformAccount." });
  return { projectId: input.projectId, records, classifications, conflicts, rayCanonicalOwnerExists: true, c4gMembershipExists: input.state.memberships.some((membership) => membership.ownerId === PILOT_OWNER_ID && membership.leagueId === "c4g-fantasy-football" && membership.effectiveFromSeason <= 2026 && (membership.effectiveToSeason === undefined || membership.effectiveToSeason >= 2026) && membership.state === "ACTIVE") };
}

export async function readPlatformAccessState(db: Firestore): Promise<PlatformAccessState> {
  const read = async <T>(collection: string): Promise<T[]> => (await db.collection(collection).get()).docs.map((doc) => doc.data() as T);
  return { schemaVersion: 1, accounts: await read<PlatformAccount>(ACCESS_COLLECTIONS.platformAccounts), authIdentities: await read<AuthIdentityMapping>(ACCESS_COLLECTIONS.authIdentityMappings), ownerLinks: await read<OwnerLink>(ACCESS_COLLECTIONS.ownerLinks), permissionGrants: await read<PermissionGrant>(ACCESS_COLLECTIONS.permissionGrants), memberships: await read<PersistedMembership>(ACCESS_COLLECTIONS.leagueMemberships) };
}

export async function applyRayPlatformLinkPlan(db: Firestore, plan: PilotPlatformLinkPlan): Promise<void> {
  if (plan.projectId !== PILOT_STAGING_PROJECT_ID) throw new Error(`Ray platform linking requires Firebase project ${PILOT_STAGING_PROJECT_ID}.`);
  if (plan.conflicts.length) throw new Error(`Ray platform link blocked by ${plan.conflicts.length} conflict(s).`);
  const entries = [
    [ACCESS_COLLECTIONS.platformAccounts, plan.records.account.accountId, plan.records.account],
    [ACCESS_COLLECTIONS.authIdentityMappings, plan.records.authIdentity.mappingId, plan.records.authIdentity],
    [ACCESS_COLLECTIONS.ownerLinks, plan.records.ownerLink.linkId, plan.records.ownerLink],
  ] as const;
  await db.runTransaction(async (transaction) => {
    const refs = entries.map(([collection, id]) => ({ collection, id, ref: db.collection(collection).doc(id) }));
    const snapshots = await Promise.all(refs.map((entry) => transaction.get(entry.ref)));
    refs.forEach((entry, index) => { const classification = plan.classifications.find((item) => item.domain === entry.collection && item.id === entry.id); if (classification?.action === "CREATE" && snapshots[index].exists) throw new Error(`Ray platform link changed during preflight: ${entry.collection}/${entry.id} now exists.`); if (classification?.action === "CREATE") transaction.create(entry.ref, entries[index][2]); });
  });
}

export function rayPlatformReadback(state: PlatformAccessState): { readonly status: "PASS" | "FAIL"; readonly errors: readonly string[]; readonly accountCount: number; readonly authMappingCount: number; readonly verifiedRayLinkCount: number; readonly c4gMembershipUnchanged: boolean } {
  const errors: string[] = [];
  const accounts = state.accounts.filter((account) => account.accountId === PILOT_PLATFORM_ACCOUNT_ID);
  const mappings = state.authIdentities.filter((mapping) => mapping.accountId === PILOT_PLATFORM_ACCOUNT_ID && mapping.provider === "FIREBASE_AUTH" && mapping.state === "VERIFIED");
  const links = state.ownerLinks.filter((link) => link.accountId === PILOT_PLATFORM_ACCOUNT_ID && link.ownerId === PILOT_OWNER_ID && link.state === "VERIFIED");
  if (accounts.length !== 1) errors.push(`Expected exactly one Ray PlatformAccount; found ${accounts.length}.`);
  if (mappings.length !== 1) errors.push(`Expected exactly one verified Firebase subject mapping; found ${mappings.length}.`);
  if (links.length !== 1) errors.push(`Expected exactly one verified Ray OwnerLink; found ${links.length}.`);
  if (state.ownerLinks.some((link) => link.accountId === PILOT_PLATFORM_ACCOUNT_ID && link.ownerId !== PILOT_OWNER_ID)) errors.push("Ray account is linked to another OwnerId.");
  if (state.memberships.filter((membership) => membership.leagueId === "c4g-fantasy-football" && membership.effectiveFromSeason <= 2026 && (membership.effectiveToSeason === undefined || membership.effectiveToSeason >= 2026) && membership.state === "ACTIVE").length !== 10) errors.push("C4G canonical membership count changed from the verified ten-membership pilot baseline.");
  return { status: errors.length ? "FAIL" : "PASS", errors, accountCount: accounts.length, authMappingCount: mappings.length, verifiedRayLinkCount: links.length, c4gMembershipUnchanged: !errors.some((error) => error.includes("C4G")) };
}
