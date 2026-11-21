import type { TradeAssetMarketEvidence, TradeReason } from "./contracts.ts";
import type { NormalizedTradeAsset } from "./types.ts";
import type { ResolvedTeamContext } from "./team-context.ts";

export interface SharedLineupTransformation {
  readonly state: "OBSERVED" | "PARTIAL" | "UNKNOWN";
  readonly startersBefore: readonly string[];
  readonly startersAfter: readonly string[];
  readonly startersEntering: readonly string[];
  readonly startersLeaving: readonly string[];
  readonly depthBefore: Readonly<Record<string, number>>;
  readonly depthAfter: Readonly<Record<string, number>>;
  readonly depthDelta: Readonly<Record<string, number>>;
  readonly positionStateBefore: Readonly<Record<string, "SURPLUS" | "ADEQUATE" | "THIN" | "UNKNOWN">>;
  readonly positionStateAfter: Readonly<Record<string, "SURPLUS" | "ADEQUATE" | "THIN" | "UNKNOWN">>;
  readonly reasons: readonly TradeReason[];
}

function playerAssets(context: ResolvedTeamContext, sent: readonly NormalizedTradeAsset[], received: readonly NormalizedTradeAsset[]) {
  const sentIds = new Set(sent.map((asset) => asset.assetId));
  return [...context.rosterAssets.filter((entry) => !sentIds.has(entry.asset.assetId)).map((entry) => entry.asset), ...received].filter((asset) => asset.assetType === "PLAYER");
}

function depth(players: readonly NormalizedTradeAsset[]) {
  return players.reduce<Record<string, number>>((result, asset) => { if (asset.assetType === "PLAYER") result[asset.position] = (result[asset.position] ?? 0) + 1; return result; }, {});
}

function allocate(players: readonly NormalizedTradeAsset[], context: ResolvedTeamContext, evidence: readonly TradeAssetMarketEvidence[]) {
  const slots = context.rosterConfig?.starterSlots ?? [];
  if (!slots.length) return { ids: [], known: false };
  const valueById = new Map(evidence.flatMap((entry) => entry.values.map((value) => [entry.assetId, value.value ?? (value.rank === null ? null : -value.rank)] as const)));
  const available = [...players].sort((a, b) => (valueById.get(b.assetId) ?? (b.assetType === "PLAYER" && context.rosterAssets.some((entry) => entry.asset.assetId === b.assetId && entry.rosterRole === "STARTER") ? 0.5 : 0)) - (valueById.get(a.assetId) ?? (a.assetType === "PLAYER" && context.rosterAssets.some((entry) => entry.asset.assetId === a.assetId && entry.rosterRole === "STARTER") ? 0.5 : 0)));
  const chosen: string[] = [];
  for (const slot of slots) {
    const eligible = available.find((asset) => asset.assetType === "PLAYER" && !chosen.includes(asset.assetId) && (slot === "FLEX" ? ["RB", "WR", "TE"].includes(asset.position) : asset.position === slot));
    if (eligible) chosen.push(eligible.assetId);
  }
  return { ids: chosen, known: true };
}

function states(players: readonly NormalizedTradeAsset[], context: ResolvedTeamContext) {
  const requirements = new Map((context.rosterConfig?.requirements ?? []).map((requirement) => [requirement.position, requirement.requiredStarters]));
  const counts = depth(players);
  return Object.fromEntries([...new Set([...requirements.keys(), ...Object.keys(counts)])].map((position) => {
    const count = counts[position] ?? 0;
    const required = requirements.get(position) ?? 0;
    return [position, !context.rosterConfig ? "UNKNOWN" : count > required + 1 ? "SURPLUS" : count >= required ? "ADEQUATE" : "THIN"];
  })) as Readonly<Record<string, "SURPLUS" | "ADEQUATE" | "THIN" | "UNKNOWN">>;
}

export function transformLineup(context: ResolvedTeamContext, sent: readonly NormalizedTradeAsset[], received: readonly NormalizedTradeAsset[], evidence: readonly TradeAssetMarketEvidence[]): SharedLineupTransformation {
  const before = context.rosterAssets.map((entry) => entry.asset).filter((asset) => asset.assetType === "PLAYER");
  const after = playerAssets(context, sent, received);
  const beforeAllocation = allocate(before, context, evidence);
  const afterAllocation = allocate(after, context, evidence);
  const beforeDepth = depth(before);
  const afterDepth = depth(after);
  const positions = new Set([...Object.keys(beforeDepth), ...Object.keys(afterDepth)]);
  const depthDelta = Object.fromEntries([...positions].map((position) => [position, (afterDepth[position] ?? 0) - (beforeDepth[position] ?? 0)]));
  const entering = afterAllocation.ids.filter((id) => !beforeAllocation.ids.includes(id));
  const leaving = beforeAllocation.ids.filter((id) => !afterAllocation.ids.includes(id));
  const reasons: TradeReason[] = [];
  if (entering.length) reasons.push({ code: "STARTER_IMPROVEMENT", message: `${entering.length} asset${entering.length === 1 ? "" : "s"} enter the optimized starting unit.`, assetIds: entering });
  if (leaving.length) reasons.push({ code: "DEPTH_LOSS", message: `${leaving.length} starter asset${leaving.length === 1 ? "" : "s"} leave the optimized starting unit.`, assetIds: leaving });
  return { state: beforeAllocation.known && afterAllocation.known ? evidence.length ? "OBSERVED" : "PARTIAL" : "UNKNOWN", startersBefore: beforeAllocation.ids, startersAfter: afterAllocation.ids, startersEntering: entering, startersLeaving: leaving, depthBefore: beforeDepth, depthAfter: afterDepth, depthDelta, positionStateBefore: states(before, context), positionStateAfter: states(after, context), reasons };
}
