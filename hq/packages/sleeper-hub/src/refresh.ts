import type { LeagueRegistry } from "../../league-registry/src/types.ts";
import type { SnapshotStore } from "../../provider-cache/src/durable-cache.ts";
import type { SleeperDataHub } from "./hub.ts";
import type { SleeperHubRequest, SleeperHubResult } from "./types.ts";

export interface SleeperRefreshTarget {
  readonly canonicalLeagueId: string;
  readonly season: number;
  readonly providerLeagueId: string;
}

/** Every ACTIVE league's current season that has a confirmed Sleeper binding. */
export function activeSleeperTargets(registry: LeagueRegistry): readonly SleeperRefreshTarget[] {
  const targets: SleeperRefreshTarget[] = [];
  for (const league of registry.leagues) {
    if (league.lifecycle !== "ACTIVE") continue;
    const season = league.seasons.find((record) => record.season === league.currentSeason);
    const binding = season?.providerBindings.find((candidate) => candidate.provider === "SLEEPER" && candidate.state === "CONFIRMED" && candidate.externalLeagueId);
    if (season && binding?.externalLeagueId) targets.push({ canonicalLeagueId: league.id, season: season.season, providerLeagueId: binding.externalLeagueId });
  }
  return targets;
}

const ET_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hourCycle: "h23" });

/** NFL game windows in Eastern time: Thu/Mon 7pm–1am, Sun 9am–1am (plus Saturday late season). */
export function isNflGameWindow(now: Date): boolean {
  const parts = Object.fromEntries(ET_PARTS.formatToParts(now).map((part) => [part.type, part.value]));
  const day = parts.weekday as string;
  const hour = Number(parts.hour);
  if (hour < 1 && (day === "Fri" || day === "Mon" || day === "Tue" || day === "Sun")) return true; // games running past midnight
  if (day === "Sun") return hour >= 9;
  if (day === "Thu" || day === "Mon") return hour >= 19;
  if (day === "Sat") return hour >= 13; // late-season Saturday slates
  return false;
}

export interface SleeperRefreshPlanInput {
  readonly targets: readonly SleeperRefreshTarget[];
  /** Current NFL week from /state/nfl (0 in the preseason). */
  readonly nflWeek: number;
  readonly now: Date;
}

/**
 * The requests one scheduled run should make. Everything uses IF_STALE, so the
 * shared TTL policy decides whether Sleeper is actually called. Weekly live data
 * (matchups/transactions) is refreshed every run during game windows and about
 * once an hour otherwise.
 */
export function planSleeperRefresh(input: SleeperRefreshPlanInput): readonly SleeperHubRequest[] {
  const requests: SleeperHubRequest[] = [{ resource: "PLAYERS" }];
  const includeWeekly = input.nflWeek >= 1 && (isNflGameWindow(input.now) || input.now.getUTCMinutes() < 15);
  for (const target of input.targets) {
    const base = { canonicalLeagueId: target.canonicalLeagueId, season: target.season } as const;
    requests.push({ ...base, resource: "LEAGUE" }, { ...base, resource: "USERS" }, { ...base, resource: "ROSTERS" }, { ...base, resource: "DRAFTS" }, { ...base, resource: "WINNERS_BRACKET" }, { ...base, resource: "LOSERS_BRACKET" });
    if (includeWeekly) requests.push({ ...base, resource: "MATCHUPS", week: input.nflWeek }, { ...base, resource: "TRANSACTIONS", week: input.nflWeek });
  }
  return requests;
}

export const snapshotId = (target: Pick<SleeperRefreshTarget, "canonicalLeagueId" | "season">, week: number, resource: "matchups" | "rosters") =>
  `sleeper:${target.canonicalLeagueId}:${target.season}:week:${week}:${resource}`;

export interface SleeperRefreshReport {
  readonly startedAt: string;
  readonly nflWeek: number | null;
  readonly requested: number;
  readonly providerCalls: number;
  readonly cacheHits: number;
  readonly failures: readonly { readonly resource: string; readonly league: string | null; readonly code: string; readonly message: string }[];
  readonly snapshotsWritten: readonly string[];
}

function lastScoredWeek(league: unknown): number {
  const settings = (league as { settings?: Record<string, unknown> } | null)?.settings ?? {};
  const value = Number(settings.last_scored_leg ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * One scheduled refresh: reads NFL state, refreshes every planned resource
 * through the hub (and therefore the shared durable cache), then freezes any
 * newly finished week's matchups and standings as write-once snapshots.
 */
export async function runSleeperRefresh(input: {
  readonly hub: SleeperDataHub;
  readonly registry: LeagueRegistry;
  readonly snapshots?: SnapshotStore | null;
  readonly now?: Date;
}): Promise<SleeperRefreshReport> {
  const now = input.now ?? new Date();
  const failures: { resource: string; league: string | null; code: string; message: string }[] = [];
  const snapshotsWritten: string[] = [];
  let providerCalls = 0;
  let cacheHits = 0;
  let requested = 0;
  const track = <T>(request: SleeperHubRequest, result: SleeperHubResult<T>): SleeperHubResult<T> => {
    requested += 1;
    if (result.providerRequestPerformed) providerCalls += 1; else cacheHits += 1;
    if (!result.ok || result.freshness === "STALE_BUT_USABLE" && result.error) {
      failures.push({ resource: request.resource, league: request.canonicalLeagueId ?? null, code: result.error?.code ?? "UNAVAILABLE", message: result.error?.message ?? "Sleeper data unavailable" });
    }
    return result;
  };

  const stateRequest: SleeperHubRequest = { resource: "NFL_STATE" };
  const state = track(stateRequest, await input.hub.read<{ week?: number }>(stateRequest));
  const nflWeek = state.ok && typeof state.data?.week === "number" ? state.data.week : null;

  const targets = activeSleeperTargets(input.registry);
  for (const request of planSleeperRefresh({ targets, nflWeek: nflWeek ?? 0, now })) {
    track(request, await input.hub.read(request));
  }

  if (input.snapshots) {
    for (const target of targets) {
      const base = { canonicalLeagueId: target.canonicalLeagueId, season: target.season } as const;
      const league = await input.hub.read(({ ...base, resource: "LEAGUE" }));
      const finished = league.ok ? lastScoredWeek(league.data) : 0;
      for (let week = 1; week <= finished; week += 1) {
        const matchupId = snapshotId(target, week, "matchups");
        if (await input.snapshots.readSnapshot(matchupId)) continue;
        const matchupsRequest: SleeperHubRequest = { ...base, resource: "MATCHUPS", week };
        const matchups = track(matchupsRequest, await input.hub.read(matchupsRequest));
        if (!matchups.ok || !matchups.entry) continue;
        if (await input.snapshots.writeOnce(matchupId, matchups.entry)) snapshotsWritten.push(matchupId);
        // Standings are only meaningful "as of" the most recently finished week.
        if (week === finished) {
          const rosters = await input.hub.read({ ...base, resource: "ROSTERS" });
          const rostersId = snapshotId(target, week, "rosters");
          if (rosters.ok && rosters.entry && await input.snapshots.writeOnce(rostersId, rosters.entry)) snapshotsWritten.push(rostersId);
        }
      }
    }
  }

  return { startedAt: now.toISOString(), nflWeek, requested, providerCalls, cacheHits, failures, snapshotsWritten };
}
