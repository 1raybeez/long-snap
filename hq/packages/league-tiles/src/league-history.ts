

export interface HistorySeasonResult {
  readonly season: number;
  /** Final place, 1 = champion. */
  readonly place: number;
  readonly teamCount: number;
  /** Everyone credited with this finish (co-owners share it). */
  readonly ownerIds: readonly string[];
  readonly franchiseId?: string | null;
  readonly teamName?: string | null;
  /** Defaults to place === 1. Lets a league record co-champions (two results with champion: true). */
  readonly champion?: boolean;
  /** Regular-season record and points for, when the league has them. */
  readonly wins?: number | null;
  readonly losses?: number | null;
  readonly ties?: number | null;
  readonly pointsFor?: number | null;
}

export interface HistoryOwner {
  readonly id: string;
  readonly name: string;
  readonly photo?: string | null;
  readonly active: boolean;
}

export interface HistoryActiveFranchise {
  readonly franchiseId: string;
  readonly name: string;
  readonly primaryOwnerId: string;
  readonly coOwnerIds: readonly string[];
}

export interface HallOfFameResume {
  readonly ownerId: string;
  readonly manager: string;
  readonly photo: string | null;
  readonly championships: number;
  readonly championshipYears: readonly number[];
  readonly runnerUpFinishes: number;
  readonly thirdPlaceFinishes: number;
  readonly podiumFinishes: number;
  readonly averageFinish: number;
  readonly seasonsPlayed: number;
  readonly rank: number;
  readonly status: "ACTIVE" | "FORMER";
  readonly coOwnerLabel?: string;
}

const isChampion = (result: HistorySeasonResult) => result.champion ?? result.place === 1;

export function completedResults(results: readonly HistorySeasonResult[], currentSeason: number): HistorySeasonResult[] {
  return results.filter((result) => result.season < currentSeason);
}

export function completedSeasons(results: readonly HistorySeasonResult[]): number[] {
  return [...new Set(results.map((result) => result.season))].sort((a, b) => b - a);
}

export function championshipResults(results: readonly HistorySeasonResult[]): HistorySeasonResult[] {
  return results.filter(isChampion).sort((a, b) => b.season - a.season || a.place - b.place);
}

export function championOwnerIds(results: readonly HistorySeasonResult[]): string[] {
  return [...new Set(championshipResults(results).flatMap((result) => result.ownerIds))];
}

