import {
  resolveProviderPlayer,
  type PlayerProvider,
} from "../../player-identity/src/index.ts";
import type {
  IntelligenceMetricKind,
  IntelligenceObservation,
  IntelligenceObservationSubject,
  IntelligenceSubjectInput,
  IntelligenceValue,
} from "./types.ts";

export function resolveObservationSubject(input: IntelligenceSubjectInput): IntelligenceObservationSubject {
  if (input.kind === "DRAFT_PICK") return input;
  const resolution = resolveProviderPlayer(input.provider, input.providerPlayerId);
  if (resolution.status === "RESOLVED") {
    return {
      kind: "PLAYER",
      hqPlayerId: resolution.player.hqPlayerId,
      provider: input.provider,
      providerPlayerId: input.providerPlayerId,
    };
  }
  return {
    kind: "UNRESOLVED_PLAYER",
    provider: input.provider,
    providerPlayerId: input.providerPlayerId,
    reason: resolution.reason,
  };
}

export function observationIdentity(observation: Pick<IntelligenceObservation, "provider" | "metric" | "subject" | "appliesToSeason" | "period" | "week" | "observedAt">): string {
  const subject = observation.subject.kind === "PLAYER"
    ? `player:${observation.subject.hqPlayerId}`
    : observation.subject.kind === "UNRESOLVED_PLAYER"
      ? `unresolved:${observation.subject.provider}:${observation.subject.providerPlayerId}`
      : observation.subject.asset.assetId;
  return [observation.provider, observation.metric, subject, observation.appliesToSeason, observation.period, observation.week ?? "", observation.observedAt].join("|");
}

export function createObservation(input: {
  readonly observationId?: string;
  readonly provider: string;
  readonly metric: IntelligenceMetricKind;
  readonly subject: IntelligenceSubjectInput;
  readonly value: IntelligenceValue;
  readonly appliesToSeason: number;
  readonly period: IntelligenceObservation["period"];
  readonly week?: number;
  readonly observedAt: string;
  readonly sourceRef: string;
  readonly freshness: IntelligenceObservation["freshness"];
  readonly normalization?: readonly string[];
  readonly providerPlayerName?: string | null;
  readonly providerNflTeam?: string | null;
  readonly providerPosition?: string | null;
  readonly effectiveAt?: string | null;
  readonly publishedAt?: string | null;
  readonly context?: import("./types.ts").IntelligenceContext;
  readonly attribution?: import("./types.ts").IntelligenceAttribution | null;
  readonly rawMetadata?: Readonly<Record<string, unknown>>;
  readonly rawObservationRef?: string | null;
}): IntelligenceObservation {
  const subject = resolveObservationSubject(input.subject);
  const base = {
    provider: input.provider,
    metric: input.metric,
    subject,
    appliesToSeason: input.appliesToSeason,
    period: input.period,
    week: input.week,
    observedAt: input.observedAt,
  };
  return {
    observationId: input.observationId ?? observationIdentity(base),
    ...base,
    value: input.value,
    sourceRef: input.sourceRef,
    freshness: input.freshness,
    normalization: input.normalization ?? [],
    mappingStatus: subject.kind === "PLAYER" ? "RESOLVED" : subject.kind === "UNRESOLVED_PLAYER" ? subject.reason === "AMBIGUOUS_MAPPING" ? "AMBIGUOUS" : "UNRESOLVED" : "NOT_APPLICABLE",
    providerPlayerName: input.providerPlayerName ?? null,
    providerNflTeam: input.providerNflTeam ?? null,
    providerPosition: input.providerPosition ?? null,
    effectiveAt: input.effectiveAt ?? input.observedAt,
    publishedAt: input.publishedAt ?? null,
    context: input.context,
    attribution: input.attribution ?? null,
    rawMetadata: input.rawMetadata,
    rawObservationRef: input.rawObservationRef ?? input.sourceRef,
  };
}

export function createSnapshot(input: {
  readonly snapshotId: string;
  readonly provider: string;
  readonly observedAt: string;
  readonly fetchedAt: string;
  readonly appliesToSeason: number;
  readonly period: IntelligenceObservation["period"];
  readonly sourceRef: string;
  readonly freshness: IntelligenceObservation["freshness"];
  readonly transformationVersion: string;
  readonly observations: readonly IntelligenceObservation[];
}): import("./types.ts").IntelligenceSnapshot {
  return {
    ...input,
    observationIds: input.observations.map((observation) => observation.observationId),
  };
}

export function providerForPlayerInput(provider: PlayerProvider): PlayerProvider {
  return provider;
}
