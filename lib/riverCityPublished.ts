// League-specific engine (not part of Long Snap): kept as an empty stand-in so shared pages compile.
export const RIVER_CITY_PUBLISHED_LEAGUE = "__none__";
export function riverCityHeroFranchiseId(..._a: unknown[]): string | null { return null; }
export function teamOutlookPanel(..._a: unknown[]): any { return null; }
export async function riverCityTeamOutlook(..._a: unknown[]): Promise<any> { return null; }
export function publicLeagueRecapFields(..._a: unknown[]): any { return null; }
export type LeagueRecapResult = { ok: boolean; recap?: any; error?: string };
export async function riverCityLeagueRecap(..._a: unknown[]): Promise<LeagueRecapResult> { return { ok: false }; }
