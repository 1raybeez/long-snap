/**
 * The one Sleeper feed (Package 2) this platform serves at /api/hq-data. Platform pages read Sleeper through it too,
 * so every league page and league site shares one cache. If it can't be reached, the loaders read Sleeper directly.
 */
export const HQ_DATA_URL: string | null = process.env.HQ_DATA_URL ?? null;
