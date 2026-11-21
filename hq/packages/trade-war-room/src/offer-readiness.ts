import { normalizeMarketEvidence } from "./market-evidence-adapter.ts";
import type { ResolvedTeamContext } from "./team-context.ts";

export type RosterReadiness = "ROSTERS_READY" | "ROSTERS_INCOMPLETE" | "ROSTER_REQUIREMENTS_MISSING";
export type MarketReadiness = "MARKET_READY" | "MARKET_PARTIAL" | "MARKET_UNAVAILABLE";

export interface OfferGenerationReadiness {
  readonly roster: RosterReadiness;
  readonly market: MarketReadiness;
  readonly bothRostersResolved: boolean;
  readonly rostersPartiallyResolved: boolean;
  readonly unresolvedAssetCount: number;
  readonly rosterRequirementsAvailable: boolean;
  readonly candidateGenerationAvailable: boolean;
  readonly rankingAvailable: boolean;
  readonly reasons: readonly string[];
}

function rosterIsUsable(context: ResolvedTeamContext | null): boolean {
  return Boolean(context && context.rosterAssets.length > 0 && context.canonicalFranchiseId && context.teamSeasonId);
}

export function buildOfferGenerationReadiness(teamA: ResolvedTeamContext | null, teamB: ResolvedTeamContext | null): OfferGenerationReadiness {
  const bothRostersResolved = rosterIsUsable(teamA) && rosterIsUsable(teamB);
  const unresolvedAssetCount = (teamA?.unresolvedAssets.length ?? 0) + (teamB?.unresolvedAssets.length ?? 0);
  const rostersPartiallyResolved = unresolvedAssetCount > 0;
  const rosterRequirementsAvailable = Boolean(teamA?.rosterConfig && teamB?.rosterConfig);
  const roster = !bothRostersResolved ? "ROSTERS_INCOMPLETE" : !rosterRequirementsAvailable ? "ROSTER_REQUIREMENTS_MISSING" : "ROSTERS_READY";
  const contexts = [teamA, teamB].filter((context): context is ResolvedTeamContext => Boolean(context));
  const assets = new Set(contexts.flatMap((context) => context.rosterAssets.map((entry) => entry.asset.assetId)));
  const evidence = normalizeMarketEvidence(contexts.flatMap((context) => context.observations));
  const evidencedAssets = new Set(evidence.filter((entry) => entry.value !== null || entry.rank !== null).map((entry) => entry.assetId));
  const market: MarketReadiness = evidence.length === 0 ? "MARKET_UNAVAILABLE" : assets.size > 0 && evidencedAssets.size >= assets.size ? "MARKET_READY" : "MARKET_PARTIAL";
  const reasons: string[] = [];
  if (!bothRostersResolved) reasons.push("Both canonical team rosters must be resolved before generating offers.");
  if (bothRostersResolved && rostersPartiallyResolved) reasons.push(`${unresolvedAssetCount} provider player identit${unresolvedAssetCount === 1 ? "y remains" : "ies remain"} unresolved; valid canonical roster assets are still usable.`);
  if (bothRostersResolved && !rosterRequirementsAvailable) reasons.push("Explicit roster requirements are missing for one or both teams.");
  if (market === "MARKET_UNAVAILABLE") reasons.push("No market observations are available; bounded offers cannot be ranked.");
  if (market === "MARKET_PARTIAL") reasons.push("Market observations cover only part of the roster assets; offer ranking remains limited.");
  return { roster, market, bothRostersResolved, rostersPartiallyResolved, unresolvedAssetCount, rosterRequirementsAvailable, candidateGenerationAvailable: bothRostersResolved && rosterRequirementsAvailable, rankingAvailable: market === "MARKET_READY", reasons };
}
