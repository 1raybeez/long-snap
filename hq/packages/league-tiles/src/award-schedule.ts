
export const AWARD_RELEASE_HOUR_ET = 11;
export const AWARD_RELEASE_MINUTE_ET = 30;

function laborDay(season: number): number {
  const first = new Date(Date.UTC(season, 8, 1));
  const offset = (8 - first.getUTCDay()) % 7; // days until Monday
  return Date.UTC(season, 8, 1 + offset);
}

/** Offset of America/New_York from UTC (minutes) at a given instant. */
function easternOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((local - at.getTime()) / 60000);
}

/** The instant week `week`'s awards are released. */
export function awardReleaseAt(season: number, week: number): Date {
  const day = laborDay(season) + (8 + 7 * (week - 1)) * 86_400_000;
  const naive = new Date(day + (AWARD_RELEASE_HOUR_ET * 60 + AWARD_RELEASE_MINUTE_ET) * 60_000);
  return new Date(naive.getTime() - easternOffsetMinutes(naive) * 60_000);
}

export function isAwardReleased(season: number, week: number, now: Date = new Date()): boolean {
  return now.getTime() >= awardReleaseAt(season, week).getTime();
}

const lastRuns = new Map<string, number>();
/** Runs `task` at most once per `intervalMs` per server instance (page loads trigger the check). */
export async function atMostEvery<T>(key: string, intervalMs: number, task: () => Promise<T>, now = Date.now()): Promise<T | null> {
  const last = lastRuns.get(key) ?? 0;
  if (now - last < intervalMs) return null;
  lastRuns.set(key, now);
  try { return await task(); } catch (error) { lastRuns.set(key, last); throw error; }
}
