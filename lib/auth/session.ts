import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { ensureLeagueSecrets } from "../leagueSecrets.ts";
import { LEAGUE_SITE_OWNERS, viewerAdminLeagues, canSeeMemberCheck, getAccountByAuthIdentity, getMyLeagues, getVerifiedOwnerLinks, readMyLeaguesData, readPlatformAccessState, SIGN_IN_COLLECTIONS, type OwnerLinkEvidence } from "../../hq/packages/platform-access/src/index.ts";
import { HQ_LEAGUE_REGISTRY } from "../../hq/config/leagues/registry.ts";
import { adminAuth, adminFirestore } from "./firebaseAdmin.ts";
import { currentSleeperLeagueId, readTeamPicks, saveTeamPick, sleeperTeams, TEAM_PICK_LEAGUES } from "./teamPicks.ts";
import { sleeperFeedFetch } from "../sleeperFeed.ts";

/** Firebase Hosting and App Hosting only pass a cookie named __session through to the server. */
import { DEMO_OWNER_COOKIE, demoSession } from "../demo/demoSession.ts";
import { isDemoMode } from "../demo/demoLeagues.ts";

export const SESSION_COOKIE = "__session";
export const SESSION_LENGTH_MS = 1000 * 60 * 60 * 24 * 5;

export type PlatformSession = {
  uid: string;
  displayName: string | null;

  email: string | null;
  /** null when the Google account isn't linked to an HQ account yet. */
  account: { accountId: string; ownerId: string | null; displayName: string | null } | null;
  /** League id → that person's team name, for leagues they're in this season. */
  leagues: Record<string, { teamName: string | null; franchiseId: string | null; role: string; sleeperLeagueId: string | null; sleeperRosterId: string | null }>;
  /** Commissioner or assistant commissioner somewhere (as the league sites said at sign-in): may open /admin/members. */
  canCheckMembers: boolean;
  /** Leagues where the league site said this person is commissioner or assistant commissioner (Commissioner Hub). */
  adminLeagues: Record<string, "commissioner" | "assistant">;
};

/** The signed-in person, from the session cookie. Never throws: any problem means "not signed in". */
export const getSession = cache(async (): Promise<PlatformSession | null> => {
  if (isDemoMode()) return demoSession((await cookies()).get(DEMO_OWNER_COOKIE)?.value ?? null);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureLeagueSecrets();
  const hit = RECENT.get(token);
  if (hit && hit.until > Date.now()) return hit.session;
  const session = await readSession(token);
  if (RECENT.size > 500) RECENT.clear();
  if (session) RECENT.set(token, { session, until: Date.now() + RECENT_MS });
  return session;
});

const RECENT_MS = 60_000;
const RECENT = new Map<string, { session: PlatformSession; until: number }>();

async function readSession(token: string): Promise<PlatformSession | null> {
  try {
    const decoded = await adminAuth().verifySessionCookie(token, true);
    const db = adminFirestore();
    const access = await readPlatformAccessState(db);
    const account = getAccountByAuthIdentity("FIREBASE_AUTH", decoded.uid, access);
    const email = decoded.email && decoded.email_verified ? decoded.email.trim().toLowerCase() : null;
    const base = { uid: decoded.uid, displayName: (decoded.name as string | undefined) ?? null, email };
    if (!account || account.state !== "ACTIVE" || !account.verified) {

      const picked: PlatformSession["leagues"] = {};
      await withTeamPicks(picked, decoded.uid);
      await withSleeperTeamNames(picked);
      return { ...base, account: null, leagues: picked, canCheckMembers: false, adminLeagues: {} };
    }
    const data = await readMyLeaguesData(db);
    const mine = getMyLeagues({ accountId: account.accountId, access, data, leagues: HQ_LEAGUE_REGISTRY });
    const leagues: PlatformSession["leagues"] = {};
    for (const l of mine) leagues[l.leagueId] = { teamName: readableName(l.teamDisplayName) ?? readableName(l.franchiseDisplayName), franchiseId: l.franchiseId, role: l.role, sleeperLeagueId: l.providerBinding?.providerLeagueId ?? null, sleeperRosterId: l.providerBinding?.sleeperRosterId ?? null };
    const ownerIds = new Set<string>(getVerifiedOwnerLinks(account.accountId, access).map((link) => String(link.ownerId)));
    const sleeperIds = new Set(data.owners.filter((o) => ownerIds.has(String(o.ownerId))).flatMap((o) => o.providerIdentities.filter((p) => p.provider === "SLEEPER" && (p.state === "CONFIRMED" || p.state === "PENDING")).map((p) => p.externalUserId)));
    // Also the Sleeper accounts the league sites list for this owner.
    for (const rows of Object.values(LEAGUE_SITE_OWNERS)) for (const [, hqOwnerId, sleeperUserId] of rows) if (sleeperUserId && ownerIds.has(hqOwnerId)) sleeperIds.add(sleeperUserId);
    for (const [hqOwnerId, ids] of Object.entries(OTHER_SLEEPER_ACCOUNTS)) if (ownerIds.has(hqOwnerId)) ids.forEach((id) => sleeperIds.add(id));
    await withSleeperOnlyMemberships(leagues, sleeperIds);
    await withTeamPicks(leagues, decoded.uid);
    const [, evidence] = await Promise.all([
      withSleeperTeamNames(leagues),
      db.collection(SIGN_IN_COLLECTIONS.ownerLinkEvidence).where("accountId", "==", account.accountId).get().then((q) => q.docs.map((d) => d.data() as OwnerLinkEvidence)).catch(() => [] as OwnerLinkEvidence[]),
    ]);
    return { ...base, account: { accountId: account.accountId, ownerId: getVerifiedOwnerLinks(account.accountId, access)[0]?.ownerId ?? null, displayName: account.displayName ?? null }, leagues, canCheckMembers: canSeeMemberCheck(account.accountId, access, evidence), adminLeagues: Object.fromEntries(viewerAdminLeagues(account.accountId, access, evidence)) };
  } catch {
    return null;
  }
}

