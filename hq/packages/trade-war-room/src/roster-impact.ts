import { deriveTeamNeeds, needForPosition, type PositionNeedSummary, type TeamNeedsReport } from "./needs.ts";
import type { ResolvedTeamContext, ResolvedTeamRosterAsset } from "./team-context.ts";
import type { NormalizedTradeAsset } from "./types.ts";

export type CandidateRosterRole = "PROJECTED_STARTER" | "LIKELY_STARTER" | "DEPTH" | "BENCH_DEVELOPMENTAL" | "UNKNOWN";

export interface RosterImpactSummary {
  readonly state: "OBSERVED" | "UNKNOWN";
  readonly receivedRoles: readonly { assetId: string; position: string | null; role: CandidateRosterRole }[];
  readonly starterGained: number | null;
  readonly starterLost: number | null;
  readonly depthGained: number | null;
  readonly depthLost: number | null;
  readonly improvedNeeds: readonly string[];
  readonly worsenedNeeds: readonly string[];
  readonly newNeeds: readonly string[];
  readonly warnings: readonly string[];
  readonly explanation: string;
}

function assetsWithout(context: ResolvedTeamContext, sent: readonly NormalizedTradeAsset[]): ResolvedTeamRosterAsset[] {
  const sentIds = new Set(sent.map((asset) => asset.assetId));
  return context.rosterAssets.filter((entry) => !sentIds.has(entry.asset.assetId));
}

function classifyIncoming(asset: NormalizedTradeAsset, postNeeds: TeamNeedsReport): CandidateRosterRole {
  if (asset.assetType !== "PLAYER") return "UNKNOWN";
  const need = needForPosition(postNeeds, asset.position);
  if (!need || need.state === "UNKNOWN") return "UNKNOWN";
  if (need.state === "CRITICAL_NEED") return "PROJECTED_STARTER";
  if (need.state === "NEED") return "LIKELY_STARTER";
  if (need.state === "BALANCED") return "DEPTH";
  return "BENCH_DEVELOPMENTAL";
}

function compareNeeds(before: TeamNeedsReport, after: TeamNeedsReport): { improved: string[]; worsened: string[]; newNeeds: string[] } {
  const improved: string[] = [];
  const worsened: string[] = [];
  const newNeeds: string[] = [];
  const rank = (state: PositionNeedSummary["state"]): number => ({ CRITICAL_NEED: 0, NEED: 1, BALANCED: 2, SURPLUS: 3, STRONG_SURPLUS: 4, UNKNOWN: -1 }[state]);
  for (const beforePosition of before.positions) {
    const afterPosition = needForPosition(after, beforePosition.position);
    if (!afterPosition || beforePosition.state === "UNKNOWN" || afterPosition.state === "UNKNOWN") continue;
    if (rank(afterPosition.state) > rank(beforePosition.state)) improved.push(beforePosition.position);
    if (rank(afterPosition.state) < rank(beforePosition.state)) worsened.push(beforePosition.position);
  }
  for (const afterPosition of after.positions) {
    const beforePosition = needForPosition(before, afterPosition.position);
    if (beforePosition && beforePosition.state !== "CRITICAL_NEED" && beforePosition.state !== "NEED" && (afterPosition.state === "CRITICAL_NEED" || afterPosition.state === "NEED")) newNeeds.push(afterPosition.position);
  }
  return { improved, worsened, newNeeds };
}

export function evaluateRosterImpact(
  context: ResolvedTeamContext,
  assetsSent: readonly NormalizedTradeAsset[],
  assetsReceived: readonly NormalizedTradeAsset[],
): RosterImpactSummary {
  const before = deriveTeamNeeds(context);
  if (before.unknown) return { state: "UNKNOWN", receivedRoles: assetsReceived.map((asset) => ({ assetId: asset.assetId, position: asset.assetType === "PLAYER" ? asset.position : null, role: "UNKNOWN" })), starterGained: null, starterLost: null, depthGained: null, depthLost: null, improvedNeeds: [], worsenedNeeds: [], newNeeds: [], warnings: ["Roster requirements or starter/depth context is incomplete."], explanation: "Roster impact is UNKNOWN because explicit roster requirements are unavailable or incomplete." };
  const preclassified = assetsReceived.map((asset) => ({ asset, rosterRole: classifyIncoming(asset, before) === "PROJECTED_STARTER" || classifyIncoming(asset, before) === "LIKELY_STARTER" ? "STARTER" as const : classifyIncoming(asset, before) === "DEPTH" || classifyIncoming(asset, before) === "BENCH_DEVELOPMENTAL" ? "BENCH" as const : "UNKNOWN" as const }));
  const postContext: ResolvedTeamContext = { ...context, rosterAssets: [...assetsWithout(context, assetsSent), ...preclassified] };
  const after = deriveTeamNeeds(postContext);
  const changes = compareNeeds(before, after);
  const receivedRoles = assetsReceived.map((asset) => ({ assetId: asset.assetId, position: asset.assetType === "PLAYER" ? asset.position : null, role: classifyIncoming(asset, before) }));
  const starterGained = receivedRoles.filter((entry) => entry.role === "PROJECTED_STARTER" || entry.role === "LIKELY_STARTER").length;
  const starterLost = assetsSent.filter((asset) => asset.assetType === "PLAYER" && context.rosterAssets.some((entry) => entry.asset.assetId === asset.assetId && entry.rosterRole === "STARTER")).length;
  const depthGained = receivedRoles.filter((entry) => entry.role === "DEPTH" || entry.role === "BENCH_DEVELOPMENTAL").length;
  const depthLost = assetsSent.filter((asset) => asset.assetType === "PLAYER" && context.rosterAssets.some((entry) => entry.asset.assetId === asset.assetId && (entry.rosterRole === "BENCH" || entry.rosterRole === "DEVELOPMENTAL"))).length;
  return { state: "OBSERVED", receivedRoles, starterGained, starterLost, depthGained, depthLost, improvedNeeds: changes.improved, worsenedNeeds: changes.worsened, newNeeds: changes.newNeeds, warnings: changes.newNeeds.length > 0 ? [`Candidate creates new positional need: ${changes.newNeeds.join(", ")}.`] : [], explanation: `${starterGained} likely/projected starter asset${starterGained === 1 ? "" : "s"} received; ${changes.improved.length} positional need${changes.improved.length === 1 ? "" : "s"} improved.` };
}
