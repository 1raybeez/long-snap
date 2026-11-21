import type { FranchiseId, OwnerId, OwnerIdentityRegistry } from "../../owner-identity/src/types.ts";
import type { LeagueRegistry } from "../../league-registry/src/types.ts";

export type PlatformAccountId = string & { readonly __platformAccountId: unique symbol };
export type AuthIdentityMappingId = string & { readonly __authIdentityMappingId: unique symbol };
export type OwnerLinkId = string & { readonly __ownerLinkId: unique symbol };
export type PermissionGrantId = string & { readonly __permissionGrantId: unique symbol };

export type PlatformAccountState = "ACTIVE" | "PENDING" | "SUSPENDED" | "RETIRED";
export type AuthProvider = "FIREBASE_AUTH";
export type AuthIdentityState = "PENDING" | "VERIFIED" | "REVOKED";
export type OwnerLinkState = "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED";
export type OwnerLinkVerificationMethod = "PRE_LINKED" | "COMMISSIONER_INVITE" | "COMMISSIONER_APPROVAL" | "PLATFORM_ADMIN" | "MANUAL_CORRECTION" | "LEAGUE_SITE_SIGN_IN";
export type AccessScope = "PLATFORM" | "LEAGUE" | "FRANCHISE" | "SELF";
export type PermissionState = "ACTIVE" | "REVOKED";

export type PlatformPermission =
  | "VIEW_LEAGUE"
  | "USE_TRADE_WAR_ROOM"
  | "SAVE_TRADE_ANALYSIS"
  | "VIEW_OWNER_PREFERENCE_GUIDANCE"
  | "WRITE_OWNER_PREFERENCE_EVIDENCE"
  | "MANAGE_OWNER_PREFERENCE_NOTES"
  | "MANAGE_FINANCE"
  | "MANAGE_GOVERNANCE"
  | "RUN_PROVIDER_SYNC"
  | "MANAGE_PLATFORM_CONFIG";

export interface PlatformAccount {
  readonly accountId: PlatformAccountId;
  readonly state: PlatformAccountState;
  readonly displayName?: string;
  readonly verified: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AuthIdentityMapping {
  readonly mappingId: AuthIdentityMappingId;
  readonly accountId: PlatformAccountId;
  readonly provider: AuthProvider;
  readonly externalSubject: string;
  readonly state: AuthIdentityState;
  readonly sourceRef?: string;
  readonly createdAt: string;
  readonly verifiedAt?: string;
  readonly revokedAt?: string;
}

export interface OwnerLink {
  readonly linkId: OwnerLinkId;
  readonly accountId: PlatformAccountId;
  readonly ownerId: OwnerId;
  readonly state: OwnerLinkState;
  readonly verificationMethod: OwnerLinkVerificationMethod;
  readonly createdAt: string;
  readonly createdBy: PlatformAccountId | string;
  readonly verifiedAt?: string;
  readonly revokedAt?: string;
  readonly sourceRef?: string;
  readonly reason?: string;
}

export interface PermissionGrant {
  readonly grantId: PermissionGrantId;
  readonly accountId: PlatformAccountId;
  readonly permission: PlatformPermission;
  readonly scope: AccessScope;
  readonly leagueId?: string;
  readonly franchiseId?: FranchiseId | string;
  readonly season?: number;
  readonly state: PermissionState;
  readonly createdAt: string;
  readonly createdBy: PlatformAccountId | string;
  readonly sourceRef?: string;
}

export interface PlatformAccessRegistry {
  readonly schemaVersion: 1;
  readonly accounts: readonly PlatformAccount[];
  readonly authIdentities: readonly AuthIdentityMapping[];
  readonly ownerLinks: readonly OwnerLink[];
  readonly permissionGrants: readonly PermissionGrant[];
}

export interface AuthorizationContext {
  readonly accountId: PlatformAccountId | string;
  readonly permission: PlatformPermission;
  readonly scope: AccessScope;
  readonly leagueId?: string;
  readonly franchiseId?: FranchiseId | string;
  readonly season?: number;
}

export interface AuthorizationResolution {
  readonly allowed: boolean;
  readonly account: PlatformAccount | null;
  readonly ownerIds: readonly OwnerId[];
  readonly reason: string;
  readonly matchedGrantIds: readonly PermissionGrantId[];
}

export interface PlatformAccessValidationContext {
  readonly leagues: LeagueRegistry;
  readonly owners: OwnerIdentityRegistry;
}
