/**
 * Shared Sleeper loader for the Trade Analyzer (HQ, 2026-10-29). Any Sleeper league (dynasty,
 * redraft, keeper) passes its league id and how its rosters map to teams; this builds the
 * TradeContext the engine and trade-service use. Server only: the result holds raw market values.
 *
 * - Fresh rosters, taxi and IR, records, FAAB left
 * - Weekly Sleeper projections, re-scored for the league (6-pt passing TDs, full PPR, TE premium)
 * - FantasyCalc values (dynasty or redraft) by Sleeper id; dynasty rows also carry redraft values
 * - Future picks: every team owns its own unless Sleeper's traded_picks moved them
 * - This season's completed two-team trades (players and picks) for the veto check
 */
import type { TradePlayer, TradeTeam } from "./trade-engine.ts";
import { pickAssetId, type StoredTrade, type TradeContext } from "./trade-service.ts";

const SLEEPER = "https://api.sleeper.app/v1";

export interface SleeperTradeTeamInfo {
  readonly id: string;
  readonly name: string;
  readonly owner: string | null;
  /** Match by Sleeper roster id, or by the Sleeper user ids of the owner/co-owners. */
  readonly rosterId?: number;
  readonly sleeperUserIds?: readonly string[];
}

export interface FantasyCalcRow { player?: { name?: string; sleeperId?: string | null; position?: string; maybeAge?: number | null; maybeTeam?: string | null }; value?: number; redraftValue?: number }
export interface PlayerMeta { name?: string | null; position?: string | null; team?: string | null; age?: number | null }

export interface SleeperTradeContext extends TradeContext { deadlineWeek: number; nowWeek: number; seasonType: string; scoringNote: string | null; lastScored?: number }

type SleeperRoster = { roster_id: number; owner_id?: string | null; co_owners?: string[] | null; players?: string[] | null; starters?: string[] | null; taxi?: string[] | null; reserve?: string[] | null; settings?: { wins?: number; losses?: number; ties?: number; waiver_budget_used?: number; fpts?: number; fpts_decimal?: number; ppts?: number; ppts_decimal?: number } };

/**
 * How the next rookie draft is ordered, for Early / Mid / Late pick values (KeepTradeCut-style).
 * Non-playoff teams take picks 1..N by the league's rule; playoff teams take the rest by finish
 * (projected from today's standings until the playoffs are played).
 */
export interface PickOrderRule {
  readonly playoffTeams: number;

  readonly pointsSeeds?: number;

  readonly nonPlayoff: "maxPf" | "pointsFor" | "standings";
}

