
import { outcomeLine, type LeagueOutcomes } from "./trade-outcomes.ts";

export interface TradeHistoryAsset { name: string; pos: string | null }
export interface TradeHistorySide {
  teamId: string | null;
  name: string;
  /** True when the team belonged to an owner who has since left (shown under that season's team name). */
  former: boolean;
  got: TradeHistoryAsset[];
  /** "2024 1st" or, once used, "2024 1st → Player Name". */
  picks: string[];
  faab: number;
  line: string;
  winner: boolean;
  /** Trade tree: later trades this team made with what it got here (and what those got, and so on). */
  tree?: { nodes: TradeTreeNode[]; total: { trades: number; wins: number; points: number; later: number } } | null;
}
export interface TradeTreeNode { id: string; season: number; week: number; partner: string; sent: string[]; got: string[]; line: string; children: TradeTreeNode[] }
export interface TradeHistoryItem { id: string; season: number; week: number; label: string; status: string; weeks: number; winner: string | null; sides: TradeHistorySide[] }
export interface TradeHistoryLeader { teamId: string; name: string; trades: number; won: number; lost: number; even: number; wins: number; points: number; later: number }
export interface TradeHistoryModel {
  kind: LeagueOutcomes["kind"];
  seasons: number[];
  trades: TradeHistoryItem[];
  board: TradeHistoryLeader[];
  /** Same leaderboard, one season at a time (trades made that season). */
  boardBySeason: Record<string, TradeHistoryLeader[]>;
  teams: { id: string; name: string }[];
  updatedAt: string;
}

