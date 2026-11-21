// Long Snap demo: "try it as an owner". A visitor picks a team and the GM pages treat them as that team's owner.
// No account, no password, nothing stored: the cookie only holds a roster number (1–12) for the made-up leagues.
import type { PlatformSession } from "../auth/session.ts";
import { DEMO_KEYS, DEMO_LEAGUES, demoLeagueId } from "./demoLeagues.ts";
import { season } from "./fakeSleeper.ts";

export const DEMO_OWNER_COOKIE = "ls_demo_owner";

export function demoTeams(slug: string): { rosterId: string; team: string; owner: string }[] {
  const key = DEMO_KEYS.find((k) => DEMO_LEAGUES[k].slug === slug);
  if (!key) return [];
  const d = season(key, 2026);
  return d.rosters.map((r: { roster_id: number; owner_id: string }) => {
    const u = d.users.find((x: { user_id: string }) => x.user_id === r.owner_id);
    return { rosterId: String(r.roster_id), team: u?.metadata?.team_name ?? `Team ${r.roster_id}`, owner: u?.display_name ?? "" };
  });
}

export function demoSession(value: string | null): PlatformSession | null {
  const rid = value && /^(?:[1-9]|1[0-2])$/.test(value) ? value : null;
  if (!rid) return null;
  const leagues: PlatformSession["leagues"] = {};
  for (const k of DEMO_KEYS) {
    const team = demoTeams(DEMO_LEAGUES[k].slug).find((t) => t.rosterId === rid);
    leagues[DEMO_LEAGUES[k].slug] = { teamName: team?.team ?? null, franchiseId: null, role: "OWNER", sleeperLeagueId: demoLeagueId(k, 2026), sleeperRosterId: rid };
  }
  return { uid: `demo-${rid}`, displayName: "Demo owner", email: null, account: { accountId: "demo", ownerId: null, displayName: "Demo owner" }, leagues, canCheckMembers: false, adminLeagues: {} };
}
