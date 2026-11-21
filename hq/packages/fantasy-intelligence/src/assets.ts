export function createDraftPickAsset(input: {
  readonly season: number;
  readonly round: number;
  readonly pickNumber?: number | null;
  readonly originalFranchiseId?: string | null;
}): {
  readonly assetType: "DRAFT_PICK";
  readonly assetId: string;
  readonly season: number;
  readonly round: number;
  readonly pickNumber: number | null;
  readonly originalFranchiseId: string | null;
} {
  const pickNumber = input.pickNumber ?? null;
  const originalFranchiseId = input.originalFranchiseId ?? null;
  return {
    assetType: "DRAFT_PICK",
    assetId: `pick:${input.season}:round-${input.round}:${pickNumber === null ? "unspecified" : `pick-${pickNumber}`}:${originalFranchiseId ?? "unspecified"}`,
    season: input.season,
    round: input.round,
    pickNumber,
    originalFranchiseId,
  };
}
