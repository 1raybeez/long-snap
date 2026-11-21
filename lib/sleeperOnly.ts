import demoOwners from "../data/demo/owners.json" with { type: "json" };
import type { LeagueData, LeagueTeam } from "./leagueData.ts";
import { sleeperFeedFetch } from "./sleeperFeed.ts";

const SLEEPER = "https://api.sleeper.app/v1";
type SleeperLeague = { season?: string; previous_league_id?: string | null; settings?: { playoff_week_start?: number; num_teams?: number; type?: number } };
type SleeperRoster = { roster_id: number; owner_id: string | null };
type SleeperUser = { user_id: string; display_name?: string; avatar?: string | null; metadata?: { team_name?: string; avatar?: string } };

/**
 * Owner names the commissioner entered for each Sleeper account (Sleeper user id → name). Kept in
 * data/demo/owners.json so the site and the weekly writers read one list. Anyone not listed shows their Sleeper name.
 */
const OWNER_NAMES: Readonly<Record<string, string>> = { ...demoOwners.owners };

async function json<T>(url: string): Promise<T | null> {
  try { const r = await sleeperFeedFetch(url, { next: { revalidate: 900 } } as RequestInit); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

export async function sleeperOnlyData(sleeperLeagueId: string): Promise<LeagueData | null> {
  const [league, rosters, users] = await Promise.all([
    json<SleeperLeague>(`${SLEEPER}/league/${sleeperLeagueId}`),
    json<SleeperRoster[]>(`${SLEEPER}/league/${sleeperLeagueId}/rosters`),
    json<SleeperUser[]>(`${SLEEPER}/league/${sleeperLeagueId}/users`),
  ]);
  if (!league || !rosters || !users) return null;
  const season = Number(league.season) || new Date().getFullYear();
  const leagueIdsBySeason: Record<string, string> = { [season]: sleeperLeagueId };
  for (let id = league.previous_league_id, s = season - 1, i = 0; id && id !== "0" && i < 20; s--, i++) {
    leagueIdsBySeason[s] = id;
    id = (await json<SleeperLeague>(`${SLEEPER}/league/${id}`))?.previous_league_id ?? null;
  }
  const byId = new Map(users.map((u) => [u.user_id, u] as const));
  const teams: LeagueTeam[] = rosters.map((r) => {
    const u = r.owner_id ? byId.get(r.owner_id) : undefined;
    return {
      rosterId: r.roster_id,
      franchiseId: r.owner_id ?? `roster-${r.roster_id}`,
      name: u?.metadata?.team_name?.trim() || u?.display_name || `Team ${r.roster_id}`,
      ownerLabel: (r.owner_id ? OWNER_NAMES[r.owner_id] : undefined) ?? u?.display_name ?? null,
      image: u?.metadata?.avatar || (u?.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null),
    };
  });
  const managerNames = Object.fromEntries(teams.map((t) => [String(t.rosterId), t.ownerLabel ?? t.name ?? ""]));
  const teamCount = league.settings?.num_teams ?? teams.length;
  return {
    sleeperOnly: true,
    season,
    leagueIdsBySeason,
    managerNames,
    teams,
    games: [],
    h2h: {},
    preview: () => null,
    recap: () => null,
    champion: null,
    finances: { entryFee: null, teamCount, weeklyHighPayout: null, payouts: {} },
    history: { results: [], owners: [], config: {} as LeagueData["history"]["config"] },
    people: { overview: {} as LeagueData["people"]["overview"], directory: { owners: [], franchises: [] }, ownerPages: {}, franchisePages: {}, ownerNames: {}, sides: [], h2hByFranchise: {} },
    copy: { rivalrySideLabel: "franchise", rivalryCoverage: "", recordsCoverage: [], draftLine: "", draftTabs: "auction" },
    regularSeasonWeeks: Math.max(1, (league.settings?.playoff_week_start ?? 15) - 1),
    birthdays: null,
    rules: { draftOrder: "standings", draftRuleText: "Draft order follows Sleeper's settings for this league.", dynasty: league.settings?.type === 2 }
  };
}
