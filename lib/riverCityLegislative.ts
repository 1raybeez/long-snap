// League-specific engine (not part of Long Snap): kept as an empty stand-in so shared pages compile.
export const RIVER_CITY_LEAGUE_ID = "__none__";
export function riverCityOwnerId(..._a: unknown[]): string | null { return null; }
export function riverCityHubPageData(..._a: unknown[]): any { return null; }
export async function riverCityLegislativeHub(..._a: unknown[]): Promise<any> { throw new Error("Not available."); }
export async function riverCitySubmitProposal(..._a: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> { return { status: 404, body: { ok: false } }; }
export async function riverCityVote(..._a: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> { return { status: 404, body: { ok: false } }; }
export interface RiverCityRuleBook { sections: any[]; history: any[]; lastAmendedAt: string | null; navLabels: Record<string, string> }
export async function riverCityRuleBook(..._a: unknown[]): Promise<RiverCityRuleBook | null> { return null; }
