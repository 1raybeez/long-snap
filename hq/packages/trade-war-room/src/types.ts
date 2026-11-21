import type { AuctionKeeperContext, EvaluationOutput, EvaluationPurpose, DynastyStrategicHorizon, EvaluationTeamContext } from "../../evaluation-profiles/src/types.ts";
import type { DraftPickAsset } from "../../fantasy-intelligence/src/types.ts";
import type { PlayerProvider } from "../../player-identity/src/types.ts";
import type { CapabilityState, LeagueFormat } from "../../league-registry/src/types.ts";

export type TradeAssetType = "PLAYER" | "DRAFT_PICK" | "FAAB";

export interface PlayerTradeAssetInput {
  readonly assetType: "PLAYER";
  readonly hqPlayerId?: string;
  readonly provider?: PlayerProvider;
  readonly providerPlayerId?: string;
}

export interface DraftPickTradeAssetInput {
  readonly assetType: "DRAFT_PICK";
  readonly asset: DraftPickAsset;
}

export interface FaabTradeAssetInput {
  readonly assetType: "FAAB";
  readonly amount: number;
}

export type TradeAssetInput = PlayerTradeAssetInput | DraftPickTradeAssetInput | FaabTradeAssetInput;

export interface TradeSideInput {
  readonly assets: readonly TradeAssetInput[];
}

export interface TradeRequest {
  readonly leagueId: string;
  readonly season: number;
  readonly sideA: TradeSideInput;
  readonly sideB: TradeSideInput;
  readonly strategicHorizon?: DynastyStrategicHorizon;
  readonly auctionKeeperContext?: AuctionKeeperContext;
  /** Optional roster inputs. Absence must remain an explicit UNKNOWN, never an inference. */
  readonly teamContext?: EvaluationTeamContext;
  readonly resolvedTeamContexts?: {
    readonly sideA: import("./team-context.ts").ResolvedTeamContext;
    readonly sideB: import("./team-context.ts").ResolvedTeamContext;
  };
  readonly riverKeeperInputs?: readonly import("./river-keeper.ts").RiverKeeperInput[];
  readonly packageMarketEvidence?: readonly import("./contracts.ts").TradeMarketEvidence[];
  readonly purpose?: EvaluationPurpose;
  readonly observations?: readonly import("../../fantasy-intelligence/src/types.ts").IntelligenceObservation[];
  readonly snapshotIds?: readonly string[];
  readonly freshnessRequirement?: "CURRENT_ONLY" | "ALLOW_STALE" | "HISTORICAL_ALLOWED";
  /** Optional participants for multi-team analysis; sideA/sideB remain the two-team compatibility shape. */
  readonly participants?: readonly TradeParticipant[];
}

export type NormalizedTradeAsset =
  | {
      readonly assetType: "PLAYER";
      readonly assetId: string;
      readonly hqPlayerId: string;
      readonly displayName: string;
      readonly position: string;
      readonly provider: PlayerProvider | null;
      readonly providerPlayerId: string | null;
    }
  | {
      readonly assetType: "DRAFT_PICK";
      readonly assetId: string;
      readonly asset: DraftPickAsset;
    }
  | {
      readonly assetType: "FAAB";
      readonly assetId: string;
      readonly amount: number;
    };

export type TradePlayerAsset = Extract<NormalizedTradeAsset, { readonly assetType: "PLAYER" }>;
export type TradePickAsset = Extract<NormalizedTradeAsset, { readonly assetType: "DRAFT_PICK" }>;
export type TradeFaabAsset = Extract<NormalizedTradeAsset, { readonly assetType: "FAAB" }>;
export type TradeAsset = NormalizedTradeAsset;

export interface TradeParticipant {
  readonly participantId: string;
  readonly teamContext?: import("./team-context.ts").ResolvedTeamContext;
  readonly side: TradeSideInput;
}

export interface TradeSide {
  readonly participantId: string;
  readonly assets: readonly TradeAsset[];
}

export interface TradeSideAnalysis {
  readonly assets: readonly NormalizedTradeAsset[];
  readonly evaluation: EvaluationOutput | null;
}

export type TradeComparisonState =
  | "SIDE_A_ADVANTAGE"
  | "SIDE_B_ADVANTAGE"
  | "ROUGHLY_BALANCED"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

export interface TradeDimensionComparison {
  readonly state: TradeComparisonState;
  readonly method: "DIRECT_SAME_METRIC_OBSERVATION" | "STRUCTURED_STATE" | "NOT_APPLICABLE" | "UNKNOWN";
  readonly sideAObservationIds: readonly string[];
  readonly sideBObservationIds: readonly string[];
  readonly metric?: string;
  readonly unit?: string;
  readonly sideAObservedTotal?: number;
  readonly sideBObservedTotal?: number;
  readonly explanation: string;
}

