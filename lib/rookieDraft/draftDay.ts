
import { POSITIONS, type Position, type RookieHistory } from "./analysis.ts";

export type LiveDraft = { draftId: string; season: number; status: string; type: string; rounds: number; teams: number; startTime: number | null; slotToRoster: Record<string, number> | null };
export type LivePick = { pick: number; round: number; rosterId: number; playerId: string; player: string; position: string | null };
export type LiveTradedPick = { round: number; originalRosterId: number; ownerRosterId: number };
export type LiveRoster = { rosterId: number; label: string; ownerKeys: string[]; players: string[] };
/** A rookie with a value (FantasyCalc dynasty value; never sent to the browser, only its rank). */
export type RookieValue = { playerId: string; name: string; position: string; team: string | null; value: number };
export type PlayerValue = { position: string; value: number };

export type OrderSlot = { pick: number; round: number; slot: number; rosterId: number; originalRosterId: number };

/** Every pick of the draft in order (linear: same order each round; snake: even rounds reversed), traded picks applied. */
export function draftOrder(draft: LiveDraft, traded: readonly LiveTradedPick[]): OrderSlot[] {
  if (!draft.slotToRoster) return [];
  const slots = Array.from({ length: draft.teams }, (_, i) => i + 1);
  const out: OrderSlot[] = [];
  for (let round = 1; round <= draft.rounds; round++) {
    const order = draft.type === "snake" && round % 2 === 0 ? [...slots].reverse() : slots;
    order.forEach((slot, i) => {
      const original = Number(draft.slotToRoster![String(slot)]);
      const moved = traded.find((t) => t.round === round && t.originalRosterId === original);
      out.push({ pick: (round - 1) * draft.teams + i + 1, round, slot, originalRosterId: original, rosterId: moved ? moved.ownerRosterId : original });
    });
  }
  return out;
}

const groupOf = (round: number) => (round === 1 ? "R1" : round === 2 ? "R2" : "R3+") as "R1" | "R2" | "R3+";
const isPos = (p: string | null | undefined): p is Position => (POSITIONS as readonly string[]).includes(p ?? "");

/** Position shares by round group for a franchise's current owners, smoothed toward the league's own mix. */
export function positionLean(h: RookieHistory, ownerKeys: readonly string[]): Record<"R1" | "R2" | "R3+", Record<Position, number>> & { counts: Record<"R1" | "R2" | "R3+", Record<Position, number>> } {
  const mine = h.picks.filter((p) => isPos(p.position) && p.owners.some((o) => ownerKeys.includes(o)));
  const league = h.picks.filter((p) => isPos(p.position));
  const result = { counts: {} } as Record<"R1" | "R2" | "R3+", Record<Position, number>> & { counts: Record<"R1" | "R2" | "R3+", Record<Position, number>> };
  for (const g of ["R1", "R2", "R3+"] as const) {
    const m = mine.filter((p) => groupOf(p.round) === g);
    const l = league.filter((p) => groupOf(p.round) === g);
    const counts = Object.fromEntries(POSITIONS.map((pos) => [pos, m.filter((p) => p.position === pos).length])) as Record<Position, number>;
    result.counts[g] = counts;
    result[g] = Object.fromEntries(POSITIONS.map((pos) => {
      const prior = l.length ? l.filter((p) => p.position === pos).length / l.length : 0.25;
      return [pos, (counts[pos] + 3 * prior) / (m.length + 3)];
    })) as Record<Position, number>;
  }
  return result;
}

export type Need = { rank: number; level: "thin" | "ok" | "deep" };
/** How each roster stacks up by position (sum of its best players' values, ranked across the league; 1 = strongest). */
export function rosterNeeds(rosters: readonly LiveRoster[], values: ReadonlyMap<string, PlayerValue>): Map<number, Record<Position, Need>> {
  const depth: Record<Position, number> = { QB: 1, RB: 3, WR: 4, TE: 1 };
  const strength = new Map(rosters.map((r) => [r.rosterId, Object.fromEntries(POSITIONS.map((pos) => {
    const vals = r.players.map((id) => values.get(id)).filter((v): v is PlayerValue => Boolean(v) && v!.position === pos).map((v) => v.value).sort((a, b) => b - a);
    return [pos, vals.slice(0, depth[pos]).reduce((s, v) => s + v, 0)];
  })) as Record<Position, number>]));
  const n = rosters.length;
  const band = Math.max(1, Math.round(n / 3)); // 12 teams: the weakest 4 are "thin", the strongest 4 "deep"
  const out = new Map<number, Record<Position, Need>>();
  for (const r of rosters) out.set(r.rosterId, {} as Record<Position, Need>);
  for (const pos of POSITIONS) {
    [...rosters].sort((a, b) => strength.get(b.rosterId)![pos] - strength.get(a.rosterId)![pos]).forEach((r, i) => {
      out.get(r.rosterId)![pos] = { rank: i + 1, level: i + 1 > n - band ? "thin" : i < band ? "deep" : "ok" };
    });
  }
  return out;
}
const NEED_FACTOR = { thin: 1.25, ok: 1, deep: 0.8 } as const;

