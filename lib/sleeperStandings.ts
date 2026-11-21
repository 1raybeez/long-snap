import { sleeperFeedFetch } from "./sleeperFeed.ts";
/**
 * Standings straight from Sleeper for the platform preview. Package 2 moves this onto the shared Sleeper cache so
 * every league reads one feed; until then it's a light, cached read (5 minutes).
 */
export type StandingRow = { rosterId: number; team: string; owner: string; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number };

type SleeperRoster = { roster_id: number; owner_id: string | null; settings?: { wins?: number; losses?: number; ties?: number; fpts?: number; fpts_decimal?: number; fpts_against?: number; fpts_against_decimal?: number } };
type SleeperUser = { user_id: string; display_name?: string; metadata?: { team_name?: string } };

const pts = (whole?: number, dec?: number) => (whole ?? 0) + (dec ?? 0) / 100;

export function toStandings(rosters: readonly SleeperRoster[], users: readonly SleeperUser[]): StandingRow[] {
  const byId = new Map(users.map((u) => [u.user_id, u]));
  return rosters
    .map((r) => {
      const u = r.owner_id ? byId.get(r.owner_id) : undefined;
      const s = r.settings ?? {};
      return {
        rosterId: r.roster_id,
        team: u?.metadata?.team_name?.trim() || u?.display_name || `Team ${r.roster_id}`,
        owner: u?.display_name ?? "Open",
        wins: s.wins ?? 0, losses: s.losses ?? 0, ties: s.ties ?? 0,
        pointsFor: Math.round(pts(s.fpts, s.fpts_decimal) * 100) / 100,
        pointsAgainst: Math.round(pts(s.fpts_against, s.fpts_against_decimal) * 100) / 100,
      };
    })
    // Record first, then Points For (the first tiebreaker in all three rule books).
    .sort((a, b) => b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pointsFor - a.pointsFor);
}

export async function loadStandings(sleeperLeagueId: string): Promise<StandingRow[] | null> {
  try {
    const opts = { next: { revalidate: 300 } } as RequestInit;
    const [rosters, users] = await Promise.all([
      sleeperFeedFetch(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/rosters`, opts).then((r) => (r.ok ? r.json() : null)),
      sleeperFeedFetch(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/users`, opts).then((r) => (r.ok ? r.json() : null)),
    ]);
    return Array.isArray(rosters) && Array.isArray(users) ? toStandings(rosters, users) : null;
  } catch {
    return null;
  }
}
