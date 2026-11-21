import type { HistorySeasonResult } from "./league-history.ts";

export interface FranchiseEra { readonly ownerIds: readonly (string | null)[]; readonly names: readonly string[]; readonly start: number; readonly end: number | "present"; readonly note?: string | null }
export interface FranchiseSource { readonly franchiseId: string; readonly name: string; readonly image: string | null; readonly eras: readonly FranchiseEra[]; readonly active: boolean }

const covers = (era: FranchiseEra, season: number, current: number) => season >= era.start && season <= (era.end === "present" ? current : era.end);

/** The franchise's completed seasons: by franchiseId when results carry it, otherwise by whoever held the seat that year. */
export function franchiseSeasons(f: FranchiseSource, results: readonly HistorySeasonResult[], currentSeason: number): HistorySeasonResult[] {
  return results.filter((r) => {
    if (r.franchiseId) return r.franchiseId === f.franchiseId;
    const era = f.eras.find((e) => covers(e, r.season, currentSeason));
    return Boolean(era && era.ownerIds.some((id) => id && r.ownerIds.includes(id)));
  }).sort((a, b) => a.season - b.season);
}

export const franchiseYears = (start: number, end: number | "present") => (end === "present" ? `${start}–present` : start === end ? `${start}` : `${start}–${end}`);
