export type PlayerType = "PLAYER" | "DEFENSE";

export type PlayerPosition = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export type PlayerStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN";

export type PlayerProvider = "SLEEPER" | "FANTASYCALC" | (string & {});

export type ProviderMappingStatus =
  | "CONFIRMED"
  | "PENDING"
  | "UNRESOLVED"
  | "RETIRED";

export interface ProviderPlayerMapping {
  readonly provider: PlayerProvider;
  readonly providerPlayerId: string;
  readonly status: ProviderMappingStatus;
  readonly sourceRef?: string;
}

export interface CanonicalPlayer {
  readonly hqPlayerId: string;
  readonly displayName: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly position: PlayerPosition;
  readonly nflTeam: string | null;
  readonly status: PlayerStatus;
  readonly playerType: PlayerType;
  readonly aliases: readonly string[];
  readonly providerMappings: readonly ProviderPlayerMapping[];
}

export type PlayerResolution =
  | {
      readonly status: "RESOLVED";
      readonly player: CanonicalPlayer;
      readonly mapping: ProviderPlayerMapping;
    }
  | {
      readonly status: "UNRESOLVED";
      readonly provider: PlayerProvider;
      readonly providerPlayerId: string;
      readonly reason: "NO_MAPPING" | "AMBIGUOUS_MAPPING" | "NON_CONFIRMED_MAPPING";
    };
