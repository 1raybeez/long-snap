import { currentSiteOwnerId } from "../hq/packages/platform-access/src/league-site-owners.ts";

const current = (leagueId: string, raw: string) => {
  const id = decodeURIComponent(raw);
  return currentSiteOwnerId(leagueId, id);
};

/** /<league>/managers/owners/<slug>[/opponents/<opponent>] */
export function renamedOwnerPagePath(league: { readonly id: string; readonly slug: string }, slug: string, opponent?: string): string | null {
  const s = current(league.id, slug);
  const o = opponent === undefined ? undefined : current(league.id, opponent);
  if (s === decodeURIComponent(slug) && (opponent === undefined || o === decodeURIComponent(opponent))) return null;
  return `/${league.slug}/managers/owners/${encodeURIComponent(s)}${o === undefined ? "" : `/opponents/${encodeURIComponent(o)}`}`;
}

/** /<league>/matchups/head-to-head/<a>-vs-<b> */
export function renamedHeadToHeadPath(league: { readonly id: string; readonly slug: string }, pair: string): string | null {
  const [a, b] = decodeURIComponent(pair).split("-vs-");
  if (!a || !b) return null;
  const ca = currentSiteOwnerId(league.id, a), cb = currentSiteOwnerId(league.id, b);
  return ca === a && cb === b ? null : `/${league.slug}/matchups/head-to-head/${encodeURIComponent(`${ca}-vs-${cb}`)}`;
}
