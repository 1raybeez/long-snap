
import { loadSleeperPlayerFacts } from "./player-news.ts";

const SLEEPER = "https://api.sleeper.app/v1";
async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}
type Tx = { type?: string; status?: string; roster_ids?: number[]; adds?: Record<string, number> | null; drops?: Record<string, number> | null; draft_picks?: { round: number; season: string; roster_id: number; owner_id: number; previous_owner_id: number }[]; waiver_budget?: { sender: number; receiver: number; amount: number }[]; settings?: { waiver_bid?: number } | null; created?: number };

export interface OwnerTradeProfile {
  teamId: string;
  seasons: number[];
  trades: number;
  tradesThisSeason: number;
  /** Trade partners (team ids) with counts. */
  partners: Record<string, number>;
  /** Net players acquired by position (positive = buys). */
  netByPos: Record<string, number>;
  picksIn: number;
  picksOut: number;
  faabIn: number;
  faabOut: number;
  avgAgeIn: number | null;
  avgAgeOut: number | null;
  waiverAdds: number;
  lastTrade: number | null;
  /** Short plain-language traits, e.g. "Trades often", "Buys RBs", "Sells picks". */
  traits: string[];
  /** One line for cards: "4 trades in 2 seasons · buys RBs · sells picks". */
  summary: string;
}
export interface LeagueTradeNorms { seasons: number[]; trades: number; perTeam: number; picksMoved: number; faabMoved: number }
export interface OwnerProfiles { profiles: Record<string, OwnerTradeProfile>; norms: LeagueTradeNorms; updatedAt: string }

const PLURAL: Record<string, string> = { QB: "QBs", RB: "RBs", WR: "WRs", TE: "TEs", K: "kickers", DEF: "defenses" };

