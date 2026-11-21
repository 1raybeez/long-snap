
import type { TradeLeagueConfig, TradePlayer, TradeTeam } from "./trade-engine.ts";

const round1 = (n: number) => Math.round(n * 10) / 10;
const isPick = (p: TradePlayer) => p.kind === "pick" || p.pos === "PICK";
const BAD = /^(out|ir|doubtful|pup|sus|na|cov)/i;
/** Projected-point gap under which a start/sit swap is a toss-up, not a recommendation. */
export const TOSS_UP = 1.5;

export interface SlotPick { slot: string; id: string; pts: number }

/** Best lineup for a week with the slot each player fills (fixed slots first, then flex). */
export function lineupBySlot(players: readonly TradePlayer[], config: TradeLeagueConfig, week: number): SlotPick[] {
  const pts = (p: TradePlayer) => p.proj[week] ?? 0;
  const sorted = [...players].filter((p) => !isPick(p)).sort((a, b) => pts(b) - pts(a));
  const used = new Set<string>();
  const out: SlotPick[] = [];
  for (const slot of config.slots.filter((s) => !config.flex[s])) {
    const p = sorted.find((x) => !used.has(x.id) && x.pos === slot);
    if (p) { used.add(p.id); out.push({ slot, id: p.id, pts: pts(p) }); } else out.push({ slot, id: "", pts: 0 });
  }
  for (const slot of config.slots.filter((s) => config.flex[s])) {
    const p = sorted.find((x) => !used.has(x.id) && config.flex[slot].includes(x.pos));
    if (p) { used.add(p.id); out.push({ slot, id: p.id, pts: pts(p) }); } else out.push({ slot, id: "", pts: 0 });
  }
  return out;
}

export interface MyTeamPlayer { id: string; name: string; pos: string; nflTeam: string | null; injury: string | null; tag: string | null }
export interface MyTeamReport {
  week: number | null;
  team: { id: string; name: string; owner: string | null; record: string | null };
  lineup: { slot: string; player: MyTeamPlayer | null; pts: number; alt: { player: MyTeamPlayer; pts: number } | null; close: boolean; inSleeper: boolean | null }[];
  total: number;
  sleeper: { set: boolean; total: number | null; gain: number; moves: { start: MyTeamPlayer; sit: MyTeamPlayer | null; gain: number; tossUp: boolean }[] };
  alerts: string[];
  weakSpots: { group: string; avg: number; rank: number; of: number; leagueAvg: number; best: { team: string; avg: number } | null; level: "strength" | "average" | "weak" }[];
  drops: { player: MyTeamPlayer; reason: string }[];
  weeksLabel: string;
  /** Latest news on your players (Sleeper status, ESPN, Pro Football Rumors), when loaded. */
  news?: { player: MyTeamPlayer; status: string | null; fresh: boolean; items: { source: string; headline: string; at: number; url: string | null }[] }[];
}

const view = (p: TradePlayer): MyTeamPlayer => ({ id: p.id, name: p.name, pos: p.pos, nflTeam: p.nflTeam, injury: p.injury, tag: p.tag ?? null });
const groupOf = (slot: string) => (slot.includes("FLEX") ? "FLEX" : slot === "D/ST" ? "DEF" : slot);

