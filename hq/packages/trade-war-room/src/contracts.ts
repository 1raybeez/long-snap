import type { LeagueFormat } from "../../league-registry/src/types.ts";
import type { EvaluationContext, EvaluationOutput } from "../../evaluation-profiles/src/types.ts";
import type { IntelligenceCoverage, IntelligenceFreshness } from "../../fantasy-intelligence/src/types.ts";
import type { ResolvedTeamContext } from "./team-context.ts";
import type { TradeAsset, TradeParticipant, TradePlayerAsset } from "./types.ts";

export type TradeReasonCode =
  | "STARTER_IMPROVEMENT"
  | "FILLS_POSITIONAL_NEED"
  | "DEPTH_GAIN"
  | "DEPTH_LOSS"
  | "CURRENT_VALUE_GAIN"
  | "FUTURE_VALUE_GAIN"
  | "KEEPER_SURPLUS_GAIN"
  | "KEEPER_COST_RISK"
  | "ACQUISITION_COST_ADVANTAGE"
  | "AGE_TIMELINE_FIT"
  | "PICK_CAPITAL_GAIN"
  | "POSITIONAL_SCARCITY"
  | "MARKET_DISAGREEMENT"
  | "LOW_DATA_COVERAGE"
  | "STALE_DATA"
  | "OWNERSHIP_MISMATCH"
  | "UNRESOLVED_ASSET";

export interface TradeReason {
  readonly code: TradeReasonCode;
  readonly message: string;
  readonly assetIds?: readonly string[];
  readonly evidenceIds?: readonly string[];
}

export type TradeWarningCode = "MISSING_CONTEXT" | "STALE_DATA" | "UNRESOLVED_ASSET" | "OWNERSHIP_MISMATCH" | "PROFILE_NOT_APPLICABLE" | "LOW_COVERAGE";

export interface TradeWarning {
  readonly code: TradeWarningCode;
  readonly message: string;
  readonly severity: "INFO" | "WARNING" | "BLOCKING";
  readonly assetIds?: readonly string[];
}

export interface TradeCoverage {
  readonly state: IntelligenceCoverage | "COMPLETE" | "UNAVAILABLE";
  readonly resolvedAssetCount: number;
  readonly unresolvedAssetCount: number;
  readonly observationCount: number;
  readonly staleObservationCount: number;
  readonly provenanceComplete: boolean;
}

export interface TradeMarketEvidence {
  readonly assetId: string;
  readonly playerId?: string;
  readonly source: string;
  readonly valuationMode: "CURRENT" | "REST_OF_SEASON" | "DYNASTY" | "REDRAFT" | "AUCTION" | "PICK";
  readonly value: number | null;
  readonly rank: number | null;
  readonly observedAt: string | null;
  readonly freshness: IntelligenceFreshness | "UNKNOWN";
  readonly sourceCount: number;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
  readonly coverage: IntelligenceCoverage;
  readonly licensing: "APPROVED" | "PENDING_REVIEW" | "INTERNAL" | "UNAVAILABLE";
  readonly provenance: string;
}

export type TradeAssetEvidenceState = "RESOLVED_WITH_VALUE" | "RESOLVED_WITH_PARTIAL_EVIDENCE" | "RESOLVED_NO_MARKET_EVIDENCE" | "UNRESOLVED_IDENTITY";

export interface TradeAssetMarketEvidence {
  readonly assetId: string;
  readonly state: TradeAssetEvidenceState;
  readonly values: readonly TradeMarketEvidence[];
  readonly warning: string | null;
}

export interface TradeKeeperEvidence {
  readonly assetId: string;
  readonly projectedNextSeasonCost: number | null;
  readonly draftCost: number | null;
  readonly highestAcquisitionCost: number | null;
  readonly acquisitionCostApproved: boolean;
  readonly eligible: boolean | null;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
  readonly provenance: string;
}

export interface TradeKeeperOutlook {
  readonly assets: readonly TradeKeeperEvidence[];
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
  readonly fairnessGate: "AVAILABLE" | "UNAVAILABLE_ACQUISITION_BASIS" | "NOT_APPLICABLE";
}

export interface TradeFairnessSummary {
  readonly state: "AVAILABLE" | "UNAVAILABLE";
  readonly reason: string | null;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
}

export interface TradeRecommendation {
  readonly participant: "SIDE_A" | "SIDE_B";
  readonly direction: "ACCEPT" | "LEAN_ACCEPT" | "HOLD" | "LEAN_DECLINE" | "DECLINE" | "UNAVAILABLE";
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
  readonly reasons: readonly TradeReason[];
}

export interface TradeEvaluationProfile {
  readonly key: string;
  readonly format: LeagueFormat;
  readonly supportedAssetTypes: readonly TradeAsset["assetType"][];
  readonly requiredContext: readonly ("ROSTER" | "MARKET" | "KEEPER" | "DYNASTY" | "LINEUP")[];
  readonly optionalContext: readonly ("ROSTER" | "MARKET" | "KEEPER" | "DYNASTY" | "LINEUP")[];
  readonly dimensions: readonly string[];
  readonly evaluates: (context: EvaluationContext) => EvaluationOutput;
}

export interface ResolvedTradeTeamContext extends ResolvedTeamContext {
  readonly canonicalFranchiseId: string | null;
  readonly teamSeasonId: string | null;
  readonly providerRosterId: string | null;
  readonly ownershipEvidence: readonly string[];
  readonly unresolvedAssets: readonly string[];
}

export interface GeneratedOffer {
  readonly offerId: string;
  readonly fromParticipantId: string;
  readonly toParticipantId: string;
  readonly outgoing: readonly TradeAsset[];
  readonly incoming: readonly TradeAsset[];
  readonly reasons: readonly TradeReason[];
  readonly warnings: readonly TradeWarning[];
  readonly rankingStatus: "BOUNDED_UNRANKED";
}

export interface MultiTeamTradeContract {
  readonly participants: readonly TradeParticipant[];
  readonly minParticipants: 2;
  readonly maxParticipants: 4;
}

export function validateMultiTeamParticipants(participants: readonly TradeParticipant[]): readonly string[] {
  const errors: string[] = [];
  if (participants.length < 2) errors.push("A trade requires at least two participants.");
  if (participants.length > 4) errors.push("The shared trade contract supports at most four participants.");
  const ids = participants.map((participant) => participant.participantId);
  if (new Set(ids).size !== ids.length) errors.push("Trade participant IDs must be unique.");
  if (participants.some((participant) => participant.side.assets.length === 0)) errors.push("Every trade participant must declare at least one outgoing asset.");
  return errors;
}

export function isTradePlayerAsset(asset: TradeAsset): asset is TradePlayerAsset {
  return asset.assetType === "PLAYER";
}
