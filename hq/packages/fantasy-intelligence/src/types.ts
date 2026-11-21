import type { PlayerProvider } from "../../player-identity/src/types.ts";

export type IntelligenceProviderStatus =
  | "APPROVED"
  | "PENDING_REVIEW"
  | "INTERNAL"
  | "UNAVAILABLE";

export type IntelligenceMetricKind =
  | "DYNASTY_PLAYER_VALUE"
  | "DYNASTY_PICK_VALUE"
  | "REDRAFT_PLAYER_VALUE"
  | "ADP"
  | "AUCTION_VALUE"
  | "PROJECTION"
  | "POSITIONAL_RANK"
  | "OVERALL_RANK"
  | "REST_OF_SEASON_VALUE"
  | "REST_OF_SEASON_RANK"
  | "DRAFT_RANKING"
  | "INJURY_STATUS"
  | "RANKING"
  | "KEEPER_VALUE"
  | "ROOKIE_VALUE"
  | "TRADE_VALUE"
  | "DRAFT_RANK"
  | "POSITION_RANK"
  | "TIER";

export type IntelligenceFormat = "DYNASTY" | "REDRAFT" | "AUCTION" | "KEEPER" | "ROOKIE";
export type IntelligenceMappingStatus = "RESOLVED" | "AMBIGUOUS" | "UNRESOLVED" | "NOT_APPLICABLE";
export type IntelligenceCoverage = "NO_DATA" | "PARTIAL" | "SUFFICIENT" | "STALE";
export type IntelligenceQualityState = "UNASSESSED" | "COVERAGE_ONLY" | "HIGH_DISAGREEMENT";

export interface IntelligenceContext {
  readonly format?: IntelligenceFormat;
  readonly scoring?: string | null;
  readonly leagueSize?: number | null;
  readonly qbCount?: number | null;
  readonly tePremium?: boolean | null;
  readonly contextRef?: string | null;
}

export interface IntelligenceAttribution {
  readonly displayName: string;
  readonly url?: string | null;
  readonly text?: string | null;
}

export type IntelligenceValue =
  | { readonly kind: "NUMBER"; readonly value: number; readonly unit: "SCORE" | "USD" | "PICK_NUMBER" | "WEEKS" }
  | { readonly kind: "RANK"; readonly value: number; readonly scope: "OVERALL" | "POSITIONAL" }
  | { readonly kind: "TEXT"; readonly value: string }
  | { readonly kind: "STATUS"; readonly value: string };

export type IntelligenceFreshness = "CURRENT" | "STALE" | "HISTORICAL" | "UNRESOLVED";

export interface IntelligenceProviderDefinition {
  readonly provider: string;
  readonly displayName: string;
  readonly status: IntelligenceProviderStatus;
  readonly attributionRequired: boolean;
  readonly republishAllowed: boolean;
  readonly useCaseNote: string;
  readonly supportedCategories?: readonly IntelligenceMetricKind[];
  readonly supportedFormats?: readonly IntelligenceFormat[];
  readonly sourceMethod?: "FIXTURE_ONLY" | "MANUAL_IMPORT" | "AUTHORIZED_API" | "PENDING_REVIEW" | "INTERNAL";
  readonly termsNote?: string;
  readonly attribution?: IntelligenceAttribution | null;
}

export interface PlayerObservationSubject {
  readonly kind: "PLAYER";
  readonly hqPlayerId: string;
  readonly provider: PlayerProvider;
  readonly providerPlayerId: string;
}

export interface UnresolvedPlayerObservationSubject {
  readonly kind: "UNRESOLVED_PLAYER";
  readonly provider: PlayerProvider;
  readonly providerPlayerId: string;
  readonly reason: "NO_MAPPING" | "AMBIGUOUS_MAPPING" | "NON_CONFIRMED_MAPPING";
}

export interface DraftPickAsset {
  readonly assetType: "DRAFT_PICK";
  readonly assetId: string;
  readonly season: number;
  readonly round: number;
  readonly pickNumber: number | null;
  readonly originalFranchiseId: string | null;
}

export interface DraftPickObservationSubject {
  readonly kind: "DRAFT_PICK";
  readonly asset: DraftPickAsset;
}

export type IntelligenceObservationSubject =
  | PlayerObservationSubject
  | UnresolvedPlayerObservationSubject
  | DraftPickObservationSubject;

export interface IntelligenceObservation {
  readonly observationId: string;
  readonly provider: string;
  readonly metric: IntelligenceMetricKind;
  readonly subject: IntelligenceObservationSubject;
  readonly value: IntelligenceValue;
  readonly appliesToSeason: number;
  readonly period: "SEASON" | "REST_OF_SEASON" | "WEEK" | "DRAFT" | "HISTORICAL";
  readonly week?: number;
  readonly observedAt: string;
  readonly sourceRef: string;
  readonly freshness: IntelligenceFreshness;
  readonly normalization: readonly string[];
  readonly mappingStatus?: IntelligenceMappingStatus;
  readonly providerPlayerName?: string | null;
  readonly providerNflTeam?: string | null;
  readonly providerPosition?: string | null;
  readonly effectiveAt?: string | null;
  readonly publishedAt?: string | null;
  readonly context?: IntelligenceContext;
  readonly attribution?: IntelligenceAttribution | null;
  readonly rawMetadata?: Readonly<Record<string, unknown>>;
  readonly rawObservationRef?: string | null;
}

export interface IntelligenceSnapshot {
  readonly snapshotId: string;
  readonly provider: string;
  readonly observedAt: string;
  readonly fetchedAt: string;
  readonly appliesToSeason: number;
  readonly period: IntelligenceObservation["period"];
  readonly sourceRef: string;
  readonly freshness: IntelligenceFreshness;
  readonly transformationVersion: string;
  readonly observationIds: readonly string[];
  readonly observations: readonly IntelligenceObservation[];
}

export type IntelligenceSubjectInput =
  | {
      readonly kind: "PLAYER";
      readonly provider: PlayerProvider;
      readonly providerPlayerId: string;
    }
  | DraftPickObservationSubject;
