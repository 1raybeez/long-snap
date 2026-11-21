import type { LeagueRegistry } from "../../league-registry/src/types.ts";
import { getLeagueById } from "../../league-registry/src/index.ts";
import type { MyLeaguesData } from "./my-leagues.ts";
import { getActivePermissionGrants } from "./permissions.ts";
import type { PlatformAccessRegistry } from "./types.ts";
import { isWhoamiLeague } from "./league-site-owners.ts";
import type { OwnerLinkEvidence, SignInLinkConflict } from "./sign-in-link.ts";

export interface MemberCheckOwner { readonly ownerId: string; readonly name: string; readonly coOwner: boolean; readonly linked: boolean; readonly vouchedByThisLeague: boolean }
export interface MemberCheckTeam { readonly franchiseId: string | null; readonly teamName: string | null; readonly sleeperRosterId: string | null; readonly owners: readonly MemberCheckOwner[] }
export interface MemberCheckLeague { readonly leagueId: string; readonly name: string; readonly season: number; readonly hasOwnSite: boolean; readonly viewerRole: "commissioner" | "assistant" | "member"; readonly sleeperLeagueId: string | null; readonly teams: readonly MemberCheckTeam[]; readonly linkedOwners: number; readonly totalOwners: number }
export interface MemberCheckConflict { readonly conflictId: string; readonly kind: SignInLinkConflict["kind"]; readonly ownerNames: readonly string[]; readonly leagues: readonly string[]; readonly detail: string; readonly updatedAt: string }
export interface MemberCheck { readonly leagues: readonly MemberCheckLeague[]; readonly conflicts: readonly MemberCheckConflict[] }

const ADMIN_ROLES: ReadonlySet<string> = new Set(["commissioner", "assistant"]);

/** Owners with a verified link from an active, verified account that has a verified Google sign-in. */
export function linkedOwnerIds(access: PlatformAccessRegistry): ReadonlySet<string> {
  const signedIn = new Set(access.authIdentities.filter((i) => i.provider === "FIREBASE_AUTH" && i.state === "VERIFIED").map((i) => i.accountId as string));
  const active = new Set(access.accounts.filter((a) => a.state === "ACTIVE" && a.verified && signedIn.has(a.accountId)).map((a) => a.accountId as string));
  return new Set(access.ownerLinks.filter((l) => l.state === "VERIFIED" && active.has(l.accountId)).map((l) => l.ownerId as string));
}

/** League id → the viewer's admin role there, from what each league site said at sign-in (or a governance grant). */
export function viewerAdminLeagues(accountId: string, access: PlatformAccessRegistry, evidence: readonly OwnerLinkEvidence[]): ReadonlyMap<string, "commissioner" | "assistant"> {
  const verifiedOwners = new Set(access.ownerLinks.filter((l) => l.accountId === accountId && l.state === "VERIFIED").map((l) => l.ownerId as string));
  const out = new Map<string, "commissioner" | "assistant">();
  for (const e of evidence) if (e.accountId === accountId && verifiedOwners.has(e.ownerId) && ADMIN_ROLES.has(e.role)) { if (out.get(e.leagueId) !== "commissioner") out.set(e.leagueId, e.role as "commissioner" | "assistant"); }
  for (const g of getActivePermissionGrants(accountId, "MANAGE_GOVERNANCE", access)) if (g.scope === "LEAGUE" && g.leagueId) out.set(g.leagueId, "commissioner");
  return out;
}

export function canSeeMemberCheck(accountId: string | null | undefined, access: PlatformAccessRegistry, evidence: readonly OwnerLinkEvidence[]): boolean {
  return Boolean(accountId) && viewerAdminLeagues(accountId!, access, evidence).size > 0;
}

const activeIn = (m: MyLeaguesData["memberships"][number], season: number) => m.state === "ACTIVE" && m.effectiveFromSeason <= season && (m.effectiveToSeason === undefined || m.effectiveToSeason >= season);

