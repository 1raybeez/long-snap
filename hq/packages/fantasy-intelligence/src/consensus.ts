import type { IntelligenceContext, IntelligenceCoverage, IntelligenceFreshness, IntelligenceMetricKind, IntelligenceObservation, IntelligenceQualityState } from "./types.ts";

export interface ConsensusInput {
  readonly observations: readonly IntelligenceObservation[];
  readonly expectedProviders?: readonly string[];
  readonly providerWeights?: Readonly<Record<string, number>>;
  readonly calculatedAt: string;
}

export interface ConsensusResult {
  readonly metric: IntelligenceMetricKind;
  readonly hqPlayerId: string;
  readonly context?: IntelligenceContext;
  readonly value: number | null;
  readonly unit: string | null;
  readonly contributingProviders: readonly string[];
  readonly providerCount: number;
  readonly coverage: IntelligenceCoverage;
  readonly freshness: IntelligenceFreshness;
  readonly dispersion: { readonly min: number | null; readonly max: number | null; readonly range: number | null };
  readonly qualityState: IntelligenceQualityState;
  readonly calculatedAt: string;
  readonly observationReferences: readonly string[];
}

function numeric(observation: IntelligenceObservation): { value: number; unit: string } | null {
  if (observation.value.kind === "NUMBER" || observation.value.kind === "RANK") return { value: observation.value.value, unit: observation.value.kind === "NUMBER" ? observation.value.unit : observation.value.scope };
  return null;
}

function contextKey(context: IntelligenceContext | undefined): string { return JSON.stringify(context ?? {}); }

export function calculateConsensus(input: ConsensusInput): readonly ConsensusResult[] {
  const groups = new Map<string, IntelligenceObservation[]>();
  for (const observation of input.observations) {
    if (observation.subject.kind !== "PLAYER") continue;
    const numericValue = numeric(observation);
    if (!numericValue) continue;
    const key = [observation.metric, observation.subject.hqPlayerId, contextKey(observation.context), numericValue.unit].join("|");
    const group = groups.get(key) ?? [];
    group.push(observation);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const values = group.map((observation) => numeric(observation)!.value);
    const weights = group.map((observation) => input.providerWeights?.[observation.provider] ?? 1);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const value = weightTotal > 0 ? group.reduce((sum, observation, index) => sum + numeric(observation)!.value * weights[index], 0) / weightTotal : null;
    const providers = [...new Set(group.map((observation) => observation.provider))].sort();
    const expected = input.expectedProviders?.length ?? providers.length;
    const coverage: IntelligenceCoverage = providers.length === 0 ? "NO_DATA" : providers.length < expected ? "PARTIAL" : "SUFFICIENT";
    const freshness: IntelligenceFreshness = group.some((observation) => observation.freshness === "STALE") ? "STALE" : group.every((observation) => observation.freshness === "HISTORICAL") ? "HISTORICAL" : "CURRENT";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const qualityState: IntelligenceQualityState = coverage === "PARTIAL" ? "COVERAGE_ONLY" : max - min > (Math.abs(value ?? 0) * 0.25) ? "HIGH_DISAGREEMENT" : "UNASSESSED";
    return {
      metric: group[0].metric,
      hqPlayerId: (group[0].subject.kind === "PLAYER" ? group[0].subject.hqPlayerId : ""),
      context: group[0].context,
      value,
      unit: numeric(group[0])!.unit,
      contributingProviders: providers,
      providerCount: providers.length,
      coverage,
      freshness,
      dispersion: { min, max, range: max - min },
      qualityState,
      calculatedAt: input.calculatedAt,
      observationReferences: group.map((observation) => observation.observationId),
    } satisfies ConsensusResult;
  });
}
