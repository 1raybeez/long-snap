import type { PermissionGrant, PlatformAccessRegistry, PlatformPermission } from "./types.ts";

export function getActivePermissionGrants(accountId: string, permission: PlatformPermission, registry: PlatformAccessRegistry): readonly PermissionGrant[] {
  return registry.permissionGrants.filter((grant) => grant.accountId === accountId && grant.permission === permission && grant.state === "ACTIVE");
}

export function permissionGrantMatches(grant: PermissionGrant, context: { scope: PermissionGrant["scope"]; leagueId?: string; franchiseId?: string; season?: number }): boolean {
  if (grant.scope !== context.scope) return false;
  if (grant.scope === "LEAGUE" && grant.leagueId !== context.leagueId) return false;
  if (grant.scope === "FRANCHISE" && grant.franchiseId !== context.franchiseId) return false;
  if (grant.season !== undefined && grant.season !== context.season) return false;
  return true;
}
