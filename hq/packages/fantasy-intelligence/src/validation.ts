import { getIntelligenceProvider } from "./providers.ts";
import type { IntelligenceObservation, IntelligenceSnapshot } from "./types.ts";

export function validateObservations(observations: readonly IntelligenceObservation[]): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const identities = new Set<string>();

  for (const observation of observations) {
    if (ids.has(observation.observationId)) errors.push(`duplicate observation id: ${observation.observationId}`);
    ids.add(observation.observationId);

    const provider = getIntelligenceProvider(observation.provider);
    if (!provider) errors.push(`unknown intelligence provider: ${observation.provider}`);

    if (observation.subject.kind === "PLAYER" && !observation.subject.hqPlayerId) {
      errors.push(`${observation.observationId} has an empty HQ player id`);
    }
    if (observation.subject.kind === "DRAFT_PICK" && observation.subject.asset.assetType !== "DRAFT_PICK") {
      errors.push(`${observation.observationId} has an invalid draft pick subject`);
    }

    const identity = [
      observation.provider,
      observation.metric,
      observation.subject.kind === "PLAYER"
        ? observation.subject.hqPlayerId
        : observation.subject.kind === "UNRESOLVED_PLAYER"
          ? `${observation.subject.provider}:${observation.subject.providerPlayerId}`
          : observation.subject.asset.assetId,
      observation.appliesToSeason,
      observation.period,
      observation.week ?? "",
      observation.observedAt,
    ].join("|");
    if (identities.has(identity)) errors.push(`duplicate observation identity: ${identity}`);
    identities.add(identity);
  }

  return errors;
}

export function validateSnapshot(snapshot: IntelligenceSnapshot): readonly string[] {
  const errors = [...validateObservations(snapshot.observations)];
  if (new Set(snapshot.observationIds).size !== snapshot.observationIds.length) errors.push(`duplicate snapshot observation ids: ${snapshot.snapshotId}`);
  if (snapshot.observationIds.length !== snapshot.observations.length) errors.push(`snapshot observation index mismatch: ${snapshot.snapshotId}`);
  if (snapshot.provider === "FANTASYCALC" && snapshot.freshness === "CURRENT" && !snapshot.sourceRef) errors.push("FantasyCalc snapshot requires a source reference");
  return errors;
}

export function assertValidSnapshot(snapshot: IntelligenceSnapshot): void {
  const errors = validateSnapshot(snapshot);
  if (errors.length > 0) throw new Error(`Invalid intelligence snapshot:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}
