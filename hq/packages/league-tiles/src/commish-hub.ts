/**
 * Commissioner Hub (HQ kit, 2026-11-03): one layout for every league's /commish page, and later the one-platform site.
 *
 * Sections, always in this order: Needs attention → This week → Tools → Quick links.
 * The view (commish-hub-view.tsx) takes `CommishHubData` and fetches nothing. Each site's server-side adapter builds
 * that data from what it already has; "This week" always comes from Sleeper through the shared loader
 * (`loadLeagueTileData`), never from a hand-kept operational snapshot.
 *
 * Privacy: attention items carry counts and totals only — never which owner owes money or who sent feedback.
 */
import { lastScoredWeek, matchupDisplayWeek, matchupPoints, standings, teamRefs, type SleeperLeagueSnapshot } from "./sleeper-adapter.ts";

export type CommishSeverity = "problem" | "action" | "info";

export interface CommishAttentionItem {
  readonly id: string;
  readonly title: string;
  /** One line. Counts and totals only. */
  readonly detail: string;
  readonly severity: CommishSeverity;
  readonly href: string | null;
  readonly cta?: string;
}

export type CommishMatchupStatus = "FINAL" | "LIVE" | "UPCOMING" | "NONE";
export type CommishPrizeTone = "ok" | "pending" | "action";

export interface CommishWeek {
  readonly season: number | null;
  /** The week Sleeper (and the site's Matchups page) is on now. */
  readonly currentWeek: number | null;
  /** Sleeper's last scored week (0 before Week 1 is scored). */
  readonly lastScoredWeek: number;
  readonly phase: string;
  readonly matchups: { readonly week: number | null; readonly status: CommishMatchupStatus; readonly label: string };
  readonly highScore: { readonly week: number; readonly teamName: string; readonly managerName: string; readonly points: number } | null;
  /** League-supplied state of the weekly prize for `highScore.week` (paid, waiting, needs review). */
  readonly prize: { readonly label: string; readonly tone: CommishPrizeTone } | null;
  readonly standings: { readonly throughWeek: number; readonly leader: string; readonly record: string } | null;
  readonly asOf: string | null;
  readonly stale: boolean;
}

/** Tools are shown in this group order everywhere; inside "league" the league's own order is kept. */
export type CommishToolGroup = "finance" | "legislative" | "league" | "feedback" | "health";
export const COMMISH_TOOL_GROUPS: readonly CommishToolGroup[] = ["finance", "legislative", "league", "feedback", "health"];

export interface CommishTool {
  readonly id: string;
  readonly group: CommishToolGroup;
  readonly title: string;
  readonly description: string;
  /** Tools without a real destination are dropped (no "coming soon" cards). */
  readonly href: string | null;
  readonly badge?: string | null;
}

export interface CommishLink { readonly label: string; readonly href: string }

export interface CommishHubData {
  readonly leagueName: string;
  readonly season: number | null;
  readonly attention: readonly CommishAttentionItem[];
  readonly week: CommishWeek | null;
  /** Shown instead of This week when Sleeper could not be read. */
  readonly weekUnavailable: string | null;

  readonly weekDetailLink: CommishLink | null;
  readonly tools: readonly CommishTool[];
  readonly quickLinks: readonly CommishLink[];
}

