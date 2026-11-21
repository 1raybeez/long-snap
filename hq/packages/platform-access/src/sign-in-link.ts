import type { OwnerRecord } from "../../owner-identity/src/types.ts";
import type { AuthIdentityMapping, OwnerLink, PlatformAccessRegistry, PlatformAccount } from "./types.ts";
import { hqOwnerForSiteOwner, isWhoamiLeague } from "./league-site-owners.ts";
import { PILOT_PLATFORM_ACCOUNT_ID } from "./link-pilot.ts";

export const SIGN_IN_COLLECTIONS = {
  platformAccounts: "platformAccounts",
  authIdentityMappings: "authIdentityMappings",
  ownerLinks: "ownerLinks",
  ownerLinkEvidence: "ownerLinkEvidence",
  signInLinkConflicts: "signInLinkConflicts",
} as const;
export type SignInCollection = (typeof SIGN_IN_COLLECTIONS)[keyof typeof SIGN_IN_COLLECTIONS];

export const SIGN_IN_LINK_SOURCE = "platform-sign-in:league-site-whoami";

export type LeagueSiteRole = "commissioner" | "assistant" | "member";
export type LeagueSiteAnswer =
  | { readonly leagueId: string; readonly status: "MEMBER"; readonly ownerId: string; readonly displayName: string | null; readonly franchiseId: string | null; readonly teamName: string | null; readonly role: LeagueSiteRole; readonly sleeperUserId: string | null }
  | { readonly leagueId: string; readonly status: "NOT_MEMBER" }
  | { readonly leagueId: string; readonly status: "UNAVAILABLE" };

const ROLES: ReadonlySet<string> = new Set(["commissioner", "assistant", "member"]);
const clean = (value: unknown, max = 120): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

/** Read one league site's whoami reply. Anything unexpected counts as "site unavailable" (never as a member). */
export function parseWhoamiReply(leagueId: string, httpStatus: number, body: unknown): LeagueSiteAnswer {
  if (httpStatus !== 200 || !body || typeof body !== "object") return { leagueId, status: "UNAVAILABLE" };
  const b = body as Record<string, unknown>;
  if (b.member === false) return { leagueId, status: "NOT_MEMBER" };
  const ownerId = clean(b.ownerId, 80);
  const role = typeof b.role === "string" && ROLES.has(b.role) ? (b.role as LeagueSiteRole) : null;
  if (b.member !== true || !ownerId || !role) return { leagueId, status: "UNAVAILABLE" };
  const sleeper = clean(b.sleeperUserId, 40);
  return { leagueId, status: "MEMBER", ownerId, displayName: clean(b.displayName), franchiseId: clean(b.franchiseId, 80), teamName: clean(b.teamName), role, sleeperUserId: sleeper && /^\d+$/.test(sleeper) ? sleeper : null };
}

export interface OwnerLinkEvidence {
  readonly evidenceId: string;
  readonly accountId: string;
  readonly ownerId: string;
  readonly leagueId: string;
  readonly source: "LEAGUE_SITE_WHOAMI";
  readonly siteOwnerId: string;
  readonly role: LeagueSiteRole;
  readonly franchiseId: string | null;
  readonly createdAt: string;
  readonly vouchedAt: string;
  readonly updatedAt: string;
}

export type SignInConflictKind =
  | "SITES_DISAGREE"
  | "UNMAPPED_SITE_OWNER"
  | "UNKNOWN_HQ_OWNER"
  | "SLEEPER_ID_MISMATCH"
  | "ACCOUNT_LINKED_TO_OTHER_OWNER"
  | "OWNER_LINKED_TO_OTHER_ACCOUNT"
  | "AUTH_IDENTITY_NOT_VERIFIED"
  | "ACCOUNT_ID_TAKEN";

export interface SignInConflictClaim { readonly leagueId: string; readonly siteOwnerId: string; readonly hqOwnerId: string | null }
export interface SignInLinkConflict {
  readonly conflictId: string;
  readonly provider: "FIREBASE_AUTH";
  readonly externalSubject: string;
  readonly state: "OPEN" | "RESOLVED";
  readonly kind: SignInConflictKind;
  readonly claims: readonly SignInConflictClaim[];
  /** HQ owner ids involved (names are looked up when shown; no emails or contact details are stored). */
  readonly ownerIds: readonly string[];
  readonly detail: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt?: string;
}