/** Projected next-draft slot for each roster (1 = first pick), from today's records and points. */
export function projectDraftSlots(rosters: readonly { roster_id: number; settings?: SleeperRoster["settings"] }[], rule: PickOrderRule): Map<number, number> {
  const wins = (r: (typeof rosters)[number]) => (r.settings?.wins ?? 0) + 0.5 * (r.settings?.ties ?? 0);
  const pf = (r: (typeof rosters)[number]) => (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
  const maxPf = (r: (typeof rosters)[number]) => (r.settings?.ppts ?? 0) + (r.settings?.ppts_decimal ?? 0) / 100;
  const standing = [...rosters].sort((a, b) => wins(b) - wins(a) || pf(b) - pf(a));
  const byRecord = standing.slice(0, rule.playoffTeams - (rule.pointsSeeds ?? 0));
  const byPoints = standing.slice(byRecord.length).sort((a, b) => pf(b) - pf(a)).slice(0, rule.pointsSeeds ?? 0);
  const playoff = standing.filter((r) => byRecord.includes(r) || byPoints.includes(r));
  const out = standing.filter((r) => !playoff.includes(r));
  const outOrder = rule.nonPlayoff === "maxPf" ? [...out].sort((a, b) => maxPf(a) - maxPf(b)) : rule.nonPlayoff === "pointsFor" ? [...out].sort((a, b) => pf(a) - pf(b)) : [...out].reverse();
  const slots = new Map<number, number>();
  outOrder.forEach((r, i) => slots.set(r.roster_id, i + 1));
  [...playoff].reverse().forEach((r, i) => slots.set(r.roster_id, out.length + i + 1));
  return slots;
}

/** KeepTradeCut / FantasyCalc tiers: thirds of the draft. */
export const pickTier = (slot: number, teams: number) => (slot <= Math.ceil(teams / 3) ? "Early" : slot <= Math.ceil((2 * teams) / 3) ? "Mid" : "Late");
type TradedPick = { season: string; round: number; roster_id: number; owner_id: number; previous_owner_id: number };
type ProjRow = { player_id?: string; stats?: Record<string, number>; player?: { first_name?: string; last_name?: string; position?: string; team?: string | null; injury_status?: string | null } };
type League = { settings?: { playoff_week_start?: number; draft_rounds?: number; waiver_budget?: number; trade_deadline?: number; num_teams?: number; last_scored_leg?: number }; roster_positions?: string[]; scoring_settings?: Record<string, number> };

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.split("?")[0]}`);
  return (await r.json()) as T;
}

/** Sleeper's pts_half_ppr assumes 4-pt passing TDs, −1 INT, 0.5 PPR, no TE premium; adjust to the league. */
export function rescore(stats: Record<string, number> | undefined, pos: string | undefined, scoring: Record<string, number>): number {
  if (!stats) return 0;
  let pts = Number(stats.pts_half_ppr ?? 0) || 0;
  const n = (k: string) => Number(stats[k] ?? 0) || 0;
  if (typeof scoring.pass_td === "number") pts += (scoring.pass_td - 4) * n("pass_td");
  if (typeof scoring.pass_int === "number") pts += (scoring.pass_int + 1) * n("pass_int");
  if (typeof scoring.rec === "number") pts += (scoring.rec - 0.5) * n("rec");
  if (pos === "TE" && typeof scoring.bonus_rec_te === "number") pts += scoring.bonus_rec_te * n("rec");
  return Math.round(pts * 10) / 10;
}

export function scoringNote(scoring: Record<string, number>): string | null {
  const parts: string[] = [];
  if (scoring.pass_td && scoring.pass_td !== 4) parts.push(`${scoring.pass_td}-pt passing TDs`);
  if (typeof scoring.rec === "number" && scoring.rec !== 0.5) parts.push(scoring.rec === 1 ? "full PPR" : `${scoring.rec} PPR`);
  if (scoring.bonus_rec_te) parts.push(`TE premium +${scoring.bonus_rec_te}`);
  return parts.length ? `Projections use ${parts.join(", ")}.` : null;
}

/** FantasyCalc settings that match the league: QBs (superflex = 2), teams, PPR. */
export function fantasyCalcUrl(league: League, dynasty: boolean) {
  const slots = league.roster_positions ?? [];
  const numQbs = slots.includes("SUPER_FLEX") || slots.filter((s) => s === "QB").length > 1 ? 2 : 1;
  const teams = Number(league.settings?.num_teams) || 12;
  const rec = Number(league.scoring_settings?.rec ?? 0.5);
  const ppr = rec >= 1 ? 1 : rec > 0 ? 0.5 : 0;
  return `https://api.fantasycalc.com/values/current?isDynasty=${dynasty}&numQbs=${numQbs}&numTeams=${teams}&ppr=${ppr}`;
}

export const DYNASTY_DEALER_URL = "https://www.dynastydealer.com/api/player-values";
export const DYNASTY_DEALER_CREDIT = { name: "Dynasty Dealer", href: "https://www.dynastydealer.com" } as const;
type DynastyDealerRow = { sleeper_id?: string; position?: string; current_value?: number };

/**
 * Blend FantasyCalc and Dynasty Dealer dynasty values half and half. The two sites use differently shaped scales
 * (Dynasty Dealer rates depth players much higher), so Dynasty Dealer is first put on FantasyCalc's curve by rank: its
 * Nth-best player gets FantasyCalc's Nth-best value. Then the two are averaged, so neither source decides alone; a player
 * only one source values keeps that source's value. Picks go through the same curve and are keyed the way the trade
 * context looks them up ("2027 1st", "2027 1st (Early)").
 */
