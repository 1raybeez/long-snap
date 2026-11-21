import type { LeagueRegistry } from "../../league-registry/src/types.ts";

export type OwnerId = string & { readonly __ownerId: unique symbol };
export type LeagueMembershipId = string & { readonly __leagueMembershipId: unique symbol };
export type FranchiseId = string & { readonly __franchiseId: unique symbol };
export type TeamSeasonId = string & { readonly __teamSeasonId: unique symbol };

export type OwnerLifecycle = "ACTIVE" | "INACTIVE" | "RETIRED" | "UNKNOWN";
export type ProviderIdentityState = "CONFIRMED" | "PENDING" | "RETIRED" | "UNRESOLVED";
export type MembershipState = "ACTIVE" | "INACTIVE" | "HISTORICAL";
export type MembershipRole = "OWNER" | "CO_OWNER" | "COMMISSIONER" | "ADMIN" | "MEMBER";

export interface OwnerProviderIdentity {
  readonly provider: "SLEEPER";
  readonly externalUserId: string;
  readonly state: ProviderIdentityState;
  readonly sourceRef?: string;
  readonly providerDisplayName?: string;
}

export interface OwnerRecord {
  readonly ownerId: OwnerId;
  readonly displayName: string;
  readonly preferredDisplayName?: string;
  readonly providerIdentities: readonly OwnerProviderIdentity[];
  readonly lifecycle: OwnerLifecycle;
  readonly aliases?: readonly string[];
}

export interface FranchiseRecord {
  readonly franchiseId: FranchiseId;
  readonly leagueId: string;
  readonly displayName?: string;
  readonly aliases?: readonly string[];
  readonly state: "ACTIVE" | "INACTIVE" | "HISTORICAL";
}

export interface ProviderTeamSeasonBinding {
  readonly provider: "SLEEPER";
  readonly externalLeagueId: string;
  readonly externalSeason: string;
  readonly externalRosterId: string;
  readonly state: "CONFIRMED" | "PENDING" | "RETIRED";
  readonly sourceRef?: string;
}

export interface TeamSeasonRecord {
  readonly teamSeasonId: TeamSeasonId;
  readonly franchiseId: FranchiseId;
  readonly season: number;
  readonly displayName?: string;
  readonly providerBindings: readonly ProviderTeamSeasonBinding[];
}

export interface LeagueMembershipRecord {
  readonly membershipId: LeagueMembershipId;
  readonly ownerId: OwnerId;
  readonly leagueId: string;
  readonly franchiseId?: FranchiseId;
  readonly teamSeasonId?: TeamSeasonId;
  readonly effectiveFromSeason: number;
  readonly effectiveToSeason?: number;
  readonly role: MembershipRole;
  readonly state: MembershipState;
  readonly sourceRef?: string;
}

export interface OwnerIdentityRegistry {
  readonly schemaVersion: 1;
  readonly owners: readonly OwnerRecord[];
  readonly franchises: readonly FranchiseRecord[];
  readonly teamSeasons: readonly TeamSeasonRecord[];
  readonly memberships: readonly LeagueMembershipRecord[];
}

export interface OwnerRegistryValidationContext {
  readonly leagues: LeagueRegistry;
}
