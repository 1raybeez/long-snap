// A commissioner's own league: everything the Long Snap setup page asked, saved as one setting (LONGSNAP_LEAGUE) on
// their Vercel project. Nothing here is code to edit: the setup page writes the text, the commissioner pastes it once.

export type OwnLeagueType = "redraft" | "keeper" | "auction" | "dynasty";

export interface OwnLeague {
  readonly v: 1;
  /** Web address part, e.g. "my-league". */
  readonly slug: string;
  readonly name: string;
  readonly short: string;
  readonly tagline: string;
  readonly type: OwnLeagueType;
  /** Sleeper league id for each season, newest last ({"2024": "…", "2025": "…"}). */
  readonly seasons: Readonly<Record<string, string>>;
  readonly colors: { readonly header: string; readonly accent: string; readonly action: string };
  readonly seeding: { readonly divisionWinners: number; readonly recordSeeds: number; readonly pointsSeeds: number };
  readonly keepers?: { readonly max: number; readonly raise: number | null } | null;
  readonly veto?: { readonly needed: number; readonly of: number; readonly hours: number } | null;
  readonly rookie?: { readonly rounds: number; readonly taxi: number } | null;
  /** Sleeper user id → owner's real name, when the commissioner typed them in. */
  readonly owners?: Readonly<Record<string, string>>;
  /** Sleeper user id → photo URL, when the commissioner added one. */
  readonly photos?: Readonly<Record<string, string>>;
}

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d);

/** Reads LONGSNAP_LEAGUE (JSON, or the same JSON in base64). Anything malformed means "no league set up yet". */
export function parseOwnLeague(raw: string | undefined | null): OwnLeague | null {
  if (!raw || !raw.trim()) return null;
  let j: any;
  try { j = JSON.parse(raw); } catch {
    try { j = JSON.parse(Buffer.from(raw.trim(), "base64").toString("utf8")); } catch { return null; }
  }
  if (!j || typeof j !== "object" || typeof j.name !== "string" || !j.seasons || typeof j.seasons !== "object") return null;
  const seasons: Record<string, string> = {};
  for (const [y, id] of Object.entries(j.seasons)) if (/^\d{4}$/.test(y) && typeof id === "string" && /^\d{5,25}$/.test(id)) seasons[y] = id;
  if (!Object.keys(seasons).length) return null;
  const type: OwnLeagueType = ["redraft", "keeper", "auction", "dynasty"].includes(j.type) ? j.type : "redraft";
  const name = j.name.trim().slice(0, 60) || "My League";
  const slug = (typeof j.slug === "string" && /^[a-z0-9-]{2,40}$/.test(j.slug) ? j.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "league";
  const c = j.colors ?? {};
  const s = j.seeding ?? {};
  return {
    v: 1, slug, name,
    short: typeof j.short === "string" && j.short.trim() ? j.short.trim().slice(0, 30) : name.replace(/\s+(FFL|Fantasy Football|League)$/i, ""),
    tagline: typeof j.tagline === "string" ? j.tagline.slice(0, 80) : "",
    type, seasons,
    colors: { header: HEX.test(c.header) ? c.header : "#0f172a", accent: HEX.test(c.accent) ? c.accent : "#f59e0b", action: HEX.test(c.action) ? c.action : "#1d4ed8" },
    seeding: { divisionWinners: clamp(s.divisionWinners, 0, 4, 0), recordSeeds: clamp(s.recordSeeds, 0, 16, 6), pointsSeeds: clamp(s.pointsSeeds, 0, 16, 0) },
    keepers: j.keepers ? { max: clamp(j.keepers.max, 0, 30, 2), raise: j.keepers.raise == null ? null : clamp(j.keepers.raise, 0, 100, 0) } : null,
    veto: j.veto ? { needed: clamp(j.veto.needed, 1, 20, 6), of: clamp(j.veto.of, 1, 20, 10), hours: clamp(j.veto.hours, 1, 168, 24) } : null,
    rookie: j.rookie ? { rounds: clamp(j.rookie.rounds, 1, 10, 4), taxi: clamp(j.rookie.taxi, 0, 10, 0) } : null,
    owners: j.owners && typeof j.owners === "object" ? Object.fromEntries(Object.entries(j.owners).filter(([k, v]) => /^\d+$/.test(k) && typeof v === "string").map(([k, v]) => [k, (v as string).slice(0, 60)])) : {},
    photos: j.photos && typeof j.photos === "object" ? Object.fromEntries(Object.entries(j.photos).filter(([k, v]) => /^\d+$/.test(k) && typeof v === "string" && /^https:\/\//.test(v as string))) as Record<string, string> : {},
  };
}

export const OWN_LEAGUE: OwnLeague | null = parseOwnLeague(process.env.LONGSNAP_LEAGUE);
export const ownSeasonYears = (l: OwnLeague) => Object.keys(l.seasons).map(Number).sort((a, b) => a - b);
export const ownCurrentSeason = (l: OwnLeague) => ownSeasonYears(l).at(-1)!;