export function blendDynastyDealer(fc: readonly FantasyCalcRow[], dd: readonly DynastyDealerRow[]): { players: Map<string, number>; picks: Map<string, number> } {
  const ddPlayers = new Map(dd.flatMap((r) => (r.sleeper_id && r.position !== "PICK" && typeof r.current_value === "number" ? [[r.sleeper_id, r.current_value] as const] : [])));
  const fcCurve = fc.flatMap((r) => (r.player?.position !== "PICK" && typeof r.value === "number" ? [r.value] : [])).sort((a, b) => b - a);
  const ddCurve = [...ddPlayers.values()].sort((a, b) => b - a);
  /** A Dynasty Dealer value → FantasyCalc's value at the same rank (interpolated between ranks). */
  const toFc = (v: number): number => {
    if (!fcCurve.length || !ddCurve.length) return v;
    let i = ddCurve.findIndex((x) => x <= v);
    if (i === -1) i = ddCurve.length - 1;
    if (i === 0) return fcCurve[0]! * (v / ddCurve[0]!);
    const hi = ddCurve[i - 1]!, lo = ddCurve[i]!;
    const t = hi === lo ? 0 : (hi - v) / (hi - lo);
    const at = (n: number) => fcCurve[Math.min(n, fcCurve.length - 1)]! * (n >= fcCurve.length ? Math.max(0, 1 - (n - fcCurve.length + 1) / 50) : 1);
    return at(i - 1) + (at(i) - at(i - 1)) * t;
  };
  const players = new Map<string, number>();
  for (const r of fc) { const id = r.player?.sleeperId; if (id && r.player?.position !== "PICK" && typeof r.value === "number") players.set(id, r.value); }
  for (const [id, v] of ddPlayers) { const m = toFc(v); const a = players.get(id); players.set(id, a === undefined ? m : (a + m) / 2); }
  const fcPicks = new Map(fc.filter((r) => r.player?.position === "PICK" && r.player.name && typeof r.value === "number").map((r) => [r.player!.name!, r.value!] as const));
  const ddPicks = new Map<string, number[]>();
  for (const r of dd) {
    const m = /^pick_(\d{4})_(\d)_(early|mid|late)$/.exec(r.sleeper_id ?? "");
    if (!m || typeof r.current_value !== "number") continue;
    const label = `${m[1]} ${ordinal(Number(m[2]))}`;
    const tier = m[3]![0]!.toUpperCase() + m[3]!.slice(1);
    const v = toFc(r.current_value);
    ddPicks.set(`${label} (${tier})`, [v]);
    ddPicks.set(label, [...(ddPicks.get(label) ?? []), v]);
  }
  const picks = new Map<string, number>(fcPicks);
  for (const [key, vs] of ddPicks) { const v = vs.reduce((a, b) => a + b, 0) / vs.length; const a = picks.get(key); picks.set(key, a === undefined ? v : (a + v) / 2); }
  return { players, picks };
}