/** HQ records sometimes hold an id ("rva-franchise-01") where a team name belongs; treat those as missing. */
function readableName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  return !n || /franchise|^[a-z0-9]+(-[a-z0-9]+)+$/i.test(n) ? null : n;
}

/** Fill in each team's current name from Sleeper (the name owners see in the app). */

/** Sleeper accounts an owner uses only in tool-only leagues (none of the league sites list them). */
const OTHER_SLEEPER_ACCOUNTS: Readonly<Record<string, readonly string[]>> = {
};

const SLEEPER_MEMBER_LEAGUES: readonly string[] = ["long-shots", "c4g-fantasy-football", "absolutely-gross"];

async function withSleeperOnlyMemberships(leagues: PlatformSession["leagues"], sleeperIds: ReadonlySet<string>): Promise<void> {
  if (!sleeperIds.size) return;
  await Promise.all(SLEEPER_MEMBER_LEAGUES.map(async (leagueId) => {
    if (leagues[leagueId]) return;
    const league = HQ_LEAGUE_REGISTRY.leagues.find((l) => l.id === leagueId);
    const sleeperLeagueId = league?.seasons.find((x) => x.season === league.currentSeason)?.providerBindings.find((b) => b.provider === "SLEEPER")?.externalLeagueId;
    if (!sleeperLeagueId) return;
    try {
      const r = await sleeperFeedFetch(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/users`, { next: { revalidate: 3600 } } as RequestInit);
      if (!r.ok) return;
      const users = (await r.json()) as { user_id?: string; display_name?: string; metadata?: { team_name?: string } }[];
      const me = users.find((u) => u.user_id && sleeperIds.has(u.user_id));
      // 2026-11-11: also the team (roster) this Sleeper account owns or co-owns, so GM tools open on the right team.
      const team = me ? (await sleeperTeams(sleeperLeagueId).catch(() => [])).find((t) => t.sleeperUserIds.some((id) => sleeperIds.has(id))) : undefined;
      if (me) leagues[leagueId] = { teamName: team?.name ?? (me.metadata?.team_name || me.display_name || null), franchiseId: null, role: "MEMBER", sleeperLeagueId, sleeperRosterId: team?.rosterId ?? null };
    } catch {
      /* Sleeper unavailable: the league just isn't listed this time. */
    }
  }));
}

async function withTeamPicks(leagues: PlatformSession["leagues"], uid: string): Promise<void> {
  const picks = await readTeamPicks(uid);
  // Record Sleeper-account matches as this sign-in's team too (once), so the commissioners' member check sees them.
  for (const leagueId of TEAM_PICK_LEAGUES) {
    const matched = leagues[leagueId]?.sleeperRosterId;
    if (matched && !picks[leagueId]) void saveTeamPick(uid, leagueId, matched, "sleeper-match").catch(() => undefined);
  }
  for (const [leagueId, rosterId] of Object.entries(picks)) {
    if (!TEAM_PICK_LEAGUES.has(leagueId)) continue;
    const sleeperLeagueId = currentSleeperLeagueId(leagueId);
    if (!sleeperLeagueId) continue;
    leagues[leagueId] = { teamName: leagues[leagueId]?.teamName ?? null, franchiseId: null, role: leagues[leagueId]?.role ?? "MEMBER", sleeperLeagueId, sleeperRosterId: rosterId };
  }
}

/** Forget the remembered sign-in for this cookie (after a team pick, so the next page shows it). */
export function forgetSession(token: string | undefined): void {
  if (token) RECENT.delete(token);
}

async function withSleeperTeamNames(leagues: PlatformSession["leagues"]): Promise<void> {
  await Promise.all(Object.values(leagues).map(async (l) => {
    if (!l.sleeperLeagueId || !l.sleeperRosterId) return;
    try {
      const opts = { next: { revalidate: 300 } } as RequestInit;
      const [rosters, users] = await Promise.all([
        sleeperFeedFetch(`https://api.sleeper.app/v1/league/${l.sleeperLeagueId}/rosters`, opts).then((r) => (r.ok ? r.json() : [])),
        sleeperFeedFetch(`https://api.sleeper.app/v1/league/${l.sleeperLeagueId}/users`, opts).then((r) => (r.ok ? r.json() : [])),
      ]) as [{ roster_id: number; owner_id: string | null }[], { user_id: string; display_name?: string; metadata?: { team_name?: string } }[]];
      const roster = rosters.find((r) => String(r.roster_id) === String(l.sleeperRosterId));
      const user = roster?.owner_id ? users.find((u) => u.user_id === roster.owner_id) : undefined;
      const name = user?.metadata?.team_name?.trim() || user?.display_name || null;
      if (name) l.teamName = name;
    } catch { /* keep HQ's name */ }
  }));
}
