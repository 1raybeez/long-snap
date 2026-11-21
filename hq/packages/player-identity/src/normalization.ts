import type { PlayerPosition, PlayerType } from "./types.ts";

export function normalizePlayerName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePosition(value: string | null | undefined): PlayerPosition | null {
  if (!value) return null;
  const position = value.trim().toUpperCase();
  if (position === "DEF" || position === "DEFENSE" || position === "D/ST" || position === "D") return "DST";
  if (["QB", "RB", "WR", "TE", "K", "DST"].includes(position)) return position as PlayerPosition;
  return null;
}

export function inferPlayerType(position: PlayerPosition): PlayerType {
  return position === "DST" ? "DEFENSE" : "PLAYER";
}

export function normalizeNflTeam(value: string | null | undefined): string | null {
  if (!value) return null;
  const team = value.trim().toUpperCase();
  return team === "" ? null : team;
}
