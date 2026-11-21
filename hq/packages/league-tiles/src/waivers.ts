
import type { TradeLeagueConfig, TradePlayer, TradeTeam } from "./trade-engine.ts";
import { lineupBySlot } from "./gm.ts";
import { blendWithSeason, fantasyCalcUrl, loadSeasonPpg, rescore, type FantasyCalcRow } from "./trade-sleeper.ts";
import { loadEspnPlayerNews, loadRumors, loadSleeperPlayerFacts, resolveEspnIds, rumorsFor, statusLine, type NewsItem } from "./player-news.ts";
import { DEFAULT_GM_PREFS, type GmPrefs } from "./gm-prefs.ts";

const SLEEPER = "https://api.sleeper.app/v1";
const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
const round1 = (n: number) => Math.round(n * 10) / 10;
const BAD = /^(out|ir|pup|sus|na|cov)/i;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.split("?")[0]}`);
  return (await r.json()) as T;
}

export interface WaiverUsage { games: number; snapPct: number | null; touches: number | null; targets: number | null; ptsAvg: number | null }
export interface WaiverFreeAgent extends TradePlayer { usage: WaiverUsage; trendingAdds: number | null; news?: NewsItem[]; newsUpdated?: number | null; status?: string | null }
/** How an owner has actually used the wire this season (from Sleeper transactions). */
export interface OwnerHabits { adds: number; kdAdds: number; bidsWon: number; bidsLost: number; avgWin: number | null; maxWin: number | null }
export interface WaiverBid { week: number; playerId: string; player: string; pos: string; rosterId: number; bid: number; won: boolean; at: number }
export interface WaiverExtras {
  budget: number;
  minBid: number;
  faabWaivers: boolean;
  /** "Wednesday about 12 PM ET", from when this season's claims actually processed. */
  processes: string | null;
  freeAgents: WaiverFreeAgent[];
  bids: WaiverBid[];
  owners: Record<string, OwnerHabits>;
  rosterToTeam: Record<string, string>;
  updatedAt: string;
}

type ProjRow = { player_id?: string; stats?: Record<string, number>; player?: { first_name?: string; last_name?: string; position?: string; team?: string | null; injury_status?: string | null } };
type Tx = { type?: string; status?: string; roster_ids?: number[]; adds?: Record<string, number> | null; settings?: { waiver_bid?: number } | null; leg?: number; created?: number; status_updated?: number; transaction_id: string };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** When claims process, from the most common Eastern-time weekday/hour of this season's completed waiver claims. */
export function waiverProcessingLabel(times: readonly number[]): string | null {
  if (!times.length) return null;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", hour: "numeric", hour12: true });
  const counts = new Map<string, number>();
  for (const t of times) { const parts = fmt.formatToParts(new Date(t)); const day = parts.find((p) => p.type === "weekday")?.value; const hour = parts.find((p) => p.type === "hour")?.value; const ap = parts.find((p) => p.type === "dayPeriod")?.value; if (day && hour) counts.set(`${day} about ${hour} ${ap ?? ""}`.trim() + " ET", (counts.get(`${day} about ${hour} ${ap ?? ""}`.trim() + " ET") ?? 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export async function loadWaiverExtras(opts: { leagueId: string; season: number; weeks: readonly number[]; market: "dynasty" | "redraft"; rosterToTeam: Record<string, string> }): Promise<WaiverExtras> {
  const { leagueId, season } = opts;
  type League = { settings?: Record<string, number>; scoring_settings?: Record<string, number>; roster_positions?: string[] };
  const [league, rosters, state] = await Promise.all([
    getJson<League>(`${SLEEPER}/league/${leagueId}`),
    getJson<{ roster_id: number; players?: string[] | null }[]>(`${SLEEPER}/league/${leagueId}/rosters`),
    getJson<{ week?: number }>(`${SLEEPER}/state/nfl`),
  ]);
  const scoring = league.scoring_settings ?? {};
  const settings = league.settings ?? {};
  const rostered = new Set(rosters.flatMap((r) => r.players ?? []));
  const nowWeek = Math.max(1, Number(state.week) || 1);
  const pos = POSITIONS.map((p) => `position[]=${p}`).join("&");

  const proj = new Map<string, Record<number, number>>();
  const info = new Map<string, NonNullable<ProjRow["player"]>>();
  await Promise.all(opts.weeks.map(async (w) => {
    try {
      for (const row of await getJson<ProjRow[]>(`https://api.sleeper.app/projections/nfl/${season}/${w}?season_type=regular&${pos}`)) {
        if (!row.player_id) continue;
        if (row.player && !info.has(row.player_id)) info.set(row.player_id, row.player);
        if (rostered.has(row.player_id)) continue;
        const cur = proj.get(row.player_id) ?? {};
        cur[w] = rescore(row.stats, row.player?.position, scoring);
        proj.set(row.player_id, cur);
      }
    } catch { /* missing week = no projection */ }
  }));

  const seasonPpg = await loadSeasonPpg(season, nowWeek - 1, scoring).catch(() => new Map<string, { ppg: number; games: number }>());
  for (const [id, p] of proj) proj.set(id, blendWithSeason(p, seasonPpg.get(id)));

  // Workload: the last three played weeks.
  const usage = new Map<string, { g: number; snp: number; tm: number; touches: number; tgt: number; pts: number }>();
  await Promise.all([nowWeek - 3, nowWeek - 2, nowWeek - 1].filter((w) => w >= 1).map(async (w) => {
    try {
      for (const row of await getJson<ProjRow[]>(`https://api.sleeper.app/stats/nfl/${season}/${w}?season_type=regular&${pos}`)) {
        if (!row.player_id) continue;
        if (row.player && !info.has(row.player_id)) info.set(row.player_id, row.player);
        if (rostered.has(row.player_id) || !row.stats) continue;
        const s = row.stats; const n = (k: string) => Number(s[k] ?? 0) || 0;
        if (!n("gp") && !n("off_snp")) continue;
        const u = usage.get(row.player_id) ?? { g: 0, snp: 0, tm: 0, touches: 0, tgt: 0, pts: 0 };
        u.g += 1; u.snp += n("off_snp"); u.tm += n("tm_off_snp"); u.touches += n("rush_att") + n("rec"); u.tgt += n("rec_tgt"); u.pts += rescore(s, row.player?.position, scoring);
        usage.set(row.player_id, u);
      }
    } catch { /* optional */ }
  }));

  let trending = new Map<string, number>();
  try { trending = new Map((await getJson<{ player_id: string; count: number }[]>(`${SLEEPER}/players/nfl/trending/add?lookback_hours=48&limit=200`)).map((t) => [t.player_id, t.count])); } catch { /* optional */ }
  let fc: FantasyCalcRow[] = [];
  try { fc = await getJson<FantasyCalcRow[]>(fantasyCalcUrl(league as never, opts.market === "dynasty")); } catch { /* optional */ }
  const fcById = new Map(fc.flatMap((r) => (r.player?.sleeperId ? [[r.player.sleeperId, r] as const] : [])));

  const freeAgents: WaiverFreeAgent[] = [...proj.entries()].flatMap(([id, p]) => {
    const pi = info.get(id);
    const position = pi?.position ?? "?";
    if (!POSITIONS.includes(position) || !pi?.team) return [];
    const u = usage.get(id);
    const row = fcById.get(id);
    return [{
      id, pos: position, nflTeam: pi.team ?? null, injury: pi.injury_status ?? null, proj: p,
      name: position === "DEF" ? `${pi.team} D/ST` : [pi.first_name, pi.last_name].filter(Boolean).join(" ") || id,
      market: typeof row?.value === "number" ? row.value : null,
      nowValue: typeof row?.redraftValue === "number" ? row.redraftValue : null,
      age: typeof row?.player?.maybeAge === "number" ? row.player.maybeAge : null,
      kind: "player" as const, tag: null,
      usage: u ? { games: u.g, snapPct: u.tm ? Math.round((100 * u.snp) / u.tm) : null, touches: position === "RB" || position === "QB" ? round1(u.touches / u.g) : null, targets: ["WR", "TE", "RB"].includes(position) ? round1(u.tgt / u.g) : null, ptsAvg: round1(u.pts / u.g) } : { games: 0, snapPct: null, touches: null, targets: null, ptsAvg: null },
      trendingAdds: trending.get(id) ?? null,
    }];
  });
  // Keep the useful part of the pool: best rest-of-season projections plus anyone with market value (dynasty stashes).
  const ros = (p: WaiverFreeAgent) => opts.weeks.reduce((a, w) => a + (p.proj[w] ?? 0), 0);
  const top = [...freeAgents].sort((a, b) => ros(b) - ros(a)).slice(0, 160);
  const valued = freeAgents.filter((p) => (p.market ?? 0) > 0 && !top.includes(p)).sort((a, b) => (b.market ?? 0) - (a.market ?? 0)).slice(0, 40);

  // This season's bids (won and lost) and when claims process.
  const txWeeks = Array.from({ length: Math.min(18, nowWeek + 1) }, (_, i) => i + 1);
  const txs = (await Promise.all(txWeeks.map((w) => getJson<Tx[]>(`${SLEEPER}/league/${leagueId}/transactions/${w}`).catch(() => [] as Tx[])))).flat();
  const bids: WaiverBid[] = txs.filter((t) => t.type === "waiver" && (t.status === "complete" || t.status === "failed") && t.adds).flatMap((t) => Object.entries(t.adds ?? {}).map(([pid, rid]) => ({
    week: Number(t.leg) || 0, playerId: pid, player: info.get(pid) ? (info.get(pid)!.position === "DEF" ? `${pid} D/ST` : `${info.get(pid)!.first_name ?? ""} ${info.get(pid)!.last_name ?? ""}`.trim()) : pid,
    pos: info.get(pid)?.position ?? (/^[A-Z]{2,3}$/.test(pid) ? "DEF" : "?"), rosterId: rid, bid: Number(t.settings?.waiver_bid ?? 0) || 0, won: t.status === "complete", at: Number(t.status_updated ?? t.created) || 0,
  })));
  // Owner habits: adds by position (do they stream kickers/defenses?) and how they bid.
  const owners: Record<string, OwnerHabits> = {};
  const habit = (rid: number) => (owners[String(rid)] ??= { adds: 0, kdAdds: 0, bidsWon: 0, bidsLost: 0, avgWin: null, maxWin: null });
  for (const t of txs) {
    if (!(t.type === "waiver" || t.type === "free_agent") || t.status !== "complete") continue;
    for (const [pid, rid] of Object.entries(t.adds ?? {})) { const h = habit(rid); h.adds += 1; const ps = info.get(pid)?.position ?? (/^[A-Z]{2,3}$/.test(pid) ? "DEF" : ""); if (ps === "K" || ps === "DEF") h.kdAdds += 1; }
  }
  for (const b of bids) { const h = habit(b.rosterId); if (b.won) { h.bidsWon += 1; h.maxWin = Math.max(h.maxWin ?? 0, b.bid); } else h.bidsLost += 1; }
  for (const [rid, h] of Object.entries(owners)) { const w = bids.filter((b) => b.won && String(b.rosterId) === rid).map((b) => b.bid); h.avgWin = w.length ? round1(w.reduce((a, x) => a + x, 0) / w.length) : null; }

  // News for the players most likely to show up: best projections plus the fastest-rising adds.
  const pool = [...top, ...valued];
  const newsIds = [...new Set([...pool.slice(0, 45).map((p) => p.id), ...pool.filter((p) => (p.trendingAdds ?? 0) >= 25000).sort((a, b) => (b.trendingAdds ?? 0) - (a.trendingAdds ?? 0)).slice(0, 15).map((p) => p.id)])].filter((id) => !/^[A-Z]{2,3}$/.test(id));
  const [facts, rumors] = await Promise.all([loadSleeperPlayerFacts(newsIds), loadRumors()]);
  const missing = newsIds.filter((id) => !facts.get(id)?.espnId).map((id) => { const p = pool.find((x) => x.id === id)!; return { id, name: p.name, team: p.nflTeam }; });
  const resolved = await resolveEspnIds(missing);
  const espnOf = (id: string) => facts.get(id)?.espnId ?? resolved.get(id) ?? null;
  const espnNews = await loadEspnPlayerNews(newsIds.map(espnOf).filter((x): x is string => Boolean(x)));
  const dayAgo = Date.now() - 3 * 86400000;
  for (const p of pool) {
    if (!newsIds.includes(p.id)) continue;
    const e = espnOf(p.id);
    const items = [...(e ? espnNews.get(e) ?? [] : []), ...rumorsFor(rumors, p.name)].filter((n) => n.at >= dayAgo).sort((a, b) => b.at - a.at).slice(0, 2);
    p.news = items;
    p.newsUpdated = facts.get(p.id)?.newsUpdated ?? null;
    p.status = statusLine(facts.get(p.id));
  }

  const processes = waiverProcessingLabel(txs.filter((t) => t.type === "waiver" && t.status === "complete").map((t) => Number(t.status_updated ?? t.created) || 0).filter(Boolean));

  return {
    budget: Number(settings.waiver_budget) || 0,
    minBid: Number(settings.waiver_bid_min) || 0,
    faabWaivers: Number(settings.waiver_type) === 2,
    processes,
    freeAgents: pool,
    bids,
    owners,
    rosterToTeam: opts.rosterToTeam,
    updatedAt: new Date().toISOString(),
  };
}

