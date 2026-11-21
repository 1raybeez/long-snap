import type { LeagueRegistry } from "../../league-registry/src/types.ts";
import type { OwnerIdentityRegistry } from "./types.ts";

const SENSITIVE_OR_OUT_OF_SCOPE_FIELDS = new Set(["email", "phone", "address", "password", "passwordHash", "credentials", "oauth", "session", "preferences", "preferenceEvidence"]);

function unique(values: readonly string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) errors.push(`${label} must not be empty.`);
    if (seen.has(value)) errors.push(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function checkOutOfScopeFields(value: object, label: string, errors: string[]): void {
  for (const key of Object.keys(value)) if (SENSITIVE_OR_OUT_OF_SCOPE_FIELDS.has(key)) errors.push(`${label} contains out-of-scope field: ${key}`);
}

export function validateOwnerIdentityRegistry(registry: OwnerIdentityRegistry, leagues: LeagueRegistry): readonly string[] {
  const errors: string[] = [];
  unique(registry.owners.map((owner) => owner.ownerId), "ownerId", errors);
  unique(registry.franchises.map((franchise) => franchise.franchiseId), "franchiseId", errors);
  unique(registry.teamSeasons.map((teamSeason) => teamSeason.teamSeasonId), "teamSeasonId", errors);
  unique(registry.memberships.map((membership) => membership.membershipId), "membershipId", errors);
  const ownerIds = new Set(registry.owners.map((owner) => owner.ownerId));
  const franchiseIds = new Set(registry.franchises.map((franchise) => franchise.franchiseId));
  const teamSeasonIds = new Set(registry.teamSeasons.map((teamSeason) => teamSeason.teamSeasonId));
  const leagueIds = new Set(leagues.leagues.map((league) => league.id));
  const providerUsers = new Set<string>();
  const providerTeamBindings = new Set<string>();
  for (const owner of registry.owners) {
    checkOutOfScopeFields(owner as unknown as object, `Owner ${owner.ownerId}`, errors);
    for (const identity of owner.providerIdentities) {
      if (!identity.externalUserId.trim()) errors.push(`Owner ${owner.ownerId} has an empty provider user ID.`);
      const key = `${identity.provider}:${identity.externalUserId}`;
      if (providerUsers.has(key)) errors.push(`Provider identity maps to more than one owner: ${key}`);
      providerUsers.add(key);
    }
  }
  for (const franchise of registry.franchises) if (!leagueIds.has(franchise.leagueId)) errors.push(`Franchise ${franchise.franchiseId} references unknown league ${franchise.leagueId}.`);
  for (const teamSeason of registry.teamSeasons) {
    const franchise = registry.franchises.find((candidate) => candidate.franchiseId === teamSeason.franchiseId);
    if (!franchise) errors.push(`Team-season ${teamSeason.teamSeasonId} references unknown franchise ${teamSeason.franchiseId}.`);
    if (!Number.isInteger(teamSeason.season)) errors.push(`Team-season ${teamSeason.teamSeasonId} has an invalid season.`);
    const providerBindings = new Set<string>();
    for (const binding of teamSeason.providerBindings) {
      const key = `${binding.provider}:${binding.externalLeagueId}:${binding.externalSeason}:${binding.externalRosterId}`;
      if (providerBindings.has(key)) errors.push(`Duplicate provider team-season binding: ${key}`);
      if (providerTeamBindings.has(key)) errors.push(`Provider team-season binding is duplicated for the same season: ${key}`);
      providerBindings.add(key);
      providerTeamBindings.add(key);
    }
  }
  const membershipKeys = new Set<string>();
  for (const membership of registry.memberships) {
    if (!ownerIds.has(membership.ownerId)) errors.push(`Membership ${membership.membershipId} references unknown owner ${membership.ownerId}.`);
    if (!leagueIds.has(membership.leagueId)) errors.push(`Membership ${membership.membershipId} references unknown league ${membership.leagueId}.`);
    if (membership.franchiseId && !franchiseIds.has(membership.franchiseId)) errors.push(`Membership ${membership.membershipId} references unknown franchise ${membership.franchiseId}.`);
    if (membership.teamSeasonId && !teamSeasonIds.has(membership.teamSeasonId)) errors.push(`Membership ${membership.membershipId} references unknown team-season ${membership.teamSeasonId}.`);
    if (membership.effectiveToSeason !== undefined && membership.effectiveToSeason < membership.effectiveFromSeason) errors.push(`Membership ${membership.membershipId} has an invalid effective season range.`);
    const key = `${membership.ownerId}:${membership.leagueId}:${membership.effectiveFromSeason}:${membership.effectiveToSeason ?? ""}:${membership.role}:${membership.franchiseId ?? ""}:${membership.teamSeasonId ?? ""}`;
    if (membershipKeys.has(key)) errors.push(`Duplicate owner membership context: ${key}`);
    membershipKeys.add(key);
    if (membership.franchiseId) {
      const franchise = registry.franchises.find((candidate) => candidate.franchiseId === membership.franchiseId);
      if (franchise && franchise.leagueId !== membership.leagueId) errors.push(`Membership ${membership.membershipId} franchise and league do not match.`);
    }
    if (membership.teamSeasonId) {
      const teamSeason = registry.teamSeasons.find((candidate) => candidate.teamSeasonId === membership.teamSeasonId);
      if (teamSeason && membership.franchiseId && teamSeason.franchiseId !== membership.franchiseId) errors.push(`Membership ${membership.membershipId} team-season and franchise do not match.`);
    }
  }
  return errors;
}

export function assertValidOwnerIdentityRegistry(registry: OwnerIdentityRegistry, leagues: LeagueRegistry): void {
  const errors = validateOwnerIdentityRegistry(registry, leagues);
  if (errors.length > 0) throw new Error(`Invalid owner identity registry:\n${errors.join("\n")}`);
}
