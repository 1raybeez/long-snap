import type { SleeperLeagueSnapshot } from "./sleeper-adapter.ts";
import { FANTASYCALC_CREDIT, fantasyCalcUrl, type FantasyCalcValueLike } from "./roster-strength.ts";

export type RosterTier = "TITLE CONTENDER" | "CONTENDER" | "PLAYOFF CALIBER" | "BUBBLE" | "LONG SHOT";
export const ROSTER_TIERS: readonly { readonly key: RosterTier; readonly label: string }[] = [
  { key: "TITLE CONTENDER", label: "Title Contenders" },
  { key: "CONTENDER", label: "Contenders" },
  { key: "PLAYOFF CALIBER", label: "Playoff Caliber" },
  { key: "BUBBLE", label: "Bubble" },
  { key: "LONG SHOT", label: "Long Shots" },
];

export type RosterArea = "starters" | "depth" | "qb" | "rb" | "wr" | "te" | "flex";
export const ROSTER_AREAS: readonly { readonly key: RosterArea; readonly label: string; readonly room: string }[] = [
  { key: "starters", label: "Starters", room: "Starting lineup" },
  { key: "depth", label: "Depth", room: "Bench/Depth" },
  { key: "qb", label: "QB", room: "QB room" },
  { key: "rb", label: "RB", room: "RB room" },
  { key: "wr", label: "WR", room: "WR room" },
  { key: "te", label: "TE", room: "TE room" },
  { key: "flex", label: "Flex", room: "Flex options" },
];

export interface RosterDetailTeam {
  readonly rosterId: number;
  /** Rank by total roster value (the "roster" half of the weekly Power Rankings). */
  readonly rank: number;
  readonly tier: RosterTier;
  readonly ranks: Readonly<Record<RosterArea, number>>;
  readonly strength: { readonly area: RosterArea; readonly label: string; readonly rank: number };
  readonly weakness: { readonly area: RosterArea; readonly label: string; readonly rank: number };
}

export interface RosterDetail {
  readonly teams: readonly RosterDetailTeam[];
  readonly teamCount: number;
  readonly label: string;
  readonly credit: typeof FANTASYCALC_CREDIT;
}

const FLEX_ELIGIBLE: Readonly<Record<string, readonly string[]>> = {
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
const CORE = ["QB", "RB", "WR", "TE"] as const;

/** Tier by roster-value rank: top sixth title contenders, next sixth contenders, middle third playoff caliber, then bubble and long shots. */
export function tierForRank(rank: number, teamCount: number): RosterTier {
  const share = rank / teamCount;
  if (share <= 1 / 6) return "TITLE CONTENDER";
  if (share <= 2 / 6) return "CONTENDER";
  if (share <= 4 / 6) return "PLAYOFF CALIBER";
  if (share <= 5 / 6) return "BUBBLE";
  return "LONG SHOT";
}

function rankDescending(rows: readonly { readonly rosterId: number; readonly value: number }[]): Map<number, number> {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.rosterId - b.rosterId);
  const ranks = new Map<number, number>();
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    ranks.set(row.rosterId, prev && prev.value === row.value ? ranks.get(prev.rosterId)! : i + 1);
  });
  return ranks;
}

