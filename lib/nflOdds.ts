
export type GamePick = {
  id: string; week: number; kickoff: string;
  home: { abbr: string; name: string }; away: { abbr: string; name: string };
  pick: "home" | "away"; pickAbbr: string; pickName: string; winChance: number; // 0–100, for the pick
  line: string | null; level: "Lock" | "Lean" | "Toss-up";
};

/** American odds → implied probability (0–1). */
export function implied(odds: string | number | null | undefined): number | null {
  const n = typeof odds === "number" ? odds : Number(String(odds ?? "").replace("+", ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return n < 0 ? -n / (-n + 100) : 100 / (n + 100);
}

export function levelFor(chance: number): GamePick["level"] { return chance >= 75 ? "Lock" : chance >= 60 ? "Lean" : "Toss-up"; }

type EspnTeam = { homeAway: "home" | "away"; team: { abbreviation: string; displayName: string } };
type EspnOdds = { details?: string; homeTeamOdds?: { favorite?: boolean }; awayTeamOdds?: { favorite?: boolean }; moneyline?: { home?: { close?: { odds?: string }; open?: { odds?: string } }; away?: { close?: { odds?: string }; open?: { odds?: string } } } };
type EspnEvent = { id: string; date: string; competitions: { status?: { type?: { state?: string } }; competitors: EspnTeam[]; odds?: EspnOdds[] }[] };

export function toGamePicks(events: readonly EspnEvent[], week: number): GamePick[] {
  const out: GamePick[] = [];
  for (const e of events) {
    const c = e.competitions?.[0];
    if (!c || c.status?.type?.state !== "pre") continue; // kicked off or final
    const home = c.competitors.find((t) => t.homeAway === "home")?.team; const away = c.competitors.find((t) => t.homeAway === "away")?.team;
    if (!home || !away) continue;
    const o = c.odds?.[0];
    const ph = implied(o?.moneyline?.home?.close?.odds ?? o?.moneyline?.home?.open?.odds);
    const pa = implied(o?.moneyline?.away?.close?.odds ?? o?.moneyline?.away?.open?.odds);
    let homeChance: number | null = ph !== null && pa !== null ? ph / (ph + pa) : null;
    if (homeChance === null && o) homeChance = o.homeTeamOdds?.favorite ? 0.6 : o.awayTeamOdds?.favorite ? 0.4 : null;
    if (homeChance === null) continue; // no line yet
    const pick = homeChance >= 0.5 ? "home" : "away";
    const chance = Math.round((pick === "home" ? homeChance : 1 - homeChance) * 100);
    const t = pick === "home" ? home : away;
    out.push({ id: e.id, week, kickoff: e.date, home: { abbr: home.abbreviation, name: home.displayName }, away: { abbr: away.abbreviation, name: away.displayName }, pick, pickAbbr: t.abbreviation, pickName: t.displayName, winChance: chance, line: o?.details ?? null, level: levelFor(chance) });
  }
  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

/** Upcoming games for this week and next (next week only matters once this week is nearly done). */
export async function loadGamePicks(season: number): Promise<{ week: number; games: GamePick[] }[] | null> {
  try {
    const opts = { next: { revalidate: 600 } } as RequestInit;
    const now = (await fetch(SCOREBOARD, opts).then((r) => (r.ok ? r.json() : null))) as { week?: { number?: number }; events?: EspnEvent[] } | null;
    const week = now?.week?.number;
    if (!now || !week) return null;
    const out = [{ week, games: toGamePicks(now.events ?? [], week) }];
    if (week < 18) {
      const next = (await fetch(`${SCOREBOARD}?seasontype=2&week=${week + 1}&dates=${season}`, opts).then((r) => (r.ok ? r.json() : null))) as { events?: EspnEvent[] } | null;
      if (next) out.push({ week: week + 1, games: toGamePicks(next.events ?? [], week + 1) });
    }
    return out.filter((w) => w.games.length);
  } catch {
    return null;
  }
}