export function hallOfFameResumes(results: readonly HistorySeasonResult[], owners: ReadonlyMap<string, HistoryOwner>): HallOfFameResume[] {
  const byOwner = new Map<string, { championships: number; years: number[]; runnerUp: number; third: number; podiums: number; total: number; seasons: number }>();
  const seen = new Set<string>();
  for (const result of results) {
    for (const ownerId of new Set(result.ownerIds)) {
      if (!owners.has(ownerId)) continue;
      const key = `${ownerId}:${result.season}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = byOwner.get(ownerId) ?? { championships: 0, years: [], runnerUp: 0, third: 0, podiums: 0, total: 0, seasons: 0 };
      r.seasons += 1;
      r.total += result.place;
      if (isChampion(result)) { r.championships += 1; r.years.push(result.season); }
      else if (result.place === 2) r.runnerUp += 1;
      if (result.place === 3) r.third += 1;
      if (result.place <= 3) r.podiums += 1;
      byOwner.set(ownerId, r);
    }
  }
  return [...byOwner.entries()]
    .map(([ownerId, r]) => {
      const owner = owners.get(ownerId)!;
      return {
        ownerId, manager: owner.name, photo: owner.photo ?? null,
        championships: r.championships, championshipYears: [...new Set(r.years)].sort((a, b) => a - b),
        runnerUpFinishes: r.runnerUp, thirdPlaceFinishes: r.third, podiumFinishes: r.podiums,
        averageFinish: r.total / r.seasons, seasonsPlayed: r.seasons,
        rank: 0, status: owner.active ? "ACTIVE" as const : "FORMER" as const,
      };
    })
    .sort((a, b) => b.championships - a.championships || a.averageFinish - b.averageFinish || b.podiumFinishes - a.podiumFinishes || a.manager.localeCompare(b.manager))
    .map((resume, index) => ({ ...resume, rank: index + 1 }));
}

/** One Hall of Fame row per active franchise (its primary owner's résumé, "with" any co-owners). */
export function activeFranchiseResumes(resumes: readonly HallOfFameResume[], franchises: readonly HistoryActiveFranchise[], owners: ReadonlyMap<string, HistoryOwner>): HallOfFameResume[] {
  const byOwner = new Map(resumes.map((resume) => [resume.ownerId, resume]));
  return franchises.flatMap((franchise) => {
    const resume = byOwner.get(franchise.primaryOwnerId);
    if (!resume) return [];
    const co = franchise.coOwnerIds.filter((id) => id !== franchise.primaryOwnerId).map((id) => owners.get(id)?.name ?? id).join(" / ");
    return [{ ...resume, status: "ACTIVE" as const, ...(co ? { coOwnerLabel: co } : {}) }];
  }).sort((a, b) => a.rank - b.rank);
}

export interface TrophyChampion { readonly season: number; readonly ownerId: string; readonly name: string; readonly photo: string | null; readonly teamName: string | null }
export interface TrophyPodium { readonly rank: number; readonly ownerId: string; readonly name: string; readonly photo: string | null; readonly gold: number; readonly silver: number; readonly bronze: number; readonly total: number }
export interface TrophyShame { readonly season: number; readonly names: string; readonly photo: string | null; readonly teamName: string | null }

export function trophyChampions(results: readonly HistorySeasonResult[], owners: ReadonlyMap<string, HistoryOwner>): TrophyChampion[] {
  return championshipResults(results).flatMap((result) => result.ownerIds.map((ownerId) => ({
    season: result.season, ownerId, name: owners.get(ownerId)?.name ?? ownerId, photo: owners.get(ownerId)?.photo ?? null, teamName: result.teamName ?? null,
  })));
}

export function trophyPodiums(resumes: readonly HallOfFameResume[]): TrophyPodium[] {
  return resumes.filter((r) => r.podiumFinishes > 0)
    .sort((a, b) => b.championships - a.championships || b.runnerUpFinishes - a.runnerUpFinishes || b.thirdPlaceFinishes - a.thirdPlaceFinishes || a.manager.localeCompare(b.manager))
    .map((r, index) => ({ rank: index + 1, ownerId: r.ownerId, name: r.manager, photo: r.photo, gold: r.championships, silver: r.runnerUpFinishes, bronze: r.thirdPlaceFinishes, total: r.championships + r.runnerUpFinishes + r.thirdPlaceFinishes }));
}

export function trophyShame(results: readonly HistorySeasonResult[], owners: ReadonlyMap<string, HistoryOwner>): TrophyShame[] {
  return results.filter((result) => result.place === result.teamCount)
    .map((result) => ({ season: result.season, names: result.ownerIds.map((id) => owners.get(id)?.name ?? id).join(" / "), photo: owners.get(result.ownerIds[0] ?? "")?.photo ?? null, teamName: result.teamName ?? null }))
    .sort((a, b) => b.season - a.season);
}

/** Last-place finishes ("toilets") per owner, from completed seasons with a known field size. */
export function lastPlaceFinishes(results: readonly HistorySeasonResult[], ownerId: string): number {
  return results.filter((r) => r.ownerIds.includes(ownerId) && typeof r.teamCount === "number" && r.place === r.teamCount).length;
}

export interface CoOwnerMerge {
  readonly results: HistorySeasonResult[];
  readonly owners: HistoryOwner[];
  /** owner id -> shared entry id, for owners that were merged. */
  readonly groupOf: ReadonlyMap<string, string>;
  /** Shared entries created (for notes such as "counted once"). */
  readonly groups: readonly { readonly id: string; readonly name: string; readonly memberIds: readonly string[] }[];
}

export function mergeConstantCoOwners(results: readonly HistorySeasonResult[], owners: readonly HistoryOwner[]): CoOwnerMerge {
  const teamsOf = new Map<string, Set<string>>();
  for (const result of results) {
    const key = [...new Set(result.ownerIds)].sort().join("|");
    for (const ownerId of new Set(result.ownerIds)) {
      if (!teamsOf.has(ownerId)) teamsOf.set(ownerId, new Set());
      teamsOf.get(ownerId)!.add(key);
    }
  }
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const groupOf = new Map<string, string>();
  const groups: { id: string; name: string; memberIds: string[] }[] = [];
  for (const [ownerId, keys] of teamsOf) {
    if (groupOf.has(ownerId) || keys.size !== 1) continue;
    const key = [...keys][0]!;
    const members = key.split("|");
    if (members.length < 2) continue;
    // Every member must likewise have only ever played on this exact team.
    if (!members.every((m) => teamsOf.get(m)?.size === 1 && teamsOf.get(m)!.has(key) && ownerById.has(m))) continue;
    // Keep the order owners are listed in (first listed = primary, whose photo is used).
    const ordered = owners.filter((o) => members.includes(o.id)).map((o) => o.id);
    const id = ordered.join("+");
    groups.push({ id, name: ordered.map((m) => ownerById.get(m)!.name).join(" / "), memberIds: ordered });
    for (const m of ordered) groupOf.set(m, id);
  }
  if (!groups.length) return { results: [...results], owners: [...owners], groupOf, groups };
  const mergedOwners: HistoryOwner[] = [];
  const added = new Set<string>();
  for (const owner of owners) {
    const gid = groupOf.get(owner.id);
    if (!gid) { mergedOwners.push(owner); continue; }
    if (added.has(gid)) continue;
    added.add(gid);
    const group = groups.find((g) => g.id === gid)!;
    const members = group.memberIds.map((m) => ownerById.get(m)!);
    mergedOwners.push({ id: gid, name: group.name, photo: members.find((m) => m.photo)?.photo ?? null, active: members.some((m) => m.active) });
  }
  const mergedResults = results.map((result) => ({ ...result, ownerIds: [...new Set(result.ownerIds.map((id) => groupOf.get(id) ?? id))] }));
  return { results: mergedResults, owners: mergedOwners, groupOf, groups };
}

/** Active franchises re-pointed at shared entries after mergeConstantCoOwners. */
export function mergeActiveFranchises(franchises: readonly HistoryActiveFranchise[], groupOf: ReadonlyMap<string, string>): HistoryActiveFranchise[] {
  return franchises.map((f) => {
    const primary = groupOf.get(f.primaryOwnerId) ?? f.primaryOwnerId;
    return { ...f, primaryOwnerId: primary, coOwnerIds: f.coOwnerIds.filter((id) => (groupOf.get(id) ?? id) !== primary) };
  });
}