export function rosterStrengthDetail(snapshot: SleeperLeagueSnapshot, values: readonly FantasyCalcValueLike[], label: string): RosterDetail | null {
  const players = new Map<string, { value: number; position: string }>();
  for (const row of values) {
    const id = row.player?.sleeperId;
    const position = (row.player as { position?: string } | null | undefined)?.position;
    if (id && typeof row.value === "number" && position) players.set(id, { value: row.value, position });
  }
  if (!players.size || !snapshot.rosters.length) return null;

  const slots = ((snapshot.league as { roster_positions?: readonly string[] }).roster_positions ?? []).filter((s) => s !== "BN");
  const dedicated = Object.fromEntries(CORE.map((pos) => [pos, slots.filter((s) => s === pos).length])) as Record<(typeof CORE)[number], number>;
  const flexSlots = slots.filter((s) => FLEX_ELIGIBLE[s]);

  const areaRows: Record<RosterArea, { rosterId: number; value: number }[]> = { starters: [], depth: [], qb: [], rb: [], wr: [], te: [], flex: [] };
  const totals: { rosterId: number; value: number }[] = [];

  for (const roster of snapshot.rosters) {
    const r = roster as { roster_id: number; players?: readonly string[] | null; taxi?: readonly string[] | null; reserve?: readonly string[] | null };
    const ids = [...new Set([...(r.players ?? []), ...(r.taxi ?? []), ...(r.reserve ?? [])])];
    const owned = ids.flatMap((id) => { const p = players.get(id); return p ? [{ id, ...p }] : []; }).sort((a, b) => b.value - a.value);
    totals.push({ rosterId: r.roster_id, value: owned.reduce((s, p) => s + p.value, 0) });

    // Best lineup: dedicated slots first, then flex slots (most restrictive first), by value.
    const used = new Set<string>();
    let starters = 0;
    for (const pos of CORE) {
      for (const p of owned.filter((p) => p.position === pos).slice(0, dedicated[pos])) { used.add(p.id); starters += p.value; }
      // Room: the starters at the position plus one backup.
      const room = owned.filter((p) => p.position === pos).slice(0, dedicated[pos] + 1).reduce((s, p) => s + p.value, 0);
      areaRows[pos.toLowerCase() as RosterArea].push({ rosterId: r.roster_id, value: room });
    }
    let flex = 0;
    for (const slot of [...flexSlots].sort((a, b) => FLEX_ELIGIBLE[a].length - FLEX_ELIGIBLE[b].length)) {
      const pick = owned.find((p) => !used.has(p.id) && FLEX_ELIGIBLE[slot].includes(p.position));
      if (pick) { used.add(pick.id); flex += pick.value; starters += pick.value; }
    }
    const depth = owned.filter((p) => !used.has(p.id) && (CORE as readonly string[]).includes(p.position)).reduce((s, p) => s + p.value, 0);
    areaRows.starters.push({ rosterId: r.roster_id, value: starters });
    areaRows.flex.push({ rosterId: r.roster_id, value: flex });
    areaRows.depth.push({ rosterId: r.roster_id, value: depth });
  }

  const teamCount = snapshot.rosters.length;
  const overall = rankDescending(totals);
  const areaRanks = Object.fromEntries(ROSTER_AREAS.map((a) => [a.key, rankDescending(areaRows[a.key])])) as Record<RosterArea, Map<number, number>>;
  // Strength/weakness are picked among position rooms, flex and depth (starters is the sum of those).
  // On a tie, position rooms win over flex and depth.
  const order: RosterArea[] = ["qb", "rb", "wr", "te", "flex", "depth"];
  const candidates = order.map((k) => ROSTER_AREAS.find((a) => a.key === k)!).filter((a) => a.key !== "flex" || flexSlots.length > 0);

  const teams = snapshot.rosters.map((roster) => {
    const rosterId = (roster as { roster_id: number }).roster_id;
    const ranks = Object.fromEntries(ROSTER_AREAS.map((a) => [a.key, areaRanks[a.key].get(rosterId) ?? teamCount])) as Record<RosterArea, number>;
    const best = candidates.reduce((b, a) => (ranks[a.key] < ranks[b.key] ? a : b));
    const worst = candidates.reduce((w, a) => (ranks[a.key] > ranks[w.key] ? a : w));
    const rank = overall.get(rosterId) ?? teamCount;
    return {
      rosterId,
      rank,
      tier: tierForRank(rank, teamCount),
      ranks,
      strength: { area: best.key, label: best.room, rank: ranks[best.key] },
      weakness: { area: worst.key, label: worst.room, rank: ranks[worst.key] },
    } satisfies RosterDetailTeam;
  }).sort((a, b) => a.rank - b.rank || a.rosterId - b.rosterId);

  return { teams, teamCount, label, credit: FANTASYCALC_CREDIT };
}

/** Fetches FantasyCalc values (same cached request as the Power Rankings) and builds the detail, or null. */
export async function loadRosterStrengthDetail(snapshot: SleeperLeagueSnapshot | null, options: { readonly dynasty: boolean }): Promise<RosterDetail | null> {
  if (!snapshot) return null;
  try {
    const response = await fetch(fantasyCalcUrl(snapshot, options.dynasty), { next: { revalidate: 43_200 } } as RequestInit);
    if (!response.ok) return null;
    const values = (await response.json()) as FantasyCalcValueLike[];
    return rosterStrengthDetail(snapshot, Array.isArray(values) ? values : [], options.dynasty ? "FantasyCalc dynasty values" : "FantasyCalc values");
  } catch {
    return null;
  }
}
