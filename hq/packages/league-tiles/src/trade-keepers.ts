
import type { TradePlayer, TradeTeam } from "./trade-engine.ts";

export interface KeeperRule { readonly max: number; readonly onePerPosition: boolean }

/** A surplus at or above this many dollars counts as a bargain keeper. */
export const BARGAIN_MIN = 5;

export interface KeeperPick { readonly id: string; readonly name: string; readonly pos: string; readonly cost: number; readonly value: number; readonly surplus: number }

export interface KeeperOutlook {
  /** The players this team would keep (best surplus, within the rule). */
  readonly keepers: readonly KeeperPick[];
  /** Total surplus of those keepers. */
  readonly total: number;
  /** Every bargain on the roster (surplus ≥ BARGAIN_MIN), best first. */
  readonly bargains: readonly KeeperPick[];
  /** Bargains the rule won't let this team keep: cheap to trade for. */
  readonly spares: readonly KeeperPick[];

  readonly closeCalls: readonly KeeperPick[];
}

/** How far below break-even a player can be and still show as a close call. */
export const CLOSE_CALL = 8;

const isPick = (p: TradePlayer) => p.kind === "pick" || p.pos === "PICK";

export function keeperSurplus(p: TradePlayer): number | null {
  if (isPick(p) || typeof p.keeperNext !== "number" || typeof p.keeperValue !== "number") return null;
  return Math.round(p.keeperValue - p.keeperNext);
}

function candidates(players: readonly TradePlayer[]): KeeperPick[] {
  const out: KeeperPick[] = [];
  for (const p of players) {
    const s = keeperSurplus(p);
    if (s === null) continue;
    out.push({ id: p.id, name: p.name, pos: p.pos, cost: p.keeperNext as number, value: Math.round(p.keeperValue as number), surplus: s });
  }
  return out.sort((a, b) => b.surplus - a.surplus || a.cost - b.cost || a.name.localeCompare(b.name));
}

/** The best keepers within the rule. Greedy by surplus is exact here (a cap plus one-per-position). */
export function bestKeepers(players: readonly TradePlayer[], rule: KeeperRule): KeeperPick[] {
  const out: KeeperPick[] = [];
  const used = new Set<string>();
  for (const c of candidates(players)) {
    if (out.length >= rule.max) break;
    if (c.surplus <= 0) break;
    if (rule.onePerPosition && used.has(c.pos)) continue;
    out.push(c);
    used.add(c.pos);
  }
  return out;
}

export function keeperOutlook(players: readonly TradePlayer[], rule: KeeperRule): KeeperOutlook {
  const keepers = bestKeepers(players, rule);
  const kept = new Set(keepers.map((k) => k.id));
  const bargains = candidates(players).filter((c) => c.surplus >= BARGAIN_MIN);
  const spares = bargains.filter((b) => !kept.has(b.id));
  const spare = new Set(spares.map((b) => b.id));
  const closeCalls = candidates(players).filter((c) => !kept.has(c.id) && !spare.has(c.id) && c.surplus >= -CLOSE_CALL && c.surplus < BARGAIN_MIN).slice(0, 3);
  return { keepers, total: keepers.reduce((s, k) => s + k.surplus, 0), bargains, spares, closeCalls };
}

/** True when the roster has any keeper values to work with (otherwise keeper checks are skipped). */
export const hasKeeperValues = (teams: readonly TradeTeam[]) => teams.some((t) => t.players.some((p) => keeperSurplus(p) !== null));

export type KeeperFlag = "only-bargain" | "spare" | "give-only-bargain" | "give-spare" | "two-for-one-great" | "one-great-for-two" | "lowball";

export interface KeeperSideCheck { readonly before: KeeperOutlook; readonly after: KeeperOutlook; readonly change: number }
export interface KeeperTradeCheck { readonly a: KeeperSideCheck; readonly b: KeeperSideCheck; readonly notes: readonly string[]; readonly flags: readonly KeeperFlag[] }

const $ = (n: number) => `$${Math.round(n)}`;
const names = (xs: readonly { name: string }[]) => (xs.length ? xs.map((x) => x.name).join(" and ") : "nobody");
/** A player's weight for "best player in the deal": next year's value, else this season's market value. */
const weight = (p: TradePlayer) => (typeof p.keeperValue === "number" ? p.keeperValue : 0) * 1000 + (p.market ?? 0) / 1000;

/**
 * Both sides' keepers before and after a trade, from team A's point of view ("you"), with the warnings from the lessons.
 * `market` is the trade's this-season market read (band, and which side gets more).
 */
