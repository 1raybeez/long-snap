import { createObservation, createSnapshot } from "./observations.ts";
import type { IntelligenceSnapshot } from "./types.ts";

export const FANTASYCALC_FIXTURE_SNAPSHOT: IntelligenceSnapshot = createSnapshot({
  snapshotId: "fixture.fantasycalc.2026-09-01",
  provider: "FANTASYCALC",
  observedAt: "2026-09-01T12:00:00.000Z",
  fetchedAt: "2026-09-01T12:05:00.000Z",
  appliesToSeason: 2026,
  period: "SEASON",
  sourceRef: "fixture/fantasycalc/2026-09-01",
  freshness: "HISTORICAL",
  transformationVersion: "fixture-v1",
  observations: [
    createObservation({
      provider: "FANTASYCALC",
      metric: "DYNASTY_PLAYER_VALUE",
      subject: { kind: "PLAYER", provider: "FANTASYCALC", providerPlayerId: "fixture-fantasycalc-patrick-mahomes" },
      value: { kind: "NUMBER", value: 7200, unit: "SCORE" },
      appliesToSeason: 2026,
      period: "SEASON",
      observedAt: "2026-09-01T12:00:00.000Z",
      sourceRef: "fixture/fantasycalc/2026-09-01/patrick-mahomes",
      freshness: "HISTORICAL",
    }),
    createObservation({
      provider: "FANTASYCALC",
      metric: "DYNASTY_PICK_VALUE",
      subject: {
        kind: "DRAFT_PICK",
        asset: {
          assetType: "DRAFT_PICK",
          assetId: "pick:2027:round-1:unspecified:unspecified",
          season: 2027,
          round: 1,
          pickNumber: null,
          originalFranchiseId: null,
        },
      },
      value: { kind: "NUMBER", value: 5400, unit: "SCORE" },
      appliesToSeason: 2026,
      period: "SEASON",
      observedAt: "2026-09-01T12:00:00.000Z",
      sourceRef: "fixture/fantasycalc/2026-09-01/2027-first",
      freshness: "HISTORICAL",
    }),
  ],
});
