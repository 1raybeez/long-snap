// League-specific engine (not part of Long Snap): kept as an empty stand-in so shared pages compile.
export async function rvaLegislativeHub(..._a: unknown[]): Promise<any> { throw new Error("Not available."); }
export async function rvaSubmitProposal(..._a: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> { return { status: 404, body: { ok: false } }; }
export async function rvaVote(..._a: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> { return { status: 404, body: { ok: false } }; }
export async function rvaLegislativeCommissioner(..._a: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> { return { status: 404, body: { ok: false } }; }
export async function rvaRuleBook(..._a: unknown[]): Promise<any> { return null; }
