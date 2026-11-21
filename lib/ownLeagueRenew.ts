// A commissioner's own league follows Sleeper into each new season by itself. Sleeper gives a renewed league a new ID
// and points it back at last season's (previous_league_id), so at start-up the site asks Sleeper for the owners'
// leagues in the next season and adds the one that continues this league. No new setup needed.
// Deliberately doesn't import ownLeague.ts: that module reads LONGSNAP_LEAGUE once, and this runs first to update it.

const SLEEPER = "https://api.sleeper.app/v1";
const get = async (path: string): Promise<any> => {
  try { const r = await fetch(`${SLEEPER}${path}`, { cache: "no-store", signal: AbortSignal.timeout(4000) }); return r.ok ? await r.json() : null; } catch { return null; }
};

export async function followNewSeasons(): Promise<void> {
  const raw = process.env.LONGSNAP_LEAGUE;
  if (!raw) return;
  let cfg: any; let base64 = false;
  try { cfg = JSON.parse(raw); } catch { try { cfg = JSON.parse(Buffer.from(raw.trim(), "base64").toString("utf8")); base64 = true; } catch { return; } }
  if (!cfg?.seasons || typeof cfg.seasons !== "object") return;
  const state = await get("/state/nfl");
  const sleeperSeason = Number(state?.league_season ?? state?.season ?? 0);
  let added = false;
  for (let i = 0; i < 3; i++) {
    const years = Object.keys(cfg.seasons).map(Number).sort((a, b) => a - b);
    const last = years.at(-1)!;
    if (!sleeperSeason || last >= sleeperSeason) break;
    const lastId = cfg.seasons[String(last)];
    const users: { user_id: string }[] = (await get(`/league/${lastId}/users`)) ?? [];
    let next: string | null = null;
    for (const u of users.slice(0, 4)) {
      const leagues: { league_id: string; previous_league_id?: string | null }[] = (await get(`/user/${u.user_id}/leagues/nfl/${last + 1}`)) ?? [];
      const hit = leagues.find((l) => l.previous_league_id === lastId);
      if (hit) { next = hit.league_id; break; }
    }
    if (!next) break;
    cfg.seasons[String(last + 1)] = next;
    added = true;
  }
  if (added) process.env.LONGSNAP_LEAGUE = base64 ? Buffer.from(JSON.stringify(cfg), "utf8").toString("base64") : JSON.stringify(cfg);
}
