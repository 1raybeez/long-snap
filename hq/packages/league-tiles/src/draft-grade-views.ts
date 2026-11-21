import rookieMarket from "./rookie-market.data.json" with { type: "json" };
import { gradeRookieDraft, letterFor, type GradePickInput, type GradeTeamInput } from "./draft-grades.ts";
import type { FantasyCalcValueLike } from "./roster-strength.ts";

export type GradeViewId = "draft-day" | "after-season" | "today";

export interface GradeBoardRow {
  readonly teamId: string;
  readonly team: string;
  readonly owner: string | null;
  readonly rank: number;
  readonly grade: string;
  readonly cols: readonly [string, string, string];
  readonly href: string | null;
}

export interface GradeCallout { readonly player: string; readonly detail: string; readonly team: string; readonly value: string }

export interface GradeView {
  readonly id: GradeViewId;
  readonly status: "ready" | "locked" | "unavailable";
  /** One line under the view switch: what this view measures, or when it unlocks. */
  readonly note: string;
  readonly columns: readonly [string, string, string];
  readonly rows: readonly GradeBoardRow[];
  readonly steals: readonly GradeCallout[];
  readonly reaches: readonly GradeCallout[];
  readonly stealTitle: string;
  readonly reachTitle: string;
  readonly method: string;
  /** Every pick's +/- in this view, by team (for the Team Report Card). */
  readonly teamPicks?: Readonly<Record<string, readonly { readonly player: string; readonly detail: string; readonly delta: number }[]>>;
}

export interface SeasonGrades {
  readonly season: number;
  readonly title: string;
  readonly views: readonly GradeView[];
  readonly recap?: { readonly title: string; readonly line: string; readonly href: string } | null;
}

export const VIEW_LABELS: Record<GradeViewId, string> = { "draft-day": "Draft Day", "after-season": "After the Season", today: "Today" };

export function lockedView(id: GradeViewId, note: string): GradeView {
  return { id, status: "locked", note, columns: ["", "", ""], rows: [], steals: [], reaches: [], stealTitle: "", reachTitle: "", method: "" };
}

const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Rookie-draft view from a value list (FantasyCalc today, or season points): uses the shared grader. */
export function rookieValueView(input: {
  readonly id: GradeViewId;
  readonly season: number;
  readonly picks: readonly GradePickInput[];
  readonly teams: readonly (GradeTeamInput & { readonly href?: string | null })[];
  readonly values: readonly FantasyCalcValueLike[];
  readonly note: string;
  readonly method: string;
}): GradeView | null {
  const report = gradeRookieDraft({ season: input.season, title: "", picks: input.picks, teams: input.teams, values: input.values });
  if (!report) return null;
  const teamName = (id: string) => input.teams.find((t) => t.id === id)?.name ?? "";
  return {
    id: input.id,
    status: "ready",
    note: input.note,
    columns: ["Class Impact", "Market Efficiency", input.id === "after-season" ? "Best rookie season" : "Best pick today"],
    rows: report.teams.map((t) => ({ teamId: t.id, team: t.name, owner: t.owner, rank: t.rank, grade: t.grade, cols: [`#${t.classImpactRank}`, `#${t.efficiencyRank}`, t.best ? `${t.best.playerName} · ${t.best.label}` : "—"], href: input.teams.find((x) => x.id === t.id)?.href ?? null })),
    steals: report.steals.map((p) => ({ player: p.playerName, detail: p.label, team: teamName(p.teamId), value: sign(p.delta) })),
    reaches: report.reaches.map((p) => ({ player: p.playerName, detail: p.label, team: teamName(p.teamId), value: sign(p.delta) })),
    stealTitle: "Biggest steals",
    reachTitle: "Biggest reaches",
    method: input.method,
    teamPicks: groupPicks(report.picks.map((p) => ({ teamId: p.teamId, player: p.playerName, detail: p.label, delta: p.delta }))),
  };
}

function groupPicks(rows: readonly { teamId: string; player: string; detail: string; delta: number }[]) {
  const out: Record<string, { player: string; detail: string; delta: number }[]> = {};
  for (const r of rows) (out[r.teamId] ??= []).push({ player: r.player, detail: r.detail, delta: r.delta });
  return out;
}

type MarketSeason = { source: string; snapshotDate: string; timing: string; coverageNote: string; players: Record<string, { id: string | null; name: string; expected: number }> };
const MARKET = (rookieMarket as { seasons: Record<string, MarketSeason> }).seasons;
export const normName = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");

/** Draft-week market for a rookie class (shared by every 1QB league), or null. */
export function rookieMarketFor(season: number): MarketSeason | null {
  return MARKET[String(season)] ?? null;
}

/**
 * Draft Day view for a rookie draft: each pick against where the draft-week market
 * expected that player to go. Positive = the player lasted longer than the market expected.
 */
