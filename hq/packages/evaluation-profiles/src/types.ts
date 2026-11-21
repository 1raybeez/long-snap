import type { LeagueFormat } from "../../league-registry/src/types.ts";
import type { IntelligenceObservation, IntelligenceValue } from "../../fantasy-intelligence/src/types.ts";

export type EvaluationPurpose = "TRADE" | "DRAFT" | "ROSTER" | "POWER_RANKING";

export type DynastyStrategicHorizon = "CONTEND_NOW" | "BALANCED" | "RETOOL" | "REBUILD";

export type EvaluationDimensionKey =
  | "currentValue"
  | "futureValue"
  | "lineupImpact"
  | "depthImpact"
  | "positionalImpact"
  | "marketValue"
  | "keeperValue"
  | "draftCapitalValue"
  | "risk"
  | "dataQuality";

export type EvaluationDimensionState = "OBSERVED" | "UNKNOWN" | "NOT_APPLICABLE" | "MISSING_INPUT";

export interface EvaluationSignal {
  readonly state: EvaluationDimensionState;
  readonly values: readonly IntelligenceValue[];
  readonly observationIds: readonly string[];
  readonly metricKinds: readonly IntelligenceObservation["metric"][];
  readonly explanation: string;
}

export type EvaluationDimensions = Readonly<Partial<Record<EvaluationDimensionKey, EvaluationSignal>>>;

export interface EvaluationTeamContext {
  readonly rosterId?: string;
  readonly hqPlayerIds?: readonly string[];
  readonly franchiseId?: string | null;
  readonly teamSeasonId?: string | null;
  readonly providerRosterId?: string | null;
  readonly starterPlayerIds?: readonly string[];
  readonly benchPlayerIds?: readonly string[];
  readonly irPlayerIds?: readonly string[];
  readonly developmentalPlayerIds?: readonly string[];
  readonly rosterRequirementsRef?: string | null;
  readonly provenance?: readonly string[];
}

export interface AuctionKeeperContext {
  readonly acquisitionCost?: number | null;
  readonly nextSeasonKeeperCost?: number | null;
  readonly keeperEligible?: boolean | null;
  readonly keeperPositionRestrictionsRef?: string | null;
  readonly auctionBudgetRemaining?: number | null;
}

export interface EvaluationContext {
  readonly leagueId: string;
  readonly season: number;
  readonly format: LeagueFormat;
  readonly scoringConfigRef?: string;
  readonly rosterConfigRef?: string;
  readonly teamContext?: EvaluationTeamContext;
  readonly purpose: EvaluationPurpose;
  readonly strategicHorizon?: DynastyStrategicHorizon;
  readonly auctionKeeperContext?: AuctionKeeperContext;
  readonly observations: readonly IntelligenceObservation[];
  readonly snapshotIds: readonly string[];
  readonly freshnessRequirement?: "CURRENT_ONLY" | "ALLOW_STALE" | "HISTORICAL_ALLOWED";
}

export interface EvaluationOutput {
  readonly evaluationId: string;
  readonly leagueId: string;
  readonly season: number;
  readonly format: LeagueFormat;
  readonly profileKey: string;
  readonly purpose: EvaluationPurpose;
  readonly strategicHorizon: DynastyStrategicHorizon | null;
  readonly dimensions: EvaluationDimensions;
  readonly inputsUsed: readonly string[];
  readonly missingInputs: readonly string[];
  readonly warnings: readonly string[];
  readonly provenance: {
    readonly snapshotIds: readonly string[];
    readonly observationIds: readonly string[];
    readonly freshness: readonly string[];
  };
}

export interface EvaluationProfile {
  readonly key: string;
  readonly format: LeagueFormat;
  readonly evaluate: (context: EvaluationContext) => EvaluationOutput;
}
