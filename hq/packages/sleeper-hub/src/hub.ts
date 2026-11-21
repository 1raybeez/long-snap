import { getProviderBinding } from "../../league-registry/src/index.ts";
import type { LeagueRegistry } from "../../league-registry/src/types.ts";
import { cacheKeys, MemoryProviderCache, MemorySyncCoordinator } from "../../provider-cache/src/index.ts";
import type { ProviderCacheEntry, SyncLoadResult } from "../../provider-cache/src/types.ts";
import { SleeperClient } from "../../sleeper-provider/src/index.ts";
import type { SleeperLeagueSeasonReference, SleeperPlayerCatalog, SleeperResult } from "../../sleeper-provider/src/types.ts";
import { sleeperTtlMs, SLEEPER_RESOURCE_CACHE } from "./policy.ts";
import type { SleeperHubRequest, SleeperHubResource, SleeperHubResult, SleeperHubProvenance } from "./types.ts";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function validResource(resource: SleeperHubResource, value: unknown): boolean {
  if (resource === "LEAGUE" || resource === "USER" || resource === "NFL_STATE") return isRecord(value);
  if (resource === "PLAYERS") return isRecord(value);
  return Array.isArray(value);
}
function malformed<T>(response: SleeperResult<T>): SleeperResult<T> {
  return { ok: false, error: { code: "RESPONSE_PARSE_ERROR", endpoint: response.source.endpoint, message: "Sleeper returned a response with an unexpected shape.", retryable: false }, source: response.source };
}

export class SleeperDataHub {
  private readonly registry: LeagueRegistry;
  private readonly client: SleeperClient;
  private readonly cache: MemoryProviderCache;
  private readonly coordinator: MemorySyncCoordinator;

  public constructor(input: { readonly registry: LeagueRegistry; readonly client?: SleeperClient; readonly cache?: MemoryProviderCache; readonly coordinator?: MemorySyncCoordinator }) {
    this.registry = input.registry;
    this.client = input.client ?? new SleeperClient(input.registry);
    this.cache = input.cache ?? new MemoryProviderCache();
    this.coordinator = input.coordinator ?? new MemorySyncCoordinator(this.cache);
  }

  public async read<T = unknown>(request: SleeperHubRequest): Promise<SleeperHubResult<T>> {
    const scope = this.scope(request);
    const cacheResource = SLEEPER_RESOURCE_CACHE[request.resource];
    const cacheKey = this.key(request, scope);
    const providerLeagueId = scope.externalLeagueId ?? null;
    const baseProvenance = (sourceState: SleeperHubProvenance["sourceState"], entry: ProviderCacheEntry<T> | null): SleeperHubProvenance => ({
      provider: "SLEEPER", resource: request.resource, cacheResource, canonicalLeagueId: scope.canonicalLeagueId ?? null,
      providerLeagueId, providerResourceId: request.draftId ?? request.userId ?? null, season: scope.season ?? null, week: scope.week ?? null,
      fetchedAt: entry?.fetchedAt ?? null, cachedAt: entry?.cachedAt ?? null, sourceState,
      sourceEndpoint: entry?.source.url ?? entry?.source.endpoint ?? null,
    });
    const unavailable = (entry: ProviderCacheEntry<T> | null, error?: SleeperHubResult<T>["error"], providerRequestPerformed = false): SleeperHubResult<T> => ({ ok: false, data: null, freshness: "UNAVAILABLE", cacheKey, provenance: baseProvenance("NONE", entry), entry, ...(error ? { error } : {}), warnings: [], providerRequestPerformed });
    try {
      const outcome = await this.coordinator.sync<T>({
        key: cacheKey, provider: "SLEEPER", resource: cacheResource, scope, ttlMs: sleeperTtlMs(request.resource), refreshPolicy: request.refreshPolicy ?? "IF_STALE",
        loader: async (): Promise<SyncLoadResult<T>> => {
          const response = await this.load(request);
          if (!response.ok) return response as SyncLoadResult<T>;
          if (!validResource(request.resource, response.data)) {
            const invalid = malformed(response);
            return invalid as SyncLoadResult<T>;
          }
          return { ok: true, value: response.data as T, source: response.source };
        },
      });
      if (outcome.status === "FAILED") {
        if (outcome.entry) return { ok: true, data: outcome.entry.value, freshness: "STALE_BUT_USABLE", cacheKey, provenance: baseProvenance("STALE_CACHE", outcome.entry), entry: outcome.entry, error: outcome.sync.error ?? undefined, warnings: ["Sleeper refresh failed; serving the last cached provider snapshot."], providerRequestPerformed: true };
        const errorCode = outcome.sync.error?.code;
        return unavailable(null, outcome.sync.error ?? undefined, errorCode !== "CONFIGURATION_ERROR" && errorCode !== "INVALID_REQUEST");
      }
      return { ok: true, data: outcome.value, freshness: outcome.freshness === "FRESH" ? "FRESH" : "STALE_BUT_USABLE", cacheKey, provenance: baseProvenance(outcome.status === "CACHE_HIT" ? "CACHE" : "PROVIDER", outcome.entry), entry: outcome.entry, warnings: [], providerRequestPerformed: outcome.status !== "CACHE_HIT" };
    } catch (error) {
      return unavailable(null, { code: "HUB_ERROR", message: error instanceof Error ? error.message : "Sleeper data hub request failed.", retryable: true }, true);
    }
  }