export async function buildSleeperTradeContext(opts: {
  leagueId: string;
  season: number;
  teams: readonly SleeperTradeTeamInfo[];
  market: "dynasty" | "redraft";
  /** How many future drafts of picks are tradeable (0 = none). */
  pickYears: number;
  /** When set, next year's picks are valued Early / Mid / Late from the projected draft order. */
  pickOrder?: PickOrderRule;
  /** Used when FantasyCalc can't be reached. */
  fallbackFantasyCalc?: () => Promise<FantasyCalcRow[]>;
  /** Dynasty leagues: blend Dynasty Dealer's values with FantasyCalc's (1-QB leagues only; see blendDynastyDealer). */
  dynastyDealer?: boolean;
  /** Extra player facts (names, ages) for anyone the projections feed doesn't cover. */
  playerMeta?: (ids: readonly string[]) => ReadonlyMap<string, PlayerMeta>;
}): Promise<SleeperTradeContext> {
  const { leagueId, season } = opts;
  const [rosters, league, state, traded] = await Promise.all([
    getJson<SleeperRoster[]>(`${SLEEPER}/league/${leagueId}/rosters`),
    getJson<League>(`${SLEEPER}/league/${leagueId}`),
    getJson<{ week?: number; season_type?: string }>(`${SLEEPER}/state/nfl`),
    opts.pickYears > 0 ? getJson<TradedPick[]>(`${SLEEPER}/league/${leagueId}/traded_picks`).catch(() => [] as TradedPick[]) : Promise.resolve([] as TradedPick[]),
  ]);
  const scoring = league.scoring_settings ?? {};
  const playoffStart = Number(league.settings?.playoff_week_start) || 15;
  const deadlineWeek = Number(league.settings?.trade_deadline) || 0;
  const nowWeek = Math.max(1, Number(state.week) || 1);
  const weeks = state.season_type === "regular" || !state.season_type ? Array.from({ length: Math.max(0, playoffStart - nowWeek) }, (_, i) => nowWeek + i) : [];

  const pts = new Map<string, Record<number, number>>();
  const info = new Map<string, NonNullable<ProjRow["player"]>>();
  const loadWeek = async (week: number) => {
    try {
      const rows = await getJson<ProjRow[]>(`https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF`);
      for (const row of rows) {
        if (!row.player_id) continue;
        const cur = pts.get(row.player_id) ?? {};
        cur[week] = rescore(row.stats, row.player?.position, scoring);
        pts.set(row.player_id, cur);
        if (row.player && !info.has(row.player_id)) info.set(row.player_id, row.player);
      }
    } catch { /* a missing week counts as no projection */ }
  };
  const loadFc = async (): Promise<FantasyCalcRow[]> => {
    try {
      const rows = await getJson<FantasyCalcRow[]>(fantasyCalcUrl(league, opts.market === "dynasty"));
      if (Array.isArray(rows) && rows.length > 100) return rows;
    } catch { /* fall back */ }
    return opts.fallbackFantasyCalc ? opts.fallbackFantasyCalc().catch(() => []) : [];
  };
  const oneQb = !fantasyCalcUrl(league, true).includes("numQbs=2");
  const loadDd = async (): Promise<DynastyDealerRow[]> => {
    if (!opts.dynastyDealer || opts.market !== "dynasty" || !oneQb) return [];
    // Dynasty Dealer asks API users to cache: an hour is plenty for trade values.
    try { const r = await fetch(DYNASTY_DEALER_URL, { next: { revalidate: 3600 } } as RequestInit); if (!r.ok) return []; const d = (await r.json()) as { players?: DynastyDealerRow[] }; return Array.isArray(d.players) ? d.players : []; } catch { return []; }
  };
  const [, fc, dd] = await Promise.all([Promise.all(weeks.map(loadWeek)), loadFc(), loadDd()]);
  const blended = dd.length > 100 ? blendDynastyDealer(fc, dd) : null;
  // Blend with what players have actually scored this season (owners' main complaint about projections alone).
  const ppg = await loadSeasonPpg(season, nowWeek - 1, scoring).catch(() => new Map<string, { ppg: number; games: number }>());
  for (const [id, p] of pts) pts.set(id, blendWithSeason(p, ppg.get(id)));
  const fcById = new Map(fc.flatMap((row) => (row.player?.sleeperId ? [[row.player.sleeperId, row] as const] : [])));
  const fcPick: Map<string, number | null> = blended ? new Map(blended.picks) : new Map(fc.filter((row) => row.player?.position === "PICK" && row.player.name).map((row) => [row.player!.name!, row.value ?? null] as const));

  // Roster → team.
  const teamFor = (r: SleeperRoster) => opts.teams.find((t) => t.rosterId === r.roster_id) ?? opts.teams.find((t) => (t.sleeperUserIds ?? []).some((u) => u === r.owner_id || (r.co_owners ?? []).includes(u)));
  const rosterTeam = new Map(rosters.flatMap((r) => { const t = teamFor(r); return t ? [[r.roster_id, t] as const] : []; }));
  const shortName = (rosterId: number) => (rosterTeam.get(rosterId)?.name ?? `Team ${rosterId}`).replace(/^The /, "");
  const budget = Number(league.settings?.waiver_budget) || 0;

  // Future picks.
  const rounds = Number(league.settings?.draft_rounds) || 4;
  const pickOwner = new Map<string, number>();
  if (opts.pickYears > 0) {
    const seasons = [...new Set([...Array.from({ length: opts.pickYears }, (_, i) => season + 1 + i), ...traded.map((p) => Number(p.season)).filter((s) => s > season)])].sort();
    for (const s of seasons) for (let round = 1; round <= rounds; round++) for (const r of rosters) pickOwner.set(pickAssetId(s, round, r.roster_id), r.roster_id);
    for (const p of traded) { const id = pickAssetId(p.season, p.round, p.roster_id); if (pickOwner.has(id)) pickOwner.set(id, p.owner_id); }
  }

  const draftSlots = opts.pickOrder && opts.pickYears > 0 ? projectDraftSlots(rosters, opts.pickOrder) : new Map<number, number>();
  const meta = opts.playerMeta ? opts.playerMeta(rosters.flatMap((r) => r.players ?? [])) : new Map<string, PlayerMeta>();
  const teams: TradeTeam[] = rosters.flatMap((r) => {
    const t = rosterTeam.get(r.roster_id);
    if (!t) return [];
    const taxi = new Set(r.taxi ?? []);
    const reserve = new Set(r.reserve ?? []);
    const players: TradePlayer[] = (r.players ?? []).map((id) => {
      const pi = info.get(id);
      const m = meta.get(id);
      const row = fcById.get(id);
      const pos = pi?.position ?? m?.position ?? row?.player?.position ?? "?";
      const team = pi?.team ?? m?.team ?? row?.player?.maybeTeam ?? null;
      const name = pos === "DEF" ? `${team ?? id} D/ST` : [pi?.first_name, pi?.last_name].filter(Boolean).join(" ") || m?.name || row?.player?.name || id;
      return {
        id, name, pos, nflTeam: team,
        injury: pi?.injury_status ?? null,
        proj: pts.get(id) ?? {},
        market: blended?.players.has(id) ? Math.round(blended.players.get(id)!) : typeof row?.value === "number" ? row.value : null,
        nowValue: opts.market === "dynasty" && typeof row?.redraftValue === "number" ? row.redraftValue : null,
        age: typeof row?.player?.maybeAge === "number" ? row.player.maybeAge : typeof m?.age === "number" ? m.age : null,
        tag: taxi.has(id) ? "Taxi" : reserve.has(id) ? "IR" : null,
        kind: "player",
      };
    });
    const picks: TradePlayer[] = [...pickOwner.entries()].filter(([, owner]) => owner === r.roster_id).map(([id]) => {
      const [, s, round, orig] = id.split(":");
      const label = `${s} ${ordinal(Number(round))}`;
      const slot = Number(s) === season + 1 ? draftSlots.get(Number(orig)) : undefined;
      const tier = slot ? pickTier(slot, rosters.length) : null;
      const tierValue = tier ? fcPick.get(`${label} (${tier})`) : undefined;
      const name = tier && tierValue != null ? `${s} ${tier} ${ordinal(Number(round))} (${shortName(Number(orig))})` : `${label} (${shortName(Number(orig))})`;
      return { id, name, pos: "PICK", nflTeam: null, injury: null, proj: {}, market: tierValue ?? fcPick.get(label) ?? null, nowValue: 0, age: null, tag: Number(orig) === r.roster_id ? null : "Acquired", kind: "pick" };
    });
    const st = r.settings;
    return [{
      id: t.id, name: t.name, owner: t.owner,
      record: st ? `${st.wins ?? 0}-${st.losses ?? 0}${st.ties ? `-${st.ties}` : ""}` : null,
      faab: budget ? Math.max(0, budget - (Number(st?.waiver_budget_used) || 0)) : null,
      players: [...players, ...picks],
      starters: r.starters ?? null,
    }];
  });

  const rosterToTeam = Object.fromEntries([...rosterTeam.entries()].map(([rid, t]) => [String(rid), t.id]));
  const txWeeks = weeks.length || state.season_type === "regular" ? Array.from({ length: Math.min(18, nowWeek + 1) }, (_, i) => i + 1) : [];
  type Tx = { type?: string; status?: string; roster_ids?: number[]; adds?: Record<string, number> | null; draft_picks?: TradedPick[]; transaction_id: string; leg?: number; created?: number };
  const trades: StoredTrade[] = (await Promise.all(txWeeks.map((w) => getJson<Tx[]>(`${SLEEPER}/league/${leagueId}/transactions/${w}`).catch(() => [] as Tx[]))))
    .flat()
    .filter((t) => t.type === "trade" && t.status === "complete" && (t.roster_ids?.length ?? 0) === 2)
    .map((t) => ({ id: t.transaction_id, week: Number(t.leg) || 0, created: Number(t.created) || 0, rosterIds: t.roster_ids ?? [], adds: t.adds ?? {}, draftPicks: t.draft_picks ?? [] }))
    .sort((a, b) => b.created - a.created);

  const slots = (league.roster_positions ?? []).filter((s) => !["BN", "IR", "TAXI"].includes(s)).map((s) => (s === "D/ST" ? "DEF" : s));
  const lastScored = Number(league.settings?.last_scored_leg) || 0;
  const seasonType = state.season_type ?? "regular";
  return { teams, weeks, slots, updatedAt: new Date().toISOString(), trades, rosterToTeam, deadlineWeek, nowWeek, seasonType, scoringNote: scoringNote(scoring), lastScored, tradesClosed: tradesAreClosed({ deadlineWeek, nowWeek, seasonType, lastScored }) };
}

