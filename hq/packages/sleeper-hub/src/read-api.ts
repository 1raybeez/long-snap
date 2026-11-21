import type { LeagueRegistry } from "../../league-registry/src/types.ts";
import type { SnapshotStore } from "../../provider-cache/src/durable-cache.ts";
import type { SleeperDataHub } from "./hub.ts";
import { snapshotId } from "./refresh.ts";
import type { SleeperHubRequest, SleeperHubResource, SleeperHubResult } from "./types.ts";

/**
 * Read-only HTTP contract that league websites use instead of calling Sleeper.
 *
 *   GET /v1/nfl-state
 *   GET /v1/players                                 slim catalog: { [playerId]: { n, p, t, s, i } }
 *   GET /v1/leagues/{leagueId}/{resource}[?season=YYYY][&week=N]
 *        resource: league | users | rosters | matchups | transactions | winners-bracket | losers-bracket | drafts
 *   GET /v1/leagues/{leagueId}/weeks/{week}/final   frozen matchups for a finished week (+ standings when frozen)
 *
 * All data is public Sleeper data. Responses carry freshness and provenance so a
 * site can show "as of" times and degrade gracefully when Sleeper is down.
 */
export interface SleeperCacheReadRequest {
  readonly method: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly origin?: string;
}

export interface SleeperCacheReadResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Record<string, unknown>;
}

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "https://rva-eskimo-bros-ffl--rva-eskimo-brothers-ffl.us-east4.hosted.app",
];

const LEAGUE_RESOURCES: Readonly<Record<string, SleeperHubResource>> = {
  league: "LEAGUE",
  users: "USERS",
  rosters: "ROSTERS",
  matchups: "MATCHUPS",
  transactions: "TRANSACTIONS",
  "winners-bracket": "WINNERS_BRACKET",
  "losers-bracket": "LOSERS_BRACKET",
  drafts: "DRAFTS",
};

const MAX_AGE_SECONDS: Readonly<Partial<Record<SleeperHubResource, number>>> = {
  NFL_STATE: 300, PLAYERS: 3600, LEAGUE: 600, USERS: 300, ROSTERS: 120, MATCHUPS: 60, TRANSACTIONS: 60, WINNERS_BRACKET: 300, LOSERS_BRACKET: 300, DRAFTS: 3600,
};

export interface SlimPlayer {
  /** full name */ readonly n: string;
  /** position */ readonly p: string | null;
  /** NFL team */ readonly t: string | null;
  /** status (Active, Inactive, ...) */ readonly s: string | null;
  /** injury status (Questionable, Out, IR, ...) */ readonly i: string | null;
}

/** Reduce Sleeper's multi-megabyte catalog to what league sites display. */
export function slimPlayerCatalog(catalog: Readonly<Record<string, unknown>>): Record<string, SlimPlayer> {
  const slim: Record<string, SlimPlayer> = {};
  for (const [id, raw] of Object.entries(catalog)) {
    const player = (raw ?? {}) as Record<string, unknown>;
    const name = typeof player.full_name === "string" && player.full_name
      ? player.full_name
      : [player.first_name, player.last_name].filter((part) => typeof part === "string" && part).join(" ") || (player.position === "DEF" ? `${player.team ?? id} D/ST` : id);
    const str = (value: unknown) => (typeof value === "string" && value ? value : null);
    slim[id] = { n: name, p: str(player.position), t: str(player.team), s: str(player.status), i: str(player.injury_status) };
  }
  return slim;
}

function corsHeaders(origin: string | undefined, allowed: readonly string[]): Record<string, string> {
  const allow = origin && (allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return allow ? { "access-control-allow-origin": origin, vary: "Origin", "access-control-allow-methods": "GET, OPTIONS" } : { vary: "Origin" };
}

function json(status: number, body: Record<string, unknown>, headers: Record<string, string>): SleeperCacheReadResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8", ...headers }, body };
}

function envelope<T>(result: SleeperHubResult<T>, data: unknown): Record<string, unknown> {
  return {
    code: "OK",
    data,
    freshness: result.freshness,
    fetchedAt: result.provenance.fetchedAt,
    cachedAt: result.provenance.cachedAt,
    source: { provider: "SLEEPER", state: result.provenance.sourceState, providerLeagueId: result.provenance.providerLeagueId },
    warnings: result.warnings,
  };
}