export function rookieDraftDayView(input: {
  readonly season: number;
  readonly picks: readonly GradePickInput[];
  readonly teams: readonly (GradeTeamInput & { readonly href?: string | null })[];
}): GradeView {
  const market = rookieMarketFor(input.season);
  if (!market) return lockedView("draft-day", "No draft-week market was saved for this draft.");
  const byId = new Map(Object.values(market.players).filter((p) => p.id).map((p) => [p.id as string, p.expected]));
  const expectedFor = (p: GradePickInput) => (p.playerId && byId.has(p.playerId) ? byId.get(p.playerId)! : market.players[normName(p.playerName)]?.expected ?? null);
  const graded = input.picks.map((p) => ({ p, expected: expectedFor(p) })).map((x) => ({ ...x, delta: x.expected === null ? null : Math.round(x.p.overall - x.expected) }));
  const teams = input.teams
    .map((t) => {
      const mine = graded.filter((g) => g.p.teamId === t.id);
      const covered = mine.filter((g) => g.delta !== null) as (typeof graded[number] & { delta: number })[];
      const avg = covered.length ? covered.reduce((s, g) => s + g.delta, 0) / covered.length : null;
      const best = [...covered].sort((a, b) => b.delta - a.delta)[0] ?? null;
      return { t, mine, covered, avg, best };
    })
    .filter((x) => x.mine.length);
  const scored = teams.filter((x) => x.avg !== null && x.covered.length / x.mine.length >= 0.5);
  const mean = scored.reduce((s, x) => s + x.avg!, 0) / (scored.length || 1);
  const sd = Math.sqrt(scored.reduce((s, x) => s + (x.avg! - mean) ** 2, 0) / (scored.length || 1)) || 1;
  const ordered = [...scored].sort((a, b) => b.avg! - a.avg!);
  const unscored = teams.filter((x) => !scored.includes(x));
  const rows: GradeBoardRow[] = [
    ...ordered.map((x, i) => ({ teamId: x.t.id, team: x.t.name, owner: x.t.owner ?? null, rank: i + 1, grade: letterFor((x.avg! - mean) / sd), cols: [`${sign(Math.round(x.avg! * 10) / 10)} ${Math.abs(Math.round(x.avg! * 10) / 10) === 1 ? "spot" : "spots"}`, `${x.covered.length} of ${x.mine.length}`, x.best ? `${x.best.p.playerName} · ${sign(x.best.delta)}` : "—"] as const, href: x.t.href ?? null })),
    ...unscored.map((x, i) => ({ teamId: x.t.id, team: x.t.name, owner: x.t.owner ?? null, rank: ordered.length + i + 1, grade: "—", cols: ["Not enough data", `${x.covered.length} of ${x.mine.length}`, "—"] as const, href: x.t.href ?? null })),
  ];
  const all = graded.filter((g) => g.delta !== null) as (typeof graded[number] & { delta: number })[];
  const teamName = (id: string) => input.teams.find((t) => t.id === id)?.name ?? "";
  const label = (p: GradePickInput) => (p.round && p.pickInRound ? `${p.round}.${String(p.pickInRound).padStart(2, "0")}` : `#${p.overall}`);
  const timingWord = market.timing === "DRAFT_DAY_CUTOFF_SAFE" ? "the draft-week rookie rankings" : `the ${market.snapshotDate.slice(0, 4)} preseason rookie market (${market.snapshotDate}, the earliest saved)`;
  return {
    id: "draft-day",
    status: ordered.length ? "ready" : "unavailable",
    note: `Draft Day: each pick against where ${timingWord} expected that rookie to go (${market.source}). Frozen; it never changes.`,
    columns: ["Value vs. market", "Picks with market data", "Best value pick"],
    rows,
    steals: [...all].sort((a, b) => b.delta - a.delta).slice(0, 5).filter((g) => g.delta > 0).map((g) => ({ player: g.p.playerName, detail: `${label(g.p)} · expected ${fmt(g.expected!)}`, team: teamName(g.p.teamId), value: sign(g.delta) })),
    reaches: [...all].sort((a, b) => a.delta - b.delta).slice(0, 5).filter((g) => g.delta < 0).map((g) => ({ player: g.p.playerName, detail: `${label(g.p)} · expected ${fmt(g.expected!)}`, team: teamName(g.p.teamId), value: sign(g.delta) })),
    stealTitle: "Fell furthest (value picks)",
    reachTitle: "Taken earliest vs. market (reaches)",
    method: `${market.coverageNote} Teams need market data on at least half their picks to be graded.`,
    teamPicks: groupPicks(all.map((g) => ({ teamId: g.p.teamId, player: g.p.playerName, detail: `${label(g.p)} · expected ${fmt(g.expected!)}`, delta: g.delta }))),
  };
}

/**
 * Points each player scored while on a roster in one Sleeper league season (regular season),
 * as a value list for the shared grader. Completed seasons only; cached a day.
 */