// ───────────────────────────── analysis ─────────────────────────────

export interface WaiverPlayerView { id: string; name: string; pos: string; nflTeam: string | null; injury: string | null; age: number | null }
export interface WaiverTarget {
  player: WaiverPlayerView;
  thisWeek: number;
  restAvg: number;
  gainNow: number;
  gainRest: number;
  fills: string | null;
  usage: WaiverUsage;
  trendingAdds: number | null;
  drop: WaiverPlayerView | null;
  bid: { amount: number; low: number; high: number; tier: "Top target" | "Strong add" | "Depth add"; reasons: string[] } | null;
  rivals: { team: string; faab: number | null }[];
  keeperNote: string | null;
  /** Latest headlines (ESPN, Pro Football Rumors) and Sleeper's injury/practice status. */
  news: NewsItem[];
  status: string | null;
  freshNews: boolean;
}
export interface WaiverReport {
  week: number | null;
  team: { id: string; name: string; faab: number | null };
  budget: number;
  faabWaivers: boolean;
  processes: string | null;
  weeksLeft: number;
  needs: string[];
  targets: WaiverTarget[];
  /** Fastest-rising adds across Sleeper (the news signal), scored for this team. */
  hot: WaiverTarget[];

  benchUpgrades: { add: WaiverPlayerView; addAvg: number; cut: WaiverPlayerView; cutAvg: number; why: string; news: NewsItem[]; status: string | null; bid: number | null }[];
  /** Your least useful players right now, with a reason. */
  cuts: { player: WaiverPlayerView; avg: number; reason: string }[];
  /** Trending players that wouldn't start for this team: shown for context, no bid. */
  buzz: { player: WaiverPlayerView; adds: number; restAvg: number; news: NewsItem[]; why: string }[];
  /** How the suggestions were tuned for this owner. */
  style: { prefs: GmPrefs; streamsKD: boolean; streamsSource: "your settings" | "your Sleeper moves"; habits: OwnerHabits | null; notes: string[] };
  stashes: { player: WaiverPlayerView; restAvg: number; bid: number; note: string }[];
  trending: { player: WaiverPlayerView; adds: number; restAvg: number }[];
  market: { claims: number; median: number | null; p75: number | null; max: { amount: number; player: string; team: string } | null; byPos: { pos: string; median: number; n: number }[] };
  faabTable: { team: string; left: number | null; spent: number | null; mine: boolean }[];
  updatedAt: string;
}

