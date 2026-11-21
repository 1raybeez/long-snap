import { OWN_LEAGUE, ownCurrentSeason, ownSeasonYears, type OwnLeague } from "../../../lib/ownLeague.ts";
import { DEMO_KEYS, DEMO_LEAGUES, DEMO_SEASONS, demoLeagueId } from "../../../lib/demo/demoLeagues.ts";
import type {
  ConfigReference,
  LeagueCapability,
  LeagueRegistry,
  LeagueRegistryEntry,
  LeagueSeasonRecord,
  ProviderLeagueBinding,
} from "../../packages/league-registry/src/types.ts";

const CURRENT_SEASON = 2026;

const formatReferences = {
  AUCTION_KEEPER: { key: "format.auction-keeper", version: "1", state: "PENDING" },
  DYNASTY: { key: "format.dynasty", version: "1", state: "PENDING" },
  REDRAFT: { key: "format.redraft", version: "1", state: "PENDING" },
  KEEPER: { key: "format.keeper", version: "1", state: "PENDING" },
  PICKEM: { key: "format.pickem", version: "1", state: "PENDING" },
} as const satisfies Record<string, ConfigReference>;

function reference(key: string): ConfigReference {
  return { key, version: "1", state: "PENDING" };
}

function binding(externalLeagueId: string, season: number): ProviderLeagueBinding {
  return {
    provider: "SLEEPER",
    externalLeagueId,
    externalSeason: String(season),
    state: "CONFIRMED",
  };
}

function seasonRecord(
  leagueId: string,
  season: number,
  format: keyof typeof formatReferences,
  providerBindings: readonly ProviderLeagueBinding[] = [],
): LeagueSeasonRecord {
  return {
    id: `${leagueId}:${season}`,
    season,
    state: season === CURRENT_SEASON ? "ACTIVE" : season < 2019 ? "ARCHIVED" : "COMPLETED",
    providerBindings,
    formatConfig: formatReferences[format],
    leagueConfig: reference(`league.${leagueId}`),
    brandingConfig: reference(`branding.${leagueId}`),
  };
}

function seasonsFromMap(
  leagueId: string,
  format: keyof typeof formatReferences,
  mappings: Readonly<Record<number, string>>,
  firstSeason: number,
): readonly LeagueSeasonRecord[] {
  const seasons: LeagueSeasonRecord[] = [];
  for (let season = firstSeason; season <= CURRENT_SEASON; season += 1) {
    const externalLeagueId = mappings[season];
    seasons.push(
      seasonRecord(
        leagueId,
        season,
        format,
        externalLeagueId ? [binding(externalLeagueId, season)] : [],
      ),
    );
  }
  return seasons;
}

function capabilities(
  entries: readonly [LeagueCapability["key"], LeagueCapability["state"]][],
): readonly LeagueCapability[] {
  return entries.map(([key, state]) => ({ key, state }));
}

const riverCityId = "river-city-ffl";
const lccId = "long-country-club";
const rvaId = "rva-eskimo-brothers";
const c4gId = "c4g-fantasy-football";
const absolutelyGrossId = "absolutely-gross";
const longShotsId = "long-shots";

const primaryCapabilities = capabilities([
  ["TRADE_WAR_ROOM", "AVAILABLE"],
  ["DRAFT_WAR_ROOM", "AVAILABLE"],
  ["COMMISSIONER_HUB", "ENABLED"],
  ["LEAGUE_INTELLIGENCE", "ENABLED"],
  ["WEEKLY_LEAGUE_MEDIA", "AVAILABLE"],
  ["HISTORY", "ENABLED"],
  ["FINANCE", "ENABLED"],
  ["GOVERNANCE", "ENABLED"],
]);

const c4gCapabilities = capabilities([
  ["TRADE_WAR_ROOM", "AVAILABLE"],
  ["DRAFT_WAR_ROOM", "AVAILABLE"],
  ["WEEKLY_LEAGUE_MEDIA", "ENABLED"],
  ["COMMISSIONER_HUB", "OUT_OF_SCOPE"],
  ["HISTORY", "OUT_OF_SCOPE"],
  ["FINANCE", "OUT_OF_SCOPE"],
  ["GOVERNANCE", "OUT_OF_SCOPE"],
  ["LEAGUE_INTELLIGENCE", "AVAILABLE"],
]);