export async function loadLeagueSeasonPoints(leagueId: string): Promise<FantasyCalcValueLike[]> {
  const get = async <T,>(path: string): Promise<T | null> => {
    try {
      const r = await fetch(`https://api.sleeper.app/v1${path}`, { next: { revalidate: 86_400 } } as RequestInit);
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const league = await get<{ settings?: { playoff_week_start?: number } }>(`/league/${leagueId}`);
  const lastWeek = Math.max(1, (league?.settings?.playoff_week_start ?? 15) - 1);
  const weeks = await Promise.all(Array.from({ length: lastWeek }, (_, i) => get<{ players_points?: Record<string, number> }[]>(`/league/${leagueId}/matchups/${i + 1}`)));
  const totals = new Map<string, number>();
  for (const week of weeks) for (const team of week ?? []) for (const [id, pts] of Object.entries(team.players_points ?? {})) totals.set(id, (totals.get(id) ?? 0) + (Number(pts) || 0));
  return [...totals.entries()].map(([id, value]) => ({ player: { sleeperId: id }, value }));
}

export interface AuctionBuy { readonly teamId: string; readonly player: string; readonly position: string | null; readonly price: number; readonly keeper: boolean; readonly metric: number }

/**
 * Auction view from a per-player number (season points for After the Season, today's value
 * for Today): teams graded on what they got (Class Impact) and what they got per dollar.
 * Steals = most per dollar ($5+), reaches = $25+ buys that returned the least per dollar.
 */
export function auctionValueView(input: {
  readonly id: GradeViewId;
  readonly buys: readonly AuctionBuy[];
  readonly teams: readonly { readonly id: string; readonly name: string; readonly owner: string | null; readonly href?: string | null }[];
  readonly unit: string;
  readonly note: string;
  readonly method: string;
  readonly showNumbers: boolean;
}): GradeView | null {
  const buys = input.buys.filter((b) => b.price > 0);
  if (!buys.length || !buys.some((b) => b.metric > 0)) return null;
  const rows0 = input.teams.map((t) => {
    const mine = buys.filter((b) => b.teamId === t.id);
    const total = mine.reduce((s, b) => s + b.metric, 0);
    const spent = mine.reduce((s, b) => s + b.price, 0);
    const best = [...mine].filter((b) => b.price >= 5).sort((a, b) => b.metric / b.price - a.metric / a.price)[0] ?? null;
    return { t, total, perDollar: spent ? total / spent : 0, best, n: mine.length };
  }).filter((r) => r.n);
  const z = (xs: number[]) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) || 1; return xs.map((x) => (x - m) / sd); };
  const zi = z(rows0.map((r) => r.total));
  const ze = z(rows0.map((r) => r.perDollar));
  const scored = rows0.map((r, i) => ({ ...r, c: 0.6 * zi[i] + 0.4 * ze[i] })).sort((a, b) => b.c - a.c);
  const rankOf = (vals: number[], v: number) => [...vals].sort((a, b) => b - a).indexOf(v) + 1;
  const totals = rows0.map((r) => r.total);
  const pers = rows0.map((r) => r.perDollar);
  const name = (id: string) => input.teams.find((t) => t.id === id)?.name ?? "";
  const per = (b: AuctionBuy) => b.metric / b.price;
  const fmtPer = (b: AuctionBuy) => (input.showNumbers ? `${per(b).toFixed(1)} ${input.unit}/$` : "");
  return {
    id: input.id,
    status: "ready",
    note: input.note,
    columns: ["Class Impact", "Per dollar", "Best buy"],
    rows: scored.map((r, i) => ({ teamId: r.t.id, team: r.t.name, owner: r.t.owner, rank: i + 1, grade: letterFor(r.c), cols: [`#${rankOf(totals, r.total)}`, `#${rankOf(pers, r.perDollar)}`, r.best ? `${r.best.player} · $${r.best.price}` : "—"] as const, href: r.t.href ?? null })),
    steals: [...buys].filter((b) => b.price >= 5).sort((a, b) => per(b) - per(a)).slice(0, 5).map((b) => ({ player: b.player, detail: `$${b.price}${b.keeper ? " keeper" : ""}`, team: name(b.teamId), value: fmtPer(b) || "value" })),
    reaches: [...buys].filter((b) => b.price >= 25).sort((a, b) => per(a) - per(b)).slice(0, 5).map((b) => ({ player: b.player, detail: `$${b.price}${b.keeper ? " keeper" : ""}`, team: name(b.teamId), value: fmtPer(b) || "reach" })),
    stealTitle: "Best buys (most per dollar, $5+)",
    reachTitle: "Money pits ($25+, least per dollar)",
    method: input.method,
    teamPicks: groupPicks(buys.map((b) => {
      const all = buys.filter((x) => x.price >= 5).map(per).sort((a, c) => c - a);
      const rank = all.indexOf(per(b));
      const delta = b.price >= 5 && all.length ? Math.round(((all.length / 2) - rank) / Math.max(1, all.length / 20)) : 0;
      return { teamId: b.teamId, player: b.player, detail: `$${b.price}${b.keeper ? " keeper" : ""}`, delta };
    })),
  };
}