export function keeperTradeCheck(input: {
  rule: KeeperRule; teamA: TradeTeam; teamB: TradeTeam; aSends: readonly string[]; bSends: readonly string[]; them: string;
  market?: { band: string; favors: "A" | "B" | null } | null;
}): KeeperTradeCheck {
  const { rule, teamA, teamB, them } = input;
  const aOut = teamA.players.filter((p) => input.aSends.includes(p.id));
  const bOut = teamB.players.filter((p) => input.bSends.includes(p.id));
  const aAfter = [...teamA.players.filter((p) => !input.aSends.includes(p.id)), ...bOut];
  const bAfter = [...teamB.players.filter((p) => !input.bSends.includes(p.id)), ...aOut];
  const side = (before: readonly TradePlayer[], after: readonly TradePlayer[]): KeeperSideCheck => {
    const b = keeperOutlook(before, rule);
    const a = keeperOutlook(after, rule);
    return { before: b, after: a, change: a.total - b.total };
  };
  const A = side(teamA.players, aAfter);
  const B = side(teamB.players, bAfter);
  const notes: string[] = [];
  const flags: KeeperFlag[] = [];
  const flag = (f: KeeperFlag) => { if (!flags.includes(f)) flags.push(f); };

  for (const p of bOut) {
    const bargain = B.before.bargains.find((x) => x.id === p.id);
    if (!bargain) continue;
    if (B.before.bargains.length === 1) {
      notes.push(`${p.name} is ${them}'s only bargain keeper (worth about ${$(bargain.value)} next year, costs ${$(bargain.cost)}). He'll price him high; asking for him reads as fishing unless you pay for next year too.`);
      flag("only-bargain");
    } else if (B.before.spares.some((x) => x.id === p.id)) {
      notes.push(`${p.name} is a bargain ${them} can't keep anyway: he'd keep ${names(B.before.keepers)}${rule.onePerPosition ? ` (${rule.max} keepers, 1 per position)` : ""}. That makes him the cheapest keeper to ask for.`);
      flag("spare");
    }
  }
  for (const p of aOut) {
    const bargain = A.before.bargains.find((x) => x.id === p.id);
    if (!bargain) continue;
    if (A.before.bargains.length === 1) {
      notes.push(`You'd give up your only bargain keeper, ${p.name} (worth about ${$(bargain.value)}, costs ${$(bargain.cost)}).`);
      flag("give-only-bargain");
    } else if (A.before.spares.some((x) => x.id === p.id)) {
      notes.push(`${p.name} is a spare bargain for you (you'd keep ${names(A.before.keepers)}), so he's cheap for you to give.`);
      flag("give-spare");
    }
  }
  // Two good for one great: the side giving one player gives the best player in the deal and must clear a roster spot.
  const top = (xs: readonly TradePlayer[]) => Math.max(...xs.map(weight));
  if (bOut.length === 1 && aOut.length >= 2 && weight(bOut[0]!) > top(aOut)) {
    notes.push(`Two good for one great: ${them} would give the best player in the deal and have to clear a roster spot. That usually reads as a lowball; one better player works better than two lesser ones.`);
    flag("two-for-one-great");
  } else if (aOut.length === 1 && bOut.length >= 2 && weight(aOut[0]!) > top(bOut) && A.change < 0) {
    notes.push(`You'd give the best player in the deal for ${bOut.length} lesser ones, and you can still keep only ${rule.max}: your keeper surplus drops ${$(-A.change)}.`);
    flag("one-great-for-two");
  }
  if (input.market?.band === "Lopsided" && input.market.favors === "A") {
    notes.push(`By this season's value it's lopsided your way, so ${them} will likely read it as a lowball. Open closer to fair.`);
    flag("lowball");
  }
  return { a: A, b: B, notes, flags };
}

/** One line for a trade card: "Your keepers: Smith ($12 surplus) + Jones → ..., +$9". */
export function keeperChangeLine(check: KeeperTradeCheck, them: string): string {
  const fmt = (o: KeeperOutlook) => (o.keepers.length ? o.keepers.map((k) => `${k.name} (saves ~${$(k.surplus)})`).join(", ") : "no bargain keepers");
  const sign = (n: number) => (n > 0 ? `savings up ${$(n)}` : n < 0 ? `savings down ${$(-n)}` : "savings unchanged");
  return `Your keepers: ${fmt(check.a.before)} → ${fmt(check.a.after)} (${sign(check.a.change)}). ${them}: ${sign(check.b.change)}.`;
}
