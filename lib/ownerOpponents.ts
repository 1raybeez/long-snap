import type { LeagueData, LeagueGame } from "./leagueData.ts";

export function ownerVsOpponent(data: LeagueData, ownerSlug: string, opponentSlug: string): { sides: [{ id: string; name: string; photo: string | null; href: string | null }, { id: string; name: string; photo: string | null; href: string | null }]; games: LeagueGame[] } | null {
  const games = data.people.rivalryGames;
  if (!games?.length || ownerSlug === opponentSlug) return null;
  const sideFor = (slug: string) => {
    const ownerId = data.people.ownerPages[slug]?.owner.id ?? slug;
    return data.people.sides.find((s) => s.id === ownerId || s.id.split("+").includes(ownerId)) ?? null;
  };
  const a = sideFor(ownerSlug), b = sideFor(opponentSlug);
  if (!a || !b || a.id === b.id) return null;
  return { sides: [{ id: a.id, name: a.name, photo: a.photo, href: a.href }, { id: b.id, name: b.name, photo: b.photo, href: b.href }], games: games.filter((g) => (g.sideA === a.id && g.sideB === b.id) || (g.sideA === b.id && g.sideB === a.id)) };
}