export interface SignInLinkState extends PlatformAccessRegistry {
  /** Canonical owners in the HQ database (`owners`). */
  readonly owners: readonly OwnerRecord[];
  readonly evidence: readonly OwnerLinkEvidence[];
  readonly conflicts: readonly SignInLinkConflict[];
}

export type SignInWrite = { readonly collection: SignInCollection; readonly id: string; readonly op: "create" | "set"; readonly data: object };
export type SignInOutcome = "LINKED_NEW" | "LINK_ADDED" | "ALREADY_LINKED" | "NOT_A_MEMBER" | "CONFLICT";
export interface SignInLinkPlan {
  readonly outcome: SignInOutcome;
  readonly uid: string;
  readonly accountId: string | null;
  readonly ownerId: string | null;
  readonly writes: readonly SignInWrite[];
  readonly conflict: SignInLinkConflict | null;
}

export const signInMappingId = (uid: string) => `firebase-auth:${uid}`;
export const signInConflictId = (uid: string) => `sign-in-conflict:${uid}`;
export const signInAccountId = (ownerId: string) => `${ownerId}-account`;
export const signInOwnerLinkId = (accountId: string, ownerId: string) => `owner-link:${accountId}:${ownerId}`;
export const signInEvidenceId = (accountId: string, leagueId: string) => `evidence:${accountId}:${leagueId}`;

function conflictPlan(input: { uid: string; now: string; state: SignInLinkState }, kind: SignInConflictKind, claims: readonly SignInConflictClaim[], ownerIds: readonly string[], detail: string, accountId: string | null = null): SignInLinkPlan {
  const conflictId = signInConflictId(input.uid);
  const existing = input.state.conflicts.find((c) => c.conflictId === conflictId) ?? null;
  const sortedOwners = [...new Set(ownerIds)].sort();
  const sortedClaims = [...claims].sort((a, b) => `${a.leagueId}:${a.siteOwnerId}`.localeCompare(`${b.leagueId}:${b.siteOwnerId}`));
  const same = existing && existing.state === "OPEN" && existing.kind === kind && JSON.stringify(existing.claims) === JSON.stringify(sortedClaims) && JSON.stringify(existing.ownerIds) === JSON.stringify(sortedOwners);
  const conflict: SignInLinkConflict = same ? existing : { conflictId, provider: "FIREBASE_AUTH", externalSubject: input.uid, state: "OPEN", kind, claims: sortedClaims, ownerIds: sortedOwners, detail, createdAt: existing?.createdAt ?? input.now, updatedAt: input.now };
  return { outcome: "CONFLICT", uid: input.uid, accountId, ownerId: null, writes: same ? [] : [{ collection: SIGN_IN_COLLECTIONS.signInLinkConflicts, id: conflictId, op: "set", data: conflict }], conflict };
}

function resolveOpenConflict(input: { uid: string; now: string; state: SignInLinkState }): SignInWrite[] {
  const open = input.state.conflicts.find((c) => c.conflictId === signInConflictId(input.uid) && c.state === "OPEN");
  return open ? [{ collection: SIGN_IN_COLLECTIONS.signInLinkConflicts, id: open.conflictId, op: "set", data: { ...open, state: "RESOLVED", updatedAt: input.now, resolvedAt: input.now } }] : [];
}

