import type { AuthIdentityMapping, PlatformAccessRegistry, PlatformAccount } from "./types.ts";

export function getAccountById(accountId: string, registry: PlatformAccessRegistry): PlatformAccount | null {
  return registry.accounts.find((account) => account.accountId === accountId) ?? null;
}

export function getAccountByAuthIdentity(provider: AuthIdentityMapping["provider"], externalSubject: string, registry: PlatformAccessRegistry): PlatformAccount | null {
  const mapping = registry.authIdentities.find((identity) => identity.provider === provider && identity.externalSubject === externalSubject && identity.state === "VERIFIED");
  return mapping ? getAccountById(mapping.accountId, registry) : null;
}

