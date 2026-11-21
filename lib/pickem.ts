import { sleeperFeedFetch } from "./sleeperFeed.ts";

export type PickemRow = { rosterId: number; name: string; total: number; byWeek: Record<number, number>; weeksPlayed: number; best: number };
export type PickemBoard = { rows: PickemRow[]; weeks: number[]; lastWeek: number | null; weekLeaders: { week: number; names: string[]; points: number }[] };

type Roster = { roster_id: number; owner_id: string | null; metadata?: { points_by_leg?: Record<string, number> } | null };
type User = { user_id: string; display_name?: string; metadata?: { team_name?: string } | null };

const weekOf = (leg: string) => { const m = /^v1:regular:(\d+)$/.exec(leg); return m ? Number(m[1]) : null; };

export function toPickemBoard(rosters: readonly Roster[], users: readonly User[]): PickemBoard {
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const rows: PickemRow[] = rosters.filter((r) => r.owner_id).map((r) => {
    const u = byId.get(r.owner_id!);
    const byWeek: Record<number, number> = {};
    for (const [leg, pts] of Object.entries(r.metadata?.points_by_leg ?? {})) { const w = weekOf(leg); if (w !== null && Number.isFinite(pts)) byWeek[w] = pts; }
    const vals = Object.values(byWeek);
    return { rosterId: r.roster_id, name: u?.metadata?.team_name?.trim() || u?.display_name || `Entry ${r.roster_id}`, total: vals.reduce((a, b) => a + b, 0), byWeek, weeksPlayed: vals.filter((v) => v > 0).length, best: vals.length ? Math.max(...vals) : 0 };
  });
  rows.sort((a, b) => b.total - a.total || b.best - a.best || a.name.localeCompare(b.name));
  const weeks = [...new Set(rows.flatMap((r) => Object.keys(r.byWeek).map(Number)))].sort((a, b) => a - b);
  const weekLeaders = weeks.map((week) => {
    const points = Math.max(0, ...rows.map((r) => r.byWeek[week] ?? 0));
    return { week, points, names: points > 0 ? rows.filter((r) => (r.byWeek[week] ?? 0) === points).map((r) => r.name) : [] };
  });
  return { rows, weeks, lastWeek: weeks.at(-1) ?? null, weekLeaders };
}

export async function loadPickemBoard(sleeperLeagueId: string): Promise<PickemBoard | null> {
  try {
    const opts = { next: { revalidate: 300 } } as RequestInit;
    const [rosters, users] = await Promise.all([
      sleeperFeedFetch(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/rosters`, opts).then((r) => (r.ok ? r.json() : null)),
      sleeperFeedFetch(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/users`, opts).then((r) => (r.ok ? r.json() : null)),
    ]);
    return Array.isArray(rosters) && Array.isArray(users) ? toPickemBoard(rosters, users) : null;
  } catch {
    return null;
  }
}
