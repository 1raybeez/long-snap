import type { TradeAnalysisResult, TradeAssetInput } from "./types.ts";
import type { TeamContextInput, ResolvedTeamContext } from "./team-context.ts";
import type { TeamNeedsReport } from "./needs.ts";
import type { RosterImpactSummary } from "./roster-impact.ts";
import type { OfferGenerationReadiness } from "./offer-readiness.ts";

export type CandidateClassification = "MUTUAL_NEED_FIT" | "CONTENDER_REBUILDER_FIT" | "POSITIONAL_SWAP" | "DEPTH_FOR_STARTER" | "FUTURE_FOR_CURRENT" | "KEEPER_VALUE_SWAP" | "EXPLORATORY";

export interface CandidateGenerationConfig {
  readonly maxAssetsPerSide?: number;
  readonly maxCandidates?: number;
}

export interface CandidateOffer {
  readonly id: string;
  readonly sideAAssets: readonly TradeAssetInput[];
  readonly sideBAssets: readonly TradeAssetInput[];
  readonly classifications: readonly CandidateClassification[];
  readonly generationReasons: readonly string[];
  readonly teamNeedsAddressed: readonly string[];
  readonly newNeedsCreated: readonly string[];
  readonly rosterImpact: Readonly<{ sideA: RosterImpactSummary; sideB: RosterImpactSummary }>;
  readonly analysis: TradeAnalysisResult;
  readonly orderingBasis: readonly string[];
}

export interface TeamTradeFinderResult {
  readonly status: "FOUND" | "PARTIAL" | "INSUFFICIENT_DATA" | "UNSUPPORTED";
  readonly leagueId: string;
  readonly season: number;
  readonly teamA: ResolvedTeamContext | null;
  readonly teamB: ResolvedTeamContext | null;
  readonly teamANeeds: TeamNeedsReport | null;
  readonly teamBNeeds: TeamNeedsReport | null;
  readonly candidates: readonly CandidateOffer[];
  readonly warnings: readonly string[];
  readonly maxCandidates: number;
  readonly readiness: OfferGenerationReadiness;
}

export interface FindTradeOpportunitiesRequest {
  readonly teamA: TeamContextInput;
  readonly teamB: TeamContextInput;
  readonly generation?: CandidateGenerationConfig;
}

export interface FindOffersForTargetRequest {
  readonly teamA: TeamContextInput;
  readonly teamB: TeamContextInput;
  readonly targetAssets: readonly TradeAssetInput[];
  readonly generation?: CandidateGenerationConfig;
}