function evidenceWrites(accountId: string, ownerId: string, members: readonly Extract<LeagueSiteAnswer, { status: "MEMBER" }>[], state: SignInLinkState, now: string): SignInWrite[] {
  const writes: SignInWrite[] = [];
  for (const m of members) {
    const evidenceId = signInEvidenceId(accountId, m.leagueId);
    const existing = state.evidence.find((e) => e.evidenceId === evidenceId);
    if (existing && existing.ownerId === ownerId && existing.siteOwnerId === m.ownerId && existing.role === m.role && existing.franchiseId === m.franchiseId) continue;
    const record: OwnerLinkEvidence = { evidenceId, accountId, ownerId, leagueId: m.leagueId, source: "LEAGUE_SITE_WHOAMI", siteOwnerId: m.ownerId, role: m.role, franchiseId: m.franchiseId, createdAt: existing?.createdAt ?? now, vouchedAt: now, updatedAt: now };
    writes.push({ collection: SIGN_IN_COLLECTIONS.ownerLinkEvidence, id: evidenceId, op: "set", data: record });
  }
  return writes;
}

const LEAGUE_NAMES: Readonly<Record<string, string>> = {};
const leagueName = (id: string) => LEAGUE_NAMES[id] ?? id;

/**
 * Decide what one sign-in should write. `answers` are the league sites' whoami replies for this Google account
 * (already verified by each site against the platform project's ID token).
 */
