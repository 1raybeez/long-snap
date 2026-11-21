import type { TradeKeeperEvidence, TradeKeeperOutlook } from "./contracts.ts";

export interface RiverKeeperInput {
  readonly assetId: string;
  readonly draftCost: number | null;
  readonly highestAcquisitionCost: number | null;
  readonly acquisitionCostApproved: boolean;
  readonly eligible?: boolean | null;
  readonly correction?: number;
  readonly provenance?: string;
}

/** River's reusable rule: higher cost basis, then +$10, with an explicit correction ledger. */
export function projectRiverKeeperCost(input: RiverKeeperInput): number | null {
  const basis = Math.max(input.draftCost ?? 0, input.highestAcquisitionCost ?? 0);
  if (input.draftCost === null && input.highestAcquisitionCost === null) return null;
  return basis + 10 + (input.correction ?? 0);
}

export function buildRiverKeeperOutlook(inputs: readonly RiverKeeperInput[]): TradeKeeperOutlook {
  const assets: TradeKeeperEvidence[] = inputs.map((input) => ({
    assetId: input.assetId,
    projectedNextSeasonCost: projectRiverKeeperCost(input),
    draftCost: input.draftCost,
    highestAcquisitionCost: input.highestAcquisitionCost,
    acquisitionCostApproved: input.acquisitionCostApproved,
    eligible: input.eligible ?? null,
    confidence: projectRiverKeeperCost(input) === null ? "UNAVAILABLE" : "HIGH",
    provenance: input.provenance ?? "river-keeper-adapter",
  }));
  const missing = assets.some((asset) => asset.projectedNextSeasonCost === null);
  const acquisitionBasisMissing = assets.some((asset) => !asset.acquisitionCostApproved);
  return { assets, confidence: missing ? "UNAVAILABLE" : "HIGH", fairnessGate: acquisitionBasisMissing ? "UNAVAILABLE_ACQUISITION_BASIS" : missing ? "UNAVAILABLE_ACQUISITION_BASIS" : "AVAILABLE" };
}
