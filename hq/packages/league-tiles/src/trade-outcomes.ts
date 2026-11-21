
import { fantasyCalcUrl, rescore, type FantasyCalcRow } from "./trade-sleeper.ts";
import { loadSleeperPlayerFacts } from "./player-news.ts";

const SLEEPER = "https://api.sleeper.app/v1";
const ELIG: Record<string, string[]> = { QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"], FLEX: ["RB", "WR", "TE"], WRRB_FLEX: ["RB", "WR"], REC_FLEX: ["WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"] };
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

type MatchRow = { roster_id: number; matchup_id: number | null; points?: number; custom_points?: number | null; players?: string[] | null; starters?: string[] | null; players_points?: Record<string, number> | null };
type Tx = { transaction_id: string; type?: string; status?: string; leg?: number; created?: number; status_updated?: number; roster_ids?: number[]; adds?: Record<string, number> | null; drops?: Record<string, number> | null; draft_picks?: { season: string; round: number; roster_id: number; owner_id: number; previous_owner_id: number }[]; waiver_budget?: { sender: number; receiver: number; amount: number }[] };
type StatRow = { player_id?: string; stats?: Record<string, number>; player?: { position?: string } };
type DraftPick = { round: number; draft_slot: number; roster_id: number; player_id: string; is_keeper?: boolean | null };
type Draft = { draft_id: string; season: string; type: string; slot_to_roster_id?: Record<string, number> | null; draft_order?: Record<string, number> | null };

export interface SeasonData {
  season: number;
  leagueId: string;
  slots: string[];
  regularEnd: number;
  lastScored: number;
  weeks: Map<number, MatchRow[]>;
  /** Exact league points by week and player (from matchups), with rescored Sleeper stats for players on no roster. */
  points: Map<number, Map<string, number>>;
  played: Map<number, Set<string>>;
  trades: Tx[];
  drafts: { draft: Draft; picks: DraftPick[]; users: Record<string, number> }[];
  /** That season's owner (Sleeper user id) and team name by roster. */
  owners: Record<number, string | null>;
  names: Record<number, string>;
}

export interface OutcomeSide {
  rosterId: number; teamId: string | null;
  /** The team's name that season (for owners no longer in the league). */
  teamName: string | null;
  got: string[]; gave: string[];
  /** Pick labels like "2027 1st (Team)". */
  gotPicks: string[]; gavePicks: string[];
  /** Pick identity (season-round-original roster) to follow a pick through later trades. */
  gotPickKeys?: string[]; gavePickKeys?: string[];
  faabIn: number; faabOut: number;
  points: number; wins: number; value: number | null;
  /** Dynasty: starter points in the seasons after the trade season from what this side got (players, and players drafted
   *  with picks it got) while on its roster, minus the same for what it gave up on the other roster. Null = no later season yet. */
  later: number | null;
  /** Picks that have been used: what they turned into (Sleeper player id). */
  turnedInto: { pick: string; playerId: string; key?: string }[];
  weekly: { week: number; impact: number; flipped: -1 | 0 | 1 }[];
}
export interface TradeOutcome {
  id: string; season: number; week: number; at: number;
  weeksCounted: number;
  sides: OutcomeSide[];
  verdict: { winner: number | null; label: string; status: "Early read" | "In progress" | "Final"; categories: { wins: number | null; points: number | null; value: number | null; later?: number | null } };
}
export interface LeagueOutcomes { kind: "dynasty" | "keeper" | "redraft"; seasons: number[]; trades: TradeOutcome[]; updatedAt: string;
  /** Names and positions of every traded player (for history pages). */
  players?: Record<string, { name: string; pos: string | null }> }

/** Load one season's matchups, weekly stats, trades and drafts. */
export async function loadSeasonData(leagueId: string, league: { season?: string; roster_positions?: string[]; scoring_settings?: Record<string, number>; settings?: { playoff_week_start?: number; last_scored_leg?: number } }): Promise<SeasonData> {
  const season = Number(league.season);
  const regularEnd = (Number(league.settings?.playoff_week_start) || 15) - 1;
  const lastScored = Number(league.settings?.last_scored_leg) || 0;
  const scoring = league.scoring_settings ?? {};
  const wk = Array.from({ length: Math.min(regularEnd, lastScored) }, (_, i) => i + 1);
  const weeks = new Map<number, MatchRow[]>();
  const points = new Map<number, Map<string, number>>();
  const played = new Map<number, Set<string>>();
  const pos = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
  await Promise.all(wk.map(async (w) => {
    const [rows, stats] = await Promise.all([
      getJson<MatchRow[]>(`${SLEEPER}/league/${leagueId}/matchups/${w}`).catch(() => [] as MatchRow[]),
      getJson<StatRow[]>(`https://api.sleeper.app/stats/nfl/${season}/${w}?season_type=regular&${pos}`).catch(() => [] as StatRow[]),
    ]);
    weeks.set(w, rows);
    const pts = new Map<string, number>(); const gp = new Set<string>();
    for (const s of stats) { if (!s.player_id || !s.stats) continue; if (Number(s.stats.gp) > 0) { gp.add(s.player_id); pts.set(s.player_id, rescore(s.stats, s.player?.position, scoring)); } }
    for (const r of rows) for (const [pid, p] of Object.entries(r.players_points ?? {})) pts.set(pid, p);
    points.set(w, pts); played.set(w, gp);
  }));
  const trades = (await Promise.all(Array.from({ length: 18 }, (_, i) => getJson<Tx[]>(`${SLEEPER}/league/${leagueId}/transactions/${i + 1}`).catch(() => [] as Tx[])))).flat()
    .filter((t) => t.type === "trade" && t.status === "complete");
  const draftList = await getJson<Draft[]>(`${SLEEPER}/league/${leagueId}/drafts`).catch(() => [] as Draft[]);
  const users = await getJson<{ user_id: string; display_name?: string; metadata?: { team_name?: string } | null }[]>(`${SLEEPER}/league/${leagueId}/users`).catch(() => []);
  const rosters = await getJson<{ roster_id: number; owner_id?: string | null }[]>(`${SLEEPER}/league/${leagueId}/rosters`).catch(() => []);
  const userToRoster = Object.fromEntries(rosters.filter((r) => r.owner_id).map((r) => [r.owner_id!, r.roster_id]));
  const drafts = await Promise.all(draftList.map(async (d) => ({ draft: d, picks: await getJson<DraftPick[]>(`${SLEEPER}/draft/${d.draft_id}/picks`).catch(() => [] as DraftPick[]), users: userToRoster })));
  return { season, leagueId, slots: (league.roster_positions ?? []).filter((s) => ELIG[s === "D/ST" ? "DEF" : s]).map((s) => (s === "D/ST" ? "DEF" : s)), regularEnd, lastScored, weeks, points, played, trades, drafts,
    owners: Object.fromEntries(rosters.map((r) => [r.roster_id, r.owner_id ?? null])),
    names: Object.fromEntries(rosters.map((r) => { const u = users.find((x) => x.user_id === r.owner_id); return [r.roster_id, u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`]; })) };
}

/** Lineup chosen by season-to-date average (through the week before), scored with that week's real points. */
function lineupScore(roster: readonly string[], week: number, sd: SeasonData, posOf: (id: string) => string | null, avgCache: Map<string, number>): number {
  const avg = (id: string) => {
    const key = `${week}:${id}`;
    const hit = avgCache.get(key);
    if (hit !== undefined) return hit;
    let s = 0, g = 0;
    for (let w = 1; w < week; w++) { const p = sd.points.get(w)?.get(id); if (p !== undefined && (sd.played.get(w)?.has(id) || p !== 0)) { s += p; g += 1; } }
    const v = g ? s / g : 0;
    avgCache.set(key, v);
    return v;
  };
  const pool = roster.map((id) => ({ id, pos: posOf(id) })).filter((p): p is { id: string; pos: string } => Boolean(p.pos)).sort((a, b) => avg(b.id) - avg(a.id));
  const used = new Set<string>(); let total = 0;
  for (const slot of [...sd.slots].sort((a, b) => ELIG[a].length - ELIG[b].length)) {
    const p = pool.find((x) => !used.has(x.id) && ELIG[slot].includes(x.pos));
    if (p) { used.add(p.id); total += sd.points.get(week)?.get(p.id) ?? 0; }
  }
  return total;
}

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

/** Grade every two-team trade in the given seasons. Pure apart from its inputs (exported for tests). */
export function gradeTrades(input: {
  seasons: readonly SeasonData[];
  kind: "dynasty" | "keeper" | "redraft";
  posOf: (id: string) => string | null;
  rosterToTeam: Record<string, string>;
  /** Past seasons: map that season's roster to today's team by owner (a former owner maps to null). */
  teamOf?: (season: number, rosterId: number) => string | null;
  /** Dynasty: today's value of a player id, or of a pick label like "2027 1st" (round average). */
  valueOf?: (id: string) => number | null;
  pickValue?: (season: string, round: number) => number | null;
}): TradeOutcome[] {
  const out: TradeOutcome[] = [];
  const bySeason = new Map(input.seasons.map((s) => [s.season, s] as const));
  for (const sd of input.seasons) {
    const avgCache = new Map<string, number>();
    for (const t of sd.trades) {
      const ids = t.roster_ids ?? [];
      if (ids.length !== 2) continue;
      const week = Math.max(1, Number(t.leg) || 1);
      const sideOf = (rid: number) => {
        const got = Object.entries(t.adds ?? {}).filter(([, r]) => r === rid).map(([p]) => p);
        const gave = Object.entries(t.drops ?? {}).filter(([, r]) => r === rid).map(([p]) => p).filter((p) => (t.adds ?? {})[p] !== undefined && (t.adds ?? {})[p] !== rid);
        const picksIn = (t.draft_picks ?? []).filter((p) => p.owner_id === rid);
        const picksOut = (t.draft_picks ?? []).filter((p) => p.previous_owner_id === rid);
        return { rid, got, gave, picksIn, picksOut, faabIn: (t.waiver_budget ?? []).filter((b) => b.receiver === rid).reduce((a, b) => a + b.amount, 0), faabOut: (t.waiver_budget ?? []).filter((b) => b.sender === rid).reduce((a, b) => a + b.amount, 0) };
      };
      const [A, B] = ids.map(sideOf);
      const weekly = new Map<number, { w: number; impA: number; impB: number; flipA: -1 | 0 | 1; flipB: -1 | 0 | 1 }>();
      const lastWeek = Math.min(sd.regularEnd, sd.lastScored);
      for (let w = week; w <= lastWeek; w++) {
        const rows = sd.weeks.get(w) ?? [];
        const rowOf = (rid: number) => rows.find((r) => r.roster_id === rid);
        const imp = (side: typeof A) => {
          const row = rowOf(side.rid); if (!row?.players) return 0;
          const real = row.players;
          const undone = [...real.filter((p) => !side.got.includes(p)), ...side.gave.filter((p) => !real.includes(p))];
          return lineupScore(real, w, sd, input.posOf, avgCache) - lineupScore(undone, w, sd, input.posOf, avgCache);
        };
        const impA = imp(A), impB = imp(B);
        const flip = (rid: number, myImp: number): -1 | 0 | 1 => {
          const me = rowOf(rid); if (!me || me.matchup_id === null || me.matchup_id === undefined) return 0;
          const opp = rows.find((r) => r.matchup_id === me.matchup_id && r.roster_id !== rid); if (!opp) return 0;
          const mine = me.custom_points ?? me.points ?? 0, theirs = opp.custom_points ?? opp.points ?? 0;
          const oppImp = opp.roster_id === A.rid ? impA : opp.roster_id === B.rid ? impB : 0;
          const real = mine > theirs ? 1 : mine < theirs ? -1 : 0;
          const cf = mine - myImp > theirs - oppImp ? 1 : mine - myImp < theirs - oppImp ? -1 : 0;
          return real === cf ? 0 : real > cf ? 1 : -1;
        };
        weekly.set(w, { w, impA, impB, flipA: flip(A.rid, impA), flipB: flip(B.rid, impB) });
      }
      // Value: dynasty = today's value received − sent (used picks count as the player drafted with them);
      // keeper = next-season points by players the acquiring team kept.
      const pickLabel = (p: { season: string; round: number; roster_id: number }) => `${p.season} ${ordinal(p.round)}`;
      const drafted = (p: { season: string; round: number; roster_id: number }) => {
        const ds = bySeason.get(Number(p.season))?.drafts.find((d) => d.draft.season === p.season && d.draft.type !== "auction");
        if (!ds) return null;
        const slotOf = ds.draft.slot_to_roster_id ? Object.entries(ds.draft.slot_to_roster_id).find(([, r]) => r === p.roster_id)?.[0] : ds.draft.draft_order ? Object.entries(ds.draft.draft_order).find(([u]) => ds.users[u] === p.roster_id)?.[1] : undefined;
        const pick = slotOf !== undefined ? ds.picks.find((x) => x.round === p.round && String(x.draft_slot) === String(slotOf)) : undefined;
        return pick?.player_id ?? null;
      };
      const valueSide = (side: typeof A): number | null => {
        if (input.kind === "dynasty" && input.valueOf) {
          let v = 0, known = 0;
          const add = (x: number | null, sign: 1 | -1) => { if (x !== null) { v += sign * x; known += 1; } };
          for (const p of side.got) add(input.valueOf(p), 1);
          for (const p of side.gave) add(input.valueOf(p), -1);
          for (const p of side.picksIn) { const d = drafted(p); add(d ? input.valueOf(d) : input.pickValue?.(p.season, p.round) ?? null, 1); }
          for (const p of side.picksOut) { const d = drafted(p); add(d ? input.valueOf(d) : input.pickValue?.(p.season, p.round) ?? null, -1); }
          return known ? Math.round(v) : null;
        }
        if (input.kind === "keeper") {
          const next = bySeason.get(sd.season + 1);
          if (!next) return null; // keepers pending
          const keeperDraft = next.drafts.find((d) => d.draft.season === String(sd.season + 1));
          const kept = (pid: string, rid: number) => Boolean(keeperDraft?.picks.some((x) => x.is_keeper && x.player_id === pid && x.roster_id === rid));
          let pts = 0;
          for (const [w, rows] of next.weeks) { void w; for (const r of rows) {
            if (r.roster_id === side.rid) for (const p of side.got) if (kept(p, side.rid) && (r.starters ?? []).includes(p)) pts += r.players_points?.[p] ?? 0;
            const other = side.rid === A.rid ? B : A;
            if (r.roster_id === other.rid) for (const p of side.gave) if (kept(p, other.rid) && (r.starters ?? []).includes(p)) pts -= r.players_points?.[p] ?? 0;
          } }
          return r1(pts);
        }
        return null;
      };
      // Later seasons (dynasty): what the deal kept producing after the trade season.
      const laterSeasons = input.seasons.filter((x) => x.season > sd.season);
      const laterSide = (side: typeof A): number | null => {
        if (input.kind !== "dynasty" || !laterSeasons.length) return null;
        const other = side.rid === A.rid ? B : A;
        const mine = new Set([...side.got, ...side.picksIn.map(drafted).filter((x): x is string => Boolean(x))]);
        const theirs = new Set([...side.gave, ...side.picksOut.map(drafted).filter((x): x is string => Boolean(x))]);
        let pts = 0;
        for (const ls of laterSeasons) for (const rows of ls.weeks.values()) for (const r of rows) {
          const set = r.roster_id === side.rid ? mine : r.roster_id === other.rid ? theirs : null;
          if (!set) continue;
          for (const p of r.starters ?? []) if (set.has(p)) pts += (r.roster_id === side.rid ? 1 : -1) * (r.players_points?.[p] ?? 0);
        }
        return r1(pts);
      };
      const turned = (side: typeof A) => side.picksIn.flatMap((p) => { const d = drafted(p); return d ? [{ pick: pickLabel(p), playerId: d, key: `${p.season}-${p.round}-${p.roster_id}` }] : []; });
      const W = [...weekly.values()];
      const mk = (side: typeof A, isA: boolean): OutcomeSide => ({
        rosterId: side.rid, teamId: input.teamOf ? input.teamOf(sd.season, side.rid) : input.rosterToTeam[String(side.rid)] ?? null, teamName: sd.names?.[side.rid] ?? null, got: side.got, gave: side.gave,
        gotPicks: side.picksIn.map(pickLabel), gavePicks: side.picksOut.map(pickLabel), gotPickKeys: side.picksIn.map((p) => `${p.season}-${p.round}-${p.roster_id}`), gavePickKeys: side.picksOut.map((p) => `${p.season}-${p.round}-${p.roster_id}`), faabIn: side.faabIn, faabOut: side.faabOut,
        points: r1(W.reduce((a, x) => a + (isA ? x.impA : x.impB), 0)),
        wins: W.reduce((a, x) => a + (isA ? x.flipA : x.flipB), 0),
        value: valueSide(side),
        later: laterSide(side),
        turnedInto: turned(side),
        weekly: W.map((x) => ({ week: x.w, impact: r1(isA ? x.impA : x.impB), flipped: isA ? x.flipA : x.flipB })),
      });
      const sa = mk(A, true), sb = mk(B, false);
      out.push({ id: t.transaction_id, season: sd.season, week, at: Number(t.status_updated ?? t.created) || 0, weeksCounted: W.length, sides: [sa, sb], verdict: verdictFor(sa, sb, W.length, sd, input.kind, input.kind === "dynasty" ? laterSeasons.filter((x) => x.weeks.size > 0).length : 0) });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

function verdictFor(a: OutcomeSide, b: OutcomeSide, weeks: number, sd: SeasonData, kind: string, laterSeasons = 0): TradeOutcome["verdict"] {
  const cat = (x: number | null, y: number | null, gap: number) => (x === null || y === null ? null : Math.abs(x - y) < gap ? 0 : x > y ? a.rosterId : b.rosterId);
  const valueGap = kind === "dynasty" ? Math.max(500, 0.15 * Math.max(Math.abs(a.value ?? 0), Math.abs(b.value ?? 0))) : 10;

  const categories = { wins: cat(a.wins, b.wins, 1), points: cat(a.points, b.points, 10), value: cat(a.value, b.value, valueGap), later: cat(a.later, b.later, 40) };
  // Each later season counts about as much as the trade season itself (wins 3 + points 2), up to three seasons.
  const weights = { wins: 3, points: 2, value: 2, later: 2.5 * Math.min(3, laterSeasons) };
  let sA = 0, sB = 0;
  for (const k of Object.keys(categories) as (keyof typeof categories)[]) { const w = categories[k]; if (w === a.rosterId) sA += weights[k]; else if (w === b.rosterId) sB += weights[k]; }
  const finished = sd.lastScored >= sd.regularEnd;
  const status: TradeOutcome["verdict"]["status"] = weeks < 3 ? "Early read" : finished ? "Final" : "In progress";
  const decided = Object.values(categories).filter((v) => v !== null);
  const winner = sA === sB ? null : sA > sB ? a.rosterId : b.rosterId;
  const margin = Math.abs(sA - sB);
  const sweep = winner !== null && decided.length >= 2 && decided.every((v) => v === winner) && categories.wins === winner;
  const label = winner === null ? (weeks === 0 ? "Not played yet" : "Even") : sweep ? "Fleeced" : margin >= 3 ? "Clear win" : "Edge";
  return { winner, label, status, categories };
}

/** Load the league's current season and the ones before it, and grade every trade. */
export async function loadTradeOutcomes(opts: { leagueId: string; rosterToTeam: Record<string, string>; kind: "dynasty" | "keeper" | "redraft"; back?: number }): Promise<LeagueOutcomes> {
  const seasons: SeasonData[] = [];
  let id: string | null = opts.leagueId;
  type LeagueJson = { season?: string; roster_positions?: string[]; scoring_settings?: Record<string, number>; settings?: Record<string, number>; previous_league_id?: string | null };
  let current: LeagueJson | null = null;
  // Default: every season back to the league's start on Sleeper (previous_league_id chain).
  for (let i = 0; id && i <= (opts.back ?? 30); i++) {
    const league: LeagueJson | null = await getJson<LeagueJson>(`${SLEEPER}/league/${id}`).catch(() => null);
    if (!league) break;
    if (i === 0) current = league;
    seasons.push(await seasonCache(id, league, i > 0));
    id = league.previous_league_id && league.previous_league_id !== "0" ? league.previous_league_id : null;
  }
  const allIds = [...new Set(seasons.flatMap((s) => [...s.weeks.values()].flatMap((rows) => rows.flatMap((r) => r.players ?? []))).concat(seasons.flatMap((s) => s.trades.flatMap((t) => Object.keys(t.adds ?? {}))), seasons.flatMap((s) => s.drafts.flatMap((d) => d.picks.map((x) => x.player_id).filter(Boolean)))))];
  const facts = await loadSleeperPlayerFacts(allIds);
  const posOf = (pid: string) => facts.get(pid)?.pos ?? (/^[A-Z]{2,3}$/.test(pid) ? "DEF" : null);
  let valueOf: ((id: string) => number | null) | undefined;
  let pickValue: ((season: string, round: number) => number | null) | undefined;
  if (opts.kind === "dynasty" && current) {
    const fc = await getJson<FantasyCalcRow[]>(fantasyCalcUrl(current as never, true)).catch(() => [] as FantasyCalcRow[]);
    const byId = new Map(fc.flatMap((r) => (r.player?.sleeperId && typeof r.value === "number" ? [[r.player.sleeperId, r.value] as const] : [])));
    const picks = new Map(fc.filter((r) => r.player?.position === "PICK" && r.player.name).map((r) => [r.player!.name!, r.value ?? null] as const));
    valueOf = (pid) => byId.get(pid) ?? 0; // a player off the dynasty market today is worth ~nothing
    pickValue = (season, round) => picks.get(`${season} ${ordinal(round)}`) ?? null;
  }
  // Owners move between rosters over the years: credit each trade to whoever owned the roster that season.
  const nowRosterOf = new Map(Object.entries(seasons[0]?.owners ?? {}).flatMap(([rid, u]) => (u ? [[u, rid] as const] : [])));
  const bySeason = new Map(seasons.map((s) => [s.season, s] as const));
  const teamOf = (season: number, rid: number) => { const u = bySeason.get(season)?.owners?.[rid]; const now = u ? nowRosterOf.get(u) : undefined; return now ? opts.rosterToTeam[now] ?? null : null; };
  const trades = gradeTrades({ seasons, kind: opts.kind, posOf, rosterToTeam: opts.rosterToTeam, teamOf, valueOf, pickValue });
  const players: Record<string, { name: string; pos: string | null }> = {};
  for (const t of trades) for (const sd of t.sides) for (const pid of [...sd.got, ...sd.gave, ...sd.turnedInto.map((x) => x.playerId)]) {
    if (players[pid]) continue;
    const f = facts.get(pid);
    players[pid] = /^[A-Z]{2,3}$/.test(pid) ? { name: `${pid} D/ST`, pos: "DEF" } : { name: f?.name || `Player ${pid}`, pos: f?.pos ?? null };
  }
  return { kind: opts.kind, seasons: seasons.map((s) => s.season), trades, updatedAt: new Date().toISOString(), players };
}

/** Finished seasons never change: load them once per server. */
const pastSeasons = new Map<string, SeasonData>();
async function seasonCache(id: string, league: Parameters<typeof loadSeasonData>[1], past: boolean) {
  if (past && pastSeasons.has(id)) return pastSeasons.get(id)!;
  const sd = await loadSeasonData(id, league);
  if (past) pastSeasons.set(id, sd);
  return sd;
}

/** One line per side for pages and profiles: "+2.0 wins, +31.4 lineup points". */
export function outcomeLine(side: OutcomeSide, kind: string): string {
  const parts = [`${side.wins > 0 ? "+" : ""}${side.wins} win${Math.abs(side.wins) === 1 ? "" : "s"}`, `${side.points > 0 ? "+" : ""}${side.points.toFixed(1)} lineup pts`];
  if (side.later !== null && side.later !== undefined) parts.push(`${side.later > 0 ? "+" : ""}${side.later.toFixed(0)} starter pts in later seasons`);
  if (side.value !== null) parts.push(kind === "keeper" ? `${side.value > 0 ? "+" : ""}${side.value.toFixed(1)} keeper pts` : `${side.value > 0 ? "more" : side.value < 0 ? "less" : "equal"} value today`);
  return parts.join(", ");
}
export const r2x = r2;
