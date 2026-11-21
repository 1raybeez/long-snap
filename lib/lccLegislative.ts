// League-specific engine (not part of Long Snap): kept as an empty stand-in so shared pages compile.
export async function lccLegislativeHub(..._a: unknown[]): Promise<any> { throw new Error("Not available."); }
export async function lccSubmitProposal(..._a: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> { return { status: 404, body: { ok: false } }; }
export async function lccVote(..._a: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> { return { status: 404, body: { ok: false } }; }
export async function lccLegislativeCommissioner(..._a: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> { return { status: 404, body: { ok: false } }; }
export async function lccRuleBook(..._a: unknown[]): Promise<any> { return null; }