  private scope(request: SleeperHubRequest): { readonly canonicalLeagueId?: string; readonly season?: number; readonly externalLeagueId?: string; readonly week?: number; readonly draftId?: string; readonly userId?: string } {
    const binding = request.canonicalLeagueId && request.season !== undefined ? getProviderBinding(request.canonicalLeagueId, request.season, "SLEEPER", this.registry) : undefined;
    return { canonicalLeagueId: request.canonicalLeagueId, season: request.season, externalLeagueId: binding?.externalLeagueId ?? undefined, week: request.week, draftId: request.draftId, userId: request.userId };
  }

  private key(request: SleeperHubRequest, scope: { readonly canonicalLeagueId?: string; readonly season?: number; readonly externalLeagueId?: string; readonly week?: number; readonly draftId?: string; readonly userId?: string }): string {
    const key = cacheKeys;
    if (request.resource === "PLAYERS") return key.players();
    if (request.resource === "NFL_STATE") return key.nflState();
    if (request.resource === "WINNERS_BRACKET") return key.winnersBracket(scope);
    if (request.resource === "LOSERS_BRACKET") return key.losersBracket(scope);
    if (request.resource === "USER") return key.user(request.userId ?? "");
    if (request.resource === "DRAFT_PICKS") return key.draftPicks(request.draftId ?? "");
    if (request.resource === "MATCHUPS") return key.matchups(scope);
    if (request.resource === "TRANSACTIONS") return key.transactions(scope);
    if (request.resource === "ROSTERS") return key.rosters(scope);
    if (request.resource === "USERS") return key.leagueUsers(scope);
    if (request.resource === "DRAFTS") return key.drafts(scope);
    return key.league(scope);
  }

  private async load(request: SleeperHubRequest): Promise<SleeperResult<unknown>> {
    const reference = { leagueId: request.canonicalLeagueId ?? "", season: request.season ?? 0 } satisfies SleeperLeagueSeasonReference;
    if (request.resource === "NFL_STATE") return this.client.getNflState();
    if (request.resource === "LEAGUE") return this.client.getLeague(reference);
    if (request.resource === "WINNERS_BRACKET") return this.client.getWinnersBracket(reference);
    if (request.resource === "LOSERS_BRACKET") return this.client.getLosersBracket(reference);
    if (request.resource === "USERS") return this.client.getLeagueUsers(reference);
    if (request.resource === "ROSTERS") return this.client.getRosters(reference);
    if (request.resource === "MATCHUPS") return this.client.getMatchups(reference, request.week ?? 0);
    if (request.resource === "TRANSACTIONS") return this.client.getTransactions(reference, request.week ?? 0);
    if (request.resource === "DRAFTS") return this.client.getDrafts(reference);
    if (request.resource === "DRAFT_PICKS") return this.client.getDraftPicks(request.draftId ?? "");
    if (request.resource === "PLAYERS") return this.client.getPlayers() as Promise<SleeperResult<SleeperPlayerCatalog>>;
    return this.client.getUser(request.userId ?? "");
  }
}