export function buildMemberCheck(input: { readonly viewerAccountId: string; readonly access: PlatformAccessRegistry; readonly data: MyLeaguesData; readonly leagues: LeagueRegistry; readonly evidence: readonly OwnerLinkEvidence[]; readonly conflicts: readonly SignInLinkConflict[] }): MemberCheck {
  const admin = viewerAdminLeagues(input.viewerAccountId, input.access, input.evidence);
  if (!admin.size) return { leagues: [], conflicts: [] };
  const viewerOwners = new Set(input.access.ownerLinks.filter((l) => l.accountId === input.viewerAccountId && l.state === "VERIFIED").map((l) => l.ownerId as string));
  const linked = linkedOwnerIds(input.access);
  const ownerName = (id: string) => { const o = input.data.owners.find((x) => x.ownerId === id); return o?.preferredDisplayName ?? o?.displayName ?? id; };
  const leagueIds = new Set<string>(admin.keys());
  for (const m of input.data.memberships) {
    const league = getLeagueById(m.leagueId, input.leagues);
    if (league && !isWhoamiLeague(league.id) && viewerOwners.has(m.ownerId) && activeIn(m, league.currentSeason)) leagueIds.add(league.id);
  }
  const leagues: MemberCheckLeague[] = [];
  for (const leagueId of leagueIds) {
    const league = getLeagueById(leagueId, input.leagues);
    if (!league) continue;
    const season = league.currentSeason;
    const members = input.data.memberships.filter((m) => m.leagueId === leagueId && activeIn(m, season));
    const groups = new Map<string, typeof members>();
    for (const m of members) { const key = m.teamSeasonId ?? m.franchiseId ?? `owner:${m.ownerId}`; groups.set(key, [...(groups.get(key) ?? []), m]); }
    const vouched = new Set(input.evidence.filter((e) => e.leagueId === leagueId).map((e) => e.ownerId));
    const teams: MemberCheckTeam[] = [...groups.values()].map((group) => {
      const first = group[0];
      const teamSeason = first.teamSeasonId ? input.data.teamSeasons.find((t) => t.teamSeasonId === first.teamSeasonId) : undefined;
      const franchise = first.franchiseId ? input.data.franchises.find((f) => f.franchiseId === first.franchiseId) : undefined;
      const owners = [...new Map(group.map((m) => [m.ownerId as string, m])).values()]
        .sort((a, b) => Number(a.role === "CO_OWNER") - Number(b.role === "CO_OWNER"))
        .map((m) => ({ ownerId: m.ownerId as string, name: ownerName(m.ownerId), coOwner: m.role === "CO_OWNER", linked: linked.has(m.ownerId), vouchedByThisLeague: vouched.has(m.ownerId) }));
      return { franchiseId: (first.franchiseId as string | undefined) ?? null, teamName: teamSeason?.displayName ?? franchise?.displayName ?? null, sleeperRosterId: teamSeason?.providerBindings.find((b) => b.provider === "SLEEPER")?.externalRosterId ?? null, owners };
    }).sort((a, b) => Number(a.sleeperRosterId ?? 999) - Number(b.sleeperRosterId ?? 999) || (a.owners[0]?.name ?? "").localeCompare(b.owners[0]?.name ?? ""));
    const all = teams.flatMap((t) => t.owners);
    const leagueSeason = league.seasons.find((s) => s.season === season);
    leagues.push({ leagueId, name: league.displayName, season, hasOwnSite: isWhoamiLeague(leagueId), viewerRole: admin.get(leagueId) ?? "member", sleeperLeagueId: leagueSeason?.providerBindings.find((b) => b.provider === "SLEEPER")?.externalLeagueId ?? null, teams, linkedOwners: all.filter((o) => o.linked).length, totalOwners: all.length });
  }
  leagues.sort((a, b) => Number(b.hasOwnSite) - Number(a.hasOwnSite) || a.name.localeCompare(b.name));
  const visible = new Set(leagues.filter((l) => l.viewerRole !== "member").map((l) => l.leagueId));
  const conflicts = input.conflicts
    .filter((c) => c.state === "OPEN" && (c.claims.length === 0 || c.claims.some((cl) => visible.has(cl.leagueId))))
    .map((c) => ({ conflictId: c.conflictId, kind: c.kind, ownerNames: c.ownerIds.map(ownerName), leagues: [...new Set(c.claims.map((cl) => getLeagueById(cl.leagueId, input.leagues)?.displayName ?? cl.leagueId))], detail: c.detail, updatedAt: c.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { leagues, conflicts };
}