/** "Trade deadline: end of Week 10…" from the league's own deadline and offseason restart. */

export function tradesAreClosed(s: { deadlineWeek: number; nowWeek: number; seasonType: string; lastScored?: number }): boolean {
  if (s.seasonType === "post") return true;
  if (!s.deadlineWeek || s.seasonType !== "regular") return false;
  return s.nowWeek > s.deadlineWeek || (s.lastScored ?? 0) >= s.deadlineWeek;
}

export function tradeWindowNote(ctx: Pick<SleeperTradeContext, "deadlineWeek" | "nowWeek" | "seasonType" | "lastScored">, reopens: string | null) {
  if (!ctx.deadlineWeek) return null;
  const closed = tradesAreClosed(ctx);
  return closed
    ? `Trades are closed for the season (deadline: end of Week ${ctx.deadlineWeek}).${reopens ? ` They reopen ${reopens}, so use this to plan.` : ""}`
    : `Trade deadline: end of Week ${ctx.deadlineWeek}.${reopens ? ` Trades reopen ${reopens}.` : ""}`;
}

/**
 * Season-to-date points per game (league scoring), from Sleeper's weekly stats. Owners pushed back on
 * projections alone (JD, 2026-10-29: "it's negating that I have the #3 QB Goff"; Sleeper had Goff at 15.7
 * this week while he's averaged 22.2). Cached in memory for an hour per season, week and scoring.
 */
