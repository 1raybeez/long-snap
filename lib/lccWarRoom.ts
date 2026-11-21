// League-specific engine (not part of Long Snap): kept as an empty stand-in so shared pages compile.
export type WarRoomResult = { status: number; body: Record<string, unknown> };
export const PRIVATE = { "Cache-Control": "private, no-store" };
export async function lccWarRoomGet(..._a: unknown[]): Promise<WarRoomResult> { return { status: 404, body: { ok: false } }; }
export function lccDraftIntelligence(..._a: unknown[]): any { return null; }
export const LCC_MATH_SEASONS: readonly number[] = [];