export interface TradeAnalysisResult {
  readonly status: "ANALYZED" | "UNSUPPORTED_LEAGUE" | "OUT_OF_SCOPE" | "CAPABILITY_UNAVAILABLE" | "INVALID_ASSETS";
  readonly leagueId: string;
  readonly leagueName: string | null;
  readonly format: LeagueFormat | null;
  readonly season: number;
  readonly tradeCapability: CapabilityState | "UNKNOWN";
  readonly sideA: TradeSideAnalysis;
  readonly sideB: TradeSideAnalysis;
  readonly rosterImpact?: {
    readonly sideA: import("./roster-impact.ts").RosterImpactSummary;
    readonly sideB: import("./roster-impact.ts").RosterImpactSummary;
  };
  readonly marketEvidence?: readonly import("./contracts.ts").TradeAssetMarketEvidence[];
  readonly lineupImpact?: {
    readonly sideA: import("./lineup-transformation.ts").SharedLineupTransformation;
    readonly sideB: import("./lineup-transformation.ts").SharedLineupTransformation;
  };
  readonly fairness?: import("./contracts.ts").TradeFairnessSummary;
  readonly keeperOutlook?: import("./contracts.ts").TradeKeeperOutlook;
  readonly recommendations?: readonly import("./contracts.ts").TradeRecommendation[];
  readonly comparisons: Readonly<{
    readonly currentValue: TradeDimensionComparison;
    readonly futureValue: TradeDimensionComparison;
    readonly keeperValue: TradeDimensionComparison;
    readonly draftCapital: TradeDimensionComparison;
  }>;
  readonly strategicHorizon: DynastyStrategicHorizon | null;
  readonly missingData: readonly string[];
  readonly warnings: readonly string[];
  readonly unsupportedAssets: readonly string[];
  readonly provenance: {
    readonly snapshotIds: readonly string[];
    readonly observationIds: readonly string[];
    readonly freshness: readonly string[];
  };
  readonly usableAnalysis: UsableTradeAnalysis;
}

export type UsableAnalysisStatus = "ANALYSIS_COMPLETE" | "ANALYSIS_PARTIAL" | "INSUFFICIENT_DATA" | "UNSUPPORTED";
export type AnalysisDimensionKey = "CURRENT_VALUE" | "FUTURE_VALUE" | "DRAFT_CAPITAL" | "KEEPER_VALUE" | "MARKET_VALUE" | "LINEUP_IMPACT" | "DEPTH_IMPACT" | "POSITIONAL_IMPACT" | "RISK";
export type AnalysisAdvantage = "SIDE_A" | "SIDE_B" | "BALANCED" | "UNKNOWN" | "NOT_APPLICABLE";
export type AnalysisConfidence = "HIGH" | "MODERATE" | "LOW" | "INSUFFICIENT";

export interface TradeAnalysisWarning {
  readonly code: "STALE_INTELLIGENCE" | "UNRESOLVED_ASSET" | "MISSING_KEEPER_CONTEXT" | "MISSING_DYNASTY_FUTURE_VALUE" | "MISSING_DRAFT_PICK_VALUATION" | "MISSING_ROSTER_CONTEXT" | "UNSUPPORTED_ASSET" | "INSUFFICIENT_COMPARABLE_OBSERVATIONS";
  readonly severity: "WARNING" | "INFO";
  readonly message: string;
  readonly relatedAssetIds: readonly string[];
}

export interface TradeDimensionSummary {
  readonly state: TradeComparisonState;
  readonly advantage: AnalysisAdvantage;
  readonly confidence: AnalysisConfidence;
  readonly inputsUsed: readonly string[];
  readonly missingInputs: readonly string[];
  readonly explanation: string;
}

export interface TradeSideSummary {
  readonly assetsSent: readonly NormalizedTradeAsset[];
  readonly assetsReceived: readonly NormalizedTradeAsset[];
  readonly gainedAssetIds: readonly string[];
  readonly lostAssetIds: readonly string[];
  readonly sentObservedCurrentValue: number | null;
  readonly receivedObservedCurrentValue: number | null;
  readonly sentObservedFutureValue: number | null;
  readonly receivedObservedFutureValue: number | null;
  readonly sentObservedDraftCapitalValue: number | null;
  readonly receivedObservedDraftCapitalValue: number | null;
  readonly playerCount: number;
  readonly draftPickCount: number;
  readonly faabAmount: number;
  readonly keeperContextCompleteness: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE";
  readonly unresolvedAssets: readonly string[];
  readonly missingIntelligence: readonly string[];
}

export interface RosterImpactSummary {
  readonly state: "OBSERVED" | "UNKNOWN" | "NOT_APPLICABLE";
  readonly missingInputs: readonly string[];
  readonly explanation: string;
}

export interface TradeDataQualitySummary {
  readonly state: "HIGH" | "MODERATE" | "LOW" | "INSUFFICIENT";
  readonly resolvedAssetCount: number;
  readonly unresolvedAssetCount: number;
  readonly missingObservationCount: number;
  readonly staleObservationCount: number;
  readonly provenanceComplete: boolean;
  readonly explanation: string;
}

export interface TradeExplanation {
  readonly summary: string;
  readonly sideA: readonly string[];
  readonly sideB: readonly string[];
  readonly dimensionAnalysis: readonly string[];
  readonly formatInterpretation: readonly string[];
  readonly strategyFit: readonly string[];
  readonly missingInformation: readonly string[];
  readonly attentionPoints: readonly string[];
  readonly humanReadable: string;
}

export interface UsableTradeAnalysis {
  readonly status: UsableAnalysisStatus;
  readonly summary: string;
  readonly sideA: TradeSideSummary;
  readonly sideB: TradeSideSummary;
  readonly dimensions: Readonly<Partial<Record<AnalysisDimensionKey, TradeDimensionSummary>>>;
  readonly formatInterpretation: readonly string[];
  readonly strategyFit: readonly string[];
  readonly rosterImpact: RosterImpactSummary;
  readonly dataQuality: TradeDataQualitySummary;
  readonly missingInformation: readonly string[];
  readonly warnings: readonly TradeAnalysisWarning[];
  readonly explanation: TradeExplanation;
}

export interface TradeCapabilityDecision {
  readonly state: CapabilityState | "UNKNOWN";
  readonly supported: boolean;
  readonly reason: string;
}
