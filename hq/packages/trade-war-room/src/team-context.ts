import { getLeagueById, type LeagueRegistry } from "../../league-registry/src/index.ts";
import { isTradeAssetSupported } from "./capabilities.ts";
import { normalizeTradeAsset } from "./assets.ts";
import type { AuctionKeeperContext, DynastyStrategicHorizon } from "../../evaluation-profiles/src/types.ts";
import type { CanonicalPlayer } from "../../player-identity/src/types.ts";
import type { NormalizedTradeAsset, TradeAssetInput } from "./types.ts";

export type RosterRole = "STARTER" | "BENCH" | "IR" | "DEVELOPMENTAL" | "UNKNOWN";

export interface TeamRosterAssetInput {
  readonly asset: TradeAssetInput;
  readonly rosterRole?: RosterRole;
}

export interface PositionRequirement {
  readonly position: string;
  readonly requiredStarters: number;
  readonly targetDepth?: number;
  readonly flexEligible?: boolean;
  readonly eligiblePositions?: readonly string[];
}

export interface TeamRosterConfiguration {
  readonly requirements: readonly PositionRequirement[];
  readonly rosterSize?: number;
  readonly benchSlots?: number;
  readonly irSlots?: number;
  readonly leagueId?: string;
  readonly season?: number;
  readonly format?: string;
  readonly teamCount?: number;
  readonly starterSlots?: readonly string[];
  readonly starterCount?: number;
  readonly totalRosterSize?: number;
  readonly reserveSlots?: number;
  readonly taxiSlots?: number;
  readonly flexEligibility?: readonly string[];
  readonly superFlexEligibility?: readonly string[];
  readonly reserveEligibility?: readonly string[];
  readonly taxiEligibility?: readonly string[];
  readonly source?: string;
  readonly provenance?: readonly string[];
  readonly asOf?: string;
  readonly warnings?: readonly string[];
  readonly sourceProvider?: "SLEEPER" | "MANUAL";
  readonly sourceRef?: string;
  readonly version?: string;
}

export interface TeamContextInput {
  readonly leagueId: string;
  readonly season: number;
  readonly teamId: string;
  readonly rosterAssets: readonly TeamRosterAssetInput[];
  readonly rosterConfig?: TeamRosterConfiguration;
  readonly strategicHorizon?: DynastyStrategicHorizon;
  readonly auctionKeeperContext?: AuctionKeeperContext;
  readonly observations?: readonly import("../../fantasy-intelligence/src/types.ts").IntelligenceObservation[];
  readonly snapshotIds?: readonly string[];
  readonly canonicalPlayers?: readonly CanonicalPlayer[];
  readonly canonicalFranchiseId?: string | null;
  readonly teamSeasonId?: string | null;
  readonly providerRosterId?: string | null;
  readonly ownershipEvidence?: readonly string[];
  readonly unresolvedAssets?: readonly string[];
  readonly provider?: "SLEEPER" | "MANUAL";
  readonly freshness?: "CURRENT" | "STALE" | "UNKNOWN";
  readonly provenance?: readonly string[];
}

export interface ResolvedTeamRosterAsset {
  readonly asset: NormalizedTradeAsset;
  readonly rosterRole: RosterRole;
}

export interface ResolvedTeamContext {
  readonly leagueId: string;
  readonly season: number;
  readonly teamId: string;
  readonly rosterAssets: readonly ResolvedTeamRosterAsset[];
  readonly rosterConfig?: TeamRosterConfiguration;
  readonly canonicalPlayers?: readonly CanonicalPlayer[];
  readonly strategicHorizon?: DynastyStrategicHorizon;
  readonly auctionKeeperContext?: AuctionKeeperContext;
  readonly observations: readonly import("../../fantasy-intelligence/src/types.ts").IntelligenceObservation[];
  readonly snapshotIds: readonly string[];
  readonly canonicalFranchiseId: string | null;
  readonly teamSeasonId: string | null;
  readonly providerRosterId: string | null;
  readonly ownershipEvidence: readonly string[];
  readonly unresolvedAssets: readonly string[];
  readonly provider: "SLEEPER" | "MANUAL" | null;
  readonly freshness: "CURRENT" | "STALE" | "UNKNOWN";
  readonly provenance: readonly string[];
}

export interface TeamContextValidation {
  readonly ok: boolean;
  readonly context: ResolvedTeamContext | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function resolveTeamContext(input: TeamContextInput, registry: LeagueRegistry): TeamContextValidation {
  const league = getLeagueById(input.leagueId, registry);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!league) errors.push(`Unknown canonical league: ${input.leagueId}`);
  if (!input.teamId.trim()) errors.push("Team context requires a non-empty canonical team ID.");
  if (!Number.isInteger(input.season)) errors.push("Team context requires an integer season.");
  if (league && input.season !== league.currentSeason) warnings.push(`Team context season ${input.season} is not the registry current season ${league.currentSeason}.`);
  const rosterAssets: ResolvedTeamRosterAsset[] = [];
  const seen = new Set<string>();
  input.rosterAssets.forEach((entry, index) => {
    const support = league ? isTradeAssetSupported(input.leagueId, entry.asset.assetType, registry) : { supported: false, reason: "Unknown league" };
    if (!support.supported) {
      errors.push(`rosterAssets[${index}] ${entry.asset.assetType}: ${support.reason}`);
      return;
    }
    const normalized = normalizeTradeAsset(entry.asset, input.canonicalPlayers);
    if (!normalized.ok) {
      errors.push(`rosterAssets[${index}]: ${normalized.message}`);
      return;
    }
    if (seen.has(normalized.asset.assetId)) {
      errors.push(`Duplicate owned asset: ${normalized.asset.assetId}`);
      return;
    }
    seen.add(normalized.asset.assetId);
    rosterAssets.push({ asset: normalized.asset, rosterRole: entry.rosterRole ?? "UNKNOWN" });
  });
  if (!input.rosterConfig) warnings.push("Roster requirements were not supplied; positional needs and surplus remain UNKNOWN.");
  return {
    ok: errors.length === 0,
    context: errors.length === 0 ? {
      leagueId: input.leagueId,
      season: input.season,
      teamId: input.teamId,
      rosterAssets,
      rosterConfig: input.rosterConfig,
      canonicalPlayers: input.canonicalPlayers,
      strategicHorizon: input.strategicHorizon,
      auctionKeeperContext: input.auctionKeeperContext,
      observations: input.observations ?? [],
      snapshotIds: input.snapshotIds ?? [],
      canonicalFranchiseId: input.canonicalFranchiseId ?? null,
      teamSeasonId: input.teamSeasonId ?? null,
      providerRosterId: input.providerRosterId ?? null,
      ownershipEvidence: input.ownershipEvidence ?? [],
      unresolvedAssets: input.unresolvedAssets ?? [],
      provider: input.provider ?? null,
      freshness: input.freshness ?? "UNKNOWN",
      provenance: input.provenance ?? [],
    } : null,
    errors,
    warnings,
  };
}
