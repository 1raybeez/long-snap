import type { ProviderCacheEntry, SyncRefreshPolicy } from "../../provider-cache/src/types.ts";
import { cacheKeys, getTtlMs, MemoryProviderCache, MemorySyncCoordinator } from "../../provider-cache/src/index.ts";
import type { SleeperClient } from "../../sleeper-provider/src/index.ts";
import type { SleeperPlayer, SleeperPlayerCatalog } from "../../sleeper-provider/src/types.ts";
import type { CanonicalPlayer, PlayerPosition, PlayerStatus } from "./types.ts";

export interface CanonicalPlayerCatalogSnapshot {
  readonly provider: "SLEEPER";
  readonly fetchedAt: string;
  readonly sourceRef: string;
  readonly players: readonly CanonicalPlayer[];
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function status(player: SleeperPlayer): PlayerStatus {
  if (player.active === false || String(player.status ?? "").toLowerCase() === "inactive") return "INACTIVE";
  if (player.active === true || String(player.status ?? "").toLowerCase() === "active") return "ACTIVE";
  return "UNKNOWN";
}

function canonicalPosition(player: SleeperPlayer): { position: PlayerPosition; playerType: "PLAYER" | "DEFENSE" } | null {
  if (player.position === "DEF" || player.fantasy_positions?.includes("DEF")) return { position: "DST", playerType: "DEFENSE" };
  if (["QB", "RB", "WR", "TE", "K"].includes(player.position ?? "")) return { position: player.position as PlayerPosition, playerType: "PLAYER" };
  return null;
}

export function canonicalPlayerIdFromSleeper(player: SleeperPlayer): string | null {
  const name = player.full_name ?? [player.first_name, player.last_name].filter(Boolean).join(" ");
  const position = canonicalPosition(player);
  if (!name || !position) return null;
  return `player.${slug(name)}${position.playerType === "DEFENSE" ? "-defense" : ""}`;
}

export function normalizeSleeperPlayerCatalog(catalog: SleeperPlayerCatalog, fetchedAt: string, sourceRef = "sleeper:/players/nfl"): CanonicalPlayerCatalogSnapshot {
  const players: CanonicalPlayer[] = [];
  for (const [catalogId, raw] of Object.entries(catalog)) {
    const providerPlayerId = raw.player_id ?? catalogId;
    const name = raw.full_name ?? [raw.first_name, raw.last_name].filter(Boolean).join(" ");
    const position = canonicalPosition(raw);
    const hqPlayerId = canonicalPlayerIdFromSleeper(raw);
    if (!providerPlayerId || !name || !position || !hqPlayerId) continue;
    players.push({
      hqPlayerId,
      displayName: name,
      firstName: raw.first_name ?? null,
      lastName: raw.last_name ?? null,
      position: position.position,
      nflTeam: raw.team ?? null,
      status: status(raw),
      playerType: position.playerType,
      aliases: [],
      providerMappings: [{ provider: "SLEEPER", providerPlayerId, status: "CONFIRMED", sourceRef }],
    });
  }
  const byId = new Map<string, CanonicalPlayer>();
  for (const player of players) {
    if (!byId.has(player.hqPlayerId)) byId.set(player.hqPlayerId, player);
  }
  return { provider: "SLEEPER", fetchedAt, sourceRef, players: [...byId.values()] };
}

export interface SleeperPlayerCatalogServiceOptions {
  readonly cache?: MemoryProviderCache;
  readonly now?: () => Date;
  readonly ttlMs?: number;
}

export class SleeperPlayerCatalogService {
  private readonly client: SleeperClient;
  private readonly coordinator: MemorySyncCoordinator;
  private readonly cache: MemoryProviderCache;
  private readonly now: () => Date;
  private readonly ttlMs: number;

  public constructor(client: SleeperClient, options: SleeperPlayerCatalogServiceOptions = {}) {
    this.client = client;
    this.cache = options.cache ?? new MemoryProviderCache();
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? getTtlMs("PLAYERS");
    this.coordinator = new MemorySyncCoordinator(this.cache, this.now);
  }

  public async getSnapshot(refreshPolicy: SyncRefreshPolicy = "IF_STALE"): Promise<{ readonly snapshot: CanonicalPlayerCatalogSnapshot | null; readonly entry: ProviderCacheEntry<CanonicalPlayerCatalogSnapshot> | null; readonly status: "CACHE_HIT" | "SYNCED" | "FAILED" }> {
    const key = cacheKeys.players();
    const outcome = await this.coordinator.sync<CanonicalPlayerCatalogSnapshot>({
      key, provider: "SLEEPER", resource: "PLAYERS", scope: {}, ttlMs: this.ttlMs, refreshPolicy,
      loader: async () => {
        const response = await this.client.getPlayers();
        if (!response.ok) return { ok: false, error: response.error, source: response.source };
        return { ok: true, value: normalizeSleeperPlayerCatalog(response.data, response.source.fetchedAt), source: response.source };
      },
    });
    return { snapshot: outcome.value, entry: outcome.entry, status: outcome.status === "FAILED" ? "FAILED" : outcome.status };
  }
}
