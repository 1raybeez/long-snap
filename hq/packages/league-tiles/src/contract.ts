/**
 * Universal nine-tile homepage contract (approved 2026-10-20).
 *
 *   Row 1: NFL Game Center · Reigning Champion · Weekly High Score
 *   Row 2: Playoff Race    · Weekly Matchups   · Power Rankings
 *   Row 3: Weekly Recap    · League Voice      · League Finances
 *
 * Tiles are presentation only. Each league supplies data through adapters:
 * Sleeper-derived tiles come from the shared HQ cache (sleeper-adapter.ts);
 * curated tiles (champion, recap, voice, finances) come from the league's own
 * records. A tile never invents data: missing data renders an explicit state.
 */

export type TileKey =
  | "NFL_GAME_CENTER"
  | "REIGNING_CHAMPION"
  | "WEEKLY_HIGH_SCORE"
  | "PLAYOFF_RACE"
  | "WEEKLY_MATCHUPS"
  | "POWER_RANKINGS"
  | "WEEKLY_RECAP"
  | "LEAGUE_VOICE"
  | "LEAGUE_FINANCES";

export const TILE_ROWS: readonly (readonly TileKey[])[] = [
  ["NFL_GAME_CENTER", "REIGNING_CHAMPION", "WEEKLY_HIGH_SCORE"],
  ["PLAYOFF_RACE", "WEEKLY_MATCHUPS", "POWER_RANKINGS"],
  ["WEEKLY_RECAP", "LEAGUE_VOICE", "LEAGUE_FINANCES"],
];

export const TILE_TITLES: Readonly<Record<TileKey, string>> = {
  NFL_GAME_CENTER: "NFL Game Center",
  REIGNING_CHAMPION: "Reigning Champion",
  WEEKLY_HIGH_SCORE: "Weekly High Score",
  PLAYOFF_RACE: "Playoff Race",
  WEEKLY_MATCHUPS: "Weekly Matchups",
  POWER_RANKINGS: "Power Rankings",
  WEEKLY_RECAP: "Weekly Recap",
  LEAGUE_VOICE: "League Voice",
  LEAGUE_FINANCES: "League Finances",
};

/** Every tile carries its own state so one failure never blanks the homepage. */
export type TileState<T> =
  | { readonly status: "READY"; readonly data: T; readonly asOf: string | null; readonly stale?: boolean }
  | { readonly status: "EMPTY"; readonly message: string }
  | { readonly status: "UNAVAILABLE"; readonly message: string };

export interface TileLink { readonly label: string; readonly href: string }

export interface TeamRef {
  readonly rosterId: number;
  readonly teamName: string;
  readonly managerName: string;
  readonly avatarUrl: string | null;
}

export interface NflGame {
  readonly id: string;
  readonly away: { readonly abbr: string; readonly score: number | null; readonly logoUrl: string | null };
  readonly home: { readonly abbr: string; readonly score: number | null; readonly logoUrl: string | null };
  readonly kickoff: string;
  readonly status: "SCHEDULED" | "LIVE" | "FINAL";
  readonly detail: string | null; // "Q3 4:12", "Final", "TNF · Prime Video"
  readonly network: string | null;
}
export interface NflGameCenterData {
  readonly nflWeek: number | null;
  readonly featured: NflGame | null;
  readonly label: "NEXT UP" | "LIVE NOW" | "LATEST FINAL";
  readonly scoresLink: TileLink | null;
}

export interface ReigningChampionData {
  readonly season: number;
  readonly team: TeamRef;
  readonly record: string | null;
  readonly note: string | null;
  readonly historyLink: TileLink | null;
}

export interface WeeklyHighScoreData {
  readonly week: number;
  readonly team: TeamRef;
  readonly points: number;
  readonly prize: string | null; // "$10 weekly winner"
  readonly runnerUp: { readonly team: TeamRef; readonly points: number } | null;
  readonly resultsLink: TileLink | null;
}

export interface StandingRow {
  readonly rank: number;
  readonly team: TeamRef;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly status: "IN" | "BUBBLE" | "OUT" | "CLINCHED" | "ELIMINATED";
  readonly division: string | null;
  /** Why a team currently holds a playoff seed (null when outside the field). */
  readonly seedReason?: "DIVISION" | "RECORD" | "POINTS" | null;
}

/**
 * How a league fills its playoff seeds, in order: division winners (by record),
 * then best remaining records, then most points for among the rest.
 */
export interface PlayoffFormat {
  readonly divisionWinners: number;
  readonly recordSeeds: number;
  readonly pointsSeeds: number;

  readonly restByPoints?: boolean;

  readonly chaseByPoints?: boolean;
}