export function planSignInLink(input: { readonly uid: string; readonly answers: readonly LeagueSiteAnswer[]; readonly state: SignInLinkState; readonly now?: string }): SignInLinkPlan {
  const uid = input.uid.trim();
  if (!uid) throw new Error("Firebase uid is required.");
  const now = input.now ?? new Date().toISOString();
  const ctx = { uid, now, state: input.state };
  const members = input.answers.filter((a): a is Extract<LeagueSiteAnswer, { status: "MEMBER" }> => a.status === "MEMBER" && isWhoamiLeague(a.leagueId));

  // 1. Map every site answer to an HQ owner, checking it against the reviewed table and HQ's Sleeper identities.
  const claims: SignInConflictClaim[] = [];
  for (const m of members) {
    const row = hqOwnerForSiteOwner(m.leagueId, m.ownerId);
    claims.push({ leagueId: m.leagueId, siteOwnerId: m.ownerId, hqOwnerId: row?.hqOwnerId ?? null });
  }
  const unmapped = claims.filter((c) => !c.hqOwnerId);
  if (unmapped.length) return conflictPlan(ctx, "UNMAPPED_SITE_OWNER", claims, claims.flatMap((c) => (c.hqOwnerId ? [c.hqOwnerId] : [])), `No reviewed HQ owner for ${unmapped.map((c) => `${leagueName(c.leagueId)} owner "${c.siteOwnerId}"`).join(", ")}.`);
  const ownerIds = [...new Set(claims.map((c) => c.hqOwnerId!))];
  if (ownerIds.length > 1) return conflictPlan(ctx, "SITES_DISAGREE", claims, ownerIds, `League sites named different owners for this Google account: ${claims.map((c) => `${leagueName(c.leagueId)} → ${c.hqOwnerId}`).join(", ")}.`);
  for (const m of members) {
    const row = hqOwnerForSiteOwner(m.leagueId, m.ownerId)!;
    const owner = input.state.owners.find((o) => o.ownerId === row.hqOwnerId);
    if (!owner || owner.lifecycle === "RETIRED" || owner.lifecycle === "INACTIVE") return conflictPlan(ctx, "UNKNOWN_HQ_OWNER", claims, ownerIds, `HQ has no active owner record for ${row.hqOwnerId}.`);
    const confirmed = owner.providerIdentities.filter((p) => p.provider === "SLEEPER" && p.state === "CONFIRMED").map((p) => p.externalUserId);
    if (m.sleeperUserId && ((row.sleeperUserId && row.sleeperUserId !== m.sleeperUserId) || (confirmed.length && !confirmed.includes(m.sleeperUserId)))) return conflictPlan(ctx, "SLEEPER_ID_MISMATCH", claims, ownerIds, `${leagueName(m.leagueId)}'s Sleeper id for ${row.hqOwnerId} doesn't match HQ's.`);
  }

  // 2. What already exists for this Google account?
  const mapping = input.state.authIdentities.find((i) => i.provider === "FIREBASE_AUTH" && i.externalSubject === uid) ?? null;
  if (mapping && mapping.state !== "VERIFIED") return conflictPlan(ctx, "AUTH_IDENTITY_NOT_VERIFIED", claims, ownerIds, "This Google account's sign-in record is pending or revoked; a commissioner must review it.");

  if (ownerIds.length === 0) {
    // No league site vouched (not a member, or the sites were unreachable): keep whatever exists, write nothing.
    return { outcome: mapping ? "ALREADY_LINKED" : "NOT_A_MEMBER", uid, accountId: mapping?.accountId ?? null, ownerId: null, writes: [], conflict: null };
  }
  const ownerId = ownerIds[0];
  const ownerLinksElsewhere = input.state.ownerLinks.filter((l) => l.ownerId === ownerId && l.state === "VERIFIED" && l.accountId !== mapping?.accountId);

  if (mapping) {
    const accountId = mapping.accountId;
    const myLinks = input.state.ownerLinks.filter((l) => l.accountId === accountId && l.state === "VERIFIED");
    if (myLinks.some((l) => l.ownerId === ownerId)) {
      if (ownerLinksElsewhere.length) return conflictPlan(ctx, "OWNER_LINKED_TO_OTHER_ACCOUNT", claims, ownerIds, `${ownerId} is linked to more than one account.`, accountId);
      return { outcome: "ALREADY_LINKED", uid, accountId, ownerId, writes: [...evidenceWrites(accountId, ownerId, members, input.state, now), ...resolveOpenConflict(ctx)], conflict: null };
    }
    if (myLinks.length) return conflictPlan(ctx, "ACCOUNT_LINKED_TO_OTHER_OWNER", claims, [...ownerIds, ...myLinks.map((l) => l.ownerId)], `This Google account is already linked to ${myLinks.map((l) => l.ownerId).join(", ")}, but the league sites say ${ownerId}.`, accountId);
    if (ownerLinksElsewhere.length) return conflictPlan(ctx, "OWNER_LINKED_TO_OTHER_ACCOUNT", claims, ownerIds, `${ownerId} is already linked to a different Google account.`, accountId);
    if (accountId === PILOT_PLATFORM_ACCOUNT_ID) return conflictPlan(ctx, "ACCOUNT_LINKED_TO_OTHER_OWNER", claims, ownerIds, "Ray's pilot account is never changed by sign-in.", accountId);
    const account = input.state.accounts.find((a) => a.accountId === accountId);
    if (!account || account.state !== "ACTIVE" || !account.verified) return conflictPlan(ctx, "AUTH_IDENTITY_NOT_VERIFIED", claims, ownerIds, "This Google account's platform account is missing or not active.", accountId);
    const link = ownerLinkRecord(accountId, ownerId, members, now);
    return { outcome: "LINK_ADDED", uid, accountId, ownerId, writes: [{ collection: SIGN_IN_COLLECTIONS.ownerLinks, id: link.linkId, op: "create", data: link }, ...evidenceWrites(accountId, ownerId, members, input.state, now), ...resolveOpenConflict(ctx)], conflict: null };
  }

  if (ownerLinksElsewhere.length) return conflictPlan(ctx, "OWNER_LINKED_TO_OTHER_ACCOUNT", claims, ownerIds, `${ownerId} is already linked to a different Google account.`);
  const accountId = signInAccountId(ownerId);
  if (input.state.accounts.some((a) => a.accountId === accountId) || input.state.authIdentities.some((i) => i.accountId === accountId)) return conflictPlan(ctx, "ACCOUNT_ID_TAKEN", claims, ownerIds, `Account ${accountId} already exists without a link to this Google account.`);
  const owner = input.state.owners.find((o) => o.ownerId === ownerId)!;
  const account: PlatformAccount = { accountId: accountId as never, state: "ACTIVE", displayName: owner.preferredDisplayName ?? owner.displayName, verified: true, createdAt: now, updatedAt: now };
  const authIdentity: AuthIdentityMapping = { mappingId: signInMappingId(uid) as never, accountId: accountId as never, provider: "FIREBASE_AUTH", externalSubject: uid, state: "VERIFIED", sourceRef: SIGN_IN_LINK_SOURCE, createdAt: now, verifiedAt: now };
  const link = ownerLinkRecord(accountId, ownerId, members, now);
  return {
    outcome: "LINKED_NEW", uid, accountId, ownerId, conflict: null,
    writes: [
      { collection: SIGN_IN_COLLECTIONS.platformAccounts, id: accountId, op: "create", data: account },
      { collection: SIGN_IN_COLLECTIONS.authIdentityMappings, id: authIdentity.mappingId, op: "create", data: authIdentity },
      { collection: SIGN_IN_COLLECTIONS.ownerLinks, id: link.linkId, op: "create", data: link },
      ...evidenceWrites(accountId, ownerId, members, input.state, now),
      ...resolveOpenConflict(ctx),
    ],
  };
}

