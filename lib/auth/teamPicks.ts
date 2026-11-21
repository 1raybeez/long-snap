import "server-only";
import { HQ_LEAGUE_REGISTRY } from "../../hq/config/leagues/registry.ts";
import { adminFirestore } from "./firebaseAdmin.ts";
import { sleeperFeedFetch } from "../sleeperFeed.ts";

export const TEAM_PICK_LEAGUES: ReadonlySet<string> = new Set(["absolutely-gross", "c4g-fantasy-football"]);
const COLLECTION = "toolLeagueTeamPicks";

export type SleeperTeam = { rosterId: string; name: string; owner: string | null; sleeperUserIds: string[] };

export function currentSleeperLeagueId(leagueId: string): string | null {
  const league = HQ_LEAGUE_REGISTRY.leagues.find((l) => l.id === leagueId);
  return league?.seasons.find((x) => x.season === league.currentSeason)?.providerBindings.find((b) => b.provider === "SLEEPER")?.externalLeagueId ?? null;
}

/** The league's current Sleeper teams (name as owners see it in the app). */
export async function sleeperTeams(sleeperLeagueId: string): Promise<SleeperTeam[]> {
  const opts = { next: { revalidate: 300 } } as RequestInit;
  const [rosters, users] = await Promise.all([
    sleeperFeedFetch(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/rosters`, opts).then((r) => (r.ok ? r.json() : [])),
    sleeperFeedFetch(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/users`, opts).then((r) => (r.ok ? r.json() : [])),
  ]) as [{ roster_id: number; owner_id: string | null; co_owners?: string[] | null }[], { user_id: string; display_name?: string; metadata?: { team_name?: string } | null }[]];
  return rosters.map((r) => {
    const u = r.owner_id ? users.find((x) => x.user_id === r.owner_id) : undefined;
    return { rosterId: String(r.roster_id), name: u?.metadata?.team_name?.trim() || u?.display_name || `Team ${r.roster_id}`, owner: u?.display_name ?? null, sleeperUserIds: [r.owner_id, ...(r.co_owners ?? [])].filter((x): x is string => Boolean(x)) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const docId = (uid: string, leagueId: string) => encodeURIComponent(`${uid}__${leagueId}`);

/** This sign-in's picks: league id → Sleeper roster id. */
export async function readTeamPicks(uid: string): Promise<Record<string, string>> {
  try {
    const snaps = await adminFirestore().getAll(...[...TEAM_PICK_LEAGUES].map((l) => adminFirestore().collection(COLLECTION).doc(docId(uid, l))));
    const out: Record<string, string> = {};
    for (const s of snaps) { const d = s.data() as { leagueId?: string; rosterId?: string } | undefined; if (d?.leagueId && d.rosterId) out[d.leagueId] = d.rosterId; }
    return out;
  } catch {
    return {};
  }
}

export async function saveTeamPick(uid: string, leagueId: string, rosterId: string | null, how: "picked" | "sleeper-match" = "picked"): Promise<void> {
  const ref = adminFirestore().collection(COLLECTION).doc(docId(uid, leagueId));
  if (rosterId === null) await ref.delete();
  else await ref.set({ uid, leagueId, rosterId, how, pickedAt: new Date().toISOString() });
}

/** Every sign-in's team in a league, for the commissioners' member check: roster id → how many sign-ins and how. */
export async function teamPicksForLeague(leagueId: string): Promise<{ rosterId: string; uid: string; how: string }[]> {
  const snap = await adminFirestore().collection(COLLECTION).where("leagueId", "==", leagueId).get();
  return snap.docs.map((d) => d.data() as { rosterId: string; uid: string; how?: string }).map((d) => ({ rosterId: String(d.rosterId), uid: d.uid, how: d.how ?? "picked" }));
}
