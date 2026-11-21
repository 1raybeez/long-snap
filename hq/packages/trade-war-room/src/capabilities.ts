import { getCapability, getLeagueById, type LeagueRegistry } from "../../league-registry/src/index.ts";
import type { TradeAssetType, TradeCapabilityDecision } from "./types.ts";

const PRIMARY_TRADE_LEAGUES = new Set([
  "river-city-ffl",
  "long-country-club",
  "rva-eskimo-brothers",
  "c4g-fantasy-football",
]);

export function getTradeCapability(
  leagueId: string,
  registry: LeagueRegistry,
): TradeCapabilityDecision {
  const league = getLeagueById(leagueId, registry);
  if (!league) return { state: "UNKNOWN", supported: false, reason: `Unknown canonical league: ${leagueId}` };
  if (!PRIMARY_TRADE_LEAGUES.has(leagueId)) {
    return { state: "OUT_OF_SCOPE", supported: false, reason: "Out of scope for this league." };
  }
  const capability = getCapability(leagueId, "TRADE_WAR_ROOM", registry);
  if (!capability || (capability.state !== "AVAILABLE" && capability.state !== "ENABLED")) {
    return { state: capability?.state ?? "UNKNOWN", supported: false, reason: `Trade War Room is not available for ${league.displayName}.` };
  }
  return { state: capability.state, supported: true, reason: "Trade War Room capability is available." };
}

export function isTradeAssetSupported(leagueId: string, assetType: TradeAssetType, registry: LeagueRegistry): { supported: boolean; reason: string } {
  const league = getLeagueById(leagueId, registry);
  if (!league) return { supported: false, reason: `Unknown canonical league: ${leagueId}` };
  if (leagueId === "absolutely-gross") return { supported: false, reason: "Out of scope for this league." };
  if (assetType === "PLAYER") return { supported: true, reason: "Players are supported trade assets." };
  if (assetType === "DRAFT_PICK") {
    return league.format === "DYNASTY"
      ? { supported: true, reason: "Draft picks are supported by the shared Dynasty profile." }
      : { supported: false, reason: `${league.format} does not support Dynasty draft-pick trade assets in Phase 3A.` };
  }
  return { supported: false, reason: "FAAB trade legality is not canonically confirmed for this Phase 3A registry configuration." };
}
