// League-specific engine (not part of Long Snap): kept as an empty stand-in so shared pages compile.
export async function riverCityPublicVetoLog(..._a: unknown[]): Promise<any> { return null; }
export async function riverCityVetoAdmin(..._a: unknown[]): Promise<any> { return null; }
export async function riverCityVetoAction(..._a: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> { return { status: 404, body: { ok: false } }; }
