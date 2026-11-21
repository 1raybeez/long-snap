
import { OWN_LEAGUE } from "./ownLeague.ts";
export type LccEngineFeature = "whoami" | "money" | "commish" | "ledger" | "feedback" | "legislative" | "rulebook" | "ask" | "contact" | "war-room" | "draft-intelligence" | "pages" | "export" | "written" | "appendix";
export const LCC_ENGINE: ReadonlySet<LccEngineFeature> = new Set<LccEngineFeature>(["whoami", "money", "commish", "ledger", "feedback", "legislative", "rulebook", "ask", "contact", "war-room", "draft-intelligence", "pages", "export", "appendix", "written"]); // "written" on 2026-11-08: the weekly writing jobs save into HQ too

export type RvaEngineFeature = "whoami" | "money" | "commish" | "ledger" | "health" | "feedback" | "legislative" | "rulebook" | "ask" | "contact" | "war-room" | "draft-intelligence" | "pages" | "export" | "written" | "appendix";
export const RVA_ENGINE: ReadonlySet<RvaEngineFeature> = new Set<RvaEngineFeature>(["whoami", "money", "commish", "ledger", "health", "feedback", "legislative", "rulebook", "ask", "contact", "war-room", "draft-intelligence", "pages", "export", "appendix", "written"]); // "written" on 2026-11-08: the weekly writing jobs save into HQ too

export type RiverCityEngineFeature = "export" | "pages" | "whoami";
export const RIVER_CITY_ENGINE: ReadonlySet<RiverCityEngineFeature> = new Set<RiverCityEngineFeature>(["export", "pages", "whoami"]);
/** The league ids for a feature that runs here on a league engine (LCC_ENGINE, RVA_ENGINE), plus `ids`. */
const withEngines = (feature: LccEngineFeature & RvaEngineFeature, ids: readonly string[]): ReadonlySet<string> => new Set([...ids, ...(LCC_ENGINE.has(feature) ? ["long-country-club"] : []), ...(RVA_ENGINE.has(feature) ? ["rva-eskimo-brothers"] : [])]);
const withRva = (feature: RvaEngineFeature, ids: readonly string[]): ReadonlySet<string> => new Set([...ids, ...(RVA_ENGINE.has(feature) ? ["rva-eskimo-brothers"] : [])]);

/**
 * Sign-in linking answered by the platform with each league's own member list (2026-11-08; was each site's
 * /api/platform/whoami): "whoami" in RIVER_CITY_ENGINE / LCC_ENGINE / RVA_ENGINE. lib/auth/leagueLink.ts.
 */
export const WHOAMI_HERE_LEAGUES: ReadonlySet<string> = new Set([...(RIVER_CITY_ENGINE.has("whoami") ? ["river-city-ffl"] : []), ...(LCC_ENGINE.has("whoami") ? ["long-country-club"] : []), ...(RVA_ENGINE.has("whoami") ? ["rva-eskimo-brothers"] : [])]);

/** Which league-specific tools run on the platform (the rest open on the league's current site until they move). */
export const GM_LEAGUES: ReadonlySet<string> = new Set([...(OWN_LEAGUE ? [OWN_LEAGUE.slug] : []), "harbor-city-ffl", "mill-creek-ffl", "ironworks-dynasty", "lakeview-ffl", "rva-eskimo-brothers", "long-country-club", "c4g-fantasy-football", "river-city-ffl", "absolutely-gross"]);

export const VETO_LOG_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl", "long-country-club", "rva-eskimo-brothers", "harbor-city-ffl", "mill-creek-ffl"]);

export const SITE_FEEDBACK_LEAGUES: ReadonlySet<string> = withEngines("feedback", ["river-city-ffl"]);

export const FULL_LEDGER_LEAGUES: ReadonlySet<string> = withEngines("ledger", ["river-city-ffl"]);
export const COMMISH_PROPOSALS_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);

export const WEEKLY_OPERATIONS_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);
export const PREDICTOR_ADMIN_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);
export const MAINTENANCE_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);

export const POST_DRAFT_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);

export const WAR_ROOM_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);

export const DYNASTY_WAR_ROOM_LEAGUES: ReadonlySet<string> = withEngines("war-room", []);

export const ROOKIE_DRAFT_ROOM_LEAGUES: ReadonlySet<string> = new Set(["long-country-club", "rva-eskimo-brothers"].filter((id) => DYNASTY_WAR_ROOM_LEAGUES.has(id)));

export const DRAFT_INTELLIGENCE_LEAGUES: ReadonlySet<string> = new Set(LCC_ENGINE.has("draft-intelligence") ? ["long-country-club"] : []);

export const DRAFT_INTELLIGENCE_API_LEAGUES: ReadonlySet<string> = withRva("draft-intelligence", [...DRAFT_INTELLIGENCE_LEAGUES]);

export const SYSTEM_HEALTH_LEAGUES: ReadonlySet<string> = withRva("health", []);

export const SCORING_APPENDIX_LEAGUES: ReadonlySet<string> = withEngines("appendix", ["lakeview-ffl", "mill-creek-ffl", "harbor-city-ffl", "ironworks-dynasty"]);

export const AUCTION_CONSOLE_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);

export const AUCTION_CONSOLE_RETIRED = true;

export const OWNER_REPORT_CARD_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);

export const PUBLISHED_POST_DRAFT_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);

export const CONSTITUTION_ASK_HERE_LEAGUES: ReadonlySet<string> = withEngines("ask", ["river-city-ffl"]);

export const GM_ENGINE_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);

/** Leagues whose owner pages have members-only Text / WhatsApp / Sleeper buttons (answered by the platform through LCC_ENGINE / RVA_ENGINE, else by the league's site). */
export const CONTACT_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl", "long-country-club", "rva-eskimo-brothers"]);

export const OWNER_OPPONENT_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl"]);

export const SCHEDULED_JOBS: ReadonlySet<string> = new Set(["river-city-ffl/weekly-operations", "river-city-ffl/weekly-high-score", "rva-eskimo-brothers/weekly-operations"]);

export const HOST_FLYER_LEAGUES: Readonly<Record<string, "leroy" | "cannon" | "vince">> = {
  "river-city-ffl": "leroy",
  "rva-eskimo-brothers": "cannon",
  "long-country-club": "vince",
};

export const COLUMN_LEAGUES: Readonly<Record<string, "beau">> = { "absolutely-gross": "beau" };
/** Round badges (companion logos) for leagues that have one. */
export const LEAGUE_BADGES: Readonly<Record<string, string>> = { "absolutely-gross": "/leagues/absolutely-gross-badge.png" };
