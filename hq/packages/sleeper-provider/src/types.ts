import type { LeagueRegistry } from "../../league-registry/src/types.ts";

export type SleeperEndpoint =
  | "NFL_STATE"
  | "PLAYERS"
  | "LEAGUE"
  | "LEAGUE_USERS"
  | "ROSTERS"
  | "MATCHUPS"
  | "TRANSACTIONS"
  | "WINNERS_BRACKET"
  | "LOSERS_BRACKET"
  | "DRAFTS"
  | "DRAFT_PICKS"
  | "USER";

export type SleeperErrorCode =
  | "CONFIGURATION_ERROR"
  | "INVALID_REQUEST"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "RESPONSE_PARSE_ERROR";

export interface SleeperLeagueSeasonReference {
  readonly leagueId: string;
  readonly season: number;
}

export interface SleeperSourceMetadata {
  readonly provider: "SLEEPER";
  readonly endpoint: SleeperEndpoint;
  readonly url: string;
  readonly fetchedAt: string;
  readonly attempts: number;
  readonly externalLeagueId?: string;
}

export interface SleeperProviderError {
  readonly code: SleeperErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly endpoint: SleeperEndpoint;
  readonly statusCode?: number;
}

export type SleeperResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly source: SleeperSourceMetadata;
    }
  | {
      readonly ok: false;
      readonly error: SleeperProviderError;
      readonly source: SleeperSourceMetadata;
    };

export interface SleeperNflState {
  readonly season?: string;
  readonly season_type?: string;
  readonly week?: number;
  readonly display_week?: number;
  readonly leg?: number;
  readonly [key: string]: unknown;
}

export interface SleeperPlayer {
  readonly player_id?: string;
  readonly full_name?: string;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly position?: string | null;
  readonly fantasy_positions?: readonly string[] | null;
  readonly team?: string | null;
  readonly status?: string | null;
  readonly active?: boolean | null;
  readonly [key: string]: unknown;
}

export type SleeperPlayerCatalog = Readonly<Record<string, SleeperPlayer>>;

export interface SleeperLeague {
  readonly league_id?: string;
  readonly name?: string;
  readonly season?: string;
  readonly sport?: string;
  readonly status?: string;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly scoring_settings?: Readonly<Record<string, number>>;
  readonly [key: string]: unknown;
}

export type SleeperLeagueUser = Readonly<Record<string, unknown>>;
export type SleeperRoster = Readonly<Record<string, unknown>>;
export type SleeperMatchup = Readonly<Record<string, unknown>>;
export type SleeperTransaction = Readonly<Record<string, unknown>>;
export type SleeperBracketMatch = Readonly<Record<string, unknown>>;
export type SleeperDraft = Readonly<Record<string, unknown>>;
export type SleeperDraftPick = Readonly<Record<string, unknown>>;
export type SleeperUser = Readonly<Record<string, unknown>>;

export interface SleeperRetryPolicy {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly retryableStatusCodes: readonly number[];
}

export interface SleeperClientOptions {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly retryPolicy?: Partial<SleeperRetryPolicy>;
  readonly fetcher?: SleeperFetcher;
  readonly sleep?: (delayMs: number) => Promise<void>;
  readonly now?: () => Date;
}

export interface SleeperHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}

export type SleeperFetcher = (
  url: string,
  init: { readonly signal: AbortSignal },
) => Promise<SleeperHttpResponse>;

export interface SleeperClientRegistryContext {
  readonly registry: LeagueRegistry;
}
