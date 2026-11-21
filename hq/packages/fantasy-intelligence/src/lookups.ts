import type { IntelligenceObservation, IntelligenceSnapshot } from "./types.ts";

export function getObservationById(
  observationId: string,
  snapshot: IntelligenceSnapshot,
): IntelligenceObservation | null {
  return snapshot.observations.find((observation) => observation.observationId === observationId) ?? null;
}

export function findPlayerObservations(
  hqPlayerId: string,
  snapshot: IntelligenceSnapshot,
): readonly IntelligenceObservation[] {
  return snapshot.observations.filter((observation) => observation.subject.kind === "PLAYER" && observation.subject.hqPlayerId === hqPlayerId);
}

export function getLatestSnapshot(
  snapshots: readonly IntelligenceSnapshot[],
  provider: string,
  season: number,
): IntelligenceSnapshot | null {
  return snapshots
    .filter((snapshot) => snapshot.provider === provider && snapshot.appliesToSeason === season)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] ?? null;
}