export type Prediction = { pick: number; round: number; rosterId: number; label: string; position: Position | null; reason: string };
/** The likely position for each upcoming pick: the manager's own lean in that round, nudged by roster needs, among what's left. */
export function predictPicks(h: RookieHistory, upcoming: readonly OrderSlot[], rosters: readonly LiveRoster[], needs: Map<number, Record<Position, Need>>, available: readonly RookieValue[]): Prediction[] {
  const byId = new Map(rosters.map((r) => [r.rosterId, r]));
  const pool = available.slice(0, 24);
  return upcoming.map((slot) => {
    const roster = byId.get(slot.rosterId);
    const label = roster?.label ?? `Roster ${slot.rosterId}`;
    if (!roster) return { pick: slot.pick, round: slot.round, rosterId: slot.rosterId, label, position: null, reason: "Roster not found in Sleeper." };
    const lean = positionLean(h, roster.ownerKeys);
    const g = groupOf(slot.round);
    const need = needs.get(slot.rosterId);
    const there = POSITIONS.filter((p) => pool.some((r) => r.position === p));
    const scored = (there.length ? there : POSITIONS).map((pos) => ({ pos, s: lean[g][pos] * NEED_FACTOR[need?.[pos]?.level ?? "ok"] })).sort((a, b) => b.s - a.s);
    const top = scored[0].pos;
    const c = lean.counts[g];
    const n = POSITIONS.reduce((s, p) => s + c[p], 0);
    const parts = [n ? `took ${top} with ${c[top]} of ${n} ${g === "R3+" ? "round 3+" : `round-${g.slice(1)}`} picks` : `no ${g === "R3+" ? "late-round" : `round-${g.slice(1)}`} history; league mix`];
    if (need?.[top]?.level === "thin") parts.push(`thin at ${top} (${need[top].rank} of ${rosters.length})`);
    const thin = POSITIONS.filter((p) => p !== top && need?.[p]?.level === "thin");
    if (thin.length) parts.push(`also thin at ${thin.join("/")}`);
    return { pick: slot.pick, round: slot.round, rosterId: slot.rosterId, label, position: top, reason: parts.join("; ") };
  });
}

export type PickSuggestion = { playerId: string; name: string; position: string; team: string | null; boardRank: number; reasons: string[] };
/**
 * A suggestion for the owner's pick: value first, then the owner's roster needs, then which positions the managers
 * picking before the owner's following pick are likely to take.
 */
export function suggestPick(opts: { available: readonly RookieValue[]; myNeeds: Record<Position, Need> | null; between: readonly Prediction[]; teams: number }): { pick: PickSuggestion; alternatives: PickSuggestion[] } | null {
  const { available, myNeeds, between, teams } = opts;
  const candidates = available.filter((r) => isPos(r.position)).slice(0, 8);
  if (!candidates.length) return null;
  const max = candidates[0].value || 1;
  const run = Object.fromEntries(POSITIONS.map((p) => [p, between.filter((b) => b.position === p).length])) as Record<Position, number>;
  const poolSize = between.length + 4;
  const inPool = Object.fromEntries(POSITIONS.map((p) => [p, available.slice(0, poolSize).filter((r) => r.position === p).length])) as Record<Position, number>;
  const scored = candidates.map((r) => {
    const pos = r.position as Position;
    const need = myNeeds?.[pos]?.level ?? "ok";
    const scarcity = inPool[pos] ? Math.min(1, run[pos] / inPool[pos]) : 0;
    const score = (r.value / max) * NEED_FACTOR[need] * (1 + 0.15 * scarcity);
    const boardRank = available.indexOf(r) + 1;
    const reasons = [`#${boardRank} rookie left on the board by value`];
    if (need === "thin") reasons.push(`you're thin at ${pos} (${myNeeds![pos].rank} of ${teams} by roster value)`);
    if (need === "deep") reasons.push(`your ${pos} room is already deep (${myNeeds![pos].rank} of ${teams})`);
    if (between.length && run[pos] >= 2) reasons.push(`${run[pos]} of the ${between.length} managers before your next pick lean ${pos}`);
    else if (between.length && run[pos] === 0) reasons.push(`none of the ${between.length} managers before your next pick lean ${pos}, so ${pos} may still be there`);
    return { score, s: { playerId: r.playerId, name: r.name, position: r.position, team: r.team, boardRank, reasons } };
  }).sort((a, b) => b.score - a.score);
  return { pick: scored[0].s, alternatives: scored.slice(1, 3).map((x) => x.s) };
}
