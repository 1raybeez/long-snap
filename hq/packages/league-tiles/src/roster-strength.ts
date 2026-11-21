import type { RosterStrength, SleeperLeagueSnapshot } from "./sleeper-adapter.ts";

/**
 * Roster strength from FantasyCalc player values (permission on file: Josh Cordell,
 * 2026-09-14 — league power rankings built from FantasyCalc values, with credit and a link,
 * and no republishing of player values). Only a 0–100 team score leaves this file.
 */
export const FANTASYCALC_CREDIT = { label: "Values: FantasyCalc", href: "https://www.fantasycalc.com" } as const;

export interface FantasyCalcValueLike { readonly player?: { readonly sleeperId?: string | null } | null; readonly value?: number | null }

/** FantasyCalc values URL matched to the league's format (QB slots, team count, PPR). */
export function fantasyCalcUrl(snapshot: SleeperLeagueSnapshot, dynasty: boolean): string {
  const league = snapshot.league as { readonly roster_positions?: readonly string[]; readonly scoring_settings?: Record<string, unknown>; readonly total_rosters?: number };
  const superflex = (league.roster_positions ?? []).includes("SUPER_FLEX") || (league.roster_positions ?? []).filter((slot) => slot === "QB").length > 1;
  const rec = Number(league.scoring_settings?.rec ?? 1);
  const ppr = rec >= 1 ? 1 : rec >= 0.5 ? 0.5 : 0;
  const teams = league.total_rosters ?? snapshot.rosters.length;
  return `https://api.fantasycalc.com/values/current?isDynasty=${dynasty}&numQbs=${superflex ? 2 : 1}&numTeams=${teams}&ppr=${ppr}&includeAdp=false`;
}

/** Sum of every rostered player's value (bench, taxi and IR included), scaled 0–100 across the league. */
export function rosterStrengthFromValues(snapshot: SleeperLeagueSnapshot, values: readonly FantasyCalcValueLike[], label: string): RosterStrength | null {
  const bySleeperId = new Map(values.flatMap((row) => (row.player?.sleeperId && typeof row.value === "number" ? [[row.player.sleeperId, row.value] as const] : [])));
  if (!bySleeperId.size) return null;
  const totals = snapshot.rosters.map((roster) => {
    const ids = new Set([...((roster as { players?: readonly string[] | null }).players ?? []), ...((roster as { taxi?: readonly string[] | null }).taxi ?? []), ...((roster as { reserve?: readonly string[] | null }).reserve ?? [])]);
    return { rosterId: roster.roster_id, total: [...ids].reduce((sum, id) => sum + (bySleeperId.get(id) ?? 0), 0) };
  });
  const min = Math.min(...totals.map((t) => t.total));
  const max = Math.max(...totals.map((t) => t.total));
  if (max <= 0) return null;
  return {
    scores: new Map(totals.map((t) => [t.rosterId, max === min ? 50 : Math.round(((t.total - min) / (max - min)) * 1000) / 10])),
    label,
    credit: FANTASYCALC_CREDIT,
  };
}

/** Fetches FantasyCalc values (cached ~12 hours) and returns roster strength, or null if unavailable. */
export async function loadFantasyCalcRosterStrength(snapshot: SleeperLeagueSnapshot | null, options: { readonly dynasty: boolean }): Promise<RosterStrength | null> {
  if (!snapshot) return null;
  try {
    const response = await fetch(fantasyCalcUrl(snapshot, options.dynasty), { next: { revalidate: 43_200 } } as RequestInit);
    if (!response.ok) return null;
    const values = (await response.json()) as FantasyCalcValueLike[];
    return rosterStrengthFromValues(snapshot, Array.isArray(values) ? values : [], options.dynasty ? "FantasyCalc dynasty roster value" : "FantasyCalc roster value");
  } catch {
    return null;
  }
}

/** Raw FantasyCalc values for server-side grading (never sent to the browser; only ranks leave). */
export async function loadFantasyCalcValues(snapshot: SleeperLeagueSnapshot | null, options: { readonly dynasty: boolean }): Promise<FantasyCalcValueLike[]> {
  if (!snapshot) return [];
  try {
    const response = await fetch(fantasyCalcUrl(snapshot, options.dynasty), { next: { revalidate: 43_200 } } as RequestInit);
    if (!response.ok) return [];
    const values = (await response.json()) as FantasyCalcValueLike[];
    return Array.isArray(values) ? values : [];
  } catch {
    return [];
  }
}
