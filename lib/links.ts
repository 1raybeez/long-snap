import type { PlatformLeague } from "./platformLeagues.ts";
import { AUCTION_CONSOLE_LEAGUES, AUCTION_CONSOLE_RETIRED, COMMISH_PROPOSALS_LEAGUES, DRAFT_INTELLIGENCE_LEAGUES, DYNASTY_WAR_ROOM_LEAGUES, FULL_LEDGER_LEAGUES, SCORING_APPENDIX_LEAGUES, SYSTEM_HEALTH_LEAGUES, GM_ENGINE_LEAGUES, GM_LEAGUES, MAINTENANCE_LEAGUES, OWNER_OPPONENT_LEAGUES, OWNER_REPORT_CARD_LEAGUES, POST_DRAFT_LEAGUES, PREDICTOR_ADMIN_LEAGUES, SITE_FEEDBACK_LEAGUES, VETO_LOG_LEAGUES, WEEKLY_OPERATIONS_LEAGUES } from "./leagueFeatures.ts";

/**
 * League models are exported from the current league site, so their links and images are paths on that site.
 * Pages already on the platform stay here; everything else (and every image) points at the current site.
 */
const ON_PLATFORM = [/^\/$/, /^\/matchups(\?|$|\/head-to-head\/|\/brackets(\?|$))/, /^\/standings(\?|$)/, /^\/power-rankings(\?|$)/, /^\/predictor(\?|$)/, /^\/history(\?|$|\/\d{4}(\?|$))/, /^\/recaps(\/|\?|$)/, /^\/league-info(\?|$|\/records|\/rivalries|\/trades|\/resources|\/legislative(\?|$|\/new(\?|$))|\/constitution(\?|#|$)|\/fees(\?|$)|\/drafts(\?|#|$|\/recap\/|\/report\/))/, /^\/managers(\?|$|\/owners\/[^/?#]+(\?|#|$)|\/franchise\/)/, /^\/gm(\/|\?|$)/, /^\/nfl\/week\/\d+$/, /^\/commish(\?|$)/];
const IMAGE = /\.(png|jpe?g|webp|gif|svg)(\?|$)/i;

/**
 * A league image (owner photos, logos, recap-archive pictures) from the platform's own copy (2026-11-08): each league
 * site's public/ images are copied under public/league-assets/<league>/ at the same paths, so no image is loaded from an
 * old league site. The talk-show host photos (/hosts/...) are the same files on every site and the platform already has them.
 */
export const leagueAssetUrl = (league: PlatformLeague, path: string) => (/^\/hosts\//.test(path) ? path : `/league-assets/${league.id}${path.split("/").map((part) => encodeURIComponent(decodeURIComponentSafe(part))).join("/")}`);
function decodeURIComponentSafe(part: string): string { try { return decodeURIComponent(part); } catch { return part; } }

/** A page on the league's current site, opened through /go so a signed-in member arrives signed in there too. */
export const sitePageHref = (league: PlatformLeague, path: string) => (league.currentSiteUrl ? `/go/${league.slug}?to=${encodeURIComponent(path)}` : path);

export function rewritePath(league: PlatformLeague, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;

  const recap = /^\/league-info\/drafts\/(\d{4})-recap(\?|$)/.exec(href);
  if (recap) return `/${league.slug}/league-info/drafts/recap/${recap[1]}`;

  const rcDraft = /^\/league-info\/draft(\/(recap|report)\/[^?]*)?(\?.*)?$/.exec(href);
  if (rcDraft) return `/${league.slug}/league-info/drafts${rcDraft[1] ?? ""}`;

  const payouts = /^\/league-info\/payouts(\?.*)?$/.exec(href);
  if (payouts) return `/${league.slug}/league-info/fees${payouts[1] ?? ""}`;
  // GM tools are on the platform only for leagues whose trade setup lives here.
  if (/^\/gm(\/|\?|$)/.test(href) && !GM_LEAGUES.has(league.id)) return sitePageHref(league, href);
  if (/^\/league-info\/vetoes(\?|$)/.test(href) && VETO_LOG_LEAGUES.has(league.id)) return `/${league.slug}/league-info/vetoes`;

  // Feedback too through their engines (SITE_FEEDBACK_LEAGUES).
  if (/^\/commish\/vetoes(\?|$)/.test(href) && VETO_LOG_LEAGUES.has(league.id)) return `/${league.slug}${href}`;
  if (/^\/(commish\/)?feedback(\?|$)/.test(href) && SITE_FEEDBACK_LEAGUES.has(league.id)) return `/${league.slug}${href}`;

  // (/commish/proposals, /commish/proposals/new) run here too (2026-11-05). The platform's ledger page is the 2026 ledger.
  if (/^\/commish\/finance(\/\d{4})?\/?(\?|#|$)/.test(href) && FULL_LEDGER_LEAGUES.has(league.id)) return `/${league.slug}/commish/finance`;
  if (/^\/commish\/proposals(\/new)?\/?(\?|#|$)/.test(href) && COMMISH_PROPOSALS_LEAGUES.has(league.id)) return `/${league.slug}${href.replace(/\/(?=\?|#|$)/, "")}`;

  // (/commish/post-draft, /report?franchiseId=…, /v2, /v2/owner-preview?franchiseId=…; query kept).
  const tool = /^\/commish\/(weekly-operations|predictor|maintenance|post-draft(?:\/report|\/v2(?:\/owner-preview)?)?)\/?(\?|#|$)/.exec(href);
  const toolLeagues = { "weekly-operations": WEEKLY_OPERATIONS_LEAGUES, predictor: PREDICTOR_ADMIN_LEAGUES, maintenance: MAINTENANCE_LEAGUES, "post-draft": POST_DRAFT_LEAGUES } as const;
  if (tool && toolLeagues[tool[1].split("/")[0] as keyof typeof toolLeagues].has(league.id)) return `/${league.slug}/commish/${tool[1]}${href.slice(href.search(/[?#]|$/))}`;

  // kept, e.g. ?edit=1). Its /login isn't needed (the console signs people in itself), so it opens the console.
  const console_ = /^\/commish\/auction(\/(report|onboarding|login))?\/?(\?|#|$)/.exec(href);
  if (console_ && AUCTION_CONSOLE_LEAGUES.has(league.id)) {
    const rest = href.slice(href.search(/[?#]|$/));
    if (AUCTION_CONSOLE_RETIRED) return console_[2] === "report" ? `/${league.slug}/league-info/draft-report` : `/${league.slug}/gm/draft`;
    return console_[2] === "login" ? `/${league.slug}/commish/auction` : `/${league.slug}/commish/auction${console_[1] ?? ""}${rest}`;
  }

  // City's War Room 2.0 is GM → Draft Room (/gm/draft), already a platform path for GM leagues.
  const ownerCard = /^\/league-info\/draft-report(\/overview)?\/?(\?|#|$)/.exec(href);
  if (ownerCard && OWNER_REPORT_CARD_LEAGUES.has(league.id)) return `/${league.slug}/league-info/draft-report${ownerCard[1] ?? ""}`;

  if (/^\/league-info\/analyzer(\/classic)?\/?(\?|#|$)/.test(href) && GM_ENGINE_LEAGUES.has(league.id)) return `/${league.slug}/gm/trades`;

  if (/^\/war-room\/?(\?|#|$)/.test(href) && DYNASTY_WAR_ROOM_LEAGUES.has(league.id)) return `/${league.slug}/gm/draft`;
  const math = /^\/league-info\/drafts\/math\/(\d{4})\/?((\?|#).*)?$/.exec(href);
  if (math && DRAFT_INTELLIGENCE_LEAGUES.has(league.id)) return `/${league.slug}/league-info/drafts/math/${math[1]}${math[2] ?? ""}`;

  if (/^\/commish\/health\/?(\?|#|$)/.test(href) && SYSTEM_HEALTH_LEAGUES.has(league.id)) return `/${league.slug}/commish/health`;
  if (/^\/league-info\/constitution\/appendix\/?(\?|#|$)/.test(href) && SCORING_APPENDIX_LEAGUES.has(league.id)) return `/${league.slug}/league-info/constitution/appendix${href.slice(href.search(/[?#]|$/))}`;
  // 2026-11-08 (platform independence): old-site pages that now have a platform home.
  const moved = movedPath(league, href);
  if (moved) return moved;
  if (IMAGE.test(href)) return leagueAssetUrl(league, href);
  if (ON_PLATFORM.some((r) => r.test(href))) return `/${league.slug}${href === "/" ? "" : href}`;
  // A league with no older site of its own (every Long Snap league): its pages all live here.
  if (!league.currentSiteUrl) return /^\/war-room\/?(\?|#|$)/.test(href) ? `/${league.slug}/gm/draft` : `/${league.slug}${href === "/" ? "" : href}`;
  return sitePageHref(league, href);
}

/** Old league-site addresses whose page is now on the platform (or folded into a platform page), 2026-11-08. */
function movedPath(league: PlatformLeague, href: string): string | null {
  const path = href.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  const base = `/${league.slug}`;
  // Trophy Room: every site's /league-info/trophy-room was History → Trophy Room.
  if (path === "/league-info/trophy-room") return `${base}/history?view=trophy-room`;

  if (path === "/league-info/archives") return league.id === "long-country-club" ? `${base}/league-info/records` : `${base}/history`;

  if (path === "/managers/franchises") return `${base}/managers?view=franchises`;
  if (path === "/managers/retired") return `${base}/managers?view=retired`;

  if (/^\/managers\/owners\/[^/]+\/opponents\/[^/]+$/.test(path) && OWNER_OPPONENT_LEAGUES.has(league.id)) return `${base}${path}`;

  if (path === "/history/version-history" && league.id === "river-city-ffl") return `${base}/history/version-history`;

  if (league.id === "river-city-ffl") {
    if (path === "/league-info/recaps" || path === "/league-info/recaps/roast") return `${base}/recaps`;
    const week = /^\/league-info\/recaps\/(\d{4})\/week\/(\d+)$/.exec(path);
    if (week && Number(week[1]) === league.season) return `${base}/recaps/week/${week[2]}`;
    if (/^\/league-info\/recaps\/\d{4}(\/|$)/.test(path)) return archivePath(league, path);
  }

  if (/^(\/league-info)?\/trade-analyzer(\/classic)?$/.test(path) && GM_LEAGUES.has(league.id) && league.id !== "river-city-ffl") return `${base}/gm/trades`;

  // the amendment history on Rules of Play.
  if (league.id === "rva-eskimo-brothers") {
    if (path === "/league-info/legislative/history") return `${base}/league-info/constitution#amendment-history`;
    if (/^\/league-info\/legislative\/(business|meetings|voting|proposals)(\/[^/]+)?$/.test(path)) return `${base}/league-info/legislative`;

    if (path === "/predictor-context") return `${base}/predictor`;
  }
  return null;
}

export function archivePath(league: PlatformLeague, href: string): string | null {
  const m = /^\/league-info\/recaps\/(\d{4})(?:\/(week\/(\d+)|[a-z0-9-]+))?\/?(?:[?#].*)?$/.exec(href);
  if (!m) return null;
  const base = `/${league.slug}/recaps/archive/${m[1]}`;
  if (!m[2]) return base;
  return m[3] ? `${base}/week-${m[3]}` : `${base}/${href.split("/")[4]!.replace(/[?#].*$/, "")}`;
}

/** Deep copy of a model with every site path rewritten. */
export function rewriteLinks<T>(league: PlatformLeague, model: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.startsWith("/") ? rewritePath(league, v) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(model) as T;
}
