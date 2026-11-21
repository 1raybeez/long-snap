import { createObservation } from "./observations.ts";
import type { IntelligenceMetricKind, IntelligenceObservation, IntelligenceSnapshot, IntelligenceSubjectInput } from "./types.ts";
import { MemoryIntelligenceRepository } from "./repository.ts";

export interface RawProviderObservation {
  readonly provider: string;
  readonly providerPlayerId?: string;
  readonly playerName?: string | null;
  readonly nflTeam?: string | null;
  readonly position?: string | null;
  readonly metric: IntelligenceMetricKind;
  readonly value: IntelligenceObservation["value"];
  readonly subject?: IntelligenceSubjectInput;
  readonly appliesToSeason: number;
  readonly period: IntelligenceObservation["period"];
  readonly week?: number;
  readonly observedAt: string;
  readonly effectiveAt?: string | null;
  readonly publishedAt?: string | null;
  readonly sourceRef: string;
  readonly freshness: IntelligenceObservation["freshness"];
  readonly context?: IntelligenceObservation["context"];
  readonly rawMetadata?: Readonly<Record<string, unknown>>;
}

export interface ProviderObservationAdapter<TRaw = unknown> {
  readonly provider: string;
  readonly fetch: (request: { readonly season: number; readonly category?: IntelligenceMetricKind }) => Promise<readonly TRaw[]>;
  readonly parse: (raw: TRaw) => RawProviderObservation;
}

export interface IngestResult {
  readonly snapshot: IntelligenceSnapshot;
  readonly observationCount: number;
  readonly resolvedMappings: number;
  readonly unresolvedMappings: number;
  readonly ambiguousMappings: number;
  readonly stored: boolean;
  readonly errors: readonly string[];
}

export async function ingestProviderObservations(input: {
  readonly adapter: ProviderObservationAdapter;
  readonly season: number;
  readonly category?: IntelligenceMetricKind;
  readonly snapshotId: string;
  readonly observedAt: string;
  readonly fetchedAt: string;
  readonly sourceRef: string;
  readonly freshness: IntelligenceObservation["freshness"];
  readonly transformationVersion: string;
  readonly repository?: MemoryIntelligenceRepository;
}): Promise<IngestResult> {
  const rawRows = await input.adapter.fetch({ season: input.season, category: input.category });
  const observations = rawRows.map((raw) => {
    const parsed = input.adapter.parse(raw);
    return createObservation({
      provider: parsed.provider,
      metric: parsed.metric,
      subject: parsed.subject ?? { kind: "PLAYER", provider: parsed.provider, providerPlayerId: parsed.providerPlayerId ?? "" },
      value: parsed.value,
      appliesToSeason: parsed.appliesToSeason,
      period: parsed.period,
      week: parsed.week,
      observedAt: parsed.observedAt,
      sourceRef: parsed.sourceRef,
      freshness: parsed.freshness,
      providerPlayerName: parsed.playerName,
      providerNflTeam: parsed.nflTeam,
      providerPosition: parsed.position,
      effectiveAt: parsed.effectiveAt,
      publishedAt: parsed.publishedAt,
      context: parsed.context,
      rawMetadata: parsed.rawMetadata,
      rawObservationRef: parsed.sourceRef,
    });
  });
  const snapshot: IntelligenceSnapshot = {
    snapshotId: input.snapshotId,
    provider: input.adapter.provider,
    observedAt: input.observedAt,
    fetchedAt: input.fetchedAt,
    appliesToSeason: input.season,
    period: observations[0]?.period ?? "SEASON",
    sourceRef: input.sourceRef,
    freshness: input.freshness,
    transformationVersion: input.transformationVersion,
    observationIds: observations.map((observation) => observation.observationId),
    observations,
  };
  const stored = input.repository?.append(snapshot);
  return {
    snapshot,
    observationCount: observations.length,
    resolvedMappings: observations.filter((observation) => observation.mappingStatus === "RESOLVED").length,
    unresolvedMappings: observations.filter((observation) => observation.mappingStatus === "UNRESOLVED").length,
    ambiguousMappings: observations.filter((observation) => observation.mappingStatus === "AMBIGUOUS").length,
    stored: stored?.accepted ?? false,
    errors: stored?.errors ?? [],
  };
}
