/**
 * League-site owner ids → HQ canonical owner ids (Package 3, one login).
 *
 * Each league site keeps its own private email → owner member list and answers the platform's sign-in question
 * ("who is this Google account in your league?") with ITS owner id. Most ids are the same as HQ's; a few were
 * spelled differently when the sites were built. This table is explicit on purpose: no name matching, no guessing.
 * Every row carries the owner's Sleeper user id so tests can prove it against the human-reviewed 2026 owner reviews
 * (config/imports/*-2026-owner-review.ts), and so sign-in can refuse a site answer whose Sleeper id disagrees.
 *
 * Only active owners are listed: league sites never vouch for retired owners.
 */
export type LeagueSiteOwnerRow = readonly [siteOwnerId: string, hqOwnerId: string, sleeperUserId: string | null];

export const WHOAMI_LEAGUE_IDS = ["river-city-ffl", "long-country-club", "rva-eskimo-brothers"] as const;
export type WhoamiLeagueId = (typeof WHOAMI_LEAGUE_IDS)[number];

export const LEAGUE_SITE_OWNERS: Readonly<Record<WhoamiLeagueId, readonly LeagueSiteOwnerRow[]>> = {
  "river-city-ffl": [],
  "long-country-club": [],
  "rva-eskimo-brothers": [],
};

/**
 * League-site owner ids that were renamed (old → current), per league. THE single alias table: records kept outside the
 * code may still carry the old id (a league's private member list secret, Firestore documents such as feedback, votes,
 * award obligations, sign-in link records), so every place an owner id comes in from those sources maps it through
 * here (currentSiteOwnerId). Data files and URLs use the current id only; the old owner-page URL redirects.
 */
export const RENAMED_SITE_OWNER_IDS: Readonly<Partial<Record<WhoamiLeagueId, Readonly<Record<string, string>>>>> = {
};

/** The league site's current owner id for `siteOwnerId` (an old, renamed id maps to the current one; others unchanged). */
export function currentSiteOwnerId(leagueId: string, siteOwnerId: string): string {
  const id = siteOwnerId.trim();
  return (isWhoamiLeague(leagueId) ? RENAMED_SITE_OWNER_IDS[leagueId]?.[id] : undefined) ?? id;
}

/** Old ids that now mean `siteOwnerId` (empty for owners never renamed). */
export function previousSiteOwnerIds(leagueId: string, siteOwnerId: string): readonly string[] {
  if (!isWhoamiLeague(leagueId)) return [];
  return Object.entries(RENAMED_SITE_OWNER_IDS[leagueId] ?? {}).filter(([, current]) => current === siteOwnerId).map(([old]) => old);
}

export function isWhoamiLeague(leagueId: string): leagueId is WhoamiLeagueId {
  return (WHOAMI_LEAGUE_IDS as readonly string[]).includes(leagueId);
}

/** The HQ owner row for a league site's owner id, or null when the site's id isn't in the reviewed table. */
export function hqOwnerForSiteOwner(leagueId: string, siteOwnerId: string): { readonly hqOwnerId: string; readonly sleeperUserId: string | null } | null {
  if (!isWhoamiLeague(leagueId)) return null;
  const site = currentSiteOwnerId(leagueId, siteOwnerId);
  const row = LEAGUE_SITE_OWNERS[leagueId].find(([id]) => id === site);
  return row ? { hqOwnerId: row[1], sleeperUserId: row[2] } : null;
}