const pview = (p: TradePlayer): WaiverPlayerView => ({ id: p.id, name: p.name, pos: p.pos, nflTeam: p.nflTeam, injury: p.injury, age: typeof p.age === "number" ? p.age : null });
const pct = (xs: readonly number[], q: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
const total = (players: readonly TradePlayer[], config: TradeLeagueConfig, week: number) => lineupBySlot(players, config, week).reduce((a, s) => a + s.pts, 0);
const isPick = (p: TradePlayer) => p.kind === "pick" || p.pos === "PICK";

/** Rest-of-season best-lineup total for a roster (healthy players only for the current week). */
function seasonTotal(players: readonly TradePlayer[], config: TradeLeagueConfig, weeks: readonly number[]) {
  return weeks.reduce((a, w, i) => a + total(i === 0 ? players.filter((p) => !(p.injury && BAD.test(p.injury))) : players, config, w), 0);
}

export function analyzeWaivers(input: { config: TradeLeagueConfig; teams: readonly TradeTeam[]; meId: string; extras: WaiverExtras; prefs?: GmPrefs | null }): WaiverReport | null {
  const { config, extras } = input;
  const prefs = input.prefs ?? DEFAULT_GM_PREFS;
  const me = input.teams.find((t) => t.id === input.meId);
  if (!me) return null;
  const weeks = config.weeks;
  const week = weeks[0] ?? null;
  const weeksLeft = weeks.length;
  const dynasty = config.format === "dynasty";
  const keeper = config.format === "auction-keeper";
  const ros = (p: TradePlayer) => weeks.reduce((a, w) => a + (p.proj[w] ?? 0), 0);
  const avg = (p: TradePlayer) => (weeksLeft ? ros(p) / weeksLeft : 0);
  const mine = me.players.filter((p) => !isPick(p));
  const myFaab = me.faab ?? null;
  const myRoster = Object.entries(extras.rosterToTeam ?? {}).find(([, t]) => t === me.id)?.[0] ?? null;
  const habits = myRoster ? extras.owners?.[myRoster] ?? null : null;
  // Kicker/defense streaming: the owner's setting, else learned from their moves (3+ K/DEF pickups = a streamer).
  const streamsKD = prefs.streamKD === "yes" ? true : prefs.streamKD === "no" ? false : (habits?.kdAdds ?? 0) >= 3;
  const hidden = new Set(prefs.hidden);
  const neverDrop = new Set(prefs.neverDrop);
  const styleNotes: string[] = [];
  styleNotes.push(streamsKD ? "You stream kickers and defenses, so weekly K/DEF swaps are included." : "You hold your kicker and defense, so K/DEF swaps only show when the upgrade lasts.");
  if (habits && habits.bidsWon >= 3 && habits.avgWin !== null) styleNotes.push(`Your winning bids this season average $${habits.avgWin}.`);
  if (prefs.bidStyle !== "normal") styleNotes.push(prefs.bidStyle === "aggressive" ? "Bids lean aggressive (your setting)." : "Bids lean light (your setting).");
  if (hidden.size) styleNotes.push(`${hidden.size} player${hidden.size > 1 ? "s" : ""} hidden ("Not for me").`);

  // Drop candidate: the bench player worth the least (dynasty keeps taxi and 23-and-under players).
  const startIds = new Set(week === null ? [] : lineupBySlot(mine, config, week).map((s) => s.id));
  const maxMarket = Math.max(1, ...mine.map((p) => p.market ?? 0));
  const maxPts = Math.max(1, ...mine.map(ros));
  const keepScore = (p: TradePlayer) => (dynasty ? 0.6 * ((p.market ?? 0) / maxMarket) + 0.4 * (ros(p) / maxPts) : 0.75 * (ros(p) / maxPts) + 0.25 * ((p.market ?? 0) / maxMarket));
  const droppable = mine.filter((p) => !startIds.has(p.id) && p.tag !== "IR" && p.tag !== "Taxi" && !neverDrop.has(p.id) && !(dynasty && typeof p.age === "number" && p.age <= 23)).sort((a, b) => keepScore(a) - keepScore(b));

  const baseNow = week === null ? 0 : total(mine.filter((p) => !(p.injury && BAD.test(p.injury))), config, week);
  const baseRest = seasonTotal(mine, config, weeks);
  const gainsFor = (roster: readonly TradePlayer[], fa: TradePlayer, drop: TradePlayer | null, bNow: number, bRest: number) => {
    const next = [...roster.filter((p) => p.id !== drop?.id), fa];
    const now = week === null ? 0 : total(next.filter((p) => !(p.injury && BAD.test(p.injury))), config, week) - bNow;
    const rest = seasonTotal(next, config, weeks) - bRest;
    return { now: round1(now), rest: round1(rest) };
  };

  // Needs this week: empty or injured/bye starters.
  const needs: string[] = [];
  if (week !== null) for (const s of lineupBySlot(mine.filter((p) => !(p.injury && BAD.test(p.injury))), config, week)) {
    if (!s.id) needs.push(`No healthy ${s.slot === "DEF" ? "defense" : s.slot} to start in Week ${week}.`);
    else if (s.pts === 0) { const p = mine.find((q) => q.id === s.id); needs.push(`${p?.name ?? "A starter"} (${s.slot}) has no projection in Week ${week} (bye?).`); }
  }

  // League bid market (winning bids this season).
  const wins = extras.bids.filter((b) => b.won && b.bid > 0);
  const amounts = wins.map((b) => b.bid);
  const teamName = (rid: number) => input.teams.find((t) => t.id === extras.rosterToTeam[String(rid)])?.name ?? `Team ${rid}`;
  const biggest = [...wins].sort((a, b) => b.bid - a.bid)[0];
  const byPos = POSITIONS.map((pos) => { const xs = wins.filter((b) => b.pos === pos).map((b) => b.bid); return { pos, median: pct(xs, 0.5) ?? 0, n: xs.length }; }).filter((x) => x.n);
  const market = { claims: wins.length, median: pct(amounts, 0.5), p75: pct(amounts, 0.75), max: biggest ? { amount: biggest.bid, player: biggest.player, team: teamName(biggest.rosterId) } : null, byPos };

  // Candidates: score every free agent against my roster.
  // Waiver data is pulled once a day (after claims settle at 12:30 PM ET); rosters are live, so anyone picked up
  // since then drops out of the free-agent pool right away.
  const rosteredNow = new Set(input.teams.flatMap((t) => t.players.map((p) => p.id)));
  const fas = extras.freeAgents.filter((p) => !(p.injury && BAD.test(p.injury)) && !hidden.has(p.id) && !rosteredNow.has(p.id));
  const fresh = (p: WaiverFreeAgent) => (p.news ?? []).some((n) => Date.now() - n.at < 48 * 3600000) || (p.newsUpdated ?? 0) > Date.now() - 24 * 3600000;
  // Best drop for each pickup: try the five least valuable droppable players and keep the one that costs least.
  const bestWith = (fa: TradePlayer) => {
    const options = ["K", "DEF"].includes(fa.pos) ? mine.filter((p) => p.pos === fa.pos && !neverDrop.has(p.id)).sort((a, b) => ros(a) - ros(b)).slice(0, 2) : droppable.slice(0, 5);
    let best: { drop: TradePlayer | null; g: { now: number; rest: number } } | null = null;
    for (const drop of options.length ? options : [null]) { const g = gainsFor(mine, fa, drop, baseNow, baseRest); if (!best || g.rest + 1.5 * g.now > best.g.rest + 1.5 * best.g.now) best = { drop, g }; }
    return best!;
  };
  const prelim = [...fas].sort((a, b) => ros(b) - ros(a)).slice(0, 70);
  const nowWeight = prefs.strategy === "now" ? 2 : prefs.strategy === "later" ? 1 : 1.5;
  // A real upgrade, not noise: at least ~0.6 points a week, or a hole filled this week. Kickers and defenses

  const worthIt = (fa: WaiverFreeAgent, g: { now: number; rest: number }) => {
    const perWeek = g.rest / Math.max(1, weeksLeft);
    if (["K", "DEF"].includes(fa.pos)) return streamsKD ? perWeek >= 0.5 || g.now >= 2 : perWeek >= 1.5;
    return perWeek >= 0.6 || g.now >= 2;
  };
  const scored = prelim.map((fa) => { const { drop, g } = bestWith(fa); const later = prefs.strategy === "later" && dynasty ? 0.2 * ((fa.market ?? 0) / maxMarket) * weeksLeft : 0; return { fa, drop, g, score: (g.rest + nowWeight * Math.max(0, g.now) + later) * (fresh(fa) ? 1.15 : 1) }; })
    .filter((x) => worthIt(x.fa, x.g))
    .sort((a, b) => b.score - a.score);
  // At most two per position (one kicker, one defense): the rest are just alternatives to the same move.
  const perPos = new Map<string, number>();
  const picks = scored.filter((x) => { const n = perPos.get(x.fa.pos) ?? 0; if (n >= (["K", "DEF"].includes(x.fa.pos) ? 1 : 2)) return false; perPos.set(x.fa.pos, n + 1); return true; }).slice(0, 6);

  // Pool rank: how good each target is among all free agents (rest-of-season points a week).
  const poolRank = new Map([...fas].filter((p) => !["K", "DEF"].includes(p.pos)).sort((a, b) => ros(b) - ros(a)).map((p, i) => [p.id, i + 1] as const));
  const budget = extras.budget;
  const pacing = myFaab !== null && weeksLeft ? myFaab / weeksLeft : null;

  const others = input.teams.filter((t) => t.id !== me.id);
  const otherBase = new Map(others.map((t) => { const ps = t.players.filter((p) => !isPick(p)); return [t.id, { ps, now: week === null ? 0 : total(ps.filter((p) => !(p.injury && BAD.test(p.injury))), config, week), rest: seasonTotal(ps, config, weeks.slice(0, 4)) }] as const; }));

  const build = ({ fa, drop, g }: { fa: WaiverFreeAgent; drop: TradePlayer | null; g: { now: number; rest: number } }, hot: boolean): WaiverTarget => {
    const rivals = others.flatMap((t) => {
      const b = otherBase.get(t.id)!;
      const next = [...b.ps, fa];
      const gr = seasonTotal(next, config, weeks.slice(0, 4)) - b.rest;
      return gr > 4 ? [{ team: t.name, faab: t.faab ?? null, gain: gr }] : [];
    }).sort((a, b) => (b.faab ?? 0) - (a.faab ?? 0));
    const kd = ["K", "DEF"].includes(fa.pos);
    const perWeek = g.rest / Math.max(1, weeksLeft);
    const rank = poolRank.get(fa.id) ?? 99;
    const adds = fa.trendingAdds ?? 0;
    const tier: "Top target" | "Strong add" | "Depth add" = !kd && (perWeek >= 3 || (rank <= 3 && perWeek >= 2) || (hot && adds >= 500000 && perWeek >= 1)) ? "Top target" : !kd && (perWeek >= 1.25 || g.now >= 4 || (hot && adds >= 150000 && perWeek >= 0.4)) ? "Strong add" : "Depth add";
    let bid: WaiverTarget["bid"] = null;
    if (extras.faabWaivers && myFaab !== null) {
      const reasons: string[] = [];
      let base: number;
      if (amounts.length >= 6) {
        const q = tier === "Top target" ? 0.9 : tier === "Strong add" ? 0.7 : 0.35;
        base = pct(kd ? (byPos.find((x) => x.pos === fa.pos) ? wins.filter((b) => b.pos === fa.pos).map((b) => b.bid) : amounts) : amounts, kd ? 0.5 : q) ?? 1;
        reasons.push(`${tier === "Top target" ? "Top 10%" : tier === "Strong add" ? "Top 30%" : "A typical"} winning bid in this league this season is about $${base} (${amounts.length} claims; median $${market.median}).`);
      } else {
        base = Math.round(budget * (tier === "Top target" ? 0.15 : tier === "Strong add" ? 0.07 : 0.02));
        reasons.push(`Few FAAB claims this season, so this starts from ${tier === "Top target" ? "15%" : tier === "Strong add" ? "7%" : "2%"} of the $${budget} budget.`);
      }
      const richRivals = rivals.filter((r) => (r.faab ?? 0) >= base);
      if (rivals.length === 0) { base = Math.max(extras.minBid, Math.round(base * 0.5)); reasons.push("No other team would start him right away, so you can bid light."); }
      else if (richRivals.length >= 2 && tier !== "Depth add") { base = Math.round(base * 1.25); reasons.push(`${rivals.length} other team${rivals.length > 1 ? "s" : ""} would start him; ${richRivals.length} can afford more than that (${richRivals.slice(0, 3).map((r) => `${r.team} $${r.faab}`).join(", ")}).`); }
      else reasons.push(`${rivals.length} other team${rivals.length > 1 ? "s" : ""} would start him (${rivals.slice(0, 3).map((r) => `${r.team} $${r.faab ?? "?"}`).join(", ")}).`);
      if (adds >= 20000) { if (tier !== "Depth add") base = Math.round(base * 1.15); reasons.push(`Hot on Sleeper: about ${adds >= 1000000 ? `${(adds / 1000000).toFixed(1)} million` : `${Math.round(adds / 1000)}k`} adds in the last two days, usually injury or role news.`); }
      if (prefs.bidStyle !== "normal") base = Math.max(extras.minBid, Math.round(base * (prefs.bidStyle === "aggressive" ? 1.3 : 0.75)));
      const cap = Math.round(myFaab * (tier === "Top target" ? 0.5 : tier === "Strong add" ? 0.3 : 0.1));
      const amount = Math.max(extras.minBid, Math.min(base, cap, myFaab));
      if (amount < base) reasons.push(`Capped at $${amount} to keep money for the rest of the season ($${myFaab} left${pacing !== null ? `, about $${Math.round(pacing)} a week` : ""}).`);
      else if (pacing !== null) reasons.push(`You have $${myFaab} left, about $${Math.round(pacing)} a week for ${weeksLeft} weeks.`);
      const topRival = rivals[0]?.faab ?? null;
      const ceiling = Math.min(myFaab, Math.round(cap * 1.25));
      bid = { amount, low: Math.max(extras.minBid, Math.round(amount * 0.7)), high: Math.max(amount, Math.min(ceiling, Math.max(Math.round(amount * 1.35), tier === "Top target" && topRival !== null ? topRival + 1 : 0))), tier, reasons };
    }
    const filled = week === null ? null : lineupBySlot([...mine.filter((p) => p.id !== drop?.id), fa], config, week).find((s) => s.id === fa.id)?.slot ?? null;
    return {
      player: pview(fa), thisWeek: week === null ? 0 : round1(fa.proj[week] ?? 0), restAvg: round1(avg(fa)), gainNow: g.now, gainRest: g.rest,
      fills: filled, usage: fa.usage, trendingAdds: fa.trendingAdds, drop: drop ? pview(drop) : null, bid,
      rivals: rivals.map((r) => ({ team: r.team, faab: r.faab })),
      keeperNote: keeper && bid ? `Keeper cost next year if you keep him: $${10 + bid.amount} ($10 + your bid).` : null,
      news: fa.news ?? [], status: fa.status ?? null, freshNews: fresh(fa),
    };
  };
  const targets = picks.map((x) => build(x, false));
  // Hot right now: free agents Sleeper users are adding fastest (injury and role news shows up here before projections catch up).
  const hotPool = fas.filter((p) => (p.trendingAdds ?? 0) >= 25000 && !["K"].includes(p.pos) && !targets.some((t) => t.player.id === p.id)).sort((a, b) => (b.trendingAdds ?? 0) - (a.trendingAdds ?? 0)).slice(0, 5);

  // actually help this team get a card and a bid; the rest are listed as league buzz.
  const hotScored = hotPool.map((fa) => ({ fa, ...bestWith(fa) }));
  const hot = hotScored.filter((x) => worthIt(x.fa, x.g)).map((x) => build(x, true));
  const buzz = hotScored.filter((x) => !worthIt(x.fa, x.g)).map((x) => ({ player: pview(x.fa), adds: x.fa.trendingAdds ?? 0, restAvg: round1(avg(x.fa)), news: x.fa.news ?? [], why: x.g.rest <= 0 && x.g.now <= 0 ? "Wouldn't start for you." : "Only a small upgrade for you." }));

  // Bench upgrades: a free agent at the same position projected clearly better than one of your bench players.
  const used = new Set([...targets, ...hot].map((t) => t.player.id));
  const benchUpgrades: WaiverReport["benchUpgrades"] = [];
  for (const b of droppable) {
    if (benchUpgrades.length >= 4) break;
    if (["K", "DEF"].includes(b.pos) && !streamsKD) continue;
    const better = fas.filter((f) => f.pos === b.pos && !used.has(f.id) && avg(f) >= avg(b) + 1 && !(dynasty && (f.market ?? 0) < 0.6 * (b.market ?? 0) && (b.age ?? 99) <= 25)).sort((x, y) => avg(y) - avg(x))[0];
    if (!better) continue;
    used.add(better.id);
    const lowBid = extras.faabWaivers && myFaab !== null ? Math.max(extras.minBid, Math.min(myFaab, pct(amounts, 0.25) ?? 1)) : null;
    benchUpgrades.push({ add: pview(better), addAvg: round1(avg(better)), cut: pview(b), cutAvg: round1(avg(b)), why: `${round1(avg(better) - avg(b))} more projected points a week than ${b.name} for the rest of the season${b.injury ? ` (${b.name} is ${b.injury})` : ""}.`, news: better.news ?? [], status: better.status ?? null, bid: lowBid });
  }
  const cuts = droppable.filter((p) => !["K", "DEF"].includes(p.pos) || mine.filter((q) => q.pos === p.pos).length > 1).slice(0, 3).map((p) => ({ player: pview(p), avg: round1(avg(p)), reason: `${round1(avg(p))} projected points a week the rest of the season${p.injury ? `, ${p.injury}` : ""}${dynasty ? ((p.market ?? 0) / maxMarket < 0.1 ? ", almost no dynasty value" : ", little dynasty value") : ""}. Your least useful ${["K", "DEF"].includes(p.pos) ? (p.pos === "DEF" ? "spare defense" : "spare kicker") : "bench player"} right now.` }));

  // Dynasty stashes: young free agents the dynasty market values, even if they don't start now.
  const stashes = dynasty ? extras.freeAgents.filter((p) => !hidden.has(p.id) && !rosteredNow.has(p.id) && (p.market ?? 0) > 0 && !["K", "DEF"].includes(p.pos) && (p.age ?? 99) <= 24 && !targets.some((t) => t.player.id === p.id))
    .sort((a, b) => (b.market ?? 0) - (a.market ?? 0)).slice(0, 4)
    .map((p) => ({ player: pview(p), restAvg: round1(avg(p)), bid: Math.max(extras.minBid, extras.faabWaivers ? Math.min(myFaab ?? 0, Math.round(budget * 0.01)) : 0), note: `${p.age ? `${p.age} years old, ` : ""}the most valued free agent${p.pos ? ` ${p.pos}` : ""} on the dynasty market right now.` })) : [];

  const trending = extras.freeAgents.filter((p) => (p.trendingAdds ?? 0) > 0 && !rosteredNow.has(p.id)).sort((a, b) => (b.trendingAdds ?? 0) - (a.trendingAdds ?? 0)).slice(0, 6)
    .map((p) => ({ player: pview(p), adds: p.trendingAdds ?? 0, restAvg: round1(avg(p)) }));

  const faabTable = input.teams.map((t) => ({ team: t.name, left: t.faab ?? null, spent: t.faab !== null && t.faab !== undefined && budget ? budget - t.faab : null, mine: t.id === me.id })).sort((a, b) => (b.left ?? 0) - (a.left ?? 0));

  return { week, team: { id: me.id, name: me.name, faab: myFaab }, budget, faabWaivers: extras.faabWaivers, processes: extras.processes, weeksLeft, needs, targets, hot, benchUpgrades, cuts, buzz, style: { prefs, streamsKD, streamsSource: prefs.streamKD === "auto" ? "your Sleeper moves" : "your settings", habits, notes: styleNotes }, stashes, trending, market, faabTable, updatedAt: extras.updatedAt };
}
