
export const DAILY_PULL_ET = { hour: 12, minute: 30 };

function etParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

export function dailyStamp(now: Date = new Date()): string {
  const et = etParts(now);
  const after = et.hour > DAILY_PULL_ET.hour || (et.hour === DAILY_PULL_ET.hour && et.minute >= DAILY_PULL_ET.minute);
  return after ? et.date : etParts(new Date(now.getTime() - 24 * 3600000)).date;
}

export function tradeHistoryStamp(input: { now?: Date; season: number; nowWeek: number; deadlineWeek: number | null | undefined; seasonType?: string | null }): string {
  const deadline = input.deadlineWeek || 0;
  const inSeason = input.seasonType === "regular" || input.seasonType === "post" || !input.seasonType;
  if (inSeason && deadline && (input.nowWeek > deadline || input.seasonType === "post")) return `${input.season}-after-week-${deadline}`;
  return dailyStamp(input.now);
}
