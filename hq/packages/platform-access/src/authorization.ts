import { getCapability, getLeagueById } from "../../league-registry/src/index.ts";
import { getLeagueMembershipsForOwner } from "../../owner-identity/src/index.ts";
import type { OwnerIdentityRegistry, OwnerId } from "../../owner-identity/src/types.ts";
import { getAccountById } from "./accounts.ts";
import { getVerifiedOwnerLinks, getOwnersForAccount } from "./owner-links.ts";
import { getActivePermissionGrants, permissionGrantMatches } from "./permissions.ts";
import type { AuthorizationContext, AuthorizationResolution, PlatformAccessRegistry } from "./types.ts";
import type { LeagueRegistry } from "../../league-registry/src/types.ts";

export interface AuthorizationDependencies {
  readonly access: PlatformAccessRegistry;
  readonly owners: OwnerIdentityRegistry;
  readonly leagues: LeagueRegistry;
}

function accountIsAuthenticated(accountId: string, dependencies: AuthorizationDependencies): boolean {
  const account = getAccountById(accountId, dependencies.access);
  return Boolean(account && account.state === "ACTIVE" && account.verified && dependencies.access.authIdentities.some((identity) => identity.accountId === accountId && identity.state === "VERIFIED"));
}

function ownerHasLeagueMembership(ownerId: OwnerId, leagueId: string, season: number | undefined, dependencies: AuthorizationDependencies): boolean {
  return getLeagueMembershipsForOwner(ownerId, dependencies.owners, season).some((membership) => membership.leagueId === leagueId && membership.state === "ACTIVE" && (season === undefined || membership.effectiveFromSeason <= season));
}

function ownerHasFranchiseMembership(ownerId: OwnerId, franchiseId: string, season: number | undefined, dependencies: AuthorizationDependencies): boolean {
  const franchise = dependencies.owners.franchises.find((candidate) => candidate.franchiseId === franchiseId);
  if (!franchise) return false;
  return getLeagueMembershipsForOwner(ownerId, dependencies.owners, season).some((membership) => membership.franchiseId === franchiseId && membership.state === "ACTIVE" && membership.leagueId === franchise.leagueId);
}

export function resolveAccountLeagueAccess(accountId: string, leagueId: string, season: number | undefined, dependencies: AuthorizationDependencies): AuthorizationResolution {
  return resolveAuthorization({ accountId, permission: "VIEW_LEAGUE", scope: "LEAGUE", leagueId, season }, dependencies);
}

export function resolveAuthorization(request: AuthorizationContext, dependencies: AuthorizationDependencies): AuthorizationResolution {
  const account = getAccountById(request.accountId, dependencies.access);
  const deny = (reason: string): AuthorizationResolution => ({ allowed: false, account, ownerIds: [], reason, matchedGrantIds: [] });
  if (!account || !accountIsAuthenticated(request.accountId, dependencies)) return deny("Account is unknown, inactive, or not verified.");
  if (request.scope === "LEAGUE" && (!request.leagueId || !getLeagueById(request.leagueId, dependencies.leagues))) return deny("Requested league scope is unknown.");
  if (request.scope === "FRANCHISE" && (!request.franchiseId || !dependencies.owners.franchises.some((franchise) => franchise.franchiseId === request.franchiseId))) return deny("Requested franchise scope is unknown.");
  const ownerIds = getOwnersForAccount(request.accountId, dependencies.access);
  if ((request.scope === "LEAGUE" || request.scope === "FRANCHISE" || request.scope === "SELF") && getVerifiedOwnerLinks(request.accountId, dependencies.access).length === 0) return deny("No verified OwnerLink exists for this account.");
  if (request.scope === "LEAGUE" && !ownerIds.some((ownerId) => ownerHasLeagueMembership(ownerId, request.leagueId!, request.season, dependencies))) return deny("No active owner membership exists for the requested league and season.");
  if (request.scope === "FRANCHISE" && !ownerIds.some((ownerId) => ownerHasFranchiseMembership(ownerId, request.franchiseId!, request.season, dependencies))) return deny("No active owner membership exists for the requested franchise and season.");
  if (request.permission === "USE_TRADE_WAR_ROOM" || request.permission === "VIEW_OWNER_PREFERENCE_GUIDANCE" || request.permission === "SAVE_TRADE_ANALYSIS") {
    if (request.leagueId && getCapability(request.leagueId, "TRADE_WAR_ROOM", dependencies.leagues)?.state === "OUT_OF_SCOPE") return deny("Trade War Room capability is out of scope for this league.");
  }
  const grants = getActivePermissionGrants(request.accountId, request.permission, dependencies.access).filter((grant) => permissionGrantMatches(grant, request));
  if (grants.length === 0) return deny("No matching active permission grant exists.");
  return { allowed: true, account, ownerIds, reason: "Explicit authenticated account, verified owner scope, membership, and permission grant resolved.", matchedGrantIds: grants.map((grant) => grant.grantId) };
}

export function hasPermission(request: AuthorizationContext, dependencies: AuthorizationDependencies): boolean {
  return resolveAuthorization(request, dependencies).allowed;
}

export function assertPermission(request: AuthorizationContext, dependencies: AuthorizationDependencies): void {
  const resolution = resolveAuthorization(request, dependencies);
  if (!resolution.allowed) throw new Error(`Permission denied: ${resolution.reason}`);
}