/** Pure: build profiles from transactions already fetched (exported for tests). */
export function buildOwnerProfiles(input: {
  /** `teamOf`: that season's roster → today's team (a former owner's roster maps to nothing). */
  seasons: { season: number; txs: Tx[]; teamOf?: Record<string, string | null> }[];
  rosterToTeam: Record<string, string>;
  facts: ReadonlyMap<string, { pos: string | null; age: number | null }>;
  currentSeason: number;
}): OwnerProfiles {
  const teams = [...new Set(Object.values(input.rosterToTeam))];
  const blank = (teamId: string): OwnerTradeProfile => ({ teamId, seasons: input.seasons.map((s) => s.season), trades: 0, tradesThisSeason: 0, partners: {}, netByPos: {}, picksIn: 0, picksOut: 0, faabIn: 0, faabOut: 0, avgAgeIn: null, avgAgeOut: null, waiverAdds: 0, lastTrade: null, traits: [], summary: "" });
  const prof = new Map(teams.map((t) => [t, blank(t)] as const));
  const ages = new Map(teams.map((t) => [t, { inn: [] as number[], out: [] as number[] }] as const));
  let teamOf: Record<string, string | null> | undefined;
  const team = (rid: number): string | undefined => (teamOf ? teamOf[String(rid)] ?? undefined : input.rosterToTeam[String(rid)]);
  let trades = 0, picksMoved = 0, faabMoved = 0;
  for (const { season, txs, teamOf: seasonTeams } of input.seasons) {
    teamOf = seasonTeams;
    for (const t of txs) {
      if (t.status !== "complete") continue;
      if (t.type === "trade") {
        trades += 1;
        const ids = (t.roster_ids ?? []).map(team).filter((x): x is string => Boolean(x));
        for (const tid of ids) {
          const p = prof.get(tid)!;
          p.trades += 1; if (season === input.currentSeason) p.tradesThisSeason += 1;
          p.lastTrade = Math.max(p.lastTrade ?? 0, Number(t.created) || 0);
          for (const other of ids) if (other !== tid) p.partners[other] = (p.partners[other] ?? 0) + 1;
        }
        for (const [pid, rid] of Object.entries(t.adds ?? {})) {
          const to = team(rid); const from = t.drops?.[pid] !== undefined ? team(t.drops[pid]) : undefined;
          const f = input.facts.get(pid); const pos = f?.pos ?? (/^[A-Z]{2,3}$/.test(pid) ? "DEF" : null);
          if (to && pos) { const p = prof.get(to)!; p.netByPos[pos] = (p.netByPos[pos] ?? 0) + 1; if (f?.age) ages.get(to)!.inn.push(f.age); }
          if (from && pos) { const p = prof.get(from)!; p.netByPos[pos] = (p.netByPos[pos] ?? 0) - 1; if (f?.age) ages.get(from)!.out.push(f.age); }
        }
        for (const dp of t.draft_picks ?? []) { picksMoved += 1; const to = team(dp.owner_id), from = team(dp.previous_owner_id); if (to) prof.get(to)!.picksIn += 1; if (from) prof.get(from)!.picksOut += 1; }
        for (const b of t.waiver_budget ?? []) { faabMoved += b.amount; const to = team(b.receiver), from = team(b.sender); if (to) prof.get(to)!.faabIn += b.amount; if (from) prof.get(from)!.faabOut += b.amount; }
      } else if ((t.type === "waiver" || t.type === "free_agent") && season === input.currentSeason) {
        for (const rid of Object.values(t.adds ?? {})) { const tid = team(rid); if (tid) prof.get(tid)!.waiverAdds += 1; }
      }
    }
  }
  const perTeam = teams.length ? (2 * trades) / teams.length : 0;
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const waiverMedian = (() => { const xs = [...prof.values()].map((p) => p.waiverAdds).sort((a, b) => a - b); return xs[Math.floor(xs.length / 2)] ?? 0; })();
  for (const p of prof.values()) {
    const a = ages.get(p.teamId)!;
    p.avgAgeIn = avg(a.inn); p.avgAgeOut = avg(a.out);
    const traits: string[] = [];
    if (p.trades === 0) traits.push("Hasn't traded");
    else if (p.trades >= Math.max(3, 1.5 * perTeam)) traits.push("Trades often");
    else if (p.trades <= Math.max(1, 0.5 * perTeam)) traits.push("Rarely trades");
    const buys = Object.entries(p.netByPos).filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).map(([pos]) => PLURAL[pos] ?? pos);
    const sells = Object.entries(p.netByPos).filter(([, n]) => n <= -2).sort((x, y) => x[1] - y[1]).map(([pos]) => PLURAL[pos] ?? pos);
    if (buys.length) traits.push(`Buys ${buys.slice(0, 2).join(" and ")}`);
    if (sells.length) traits.push(`Sells ${sells.slice(0, 2).join(" and ")}`);
    if (p.picksOut - p.picksIn >= 2) traits.push("Sells picks");
    if (p.picksIn - p.picksOut >= 2) traits.push("Collects picks");
    if (p.avgAgeIn !== null && p.avgAgeOut !== null && a.inn.length + a.out.length >= 4) {
      if (p.avgAgeIn - p.avgAgeOut >= 2) traits.push("Buys veterans (win-now)");
      else if (p.avgAgeOut - p.avgAgeIn >= 2) traits.push("Gets younger (rebuilding)");
    }
    if (p.faabIn + p.faabOut > 0) traits.push(p.faabIn > p.faabOut ? `Takes FAAB in trades ($${p.faabIn})` : `Adds FAAB to trades ($${p.faabOut})`);
    if (p.waiverAdds >= 2 * Math.max(1, waiverMedian)) traits.push("Lives on the waiver wire");
    p.traits = traits;
    const seasons = p.seasons.length;
    p.summary = [`${p.trades} trade${p.trades === 1 ? "" : "s"} in ${seasons} season${seasons === 1 ? "" : "s"}${p.tradesThisSeason ? ` (${p.tradesThisSeason} this year)` : ""}`, ...traits.filter((x) => !/trade(s)? often|Rarely|Hasn't/.test(x)).slice(0, 3)].join(" · ");
  }
  return { profiles: Object.fromEntries(prof), norms: { seasons: input.seasons.map((s) => s.season), trades, perTeam: Math.round(perTeam * 10) / 10, picksMoved, faabMoved }, updatedAt: new Date().toISOString() };
}

/** Load this season plus up to `back` earlier seasons (via previous_league_id) and build the profiles. */
/** Finished seasons never change: keep their transactions in memory for the life of the server. */
const pastSeasonTxs = new Map<string, Tx[]>();
const pastSeasonOwners = new Map<string, Record<string, string | null>>();
async function rosterOwners(leagueId: string): Promise<Record<string, string | null>> {
  const rows = await getJson<{ roster_id: number; owner_id?: string | null }[]>(`${SLEEPER}/league/${leagueId}/rosters`).catch(() => []);
  return Object.fromEntries(rows.map((r) => [String(r.roster_id), r.owner_id ?? null]));
}

export async function loadOwnerProfiles(opts: { leagueId: string; season: number; rosterToTeam: Record<string, string>; back?: number }): Promise<OwnerProfiles> {
  const seasons: { season: number; txs: Tx[]; owners: Record<string, string | null> }[] = [];
  let id: string | null = opts.leagueId, season = opts.season;
  for (let i = 0; id && i <= (opts.back ?? 2); i++) {
    const league: { previous_league_id?: string | null; settings?: { last_scored_leg?: number } } | null = await getJson<{ previous_league_id?: string | null; settings?: { last_scored_leg?: number } }>(`${SLEEPER}/league/${id}`).catch(() => null);
    if (!league) break;
    const weeks = Array.from({ length: 18 }, (_, k) => k + 1);
    const lid: string = id;
    const cached = i > 0 ? pastSeasonTxs.get(lid) : undefined;
    const txs = cached ?? (await Promise.all(weeks.map((w) => getJson<Tx[]>(`${SLEEPER}/league/${lid}/transactions/${w}`).catch(() => [] as Tx[])))).flat();
    if (i > 0 && !cached) pastSeasonTxs.set(lid, txs);
    const owners = (i > 0 ? pastSeasonOwners.get(lid) : undefined) ?? (await rosterOwners(lid));
    if (i > 0) pastSeasonOwners.set(lid, owners);
    seasons.push({ season, txs, owners });
    id = league.previous_league_id && league.previous_league_id !== "0" ? league.previous_league_id : null;
    season -= 1;
  }
  const ids = [...new Set(seasons.flatMap((s) => s.txs.filter((t) => t.type === "trade").flatMap((t) => Object.keys(t.adds ?? {}))))];
  const facts = await loadSleeperPlayerFacts(ids);
  // Credit each season's moves to whoever owned the roster then (owners change rosters over the years).
  const nowRosterOf = Object.fromEntries(Object.entries(seasons[0]?.owners ?? {}).flatMap(([rid, u]) => (u ? [[u, rid] as const] : [])));
  const withTeams = seasons.map((s) => ({ season: s.season, txs: s.txs, teamOf: Object.fromEntries(Object.entries(s.owners).map(([rid, u]) => [rid, u && nowRosterOf[u] ? opts.rosterToTeam[nowRosterOf[u]] ?? null : null])) }));
  return buildOwnerProfiles({ seasons: withTeams, rosterToTeam: opts.rosterToTeam, facts, currentSeason: opts.season });
}