const absolutelyGrossCapabilities = capabilities([
  ["TRADE_WAR_ROOM", "OUT_OF_SCOPE"],
  ["DRAFT_WAR_ROOM", "OUT_OF_SCOPE"],
  ["WEEKLY_LEAGUE_MEDIA", "OUT_OF_SCOPE"],
  ["COMMISSIONER_HUB", "OUT_OF_SCOPE"],
  ["HISTORY", "OUT_OF_SCOPE"],
  ["FINANCE", "OUT_OF_SCOPE"],
  ["GOVERNANCE", "OUT_OF_SCOPE"],
  ["LEAGUE_INTELLIGENCE", "OUT_OF_SCOPE"],
]);

const longShotsCapabilities = capabilities([
  ["TRADE_WAR_ROOM", "OUT_OF_SCOPE"],
  ["DRAFT_WAR_ROOM", "OUT_OF_SCOPE"],
  ["WEEKLY_LEAGUE_MEDIA", "OUT_OF_SCOPE"],
  ["COMMISSIONER_HUB", "OUT_OF_SCOPE"],
  ["HISTORY", "OUT_OF_SCOPE"],
  ["FINANCE", "OUT_OF_SCOPE"],
  ["GOVERNANCE", "OUT_OF_SCOPE"],
  ["LEAGUE_INTELLIGENCE", "OUT_OF_SCOPE"],
]);

const league = (
  id: string,
  displayName: string,
  shortName: string,
  format: LeagueRegistryEntry["format"],
  participationMode: LeagueRegistryEntry["participationMode"],
  dedicatedWebsite: boolean,
  capabilitiesForLeague: readonly LeagueCapability[],
  seasons: readonly LeagueSeasonRecord[],
): LeagueRegistryEntry => ({
  id,
  slug: id,
  displayName,
  shortName,
  format,
  lifecycle: "ACTIVE",
  participationMode,
  dedicatedWebsite,
  currentSeason: CURRENT_SEASON,
  capabilities: capabilitiesForLeague,
  seasons,
});

// Long Snap demo: only the made-up leagues are on this site (each season bound to its fake Sleeper league ID).
const demoCapabilities = capabilities([
  ["TRADE_WAR_ROOM", "AVAILABLE"],
  ["DRAFT_WAR_ROOM", "AVAILABLE"],
  ["WEEKLY_LEAGUE_MEDIA", "ENABLED"],
]);

const demoLeague = (key: (typeof DEMO_KEYS)[number]) =>
  league(DEMO_LEAGUES[key].slug, DEMO_LEAGUES[key].name, DEMO_LEAGUES[key].short, DEMO_LEAGUES[key].format, "FULL_LEAGUE_EXPERIENCE", true, demoCapabilities,
    seasonsFromMap(DEMO_LEAGUES[key].slug, DEMO_LEAGUES[key].format, Object.fromEntries(DEMO_SEASONS.map((s) => [s, demoLeagueId(key, s)])), DEMO_SEASONS[0]));

// A commissioner's own league (LONGSNAP_LEAGUE, written by the setup page): it replaces the demo leagues.
const OWN_FORMAT = { redraft: "REDRAFT", keeper: "KEEPER", auction: "AUCTION_KEEPER", dynasty: "DYNASTY" } as const;
const ownLeague = (l: OwnLeague): LeagueRegistryEntry => ({
  ...league(l.slug, l.name, l.short, OWN_FORMAT[l.type], "TOOL_ONLY", false, demoCapabilities,
    seasonsFromMap(l.slug, OWN_FORMAT[l.type], Object.fromEntries(Object.entries(l.seasons).map(([y, id]) => [Number(y), id])), ownSeasonYears(l)[0]!).filter((s) => s.season <= ownCurrentSeason(l))),
  currentSeason: ownCurrentSeason(l),
});

export const HQ_LEAGUE_REGISTRY = {
  schemaVersion: 1,
  leagues: OWN_LEAGUE ? [ownLeague(OWN_LEAGUE)] : DEMO_KEYS.map(demoLeague),
} as const satisfies LeagueRegistry;
