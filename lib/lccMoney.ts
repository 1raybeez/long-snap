// League-specific engine (not part of Long Snap): kept as an empty stand-in so shared pages compile.
export type MoneyResult = { status: number; body: Record<string, unknown> };
export async function lccMoneyRead(..._a: unknown[]): Promise<MoneyResult> { return { status: 404, body: { ok: false } }; }
export async function lccMoneyWrite(..._a: unknown[]): Promise<MoneyResult> { return { status: 404, body: { ok: false } }; }
