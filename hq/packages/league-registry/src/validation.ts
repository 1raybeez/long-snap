import type {
  LeagueRegistry,
  LeagueRegistryEntry,
  LeagueSeasonRecord,
} from "./types.ts";

// Long Snap demo: the four made-up leagues.
const REQUIRED_LEAGUE_IDS = [
  "lakeview-ffl",
  "mill-creek-ffl",
  "harbor-city-ffl",
  "ironworks-dynasty",
] as const;

const FORBIDDEN_KEYS = new Set([
  "credentials",
  "password",
  "token",
  "secret",
  "userIdentity",
  "memberships",
  "rosterData",
  "rosters",
  "playerData",
  "players",
  "matchupData",
  "matchups",
  "financeTransactions",
  "governanceRecords",
  "mediaContent",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findForbiddenKeys(value: unknown, path: string, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, errors));
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      errors.push(`${path}.${key} is outside the league registry boundary`);
    }
    findForbiddenKeys(child, `${path}.${key}`, errors);
  }
}

function validateSeason(
  league: LeagueRegistryEntry,
  season: LeagueSeasonRecord,
  errors: string[],
): void {
  if (season.id !== `${league.id}:${season.season}`) {
    errors.push(`${league.id} season ${season.season} has an invalid canonical season id`);
  }

  if (!Number.isInteger(season.season) || season.season < 1900) {
    errors.push(`${league.id} has an invalid season year`);
  }

  for (const binding of season.providerBindings) {
    if (!binding.provider || !binding.state) {
      errors.push(`${league.id}:${season.season} has an incomplete provider binding`);
    }

    if (binding.state === "CONFIRMED" && !binding.externalLeagueId) {
      errors.push(`${league.id}:${season.season} has a confirmed provider binding without an external league id`);
    }

    if (binding.externalLeagueId && binding.externalLeagueId === league.id) {
      errors.push(`${league.id}:${season.season} uses a provider id as canonical league identity`);
    }
  }
}

export function validateRegistry(registry: LeagueRegistry): readonly string[] {
  const errors: string[] = [];

  if (registry.schemaVersion !== 1) {
    errors.push("unsupported registry schema version");
  }

  const ids = new Set<string>();
  const slugs = new Set<string>();
  const providerIds = new Set<string>();
  const seenRequiredIds = new Set<string>();

  // Long Snap: either the demo leagues or one commissioner's own league.
  const demo = registry.leagues.some((l) => REQUIRED_LEAGUE_IDS.includes(l.id as (typeof REQUIRED_LEAGUE_IDS)[number]));
  if (demo && registry.leagues.length !== REQUIRED_LEAGUE_IDS.length) {
    errors.push(`expected exactly ${REQUIRED_LEAGUE_IDS.length} leagues`);
  }

  for (const league of registry.leagues) {
    if (!league.id || ids.has(league.id)) {
      errors.push(`duplicate or empty league id: ${league.id || "<empty>"}`);
    }
    ids.add(league.id);

    if (!league.slug || slugs.has(league.slug)) {
      errors.push(`duplicate or empty league slug: ${league.slug || "<empty>"}`);
    }
    slugs.add(league.slug);

    if (REQUIRED_LEAGUE_IDS.includes(league.id as (typeof REQUIRED_LEAGUE_IDS)[number])) {
      seenRequiredIds.add(league.id);
    } else if (demo) {
      errors.push(`unexpected league id: ${league.id}`);
    }

    if (league.lifecycle === "ACTIVE" && league.currentSeason !== 2026) {
      errors.push(`${league.id} active season must be 2026`);
    }

    if (!league.seasons.some((season) => season.season === league.currentSeason && season.state === "ACTIVE")) {
      errors.push(`${league.id} must have an active current season record`);
    }

    const seasons = new Set<number>();
    for (const season of league.seasons) {
      if (seasons.has(season.season)) {
        errors.push(`duplicate season ${league.id}:${season.season}`);
      }
      seasons.add(season.season);
      validateSeason(league, season, errors);

      for (const binding of season.providerBindings) {
        if (binding.externalLeagueId) {
          if (providerIds.has(`${binding.provider}:${binding.externalLeagueId}`)) {
            errors.push(`duplicate provider binding: ${binding.provider}:${binding.externalLeagueId}`);
          }
          providerIds.add(`${binding.provider}:${binding.externalLeagueId}`);
        }
      }
    }

    const capabilities = new Set<string>();
    for (const capability of league.capabilities) {
      if (capabilities.has(capability.key)) {
        errors.push(`duplicate capability ${league.id}:${capability.key}`);
      }
      capabilities.add(capability.key);
    }
  }

  for (const requiredId of REQUIRED_LEAGUE_IDS) {
    if (demo && !seenRequiredIds.has(requiredId)) {
      errors.push(`missing required league: ${requiredId}`);
    }
  }

  findForbiddenKeys(registry, "registry", errors);
  return errors;
}

export function assertValidRegistry(registry: LeagueRegistry): void {
  const errors = validateRegistry(registry);
  if (errors.length > 0) {
    throw new Error(`Invalid league registry:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
}
