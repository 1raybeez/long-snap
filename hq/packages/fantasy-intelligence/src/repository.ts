import { validateSnapshot } from "./validation.ts";
import type { IntelligenceMetricKind, IntelligenceObservation, IntelligenceSnapshot } from "./types.ts";

export interface IntelligenceQuery {
  readonly hqPlayerId?: string;
  readonly provider?: string;
  readonly metric?: IntelligenceMetricKind;
  readonly appliesToSeason?: number;
  readonly asOf?: string;
}

export interface SnapshotAppendResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly errors: readonly string[];
}

export class MemoryIntelligenceRepository {
  private readonly snapshots = new Map<string, IntelligenceSnapshot>();

  public append(snapshot: IntelligenceSnapshot): SnapshotAppendResult {
    const errors = validateSnapshot(snapshot);
    if (errors.length) return { accepted: false, duplicate: false, errors };
    if (this.snapshots.has(snapshot.snapshotId)) return { accepted: false, duplicate: true, errors: [] };
    this.snapshots.set(snapshot.snapshotId, snapshot);
    return { accepted: true, duplicate: false, errors: [] };
  }

  public listSnapshots(): readonly IntelligenceSnapshot[] { return [...this.snapshots.values()]; }

  public queryObservations(query: IntelligenceQuery = {}): readonly IntelligenceObservation[] {
    return this.listSnapshots().flatMap((snapshot) => snapshot.observations).filter((observation) => {
      if (query.hqPlayerId && (observation.subject.kind !== "PLAYER" || observation.subject.hqPlayerId !== query.hqPlayerId)) return false;
      if (query.provider && observation.provider !== query.provider) return false;
      if (query.metric && observation.metric !== query.metric) return false;
      if (query.appliesToSeason !== undefined && observation.appliesToSeason !== query.appliesToSeason) return false;
      if (query.asOf && Date.parse(observation.effectiveAt ?? observation.observedAt) > Date.parse(query.asOf)) return false;
      return true;
    });
  }

  public latest(query: Omit<IntelligenceQuery, "asOf"> = {}): IntelligenceObservation | null {
    return [...this.queryObservations(query)].sort((left, right) => Date.parse(right.effectiveAt ?? right.observedAt) - Date.parse(left.effectiveAt ?? left.observedAt))[0] ?? null;
  }

  public pointInTime(query: IntelligenceQuery): IntelligenceObservation | null {
    if (!query.asOf) throw new Error("pointInTime requires asOf");
    return [...this.queryObservations(query)].sort((left, right) => Date.parse(right.effectiveAt ?? right.observedAt) - Date.parse(left.effectiveAt ?? left.observedAt))[0] ?? null;
  }
}