export function buildTradeHistoryModel(outcomes: LeagueOutcomes, teams: readonly { id: string; name: string }[]): TradeHistoryModel {
  const teamName = new Map(teams.map((t) => [t.id, t.name] as const));
  const asset = (pid: string): TradeHistoryAsset => outcomes.players?.[pid] ?? (/^[A-Z]{2,3}$/.test(pid) ? { name: `${pid} D/ST`, pos: "DEF" } : { name: `Player ${pid}`, pos: null });
  const nameOf = (s: LeagueOutcomes["trades"][number]["sides"][number]) => (s.teamId ? teamName.get(s.teamId) : undefined) ?? s.teamName ?? `Team ${s.rosterId}`;
  const lineOf = (t: LeagueOutcomes["trades"][number], s: LeagueOutcomes["trades"][number]["sides"][number]) => (t.weeksCounted ? outcomeLine(s, outcomes.kind) : ["No games yet", s.value !== null && outcomes.kind === "dynasty" ? `${s.value > 0 ? "more" : s.value < 0 ? "less" : "equal"} value today` : null].filter(Boolean).join(" · "));
  const pickNames = (s: LeagueOutcomes["trades"][number]["sides"][number]) => { const used = [...(s.turnedInto ?? [])]; return s.gotPicks.map((label) => { const i = used.findIndex((u) => u.pick === label); if (i < 0) return label; const [u] = used.splice(i, 1); return `${label} → ${asset(u.playerId).name}`; }); };

  const chrono = [...outcomes.trades].sort((a, b) => a.at - b.at);
  type Side = LeagueOutcomes["trades"][number]["sides"][number];
  const received = (side: Side) => ({ players: new Set([...side.got, ...(side.turnedInto ?? []).map((x) => x.playerId)]), picks: new Set(side.gotPickKeys ?? []) });
  const pickName = new Map<string, string>();
  for (const t of chrono) for (const sd of t.sides) (sd.gavePickKeys ?? []).forEach((k, i) => pickName.set(k, sd.gavePicks[i] ?? k));
  const grow = (rosterId: number, teamId: string | null, after: number, have: { players: Set<string>; picks: Set<string> }, seen: Set<string>, depth: number): TradeTreeNode[] => {
    if (depth > 5) return [];
    const out: TradeTreeNode[] = [];
    for (const u of chrono) {
      if (u.at <= after || seen.has(u.id)) continue;
      const v = u.sides.find((x) => x.rosterId === rosterId && (x.teamId ?? null) === teamId);
      if (!v) continue;
      const sentPlayers = v.gave.filter((p) => have.players.has(p));
      const sentPicks = (v.gavePickKeys ?? []).filter((k) => have.picks.has(k));
      if (!sentPlayers.length && !sentPicks.length) continue;
      seen.add(u.id);
      sentPlayers.forEach((p) => have.players.delete(p)); sentPicks.forEach((k) => have.picks.delete(k));
      const partner = u.sides.find((x) => x !== v);
      out.push({
        id: u.id, season: u.season, week: u.week, partner: partner ? nameOf(partner) : "another team",
        sent: [...sentPlayers.map((p) => asset(p).name), ...sentPicks.map((k) => pickName.get(k) ?? k)],
        got: [...v.got.map((p) => asset(p).name), ...pickNames(v)],
        line: lineOf(u, v),
        children: grow(rosterId, teamId, u.at, received(v), seen, depth + 1),
      });
    }
    return out;
  };
  const treeFor = (t: LeagueOutcomes["trades"][number], s: Side): TradeHistorySide["tree"] => {
    const nodes = grow(s.rosterId, s.teamId ?? null, t.at, received(s), new Set([t.id]), 1);
    if (!nodes.length) return null;
    const byId = new Map(outcomes.trades.map((x) => [x.id, x] as const));
    const total = { trades: 1, wins: s.wins, points: s.points, later: s.later ?? 0 };
    const walk = (ns: TradeTreeNode[]) => { for (const n of ns) { const v = byId.get(n.id)?.sides.find((x) => x.rosterId === s.rosterId); if (v) { total.trades += 1; total.wins += v.wins; total.points += v.points; total.later += v.later ?? 0; } walk(n.children); } };
    walk(nodes);
    return { nodes, total: { trades: total.trades, wins: total.wins, points: Math.round(total.points * 10) / 10, later: Math.round(total.later) } };
  };
  const trades: TradeHistoryItem[] = [...outcomes.trades].sort((a, b) => b.at - a.at).map((t) => {
    const sides = t.sides.map((s): TradeHistorySide => {
      const current = s.teamId ? teamName.get(s.teamId) : undefined;
      return {
        teamId: current ? s.teamId : null,
        name: current ?? s.teamName ?? `Team ${s.rosterId}`,
        former: !current,
        got: s.got.map(asset),
        picks: pickNames(s),
        faab: s.faabIn,
        line: lineOf(t, s),
        winner: t.verdict.winner === s.rosterId,
        tree: treeFor(t, s),
      };
    });
    return { id: t.id, season: t.season, week: t.week, label: t.verdict.label, status: t.verdict.status, weeks: t.weeksCounted, winner: sides.find((s) => s.winner)?.name ?? null, sides };
  });
  const leadersFor = (list: LeagueOutcomes["trades"]) => {
    const board = new Map<string, TradeHistoryLeader>(teams.map((t) => [t.id, { teamId: t.id, name: t.name, trades: 0, won: 0, lost: 0, even: 0, wins: 0, points: 0, later: 0 }]));
    for (const t of list) {
      for (const s of t.sides) {
        const row = s.teamId ? board.get(s.teamId) : undefined;
        if (!row) continue;
        row.trades += 1;
        if (t.verdict.status === "Early read") continue; // too soon to call
        row.wins += s.wins;
        row.points = Math.round((row.points + s.points) * 10) / 10;
        row.later = Math.round(row.later + (s.later ?? 0));
        if (t.verdict.winner === null) row.even += 1; else if (t.verdict.winner === s.rosterId) row.won += 1; else row.lost += 1;
      }
    }
    return [...board.values()].filter((r) => r.trades > 0).sort((a, b) => (b.won - b.lost) - (a.won - a.lost) || b.wins - a.wins || b.points - a.points);
  };
  const leaders = leadersFor(outcomes.trades);
  const boardBySeason = Object.fromEntries(outcomes.seasons.map((y) => [String(y), leadersFor(outcomes.trades.filter((t) => t.season === y))]));
  return { kind: outcomes.kind, seasons: [...outcomes.seasons].sort((a, b) => b - a), trades, board: leaders, boardBySeason, teams: [...teams].map((t) => ({ id: t.id, name: t.name })), updatedAt: outcomes.updatedAt };
}
