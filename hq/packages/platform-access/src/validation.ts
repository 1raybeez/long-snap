import { getLeagueById } from "../../league-registry/src/index.ts";
import type { PlatformAccessRegistry, PlatformAccessValidationContext } from "./types.ts";

const FORBIDDEN_FIELDS = new Set(["password", "passwordHash", "oauthToken", "accessToken", "refreshToken", "secret", "firebaseAdminCredentials"]);

function unique(values: readonly string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) errors.push(`${label} must not be empty.`);
    if (seen.has(value)) errors.push(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function validatePlatformAccessRegistry(registry: PlatformAccessRegistry, context: PlatformAccessValidationContext): readonly string[] {
  const errors: string[] = [];
  unique(registry.accounts.map((account) => account.accountId), "accountId", errors);
  unique(registry.authIdentities.map((identity) => identity.mappingId), "auth identity mapping ID", errors);
  unique(registry.ownerLinks.map((link) => link.linkId), "owner link ID", errors);
  unique(registry.permissionGrants.map((grant) => grant.grantId), "permission grant ID", errors);
  const accountIds = new Set(registry.accounts.map((account) => account.accountId));
  const ownerIds = new Set(context.owners.owners.map((owner) => owner.ownerId));
  const franchiseIds: ReadonlySet<string> = new Set(context.owners.franchises.map((franchise) => String(franchise.franchiseId)));
  const authSubjects = new Set<string>();
  const grantKeys = new Set<string>();
  for (const account of registry.accounts) {
    for (const field of Object.keys(account)) if (FORBIDDEN_FIELDS.has(field)) errors.push(`Account ${account.accountId} contains forbidden secret field: ${field}`);
  }
  for (const identity of registry.authIdentities) {
    if (!accountIds.has(identity.accountId)) errors.push(`Auth identity ${identity.mappingId} references unknown account.`);
    if (!identity.externalSubject.trim()) errors.push(`Auth identity ${identity.mappingId} has an empty external subject.`);
    const key = `${identity.provider}:${identity.externalSubject}`;
    if (authSubjects.has(key)) errors.push(`Authentication identity maps to more than one account: ${key}`);
    authSubjects.add(key);
  }
  for (const link of registry.ownerLinks) {
    if (!accountIds.has(link.accountId)) errors.push(`Owner link ${link.linkId} references unknown account.`);
    if (!ownerIds.has(link.ownerId)) errors.push(`Owner link ${link.linkId} references unknown OwnerId.`);
    for (const field of Object.keys(link)) if (FORBIDDEN_FIELDS.has(field)) errors.push(`Owner link ${link.linkId} contains forbidden secret field: ${field}`);
    if (link.state === "VERIFIED" && !link.verifiedAt) errors.push(`Verified owner link ${link.linkId} requires verifiedAt.`);
    if (link.state === "REVOKED" && !link.revokedAt) errors.push(`Revoked owner link ${link.linkId} requires revokedAt.`);
  }
  for (const grant of registry.permissionGrants) {
    if (!accountIds.has(grant.accountId)) errors.push(`Permission grant ${grant.grantId} references unknown account.`);
    if (grant.scope === "LEAGUE" && (!grant.leagueId || !getLeagueById(grant.leagueId, context.leagues))) errors.push(`League permission grant ${grant.grantId} requires a known league.`);
    if (grant.scope === "FRANCHISE" && (!grant.franchiseId || !franchiseIds.has(grant.franchiseId))) errors.push(`Franchise permission grant ${grant.grantId} requires a known franchise.`);
    if (grant.scope === "PLATFORM" && (grant.leagueId || grant.franchiseId)) errors.push(`Platform grant ${grant.grantId} cannot contain league/franchise scope.`);
    if (grant.scope === "SELF" && (grant.leagueId || grant.franchiseId)) errors.push(`Self grant ${grant.grantId} cannot contain league/franchise scope.`);
    const key = `${grant.accountId}:${grant.permission}:${grant.scope}:${grant.leagueId ?? ""}:${grant.franchiseId ?? ""}:${grant.season ?? ""}`;
    if (grantKeys.has(key)) errors.push(`Duplicate permission grant context: ${key}`);
    grantKeys.add(key);
  }
  return errors;
}

export function assertValidPlatformAccessRegistry(registry: PlatformAccessRegistry, context: PlatformAccessValidationContext): void {
  const errors = validatePlatformAccessRegistry(registry, context);
  if (errors.length > 0) throw new Error(`Invalid platform access registry:\n${errors.join("\n")}`);
}
