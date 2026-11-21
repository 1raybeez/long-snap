// League-specific engine (not part of Long Snap): kept as an empty stand-in so shared pages compile.
export type GmResult = { status: number; body: Record<string, unknown> };
export const riverCityGmTeam = (..._a: unknown[]): string | null => null;
export async function riverCityGmGet(..._a: unknown[]): Promise<GmResult> { return { status: 404, body: { ok: false } }; }
export async function riverCityGmPost(..._a: unknown[]): Promise<GmResult> { return { status: 404, body: { ok: false } }; }
