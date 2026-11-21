// Long Snap demo leagues. All made up: invented teams and owners, scored from real NFL games.
// Each season has a fake Sleeper league ID; lib/demo/fakeSleeper.ts answers Sleeper requests for these IDs
// from the files in data/demo/, so the platform's own pages render them like any Sleeper league.

export type DemoKey = "redraft" | "keeper" | "auction" | "dynasty";

export const DEMO_SEASONS = [2022, 2023, 2024, 2025, 2026] as const;
const INDEX: Readonly<Record<DemoKey, number>> = { redraft: 1, keeper: 2, auction: 3, dynasty: 4 };

/** 18-digit fake Sleeper league ID, e.g. 930000000000002026 = the auction league's 2026 season. */
export const demoLeagueId = (key: DemoKey, season: number) => `9${INDEX[key]}000000000000${season}`;
export const demoDraftId = (key: DemoKey, season: number) => `${demoLeagueId(key, season)}9`;
/** Numeric fake Sleeper user ID for an owner ("au011" = auction, roster 1, co-owner 1). */
export const demoUserId = (raw: string) => {
  const key = (Object.keys(INDEX) as DemoKey[]).find((k) => raw.startsWith(k.slice(0, 2)));
  return `8${key ? INDEX[key] : 0}0000000000${raw.slice(2).padStart(6, "0")}`;
};

export function parseDemoLeagueId(id: string): { key: DemoKey; season: number } | null {
  const m = /^9([1-4])0{12}(\d{4})$/.exec(id);
  if (!m) return null;
  const key = (Object.keys(INDEX) as DemoKey[]).find((k) => INDEX[k] === Number(m[1]))!;
  const season = Number(m[2]);
  return (DEMO_SEASONS as readonly number[]).includes(season) ? { key, season } : null;
}

export const DEMO_LEAGUES: Readonly<Record<DemoKey, { slug: string; name: string; short: string; tagline: string; format: "REDRAFT" | "KEEPER" | "AUCTION_KEEPER" | "DYNASTY" }>> = {
  redraft: { slug: "lakeview-ffl", name: "Lakeview FFL", short: "Lakeview", tagline: "Redraft, every year a fresh start", format: "REDRAFT" },
  keeper: { slug: "mill-creek-ffl", name: "Mill Creek FFL", short: "Mill Creek", tagline: "Snake-draft keepers since 2014", format: "KEEPER" },
  auction: { slug: "harbor-city-ffl", name: "Harbor City FFL", short: "Harbor City", tagline: "Auction keeper since 2011", format: "AUCTION_KEEPER" },
  dynasty: { slug: "ironworks-dynasty", name: "Ironworks Dynasty", short: "Ironworks", tagline: "Dynasty since 2022", format: "DYNASTY" },
};
export const DEMO_KEYS = Object.keys(DEMO_LEAGUES) as DemoKey[];
export const demoKeyForSlug = (slug: string) => DEMO_KEYS.find((k) => DEMO_LEAGUES[k].slug === slug) ?? null;
/** The demo leagues are on unless LONGSNAP_DEMO is set to 0 (a league's own site turns them off). */
export const isDemoMode = () => (process.env.LONGSNAP_DEMO ?? "1") !== "0";

/** Every demo league slug (for pages that list which leagues have a feature). */
export const DEMO_SLUGS: readonly string[] = Object.values(DEMO_LEAGUES).map((l) => l.slug);
