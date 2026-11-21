import type { CacheScope } from "./types.ts";

function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function leaguePrefix(scope: CacheScope): string {
  if (!scope.canonicalLeagueId || scope.season === undefined) {
    throw new Error("canonicalLeagueId and season are required for league-scoped cache keys");
  }
  const external = scope.externalLeagueId ? `:${segment(scope.externalLeagueId)}` : "";
  return `sleeper:league:${segment(scope.canonicalLeagueId)}:${scope.season}${external}`;
}

export const cacheKeys = {
  nflState: () => "sleeper:nfl-state",
  players: () => "sleeper:players:nfl",
  league: (scope: CacheScope) => leaguePrefix(scope),
  leagueUsers: (scope: CacheScope) => `${leaguePrefix(scope)}:users`,
  rosters: (scope: CacheScope) => `${leaguePrefix(scope)}:rosters`,
  matchups: (scope: CacheScope) => {
    if (!Number.isInteger(scope.week) || (scope.week ?? 0) < 1) throw new Error("week is required for matchup cache keys");
    return `${leaguePrefix(scope)}:matchups:${scope.week}`;
  },
  transactions: (scope: CacheScope) => {
    if (!Number.isInteger(scope.week) || (scope.week ?? 0) < 1) throw new Error("week is required for transaction cache keys");
    return `${leaguePrefix(scope)}:transactions:${scope.week}`;
  },
  winnersBracket: (scope: CacheScope) => `${leaguePrefix(scope)}:winners-bracket`,
  losersBracket: (scope: CacheScope) => `${leaguePrefix(scope)}:losers-bracket`,
  drafts: (scope: CacheScope) => `${leaguePrefix(scope)}:drafts`,
  draftPicks: (draftId: string) => `sleeper:draft:${segment(draftId)}:picks`,
  user: (userId: string) => `sleeper:user:${segment(userId)}`,
};
