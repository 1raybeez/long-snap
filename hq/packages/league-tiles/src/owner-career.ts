import type { HistorySeasonResult } from "./league-history.ts";

/** Career summary + timeline for one owner, from a league's completed season results (shared). */
export interface OwnerCareer {
  readonly seasons: readonly HistorySeasonResult[];
  readonly titles: number;
  readonly podiums: number;
  readonly bestFinish: number | null;
  readonly playoffAppearances: number | null;
  readonly timeline: readonly { readonly season: string; readonly title: string; readonly detail: string | null; readonly tone?: "gold" | "silver" | "bronze" | "shame" | null }[];
}

const isChampion = (r: HistorySeasonResult) => r.champion ?? r.place === 1;

export function ownerCareer(results: readonly HistorySeasonResult[], ownerId: string, options: { readonly playoffSpots?: number; readonly leagueName: string; readonly ownerName?: (id: string) => string } ): OwnerCareer {
  const mine = results.filter((r) => r.ownerIds.includes(ownerId)).sort((a, b) => a.season - b.season);
  const name = options.ownerName ?? ((id: string) => id);
  const timeline: OwnerCareer["timeline"][number][] = [];
  let previousTeamKey: string | null = null;
  let previousSeason: number | null = null;
  mine.forEach((r, index) => {
    const partners = r.ownerIds.filter((id) => id !== ownerId).map(name);
    const teamKey = `${r.franchiseId ?? ""}|${partners.join(",")}`;
    if (index === 0) timeline.push({ season: String(r.season), title: `Joined ${options.leagueName}`, detail: [r.teamName, partners.length ? `with ${partners.join(" / ")}` : null].filter(Boolean).join(" · ") || null });
    else if (previousSeason !== null && r.season - previousSeason > 1) timeline.push({ season: `${previousSeason + 1}–${r.season - 1}`, title: "Did not participate", detail: null }, { season: String(r.season), title: `Returned to ${options.leagueName}`, detail: r.teamName ?? null });
    else if (teamKey !== previousTeamKey) timeline.push({ season: String(r.season), title: partners.length ? "New co-ownership" : "Ownership change", detail: [r.teamName, partners.length ? `with ${partners.join(" / ")}` : "Sole owner"].filter(Boolean).join(" · ") });
    if (isChampion(r)) timeline.push({ season: String(r.season), title: "Champion", detail: r.teamName ?? null, tone: "gold" });
    else if (r.place === 2) timeline.push({ season: String(r.season), title: "Runner-up", detail: r.teamName ?? null, tone: "silver" });
    else if (r.place === 3) timeline.push({ season: String(r.season), title: "Third place", detail: r.teamName ?? null, tone: "bronze" });
    if (r.place === r.teamCount) timeline.push({ season: String(r.season), title: "Last place", detail: r.teamName ?? null, tone: "shame" });
    previousTeamKey = teamKey; previousSeason = r.season;
  });
  return {
    seasons: mine,
    titles: mine.filter(isChampion).length,
    podiums: mine.filter((r) => r.place <= 3).length,
    bestFinish: mine.length ? Math.min(...mine.map((r) => r.place)) : null,
    playoffAppearances: options.playoffSpots ? mine.filter((r) => r.place <= options.playoffSpots!).length : null,
    timeline,
  };
}
