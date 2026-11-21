import type { IntelligenceObservation } from "../../fantasy-intelligence/src/types.ts";
import type { TradeCoverage, TradeMarketEvidence } from "./contracts.ts";

function modeFor(observation: IntelligenceObservation): TradeMarketEvidence["valuationMode"] {
  if (observation.metric === "DYNASTY_PLAYER_VALUE") return "DYNASTY";
  if (observation.metric === "DYNASTY_PICK_VALUE") return "PICK";
  if (observation.metric === "AUCTION_VALUE") return "AUCTION";
  if (observation.metric === "REDRAFT_PLAYER_VALUE") return "REDRAFT";
  if (observation.metric === "REST_OF_SEASON_VALUE" || observation.metric === "REST_OF_SEASON_RANK") return "REST_OF_SEASON";
  return "CURRENT";
}

export function normalizeMarketEvidence(observations: readonly IntelligenceObservation[]): readonly TradeMarketEvidence[] {
  return observations.flatMap((observation) => {
    const subject = observation.subject;
    const assetId = subject.kind === "PLAYER" ? subject.hqPlayerId : subject.kind === "DRAFT_PICK" ? subject.asset.assetId : null;
    if (!assetId) return [];
    const value = observation.value.kind === "NUMBER" && observation.value.unit === "SCORE" ? observation.value.value : null;
    const rank = observation.value.kind === "RANK" ? observation.value.value : null;
    const confidence = observation.freshness === "CURRENT" && value !== null ? "HIGH" : value !== null ? "MEDIUM" : rank !== null ? "LOW" : "UNAVAILABLE";
    return [{
      assetId,
      playerId: subject.kind === "PLAYER" ? subject.hqPlayerId : undefined,
      source: observation.provider,
      valuationMode: modeFor(observation),
      value,
      rank,
      observedAt: observation.observedAt,
      freshness: observation.freshness,
      sourceCount: 1,
      confidence,
      coverage: observation.freshness === "STALE" ? "STALE" : value !== null || rank !== null ? "SUFFICIENT" : "NO_DATA",
      licensing: observation.attribution ? "APPROVED" : "INTERNAL",
      provenance: observation.sourceRef,
    } satisfies TradeMarketEvidence];
  });
}

export function summarizeTradeCoverage(observations: readonly IntelligenceObservation[], resolvedAssetCount: number, unresolvedAssetCount: number): TradeCoverage {
  const normalized = normalizeMarketEvidence(observations);
  const staleObservationCount = normalized.filter((entry) => entry.freshness === "STALE").length;
  const state = normalized.length === 0 ? "NO_DATA" : staleObservationCount === normalized.length ? "STALE" : normalized.some((entry) => entry.coverage === "NO_DATA") ? "PARTIAL" : "SUFFICIENT";
  return { state, resolvedAssetCount, unresolvedAssetCount, observationCount: normalized.length, staleObservationCount, provenanceComplete: normalized.every((entry) => entry.provenance.length > 0) };
}