export const LEAGUE_PLAYOFF_FORMATS: Readonly<Record<string, PlayoffFormat>> = {
  // Long Snap demo leagues: each commissioner's seeding answer from the setup page.
  "harbor-city-ffl": { divisionWinners: 3, recordSeeds: 1, pointsSeeds: 2, restByPoints: true },
  "mill-creek-ffl": { divisionWinners: 2, recordSeeds: 2, pointsSeeds: 2 },
  "ironworks-dynasty": { divisionWinners: 0, recordSeeds: 4, pointsSeeds: 2, chaseByPoints: true },
  "lakeview-ffl": { divisionWinners: 0, recordSeeds: 6, pointsSeeds: 0 },
  "river-city-ffl": { divisionWinners: 3, recordSeeds: 1, pointsSeeds: 2, restByPoints: true },
  "long-country-club": { divisionWinners: 2, recordSeeds: 2, pointsSeeds: 2 },
  "rva-eskimo-brothers": { divisionWinners: 0, recordSeeds: 4, pointsSeeds: 2, chaseByPoints: true },

  "c4g-fantasy-football": { divisionWinners: 2, recordSeeds: 4, pointsSeeds: 0 },

  "absolutely-gross": { divisionWinners: 0, recordSeeds: 6, pointsSeeds: 0 },
};
export interface PlayoffRaceData {
  readonly throughWeek: number;
  readonly playoffSpots: number;
  readonly playoffStartWeek: number | null;
  readonly format: PlayoffFormat;
  readonly rows: readonly StandingRow[];
  readonly standingsLink: TileLink | null;
}

export interface MatchupSide { readonly team: TeamRef; readonly points: number | null; readonly record: string | null }
export interface WeeklyMatchupsData {
  readonly week: number;
  readonly phase: "UPCOMING" | "IN_PROGRESS" | "FINAL";
  readonly matchups: readonly { readonly id: number; readonly a: MatchupSide; readonly b: MatchupSide }[];
  readonly matchupsLink: TileLink | null;
}

export interface PowerRankingRow {
  readonly rank: number;
  readonly team: TeamRef;
  readonly movement: number | null; // +2 = up two spots
  readonly label: string | null; // "Title contender"
  readonly score: number | null;
}
export interface PowerRankingsData {
  readonly throughWeek: number | null;
  readonly model: string; // which model produced it, e.g. "record-and-points-v1" or a league model
  readonly rows: readonly PowerRankingRow[];
  readonly rankingsLink: TileLink | null;
  /** e.g. "71% results · 29% roster". */
  readonly method?: string | null;
  /** Where roster strength comes from, e.g. "FantasyCalc dynasty values". */
  readonly rosterSource?: string | null;
  /** Required attribution link for the roster source (FantasyCalc). */
  readonly credit?: TileLink | null;
}

export interface WeeklyRecapData {
  readonly week: number;
  readonly headline: string;
  readonly summary: string;
  readonly author: string | null;
  readonly publishedAt: string | null;
  readonly recapLink: TileLink | null;
}

/** League Voice = league participation and governance (NOT owner feedback). */
export interface LeagueVoiceData {
  readonly openItems: readonly { readonly title: string; readonly kind: "PROPOSAL" | "VOTE" | "MEETING" | "RULE_CHANGE"; readonly closesAt: string | null; readonly href: string | null }[];
  readonly latestDecision: { readonly title: string; readonly outcome: string; readonly decidedAt: string | null } | null;
  readonly hubLink: TileLink | null;
  /** Where owners send new proposals, when the league has a submit page. */
  readonly submitLink?: TileLink | null;
  /** The meeting proposals are headed to, e.g. "Spring 2027 owners meeting (March/April)". */
  readonly meetingLabel?: string | null;
  /** Replaces the default "Submit a proposal now…" line, e.g. for a league without an online hub yet. */
  readonly invite?: string | null;
}

export interface LeagueFinancesData {
  readonly season: number;
  readonly prizePool: number | null;
  readonly currency: "USD";
  readonly payouts: readonly { readonly label: string; readonly amount: number }[];
  readonly weeklyPrize: number | null;
  readonly duesStatus: { readonly paid: number; readonly total: number } | null;
  readonly financesLink: TileLink | null;
}

export interface LeagueHomeTiles {
  readonly NFL_GAME_CENTER: TileState<NflGameCenterData>;
  readonly REIGNING_CHAMPION: TileState<ReigningChampionData>;
  readonly WEEKLY_HIGH_SCORE: TileState<WeeklyHighScoreData>;
  readonly PLAYOFF_RACE: TileState<PlayoffRaceData>;
  readonly WEEKLY_MATCHUPS: TileState<WeeklyMatchupsData>;
  readonly POWER_RANKINGS: TileState<PowerRankingsData>;
  readonly WEEKLY_RECAP: TileState<WeeklyRecapData>;
  readonly LEAGUE_VOICE: TileState<LeagueVoiceData>;
  readonly LEAGUE_FINANCES: TileState<LeagueFinancesData>;
}

export const ready = <T>(data: T, asOf: string | null = null, stale = false): TileState<T> => ({ status: "READY", data, asOf, ...(stale ? { stale } : {}) });
export const empty = <T>(message: string): TileState<T> => ({ status: "EMPTY", message });
export const unavailable = <T>(message: string): TileState<T> => ({ status: "UNAVAILABLE", message });
