import { HQ_PLAYER_FIXTURES } from "./registry.ts";
import { normalizePlayerName } from "./normalization.ts";
import type {
  CanonicalPlayer,
  PlayerProvider,
  PlayerResolution,
  ProviderPlayerMapping,
} from "./types.ts";

export function getPlayerByHqId(
  hqPlayerId: string,
  players: readonly CanonicalPlayer[] = HQ_PLAYER_FIXTURES,
): CanonicalPlayer | null {
  return players.find((player) => player.hqPlayerId === hqPlayerId) ?? null;
}

export function getProviderMapping(
  hqPlayerId: string,
  provider: PlayerProvider,
  players: readonly CanonicalPlayer[] = HQ_PLAYER_FIXTURES,
): ProviderPlayerMapping | null {
  return getPlayerByHqId(hqPlayerId, players)?.providerMappings.find((mapping) => mapping.provider === provider) ?? null;
}

export function resolveProviderPlayer(
  provider: PlayerProvider,
  providerPlayerId: string,
  players: readonly CanonicalPlayer[] = HQ_PLAYER_FIXTURES,
): PlayerResolution {
  const matches = players.flatMap((player) => player.providerMappings
    .filter((mapping) => mapping.provider === provider && mapping.providerPlayerId === providerPlayerId)
    .map((mapping) => ({ player, mapping })));

  if (matches.length === 0) {
    return { status: "UNRESOLVED", provider, providerPlayerId, reason: "NO_MAPPING" };
  }
  if (matches.length > 1) {
    return { status: "UNRESOLVED", provider, providerPlayerId, reason: "AMBIGUOUS_MAPPING" };
  }
  const [{ player, mapping }] = matches;
  if (mapping.status !== "CONFIRMED") {
    return { status: "UNRESOLVED", provider, providerPlayerId, reason: "NON_CONFIRMED_MAPPING" };
  }
  return { status: "RESOLVED", player, mapping };
}

export function findPlayersByNormalizedName(
  name: string,
  players: readonly CanonicalPlayer[] = HQ_PLAYER_FIXTURES,
): readonly CanonicalPlayer[] {
  const normalized = normalizePlayerName(name);
  return players.filter((player) => [player.displayName, ...player.aliases]
    .some((candidate) => normalizePlayerName(candidate) === normalized));
}
