import type { CanonicalPlayer } from "./types.ts";

export function validatePlayerRegistry(players: readonly CanonicalPlayer[]): readonly string[] {
  const errors: string[] = [];
  const hqIds = new Set<string>();
  const providerIds = new Set<string>();

  for (const player of players) {
    if (!player.hqPlayerId || hqIds.has(player.hqPlayerId)) {
      errors.push(`duplicate or empty HQ player id: ${player.hqPlayerId || "<empty>"}`);
    }
    hqIds.add(player.hqPlayerId);

    if (!player.displayName.trim()) errors.push(`${player.hqPlayerId} has an empty display name`);
    if (player.playerType === "DEFENSE" && player.position !== "DST") {
      errors.push(`${player.hqPlayerId} defense identity must use DST position`);
    }
    if (player.playerType === "PLAYER" && player.position === "DST") {
      errors.push(`${player.hqPlayerId} DST identity must use DEFENSE player type`);
    }

    for (const mapping of player.providerMappings) {
      if (!mapping.providerPlayerId.trim()) {
        errors.push(`${player.hqPlayerId} has an empty provider player id`);
      }
      if (mapping.providerPlayerId === player.hqPlayerId) {
        errors.push(`${player.hqPlayerId} accidentally uses a provider id as its HQ id`);
      }
      const key = `${mapping.provider}:${mapping.providerPlayerId}`;
      if (providerIds.has(key)) errors.push(`duplicate provider mapping: ${key}`);
      providerIds.add(key);
    }
  }

  return errors;
}

export function assertValidPlayerRegistry(players: readonly CanonicalPlayer[]): void {
  const errors = validatePlayerRegistry(players);
  if (errors.length > 0) {
    throw new Error(`Invalid player registry:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
}
