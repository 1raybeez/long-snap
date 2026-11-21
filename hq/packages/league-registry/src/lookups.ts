import type {
  CapabilityKey,
  LeagueCapability,
  LeagueRegistry,
  LeagueRegistryEntry,
  LeagueSeasonRecord,
  ProviderKey,
  ProviderLeagueBinding,
} from "./types.ts";
import { HQ_LEAGUE_REGISTRY } from "./registry.ts";

export function getLeagueById(
  id: string,
  registry: LeagueRegistry = HQ_LEAGUE_REGISTRY,
): LeagueRegistryEntry | null {
  return registry.leagues.find((league) => league.id === id) ?? null;
}

export function getLeagueBySlug(
  slug: string,
  registry: LeagueRegistry = HQ_LEAGUE_REGISTRY,
): LeagueRegistryEntry | null {
  return registry.leagues.find((league) => league.slug === slug) ?? null;
}

export function getLeagueSeason(
  leagueId: string,
  season: number,
  registry: LeagueRegistry = HQ_LEAGUE_REGISTRY,
): LeagueSeasonRecord | null {
  return getLeagueById(leagueId, registry)?.seasons.find((record) => record.season === season) ?? null;
}

export function getCapability(
  leagueId: string,
  capabilityKey: CapabilityKey,
  registry: LeagueRegistry = HQ_LEAGUE_REGISTRY,
): LeagueCapability | null {
  return getLeagueById(leagueId, registry)?.capabilities.find((capability) => capability.key === capabilityKey) ?? null;
}

export function getProviderBinding(
  leagueId: string,
  season: number,
  provider: ProviderKey,
  registry: LeagueRegistry = HQ_LEAGUE_REGISTRY,
): ProviderLeagueBinding | null {
  return getLeagueSeason(leagueId, season, registry)?.providerBindings.find((binding) => binding.provider === provider) ?? null;
}