function ownerLinkRecord(accountId: string, ownerId: string, members: readonly Extract<LeagueSiteAnswer, { status: "MEMBER" }>[], now: string): OwnerLink & { readonly updatedAt: string } {
  const leagues = [...new Set(members.map((m) => m.leagueId))].sort();
  return { linkId: signInOwnerLinkId(accountId, ownerId) as never, accountId: accountId as never, ownerId: ownerId as never, state: "VERIFIED", verificationMethod: "LEAGUE_SITE_SIGN_IN", createdAt: now, updatedAt: now, createdBy: SIGN_IN_LINK_SOURCE, verifiedAt: now, sourceRef: `${SIGN_IN_LINK_SOURCE}:${leagues.join(",")}`, reason: `Vouched at sign-in by ${leagues.map(leagueName).join(", ")} (${now}).` };
}

/** A transaction over the HQ database: reads first, then writes (Firestore's rule). */
export interface SignInLinkTransaction {
  get(collection: SignInCollection, id: string): Promise<object | null>;
  verifiedOwnerLinksFor(ownerId: string): Promise<readonly OwnerLink[]>;
  create(collection: SignInCollection, id: string, data: object): void;
  set(collection: SignInCollection, id: string, data: object): void;
}
export interface SignInLinkStore { transact<T>(fn: (tx: SignInLinkTransaction) => Promise<T>): Promise<T> }

const NEVER_REWRITTEN: ReadonlySet<string> = new Set([SIGN_IN_COLLECTIONS.platformAccounts, SIGN_IN_COLLECTIONS.authIdentityMappings, SIGN_IN_COLLECTIONS.ownerLinks]);

/** Apply a plan. Re-checks inside the transaction so two sign-ins at once can't create a duplicate account or link. */
export async function applySignInLinkPlan(store: SignInLinkStore, plan: SignInLinkPlan): Promise<{ readonly written: number }> {
  if (!plan.writes.length) return { written: 0 };
  for (const w of plan.writes) {
    if (NEVER_REWRITTEN.has(w.collection) && w.op !== "create") throw new Error(`Sign-in never rewrites ${w.collection}.`);
    if (w.id.includes(PILOT_PLATFORM_ACCOUNT_ID) && NEVER_REWRITTEN.has(w.collection)) throw new Error("Sign-in never writes Ray's pilot records.");
  }
  return store.transact(async (tx) => {
    const creates = plan.writes.filter((w) => w.op === "create");
    const existing = await Promise.all(creates.map((w) => tx.get(w.collection, w.id)));
    const taken = creates.find((_, i) => existing[i]);
    if (taken) throw new Error(`Sign-in link changed meanwhile: ${taken.collection}/${taken.id} already exists.`);
    if (plan.ownerId && creates.some((w) => w.collection === SIGN_IN_COLLECTIONS.ownerLinks)) {
      const links = await tx.verifiedOwnerLinksFor(plan.ownerId);
      if (links.some((l) => l.accountId !== plan.accountId)) throw new Error("Sign-in link changed meanwhile: owner already linked to another account.");
    }
    // The auth mapping id is derived from the uid, so the "already exists" check above also guarantees one account per Google uid.
    for (const w of plan.writes) (w.op === "create" ? tx.create : tx.set).call(tx, w.collection, w.id, w.data);
    return { written: plan.writes.length };
  });
}
