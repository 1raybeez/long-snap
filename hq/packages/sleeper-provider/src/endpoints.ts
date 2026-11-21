export const SLEEPER_ENDPOINT_PATHS = {
  NFL_STATE: "/state/nfl",
  PLAYERS: "/players/nfl",
  LEAGUE: "/league/:leagueId",
  LEAGUE_USERS: "/league/:leagueId/users",
  ROSTERS: "/league/:leagueId/rosters",
  MATCHUPS: "/league/:leagueId/matchups/:week",
  TRANSACTIONS: "/league/:leagueId/transactions/:week",
  WINNERS_BRACKET: "/league/:leagueId/winners_bracket",
  LOSERS_BRACKET: "/league/:leagueId/losers_bracket",
  DRAFTS: "/league/:leagueId/drafts",
  DRAFT_PICKS: "/draft/:draftId/picks",
  USER: "/user/:userId",
} as const;
