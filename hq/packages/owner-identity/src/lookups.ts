import type { OwnerId, OwnerIdentityRegistry, OwnerRecord, FranchiseRecord, FranchiseId, LeagueMembershipRecord, TeamSeasonRecord, TeamSeasonId } from "./types.ts";

export function getOwnerById(ownerId: string, registry: OwnerIdentityRegistry): OwnerRecord | null {
  return registry.owners.find((owner) => owner.ownerId === ownerId) ?? null;
}

export function getOwnerByProviderId(provider: "SLEEPER", externalUserId: string, registry: OwnerIdentityRegistry): OwnerRecord | null {
  return registry.owners.find((owner) => owner.providerIdentities.some((identity) => identity.provider === provider && identity.externalUserId === externalUserId)) ?? null;
}

export function resolveSleeperUserToOwner(externalUserId: string, registry: OwnerIdentityRegistry): OwnerRecord | null {
  return getOwnerByProviderId("SLEEPER", externalUserId, registry);
}

export function getLeagueMembershipsForOwner(ownerId: OwnerId | string, registry: OwnerIdentityRegistry, season?: number): readonly LeagueMembershipRecord[] {
  return registry.memberships.filter((membership) => membership.ownerId === ownerId && (season === undefined || (membership.effectiveFromSeason <= season && (membership.effectiveToSeason === undefined || membership.effectiveToSeason >= season))));
}

export function getOwnersForLeague(leagueId: string, registry: OwnerIdentityRegistry, season?: number): readonly OwnerRecord[] {
  const ids = new Set(registry.memberships.filter((membership) => membership.leagueId === leagueId && (season === undefined || (membership.effectiveFromSeason <= season && (membership.effectiveToSeason === undefined || membership.effectiveToSeason >= season)))).map((membership) => membership.ownerId));
  return registry.owners.filter((owner) => ids.has(owner.ownerId));
}

export function getOwnersForFranchise(franchiseId: FranchiseId | string, registry: OwnerIdentityRegistry, season?: number): readonly OwnerRecord[] {
  const ids = new Set(registry.memberships.filter((membership) => membership.franchiseId === franchiseId && (season === undefined || (membership.effectiveFromSeason <= season && (membership.effectiveToSeason === undefined || membership.effectiveToSeason >= season)))).map((membership) => membership.ownerId));
  return registry.owners.filter((owner) => ids.has(owner.ownerId));
}

export function getFranchisesForOwner(ownerId: OwnerId | string, registry: OwnerIdentityRegistry, season?: number): readonly FranchiseRecord[] {
  const ids = new Set(getLeagueMembershipsForOwner(ownerId, registry, season).flatMap((membership) => membership.franchiseId ? [membership.franchiseId] : []));
  return registry.franchises.filter((franchise) => ids.has(franchise.franchiseId));
}

export function getFranchiseForOwner(ownerId: OwnerId | string, registry: OwnerIdentityRegistry, season: number): FranchiseRecord | null {
  const franchises = getFranchisesForOwner(ownerId, registry, season);
  return franchises.length === 1 ? franchises[0] : null;
}

export function getTeamSeason(teamSeasonId: TeamSeasonId | string, registry: OwnerIdentityRegistry): TeamSeasonRecord | null {
  return registry.teamSeasons.find((teamSeason) => teamSeason.teamSeasonId === teamSeasonId) ?? null;
}

export function getOwnersForTeamSeason(teamSeasonId: TeamSeasonId | string, registry: OwnerIdentityRegistry): readonly OwnerRecord[] {
  const ids = new Set(registry.memberships.filter((membership) => membership.teamSeasonId === teamSeasonId).map((membership) => membership.ownerId));
  return registry.owners.filter((owner) => ids.has(owner.ownerId));
}