const SEVERITY_ORDER: Readonly<Record<CommishSeverity, number>> = { problem: 0, action: 1, info: 2 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dollars = (cents: number) => `$${(Math.max(0, cents) / 100).toFixed(2)}`;
const record = (w: number, l: number, t: number) => `${w}-${l}${t ? `-${t}` : ""}`;

/** "This week" from the shared Sleeper snapshot. */
export function buildCommishWeek(snapshot: SleeperLeagueSnapshot, options: { readonly now?: Date; readonly prize?: CommishWeek["prize"] } = {}): CommishWeek {
  const settings = (snapshot.league.settings ?? {}) as Record<string, unknown>;
  const scored = lastScoredWeek(snapshot.league);
  const hasRows = (week: number) => Boolean(snapshot.matchupsByWeek[week]?.length);
  const shown = matchupDisplayWeek({ stateWeek: snapshot.nflWeek, displayWeek: snapshot.displayWeek, lastScoredWeek: scored, seasonType: snapshot.seasonType, hasMatchups: hasRows, now: options.now }) || null;
  const rows = shown ? snapshot.matchupsByWeek[shown] ?? [] : [];
  const status: CommishMatchupStatus = !shown || !rows.length ? "NONE" : shown <= scored ? "FINAL" : rows.some((row) => matchupPoints(row) > 0) ? "LIVE" : "UPCOMING";
  const label = status === "FINAL" ? "Final" : status === "LIVE" ? "In progress" : status === "UPCOMING" ? "Not started" : "No matchups yet";

  const refs = teamRefs(snapshot);
  const scoredRows = (snapshot.matchupsByWeek[scored] ?? []).filter((row) => refs.has(row.roster_id)).map((row) => ({ team: refs.get(row.roster_id)!, points: matchupPoints(row) })).sort((a, b) => b.points - a.points);
  const top = scored >= 1 && scoredRows[0] && scoredRows[0].points > 0 ? scoredRows[0] : null;

  const table = scored >= 1 ? standings(snapshot) : [];
  const leader = table[0];

  const playoffStart = Number(settings.playoff_week_start) || 0;
  const leagueStatus = String((snapshot.league as { status?: unknown }).status ?? "");
  const phase = leagueStatus === "complete" ? "Season complete"
    : snapshot.seasonType === "off" ? "Off-season"
    : snapshot.seasonType === "pre" || (!scored && !(snapshot.nflWeek >= 1)) ? "Preseason"
    : playoffStart && shown && shown >= playoffStart ? "Playoffs"
    : "Regular season";

  return {
    season: Number(snapshot.league.season) || null,
    currentWeek: shown,
    lastScoredWeek: scored,
    phase,
    matchups: { week: shown, status, label },
    highScore: top ? { week: scored, teamName: top.team.teamName, managerName: top.team.managerName, points: top.points } : null,
    prize: top ? options.prize ?? null : null,
    standings: leader ? { throughWeek: scored, leader: leader.team.teamName, record: record(leader.wins, leader.losses, leader.ties) } : null,
    asOf: snapshot.asOf,
    stale: Boolean(snapshot.stale),
  };
}

/** Data problems from the Sleeper read itself. */
export function sleeperAttention(snapshot: SleeperLeagueSnapshot | null, href: string | null = null): readonly CommishAttentionItem[] {
  if (!snapshot) return [{ id: "data-sleeper-unavailable", title: "Sleeper data could not be loaded", detail: "This week's status is unavailable until Sleeper or the HQ feed answers again.", severity: "problem", href, cta: href ? "Check health" : undefined }];
  if (snapshot.stale) return [{ id: "data-sleeper-stale", title: "League data may be out of date", detail: "The HQ feed is serving its last good copy; Sleeper did not answer the latest refresh.", severity: "info", href, cta: href ? "Check health" : undefined }];
  return [];
}

/** Outstanding dues: total and number of teams, never which teams. */
export function duesAttention(input: { readonly outstandingCents: number; readonly teamsOwing: number | null; readonly href: string }): readonly CommishAttentionItem[] {
  if (!(input.outstandingCents > 0)) return [];
  const teams = typeof input.teamsOwing === "number" && input.teamsOwing > 0 ? ` across ${plural(input.teamsOwing, "team")}` : "";
  return [{ id: "finance-dues", title: "Outstanding dues", detail: `${dollars(input.outstandingCents)} still owed${teams}.`, severity: "action", href: input.href, cta: "Open finance" }];
}

const FINANCE_CHECK_TITLES: Readonly<Record<string, string>> = {
  awards: "Awards ready for your review",
  settlements: "Approved awards waiting to be paid",
  expenses: "Ring expense needs a look",
  reserve: "Ring reserve needs a look",
  identity: "Finance team list needs a look",
  postseason: "Postseason placements ready for awards",
  audit: "Finance audit trail needs a look",
  storage: "Finance records could not be read",
};

export function financeCheckAttention(checks: readonly { readonly key: string; readonly label: string; readonly status: string; readonly reason: string }[], href: string): readonly CommishAttentionItem[] {
  const seen = new Set<string>();
  return checks.flatMap((check) => {
    if (check.key === "dues" || seen.has(check.key)) return [];
    if (check.status !== "action-required" && check.status !== "issue" && check.status !== "blocking") return [];
    seen.add(check.key);
    return [{ id: `finance-${check.key}`, title: FINANCE_CHECK_TITLES[check.key] ?? `${check.label} needs a look`, detail: check.reason, severity: check.status === "action-required" ? "action" : "problem", href, cta: "Open finance" } satisfies CommishAttentionItem];
  });
}

export function feedbackAttention(input: { readonly open: number; readonly href: string }): readonly CommishAttentionItem[] {
  if (!(input.open > 0)) return [];
  return [{ id: "feedback-open", title: "New owner feedback", detail: `${plural(input.open, "open report")} waiting for a reply.`, severity: "info", href: input.href, cta: "Open feedback" }];
}

/** Proposals that need the commissioner: ready to close, or collected with no meeting date set. */
export function proposalAttention(input: { readonly readyToClose: number; readonly waitingForMeetingDate: number; readonly href: string }): readonly CommishAttentionItem[] {
  const items: CommishAttentionItem[] = [];
  if (input.readyToClose > 0) items.push({ id: "legislative-ready", title: "Proposals ready to close", detail: `${plural(input.readyToClose, "proposal")} finished voting and can be finalized.`, severity: "action", href: input.href, cta: "Open Legislative Hub" });
  if (input.waitingForMeetingDate > 0) items.push({ id: "legislative-meeting", title: "Proposals waiting for a meeting date", detail: `${plural(input.waitingForMeetingDate, "proposal")} will go to a vote once the Owners Meeting is scheduled.`, severity: "info", href: input.href, cta: "Open Legislative Hub" });
  return items;
}

export function vetoAttention(input: { readonly awaitingPoll: number; readonly href: string }): readonly CommishAttentionItem[] {
  if (!(input.awaitingPoll > 0)) return [];
  return [{ id: "veto-poll", title: "Veto flag waiting on a poll result", detail: `${plural(input.awaitingPoll, "flag")} logged with the poll still open.`, severity: "action", href: input.href, cta: "Open Veto Log" }];
}

/** Drops tools without a destination and puts them in the shared group order (stable inside a group). */
export function orderCommishTools(tools: readonly CommishTool[]): readonly CommishTool[] {
  const seen = new Set<string>();
  return tools
    .filter((tool) => Boolean(tool.href) && !seen.has(tool.id) && Boolean(seen.add(tool.id)))
    .map((tool, index) => ({ tool, index }))
    .sort((a, b) => COMMISH_TOOL_GROUPS.indexOf(a.tool.group) - COMMISH_TOOL_GROUPS.indexOf(b.tool.group) || a.index - b.index)
    .map(({ tool }) => tool);
}

/** Problems first, then actions, then notes; duplicates (same id) dropped. */
export function orderCommishAttention(items: readonly CommishAttentionItem[]): readonly CommishAttentionItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => SEVERITY_ORDER[a.item.severity] - SEVERITY_ORDER[b.item.severity] || a.index - b.index)
    .map(({ item }) => item);
}

