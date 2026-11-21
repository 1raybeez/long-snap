import {
  getProviderBinding,
  type LeagueRegistry,
} from "../../league-registry/src/index.ts";
import { isRetryableStatus, providerError } from "./errors.ts";
import { DEFAULT_RETRY_POLICY, getRetryDelay } from "./retry.ts";
import type {
  SleeperClientOptions,
  SleeperEndpoint,
  SleeperFetcher,
  SleeperHttpResponse,
  SleeperBracketMatch,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueSeasonReference,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayerCatalog,
  SleeperProviderError,
  SleeperResult,
  SleeperRetryPolicy,
  SleeperRoster,
  SleeperSourceMetadata,
  SleeperTransaction,
  SleeperUser,
} from "./types.ts";

const defaultFetcher: SleeperFetcher = (url, init) => fetch(url, init);
const defaultSleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export class SleeperClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryPolicy: SleeperRetryPolicy;
  private readonly fetcher: SleeperFetcher;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly registry: LeagueRegistry;

  public constructor(registry: LeagueRegistry, options: SleeperClientOptions = {}) {
    this.registry = registry;
    this.baseUrl = (options.baseUrl ?? "https://api.sleeper.app/v1").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...options.retryPolicy };
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => new Date());
  }

  public async getNflState(): Promise<SleeperResult<SleeperNflState>> {
    return this.request<SleeperNflState>("NFL_STATE", "/state/nfl");
  }

  public async getPlayers(): Promise<SleeperResult<SleeperPlayerCatalog>> {
    return this.request<SleeperPlayerCatalog>("PLAYERS", "/players/nfl");
  }

  public async getLeague(reference: SleeperLeagueSeasonReference): Promise<SleeperResult<SleeperLeague>> {
    return this.requestForLeague<SleeperLeague>(reference, "LEAGUE", (externalId) => `/league/${externalId}`);
  }

  public async getLeagueUsers(reference: SleeperLeagueSeasonReference): Promise<SleeperResult<readonly SleeperLeagueUser[]>> {
    return this.requestForLeague<readonly SleeperLeagueUser[]>(reference, "LEAGUE_USERS", (externalId) => `/league/${externalId}/users`);
  }

  public async getRosters(reference: SleeperLeagueSeasonReference): Promise<SleeperResult<readonly SleeperRoster[]>> {
    return this.requestForLeague<readonly SleeperRoster[]>(reference, "ROSTERS", (externalId) => `/league/${externalId}/rosters`);
  }

  public async getMatchups(reference: SleeperLeagueSeasonReference, week: number): Promise<SleeperResult<readonly SleeperMatchup[]>> {
    if (!Number.isInteger(week) || week < 1) return this.invalidRequest("MATCHUPS", "week must be a positive integer");
    return this.requestForLeague<readonly SleeperMatchup[]>(reference, "MATCHUPS", (externalId) => `/league/${externalId}/matchups/${week}`);
  }

  public async getTransactions(reference: SleeperLeagueSeasonReference, week: number): Promise<SleeperResult<readonly SleeperTransaction[]>> {
    if (!Number.isInteger(week) || week < 1) return this.invalidRequest("TRANSACTIONS", "week must be a positive integer");
    return this.requestForLeague<readonly SleeperTransaction[]>(reference, "TRANSACTIONS", (externalId) => `/league/${externalId}/transactions/${week}`);
  }

  public async getWinnersBracket(reference: SleeperLeagueSeasonReference): Promise<SleeperResult<readonly SleeperBracketMatch[]>> {
    return this.requestForLeague<readonly SleeperBracketMatch[]>(reference, "WINNERS_BRACKET", (externalId) => `/league/${externalId}/winners_bracket`);
  }

  public async getLosersBracket(reference: SleeperLeagueSeasonReference): Promise<SleeperResult<readonly SleeperBracketMatch[]>> {
    return this.requestForLeague<readonly SleeperBracketMatch[]>(reference, "LOSERS_BRACKET", (externalId) => `/league/${externalId}/losers_bracket`);
  }

  public async getDrafts(reference: SleeperLeagueSeasonReference): Promise<SleeperResult<readonly SleeperDraft[]>> {
    return this.requestForLeague<readonly SleeperDraft[]>(reference, "DRAFTS", (externalId) => `/league/${externalId}/drafts`);
  }

  public async getDraftPicks(draftId: string): Promise<SleeperResult<readonly SleeperDraftPick[]>> {
    if (!draftId.trim()) return this.invalidRequest("DRAFT_PICKS", "draftId is required");
    return this.request<readonly SleeperDraftPick[]>("DRAFT_PICKS", `/draft/${encodeURIComponent(draftId)}/picks`);
  }

  public async getUser(userId: string): Promise<SleeperResult<SleeperUser>> {
    if (!userId.trim()) return this.invalidRequest("USER", "userId is required");
    return this.request<SleeperUser>("USER", `/user/${encodeURIComponent(userId)}`);
  }

  private async requestForLeague<T>(
    reference: SleeperLeagueSeasonReference,
    endpoint: SleeperEndpoint,
    path: (externalLeagueId: string) => string,
  ): Promise<SleeperResult<T>> {
    const binding = getProviderBinding(reference.leagueId, reference.season, "SLEEPER", this.registry);
    if (!binding || binding.state !== "CONFIRMED" || !binding.externalLeagueId) {
      return this.configurationError(endpoint, `No confirmed Sleeper binding for ${reference.leagueId}:${reference.season}`);
    }
    return this.request<T>(endpoint, path(binding.externalLeagueId), binding.externalLeagueId);
  }

  private async request<T>(
    endpoint: SleeperEndpoint,
    path: string,
    externalLeagueId?: string,
  ): Promise<SleeperResult<T>> {
    const url = `${this.baseUrl}${path}`;
    let attempts = 0;
    let lastError: SleeperProviderError | null = null;

    for (let retryNumber = 0; retryNumber <= this.retryPolicy.maxRetries; retryNumber += 1) {
      attempts += 1;
      const startedAt = this.now().toISOString();
      const source: SleeperSourceMetadata = {
        provider: "SLEEPER",
        endpoint,
        url,
        fetchedAt: startedAt,
        attempts,
        ...(externalLeagueId ? { externalLeagueId } : {}),
      };

      try {
        const response = await this.fetchWithTimeout(url);
        if (!response.ok) {
          const retryable = isRetryableStatus(response.status, this.retryPolicy.retryableStatusCodes);
          lastError = providerError(endpoint === "USER" && response.status === 404 ? "HTTP_ERROR" : "HTTP_ERROR", endpoint, `Sleeper returned HTTP ${response.status}`, retryable, response.status);
          if (!retryable || retryNumber >= this.retryPolicy.maxRetries) return { ok: false, error: lastError, source };
          await this.sleep(getRetryDelay(this.retryPolicy, retryNumber + 1));
          continue;
        }

        let data: unknown;
        try {
          data = await response.json();
        } catch {
          return {
            ok: false,
            error: providerError("RESPONSE_PARSE_ERROR", endpoint, "Sleeper response was not valid JSON", false),
            source,
          };
        }
        return { ok: true, data: data as T, source };
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "AbortError";
        lastError = providerError(
          timedOut ? "TIMEOUT" : "NETWORK_ERROR",
          endpoint,
          timedOut ? `Sleeper request exceeded ${this.timeoutMs}ms` : "Sleeper request failed before receiving a response",
          true,
        );
        if (retryNumber >= this.retryPolicy.maxRetries) return { ok: false, error: lastError, source };
        await this.sleep(getRetryDelay(this.retryPolicy, retryNumber + 1));
      }
    }

    const source: SleeperSourceMetadata = {
      provider: "SLEEPER",
      endpoint,
      url,
      fetchedAt: this.now().toISOString(),
      attempts,
      ...(externalLeagueId ? { externalLeagueId } : {}),
    };
    return {
      ok: false,
      error: lastError ?? providerError("NETWORK_ERROR", endpoint, "Sleeper request failed", true),
      source,
    };
  }

  private async fetchWithTimeout(url: string): Promise<SleeperHttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private invalidRequest<T>(endpoint: SleeperEndpoint, message: string): SleeperResult<T> {
    const url = `${this.baseUrl}/invalid-request`;
    const source: SleeperSourceMetadata = {
      provider: "SLEEPER",
      endpoint,
      url,
      fetchedAt: this.now().toISOString(),
      attempts: 0,
    };
    return { ok: false, error: providerError("INVALID_REQUEST", endpoint, message, false), source };
  }

  private configurationError<T>(endpoint: SleeperEndpoint, message: string): SleeperResult<T> {
    const url = `${this.baseUrl}/configuration-error`;
    const source: SleeperSourceMetadata = {
      provider: "SLEEPER",
      endpoint,
      url,
      fetchedAt: this.now().toISOString(),
      attempts: 0,
    };
    return { ok: false, error: providerError("CONFIGURATION_ERROR", endpoint, message, false), source };
  }
}