export async function handleSleeperCacheRead(
  request: SleeperCacheReadRequest,
  dependencies: {
    readonly hub: SleeperDataHub;
    readonly registry: LeagueRegistry;
    readonly snapshots?: SnapshotStore | null;
    readonly allowedOrigins?: readonly string[];
  },
): Promise<SleeperCacheReadResponse> {
  const cors = corsHeaders(request.origin, dependencies.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS);
  if (request.method === "OPTIONS") return { status: 204, headers: { ...cors, "access-control-max-age": "3600" }, body: {} };
  if (request.method !== "GET") return json(405, { code: "METHOD_NOT_ALLOWED" }, cors);

  const segments = request.path.replace(/^\/+|\/+$/g, "").split("/");
  if (segments[0] !== "v1") return json(404, { code: "NOT_FOUND" }, cors);

  const respond = async <T>(hubRequest: SleeperHubRequest, transform: (data: T) => unknown = (data) => data): Promise<SleeperCacheReadResponse> => {
    const result = await dependencies.hub.read<T>(hubRequest);
    if (!result.ok || result.data === null) {
      return json(503, { code: "SLEEPER_UNAVAILABLE", message: "Sleeper data is temporarily unavailable and no cached copy exists.", error: result.error?.code ?? null }, { ...cors, "cache-control": "no-store" });
    }
    const maxAge = MAX_AGE_SECONDS[hubRequest.resource] ?? 60;
    return json(200, envelope(result, transform(result.data)), { ...cors, "cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge}` });
  };

  if (segments.length === 2 && segments[1] === "nfl-state") return respond({ resource: "NFL_STATE" });
  if (segments.length === 2 && segments[1] === "players") return respond<Record<string, unknown>>({ resource: "PLAYERS" }, slimPlayerCatalog);

  if (segments[1] !== "leagues" || !segments[2]) return json(404, { code: "NOT_FOUND" }, cors);
  const league = dependencies.registry.leagues.find((candidate) => candidate.id === segments[2] || candidate.slug === segments[2]);
  if (!league) return json(404, { code: "UNKNOWN_LEAGUE" }, cors);
  const season = request.query?.season ? Number(request.query.season) : league.currentSeason;
  const seasonRecord = league.seasons.find((record) => record.season === season);
  if (!Number.isInteger(season) || !seasonRecord?.providerBindings.some((binding) => binding.provider === "SLEEPER" && binding.externalLeagueId)) {
    return json(404, { code: "NO_SLEEPER_SEASON", message: `${league.displayName} has no Sleeper league for ${request.query?.season ?? season}.` }, cors);
  }
  const base = { canonicalLeagueId: league.id, season } as const;

  // /v1/leagues/{id}/weeks/{week}/final
  if (segments[3] === "weeks" && segments[5] === "final" && segments.length === 6) {
    const week = Number(segments[4]);
    if (!Number.isInteger(week) || week < 1 || week > 18) return json(400, { code: "INVALID_WEEK" }, cors);
    if (!dependencies.snapshots) return json(503, { code: "SNAPSHOTS_UNAVAILABLE" }, cors);
    const target = { canonicalLeagueId: league.id, season };
    const matchups = await dependencies.snapshots.readSnapshot(snapshotId(target, week, "matchups"));
    if (!matchups) return json(404, { code: "WEEK_NOT_FINAL", message: `Week ${week} has not been frozen yet.` }, { ...cors, "cache-control": "public, max-age=300" });
    const rosters = await dependencies.snapshots.readSnapshot(snapshotId(target, week, "rosters"));
    return json(200, { code: "OK", data: { matchups: matchups.value, standings: rosters?.value ?? null }, frozenAt: matchups.cachedAt ?? matchups.fetchedAt, final: true }, { ...cors, "cache-control": "public, max-age=86400, immutable" });
  }

  if (segments.length !== 4) return json(404, { code: "NOT_FOUND" }, cors);
  const resource = LEAGUE_RESOURCES[segments[3]];
  if (!resource) return json(404, { code: "UNKNOWN_RESOURCE" }, cors);
  if (resource === "MATCHUPS" || resource === "TRANSACTIONS") {
    const week = Number(request.query?.week);
    if (!Number.isInteger(week) || week < 1 || week > 18) return json(400, { code: "INVALID_WEEK", message: "week=1..18 is required." }, cors);
    return respond({ ...base, resource, week });
  }
  return respond({ ...base, resource });
}
