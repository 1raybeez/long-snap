import type { OwnerId } from "../../owner-identity/src/types.ts";
import type { OwnerLink, PlatformAccessRegistry, PlatformAccount, PlatformAccountId } from "./types.ts";

export function getVerifiedOwnerLinks(accountId: PlatformAccountId | string, registry: PlatformAccessRegistry): readonly OwnerLink[] {
  return registry.ownerLinks.filter((link) => link.accountId === accountId && link.state === "VERIFIED");
}

export function getOwnersForAccount(accountId: PlatformAccountId | string, registry: PlatformAccessRegistry): readonly OwnerId[] {
  return getVerifiedOwnerLinks(accountId, registry).map((link) => link.ownerId);
}

export function getAccountsForOwner(ownerId: OwnerId | string, registry: PlatformAccessRegistry): readonly PlatformAccount[] {
  const accountIds = new Set(getVerifiedOwnerLinksForOwner(ownerId, registry).map((link) => link.accountId));
  return registry.accounts.filter((account) => accountIds.has(account.accountId));
}

function getVerifiedOwnerLinksForOwner(ownerId: OwnerId | string, registry: PlatformAccessRegistry): readonly OwnerLink[] {
  return registry.ownerLinks.filter((link) => link.ownerId === ownerId && link.state === "VERIFIED");
}

