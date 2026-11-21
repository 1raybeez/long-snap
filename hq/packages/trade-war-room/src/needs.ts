import type { ResolvedTeamContext, ResolvedTeamRosterAsset } from "./team-context.ts";

export type TeamNeedState = "CRITICAL_NEED" | "NEED" | "BALANCED" | "SURPLUS" | "STRONG_SURPLUS" | "UNKNOWN";

export interface PositionNeedSummary {
  readonly position: string;
  readonly state: TeamNeedState;
  readonly requiredStarters: number | null;
  readonly targetDepth: number | null;
  readonly knownStarterCount: number | null;
  readonly knownRosterCount: number | null;
  readonly explanation: string;
}

export interface TeamNeedsReport {
  readonly teamId: string;
  readonly positions: readonly PositionNeedSummary[];
  readonly unknown: boolean;
  readonly summary: string;
}

function countPosition(assets: readonly ResolvedTeamRosterAsset[], position: string): { roster: number; starters: number; starterStatusKnown: boolean } {
  const matching = assets.filter((entry) => entry.asset.assetType === "PLAYER" && entry.asset.position === position);
  return {
    roster: matching.length,
    starters: matching.filter((entry) => entry.rosterRole === "STARTER").length,
    starterStatusKnown: matching.every((entry) => entry.rosterRole !== "UNKNOWN"),
  };
}

export function deriveTeamNeeds(context: ResolvedTeamContext): TeamNeedsReport {
  const requirements = context.rosterConfig?.requirements ?? [];
  if (requirements.length === 0) return { teamId: context.teamId, positions: [], unknown: true, summary: "Positional needs and surplus are UNKNOWN because roster requirements were not supplied." };
  const positions = requirements.map((requirement) => {
    const counts = countPosition(context.rosterAssets, requirement.position);
    const targetDepth = requirement.targetDepth ?? requirement.requiredStarters;
    if (!counts.starterStatusKnown) return { position: requirement.position, state: "UNKNOWN" as const, requiredStarters: requirement.requiredStarters, targetDepth, knownStarterCount: null, knownRosterCount: counts.roster, explanation: "Starter/depth role data is incomplete." };
    const starterGap = requirement.requiredStarters - counts.starters;
    if (starterGap > 0) return { position: requirement.position, state: starterGap >= requirement.requiredStarters ? "CRITICAL_NEED" as const : "NEED" as const, requiredStarters: requirement.requiredStarters, targetDepth, knownStarterCount: counts.starters, knownRosterCount: counts.roster, explanation: `${starterGap} required starter slot${starterGap === 1 ? "" : "s"} remain open.` };
    const excess = counts.roster - targetDepth;
    if (excess >= 2) return { position: requirement.position, state: "STRONG_SURPLUS" as const, requiredStarters: requirement.requiredStarters, targetDepth, knownStarterCount: counts.starters, knownRosterCount: counts.roster, explanation: `${excess} player${excess === 1 ? "" : "s"} exceed the configured target depth.` };
    if (excess === 1) return { position: requirement.position, state: "SURPLUS" as const, requiredStarters: requirement.requiredStarters, targetDepth, knownStarterCount: counts.starters, knownRosterCount: counts.roster, explanation: "One player exceeds the configured target depth." };
    return { position: requirement.position, state: "BALANCED" as const, requiredStarters: requirement.requiredStarters, targetDepth, knownStarterCount: counts.starters, knownRosterCount: counts.roster, explanation: "Known starters and depth meet the configured requirement." };
  });
  return { teamId: context.teamId, positions, unknown: positions.some((position) => position.state === "UNKNOWN"), summary: positions.map((position) => `${position.position}: ${position.state}`).join(", ") };
}

export function needForPosition(report: TeamNeedsReport, position: string): PositionNeedSummary | null {
  return report.positions.find((entry) => entry.position === position) ?? null;
}
