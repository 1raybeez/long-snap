import type { Firestore } from "firebase-admin/firestore";
import type { LeagueRegistry, CapabilityKey, CapabilityState } from "../../league-registry/src/types.ts";
import { getLeagueById, getLeagueSeason } from "../../league-registry/src/index.ts";
import type { FranchiseRecord, LeagueMembershipRecord, OwnerRecord, TeamSeasonRecord } from "../../owner-identity/src/types.ts";
import type { PersistedFranchise, PersistedMembership, PersistedOwner, PersistedTeamSeason } from "../../persistence/src/types.ts";
import type { PlatformAccessRegistry } from "./types.ts";
import { getAccountById } from "./accounts.ts";
import { getActivePermissionGrants, permissionGrantMatches } from "./permissions.ts";
import { getVerifiedOwnerLinks } from "./owner-links.ts";

export interface MyLeaguesData { readonly owners: readonly OwnerRecord[]; readonly memberships: readonly LeagueMembershipRecord[]; readonly franchises: readonly FranchiseRecord[]; readonly teamSeasons: readonly TeamSeasonRecord[]; }
export interface MyLeagueCapability { readonly key: CapabilityKey; readonly state: CapabilityState; }
export interface MyLeagueCoOwner { readonly ownerId: string; readonly displayName: string | null; readonly role: "CO_OWNER"; }
export interface MyLeagueRecord {
  readonly leagueId: string; readonly displayName: string; readonly shortName: string; readonly format: string; readonly participationMode: string; readonly lifecycle: string; readonly season: number; readonly ownerId: string; readonly franchiseId: string | null; readonly franchiseDisplayName: string | null; readonly teamSeasonId: string | null; readonly teamDisplayName: string | null; readonly coOwners: readonly MyLeagueCoOwner[]; readonly providerBinding: { readonly provider: string; readonly state: string; readonly providerLeagueId: string | null; readonly sleeperRosterId: string | null } | null; readonly capabilities: readonly MyLeagueCapability[]; readonly dedicatedWebsite: boolean; readonly commissionerHub: "AVAILABLE" | "HIDDEN"; readonly role: string;
}

function activeMembership(membership: LeagueMembershipRecord, season: number): boolean { return membership.state === "ACTIVE" && membership.effectiveFromSeason <= season && (membership.effectiveToSeason === undefined || membership.effectiveToSeason >= season); }
function publicCapabilityKeys(): readonly CapabilityKey[] { return ["TRADE_WAR_ROOM", "DRAFT_WAR_ROOM", "LEAGUE_INTELLIGENCE", "WEEKLY_LEAGUE_MEDIA"]; }

export function getMyLeagues(input: { readonly accountId: string; readonly season?: number; readonly access: PlatformAccessRegistry; readonly data: MyLeaguesData; readonly leagues: LeagueRegistry }): readonly MyLeagueRecord[] {
  const account = getAccountById(input.accountId, input.access);
  if (!account || account.state !== "ACTIVE" || !account.verified || !input.access.authIdentities.some((identity) => identity.accountId === input.accountId && identity.state === "VERIFIED")) return [];
  const verifiedOwnerIds = new Set(getVerifiedOwnerLinks(input.accountId, input.access).map((link) => link.ownerId));
  if (verifiedOwnerIds.size === 0) return [];
  const season = input.season;
  const records: MyLeagueRecord[] = [];
  const emittedCards = new Set<string>();
  for (const membership of input.data.memberships) {
    if (!verifiedOwnerIds.has(membership.ownerId)) continue;
    if (!input.data.owners.some((owner) => owner.ownerId === membership.ownerId)) continue;
    const league = getLeagueById(membership.leagueId, input.leagues);
    const targetSeason = season ?? league?.currentSeason;
    if (!league || targetSeason === undefined || !activeMembership(membership, targetSeason)) continue;
    const cardKey = `${league.id}:${membership.ownerId}:${targetSeason}`;
    if (emittedCards.has(cardKey)) continue;
    emittedCards.add(cardKey);
    const leagueSeason = getLeagueSeason(membership.leagueId, targetSeason, input.leagues);
    const franchise = membership.franchiseId ? input.data.franchises.find((item) => item.franchiseId === membership.franchiseId) : undefined;
    const teamSeason = membership.teamSeasonId ? input.data.teamSeasons.find((item) => item.teamSeasonId === membership.teamSeasonId && item.season === targetSeason) : undefined;
    const binding = teamSeason?.providerBindings.find((item) => item.provider === "SLEEPER") ?? leagueSeason?.providerBindings.find((item) => item.provider === "SLEEPER");
    const coOwners = input.data.memberships
      .filter((candidate) => candidate.leagueId === membership.leagueId && candidate.franchiseId === membership.franchiseId && candidate.teamSeasonId === membership.teamSeasonId && candidate.role === "CO_OWNER" && activeMembership(candidate, targetSeason))
      .map((candidate) => ({ ownerId: candidate.ownerId, displayName: input.data.owners.find((owner) => owner.ownerId === candidate.ownerId)?.displayName ?? null, role: "CO_OWNER" as const }))
      .filter((candidate, index, all) => all.findIndex((item) => item.ownerId === candidate.ownerId) === index);
    const commissioner = getActivePermissionGrants(input.accountId, "MANAGE_GOVERNANCE", input.access).some((grant) => permissionGrantMatches(grant, { scope: "LEAGUE", leagueId: membership.leagueId, season: targetSeason }));
    records.push({ leagueId: league.id, displayName: league.displayName, shortName: league.shortName, format: league.format, participationMode: league.participationMode, lifecycle: league.lifecycle, season: targetSeason, ownerId: membership.ownerId, franchiseId: membership.franchiseId ?? null, franchiseDisplayName: franchise?.displayName ?? null, teamSeasonId: membership.teamSeasonId ?? null, teamDisplayName: teamSeason?.displayName ?? franchise?.displayName ?? null, coOwners, providerBinding: binding ? { provider: binding.provider, state: binding.state, providerLeagueId: binding.externalLeagueId ?? null, sleeperRosterId: teamSeason?.providerBindings.find((item) => item.provider === "SLEEPER")?.externalRosterId ?? null } : null, capabilities: league.capabilities.filter((capability) => publicCapabilityKeys().includes(capability.key) && capability.state !== "OUT_OF_SCOPE"), dedicatedWebsite: league.dedicatedWebsite, commissionerHub: commissioner ? "AVAILABLE" : "HIDDEN", role: membership.role });
  }
  return records.sort((left, right) => `${left.displayName}:${left.ownerId}:${left.season}`.localeCompare(`${right.displayName}:${right.ownerId}:${right.season}`));
}

export async function readMyLeaguesData(db: Firestore): Promise<MyLeaguesData> {
  const read = async <T>(collection: string): Promise<T[]> => (await db.collection(collection).get()).docs.map((doc) => doc.data() as T);
  return { owners: await read<PersistedOwner>("owners"), memberships: await read<PersistedMembership>("leagueMemberships"), franchises: await read<PersistedFranchise>("franchises"), teamSeasons: await read<PersistedTeamSeason>("teamSeasons") };
}