export function analyzeMyTeam(input: { config: TradeLeagueConfig; teams: readonly TradeTeam[]; meId: string; sleeperStarters?: readonly string[] | null }): MyTeamReport | null {
  const { config } = input;
  const me = input.teams.find((t) => t.id === input.meId);
  if (!me) return null;
  const week = config.weeks[0] ?? null;
  const byId = new Map(me.players.map((p) => [p.id, p] as const));
  const weeksLabel = config.weeks.length ? `Weeks ${config.weeks[0]}–${config.weeks[config.weeks.length - 1]}` : "rest of season";

  // 1 · Start / Sit (this week).
  const best = week === null ? [] : lineupBySlot(me.players, config, week);
  const startIds = new Set(best.map((s) => s.id).filter(Boolean));
  const bench = me.players.filter((p) => !isPick(p) && !startIds.has(p.id) && p.tag !== "Taxi" && p.tag !== "IR");
  const sleeperSet = new Set((input.sleeperStarters ?? []).filter((id) => id && id !== "0"));
  const lineup = best.map((s) => {
    const p = s.id ? byId.get(s.id)! : null;
    const eligible = (q: TradePlayer) => (config.flex[s.slot] ? config.flex[s.slot].includes(q.pos) : q.pos === s.slot);
    const alt = week === null ? undefined : bench.filter(eligible).sort((a, b) => (b.proj[week] ?? 0) - (a.proj[week] ?? 0))[0];
    const altPts = alt && week !== null ? alt.proj[week] ?? 0 : 0;
    return {
      slot: s.slot, player: p ? view(p) : null, pts: round1(s.pts),
      alt: alt ? { player: view(alt), pts: round1(altPts) } : null,
      close: Boolean(alt && s.pts - altPts < 1.5),
      inSleeper: sleeperSet.size ? (p ? sleeperSet.has(p.id) : null) : null,
    };
  });
  const total = round1(best.reduce((a, s) => a + s.pts, 0));
  let sleeper: MyTeamReport["sleeper"] = { set: false, total: null, gain: 0, moves: [] };
  if (sleeperSet.size && week !== null) {
    const current = me.players.filter((p) => sleeperSet.has(p.id));
    const currentTotal = round1(current.reduce((a, p) => a + (p.proj[week] ?? 0), 0));
    const toStart = best.filter((s) => s.id && !sleeperSet.has(s.id)).map((s) => byId.get(s.id)!).sort((a, b) => (b.proj[week] ?? 0) - (a.proj[week] ?? 0));
    const toSit = current.filter((p) => !startIds.has(p.id)).sort((a, b) => (a.proj[week] ?? 0) - (b.proj[week] ?? 0));
    // Pair each change by position: a QB replaces a QB; a flex player replaces someone his slot can hold.
    const flexOk = (a: string, b: string) => Object.values(config.flex).some((ok) => ok.includes(a) && ok.includes(b));
    const left = [...toSit];
    const take = (pred: (q: TradePlayer) => boolean) => { const i = left.findIndex(pred); return i >= 0 ? left.splice(i, 1)[0] : null; };
    const pairs = toStart.map((p) => ({ p, q: take((q) => q.pos === p.pos) }));
    for (const pr of pairs) if (!pr.q) pr.q = take((q) => flexOk(q.pos, pr.p.pos));

    const moves = pairs.map(({ p, q }) => { const gain = round1((p.proj[week] ?? 0) - (q ? q.proj[week] ?? 0 : 0)); return { start: view(p), sit: q ? view(q) : null, gain, tossUp: Boolean(q) && gain < TOSS_UP }; }).filter((m) => m.gain > 0.05);
    sleeper = { set: true, total: currentTotal, gain: round1(Math.max(0, total - currentTotal)), moves };
  }
  const alerts: string[] = [];
  for (const p of me.players) {
    if (isPick(p)) continue;
    const starting = sleeperSet.size ? sleeperSet.has(p.id) : startIds.has(p.id);
    if (starting && p.injury && BAD.test(p.injury)) alerts.push(`${p.name} is ${p.injury} and in your lineup.`);
    else if (starting && p.injury && /^q/i.test(p.injury)) alerts.push(`${p.name} is questionable; check before kickoff.`);
    if (starting && week !== null && (p.proj[week] ?? 0) === 0 && !p.injury) alerts.push(`${p.name} has no projection this week (bye?).`);
  }
  if (sleeperSet.size && [...sleeperSet].length < config.slots.length) alerts.push(`Your Sleeper lineup has an empty spot.`);

  // 2 · Weak spots: rest-of-season average at each starting group, ranked against the league.
  const groups = [...new Set(config.slots.map(groupOf))].filter((g) => !["K", "DEF"].includes(g));
  const avgByTeam = new Map<string, Map<string, number>>();
  for (const t of input.teams) {
    const sums = new Map<string, number[]>();
    for (const w of config.weeks) for (const s of lineupBySlot(t.players, config, w)) { const g = groupOf(s.slot); sums.set(g, [...(sums.get(g) ?? []), s.pts]); }
    avgByTeam.set(t.id, new Map([...sums.entries()].map(([g, xs]) => [g, xs.reduce((a, b) => a + b, 0) / Math.max(1, config.weeks.length)])));
  }
  const weakSpots = groups.map((g) => {
    const rows = input.teams.map((t) => ({ t, v: avgByTeam.get(t.id)?.get(g) ?? 0 })).sort((a, b) => b.v - a.v);
    const mine = rows.find((r) => r.t.id === me.id)!;
    const rank = rows.indexOf(mine) + 1;
    const n = rows.length;
    const top = rows.find((r) => r.t.id !== me.id) ?? null;
    return {
      group: g, avg: round1(mine.v), rank, of: n,
      leagueAvg: round1(rows.reduce((a, r) => a + r.v, 0) / Math.max(1, n)),
      best: top ? { team: top.t.name, avg: round1(top.v) } : null,
      level: (rank <= Math.ceil(n / 3) ? "strength" : rank > n - Math.ceil(n / 3) ? "weak" : "average") as "strength" | "average" | "weak",
    };
  });

  // 3 · Drop candidates: bench players worth the least.
  const dynasty = config.format === "dynasty";
  const restPts = (p: TradePlayer) => config.weeks.reduce((a, w) => a + (p.proj[w] ?? 0), 0);
  const protectedPlayer = (p: TradePlayer) => dynasty && (p.tag === "Taxi" || (typeof p.age === "number" && p.age <= 23));
  const cands = me.players.filter((p) => !isPick(p) && !startIds.has(p.id) && !protectedPlayer(p) && p.tag !== "IR");
  const maxMarket = Math.max(1, ...me.players.map((p) => p.market ?? 0));
  const maxPts = Math.max(1, ...me.players.map(restPts));
  const keepScore = (p: TradePlayer) => (dynasty ? 0.6 * ((p.market ?? 0) / maxMarket) + 0.4 * (restPts(p) / maxPts) : 0.75 * (restPts(p) / maxPts) + 0.25 * ((p.market ?? 0) / maxMarket));
  const extraKD = (pos: string) => me.players.filter((p) => p.pos === pos).length > 1;
  const drops = cands
    .filter((p) => !["K", "DEF"].includes(p.pos) || extraKD(p.pos))
    .sort((a, b) => keepScore(a) - keepScore(b))
    .slice(0, 3)
    .map((p) => ({
      player: view(p),
      reason: ["K", "DEF"].includes(p.pos)
        ? `Your second ${p.pos === "DEF" ? "defense" : "kicker"}; only one starts.`
        : `${round1(restPts(p) / Math.max(1, config.weeks.length))} projected points a week and ${(p.market ?? 0) / maxMarket < 0.1 ? "almost no" : "little"} ${dynasty ? "dynasty" : "trade"} value${p.injury ? ` (${p.injury})` : ""}.`,
    }));

  return { week, team: { id: me.id, name: me.name, owner: me.owner, record: me.record }, lineup, total, sleeper, alerts, weakSpots, drops, weeksLabel };
}