/** The five quick links, in the same order on every league. */
export function commishQuickLinks(paths: { readonly home: string; readonly matchups: string; readonly constitution: string; readonly history: string; readonly legislative: string }): readonly CommishLink[] {
  return [
    { label: "Home", href: paths.home },
    { label: "Matchups", href: paths.matchups },
    { label: "Constitution", href: paths.constitution },
    { label: "History", href: paths.history },
    { label: "Legislative Hub", href: paths.legislative },
  ];
}

export function buildCommishHub(input: {
  readonly leagueName: string;
  readonly snapshot: SleeperLeagueSnapshot | null;
  readonly attention: readonly CommishAttentionItem[];
  readonly tools: readonly CommishTool[];
  readonly quickLinks: readonly CommishLink[];
  readonly prize?: CommishWeek["prize"];
  readonly weekDetailLink?: CommishLink | null;
  readonly healthHref?: string | null;
  readonly now?: Date;
}): CommishHubData {
  const week = input.snapshot ? buildCommishWeek(input.snapshot, { now: input.now, prize: input.prize ?? null }) : null;
  return {
    leagueName: input.leagueName,
    season: week?.season ?? null,
    attention: orderCommishAttention([...sleeperAttention(input.snapshot, input.healthHref ?? null), ...input.attention]),
    week,
    weekUnavailable: week ? null : "Sleeper could not be reached just now. Reload in a minute.",
    weekDetailLink: input.weekDetailLink ?? null,
    tools: orderCommishTools(input.tools),
    quickLinks: input.quickLinks,
  };
}
