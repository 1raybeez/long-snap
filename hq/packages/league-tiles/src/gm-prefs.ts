/**
 * "My GM style" (HQ, 2026-10-29). Each owner tells the GM tab how they play, once, and taps "Not for me" on
 * suggestions they'd never make; Waivers (and later Trades) use it. Stored per team by each site's server
 * (Firestore `gmPreferences/{teamId}`); only the signed-in owner can change their own team's settings.
 */
export interface GmPrefs {
  /** Dynasty: weight this season vs. the future. Redraft/keeper leagues use "now". */
  strategy: "now" | "balanced" | "later";
  /** Stream kickers and defenses week to week? "auto" = learn it from your Sleeper moves. */
  streamKD: "auto" | "yes" | "no";
  bidStyle: "light" | "normal" | "aggressive";
  /** Players never suggested as drops (Sleeper ids). */
  neverDrop: string[];
  /** Players you tapped "Not for me" on (Sleeper ids), hidden from suggestions. */
  hidden: string[];
  updatedAt: string | null;
}

export const DEFAULT_GM_PREFS: GmPrefs = { strategy: "balanced", streamKD: "auto", bidStyle: "normal", neverDrop: [], hidden: [], updatedAt: null };
export const GM_PREFS_COLLECTION = "gmPreferences";

const idList = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(x)))].slice(-max) : []);

export function sanitizeGmPrefs(raw: unknown): GmPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    strategy: r.strategy === "now" || r.strategy === "later" ? r.strategy : "balanced",
    streamKD: r.streamKD === "yes" || r.streamKD === "no" ? r.streamKD : "auto",
    bidStyle: r.bidStyle === "light" || r.bidStyle === "aggressive" ? r.bidStyle : "normal",
    neverDrop: idList(r.neverDrop, 40),
    hidden: idList(r.hidden, 200),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
  };
}

export interface GmPrefsStore {
  get(teamId: string): Promise<GmPrefs | null>;
  set(teamId: string, prefs: GmPrefs): Promise<void>;
}

/**
 * Shared request handling for `mode: "gmprefs"` (read or save) and `mode: "notforme"` (hide one player, or
 * un-hide with `undo: true`). Returns null for other modes. Writes only to the signed-in owner's own team.
 */
export async function handleGmPrefsRequest(body: Record<string, unknown>, deps: { store: GmPrefsStore | null; signedInTeamId: string | null }) {
  if (body.mode !== "gmprefs" && body.mode !== "notforme") return null;
  const team = deps.signedInTeamId;
  if (!deps.store || !team) return { ok: false as const, error: "Sign in as a team owner to save your GM style." };
  const current = (await deps.store.get(team)) ?? DEFAULT_GM_PREFS;
  if (body.mode === "gmprefs" && !body.prefs) return { ok: true as const, prefs: current };
  let next: GmPrefs;
  if (body.mode === "notforme") {
    const id = typeof body.playerId === "string" ? body.playerId : "";
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return { ok: false as const, error: "Unknown player." };
    next = { ...current, hidden: body.undo === true ? current.hidden.filter((x) => x !== id) : [...current.hidden.filter((x) => x !== id), id].slice(-200) };
  } else {
    next = sanitizeGmPrefs({ ...current, ...(body.prefs as Record<string, unknown>) });
  }
  next = { ...next, updatedAt: new Date().toISOString() };
  await deps.store.set(team, next);
  return { ok: true as const, prefs: next };
}