const ppgCache = new Map<string, { at: number; data: Map<string, { ppg: number; games: number }> }>();
export async function loadSeasonPpg(season: number, throughWeek: number, scoring: Record<string, number>): Promise<Map<string, { ppg: number; games: number }>> {
  if (throughWeek < 1) return new Map();
  const key = `${season}:${throughWeek}:${scoring.pass_td ?? 4}:${scoring.rec ?? 0.5}:${scoring.pass_int ?? -1}:${scoring.bonus_rec_te ?? 0}`;
  const hit = ppgCache.get(key);
  if (hit && Date.now() - hit.at < 3600000) return hit.data;
  const sums = new Map<string, { pts: number; games: number }>();
  await Promise.all(Array.from({ length: throughWeek }, (_, i) => i + 1).map(async (w) => {
    try {
      const rows = await getJson<ProjRow[]>(`https://api.sleeper.app/stats/nfl/${season}/${w}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF`);
      for (const row of rows) {
        if (!row.player_id || !row.stats || !(Number(row.stats.gp) > 0)) continue;
        const cur = sums.get(row.player_id) ?? { pts: 0, games: 0 };
        cur.pts += rescore(row.stats, row.player?.position, scoring); cur.games += 1;
        sums.set(row.player_id, cur);
      }
    } catch { /* a missing week just counts less */ }
  }));
  const data = new Map([...sums.entries()].map(([id, s]) => [id, { ppg: Math.round((s.pts / s.games) * 10) / 10, games: s.games }] as const));
  ppgCache.set(key, { at: Date.now(), data });
  return data;
}

/** Weight on what a player has actually scored: grows with games played, capped at half. */
export const actualWeight = (games: number) => (games >= 3 ? Math.min(0.5, 0.07 * games) : 0);

/** Blend weekly projections with season-to-date points per game; weeks with no game (bye, out) stay 0. */
export function blendWithSeason(proj: Readonly<Record<number, number>>, season: { ppg: number; games: number } | undefined): Record<number, number> {
  const a = season ? actualWeight(season.games) : 0;
  if (!a) return { ...proj };
  return Object.fromEntries(Object.entries(proj).map(([w, p]) => [w, p > 0 ? Math.round(((1 - a) * p + a * season!.ppg) * 10) / 10 : p]));
}
export const BLENDED_LABEL = "Sleeper projections blended with season-to-date points (up to half)";
