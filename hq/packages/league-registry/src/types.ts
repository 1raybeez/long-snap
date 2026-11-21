
export type LeagueFormat = "AUCTION_KEEPER" | "KEEPER" | "DYNASTY" | "REDRAFT" | "PICKEM";

export type ParticipationMode = "FULL_LEAGUE_EXPERIENCE" | "TOOL_ONLY";

export type LeagueLifecycle = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type CapabilityKey =
  | "TRADE_WAR_ROOM"
  | "DRAFT_WAR_ROOM"
  | "COMMISSIONER_HUB"
  | "LEAGUE_INTELLIGENCE"
  | "WEEKLY_LEAGUE_MEDIA"
  | "HISTORY"
  | "FINANCE"
  | "GOVERNANCE";

export type CapabilityState =
  | "ENABLED"
  | "AVAILABLE"
  | "DISABLED"
  | "OUT_OF_SCOPE";

export type ProviderKey = "SLEEPER";

export type ProviderBindingState =
  | "CONFIRMED"
  | "PENDING"
  | "UNAVAILABLE";

export type SeasonState =
  | "PLANNED"
  | "ACTIVE"
  | "COMPLETED"
  | "ARCHIVED";

export type ConfigReferenceState = "PENDING" | "RESOLVED";

export interface ConfigReference {
  readonly key: string;
  readonly version: string;
  readonly state: ConfigReferenceState;
}

export interface LeagueCapability {
  readonly key: CapabilityKey;
  readonly state: CapabilityState;
}

export interface ProviderLeagueBinding {
  readonly provider: ProviderKey;
  readonly externalLeagueId: string | null;
  readonly externalSeason: string | null;
  readonly state: ProviderBindingState;
}

export interface LeagueSeasonRecord {
  readonly id: string;
  readonly season: number;
  readonly state: SeasonState;
  readonly providerBindings: readonly ProviderLeagueBinding[];
  readonly formatConfig: ConfigReference;
  readonly leagueConfig: ConfigReference;
  readonly brandingConfig: ConfigReference;
}

export interface LeagueRegistryEntry {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly shortName: string;
  readonly format: LeagueFormat;
  readonly lifecycle: LeagueLifecycle;
  readonly participationMode: ParticipationMode;
  readonly dedicatedWebsite: boolean;
  readonly currentSeason: number;
  readonly capabilities: readonly LeagueCapability[];
  readonly seasons: readonly LeagueSeasonRecord[];
}

export interface LeagueRegistry {
  readonly schemaVersion: 1;
  readonly leagues: readonly LeagueRegistryEntry[];
}
