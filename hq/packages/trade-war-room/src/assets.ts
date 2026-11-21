import { createDraftPickAsset } from "../../fantasy-intelligence/src/index.ts";
import { getPlayerByHqId, resolveProviderPlayer, HQ_PLAYER_FIXTURES } from "../../player-identity/src/index.ts";
import type { CanonicalPlayer } from "../../player-identity/src/types.ts";
import type { DraftPickTradeAssetInput, NormalizedTradeAsset, PlayerTradeAssetInput, TradeAssetInput } from "./types.ts";

export type AssetNormalization =
  | { readonly ok: true; readonly asset: NormalizedTradeAsset }
  | { readonly ok: false; readonly message: string };

function normalizePlayer(input: PlayerTradeAssetInput, players: readonly CanonicalPlayer[]): AssetNormalization {
  if (input.hqPlayerId) {
    const player = getPlayerByHqId(input.hqPlayerId, players);
    if (!player) return { ok: false, message: `Unresolved HQ player identity: ${input.hqPlayerId}` };
    return {
      ok: true,
      asset: {
        assetType: "PLAYER",
        assetId: player.hqPlayerId,
        hqPlayerId: player.hqPlayerId,
        displayName: player.displayName,
        position: player.position,
        provider: input.provider ?? null,
        providerPlayerId: input.providerPlayerId ?? null,
      },
    };
  }
  if (!input.provider || !input.providerPlayerId) return { ok: false, message: "Player asset requires an HQ player ID or provider player reference." };
  const resolution = resolveProviderPlayer(input.provider, input.providerPlayerId, players);
  if (resolution.status !== "RESOLVED") return { ok: false, message: `Unresolved player identity: ${input.provider}:${input.providerPlayerId} (${resolution.reason}).` };
  return {
    ok: true,
    asset: {
      assetType: "PLAYER",
      assetId: resolution.player.hqPlayerId,
      hqPlayerId: resolution.player.hqPlayerId,
      displayName: resolution.player.displayName,
      position: resolution.player.position,
      provider: input.provider,
      providerPlayerId: input.providerPlayerId,
    },
  };
}

function normalizePick(input: DraftPickTradeAssetInput): AssetNormalization {
  const pick = input.asset;
  if (pick.assetType !== "DRAFT_PICK" || !Number.isInteger(pick.season) || !Number.isInteger(pick.round) || pick.round < 1) {
    return { ok: false, message: "Draft-pick asset is invalid." };
  }
  const canonical = createDraftPickAsset({
    season: pick.season,
    round: pick.round,
    pickNumber: pick.pickNumber,
    originalFranchiseId: pick.originalFranchiseId,
  });
  return { ok: true, asset: { assetType: "DRAFT_PICK", assetId: canonical.assetId, asset: canonical } };
}

export function normalizeTradeAsset(input: TradeAssetInput, players: readonly CanonicalPlayer[] = HQ_PLAYER_FIXTURES): AssetNormalization {
  if (input.assetType === "PLAYER") return normalizePlayer(input, players);
  if (input.assetType === "DRAFT_PICK") return normalizePick(input);
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "FAAB amount must be a positive finite number." };
  return { ok: true, asset: { assetType: "FAAB", assetId: `faab:${input.amount}`, amount: input.amount } };
}
