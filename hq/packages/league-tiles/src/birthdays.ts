
export type BirthdayLeague = "rc" | "lcc" | "rva";

export interface Birthday {
  readonly name: string;
  readonly month: number;
  readonly day: number;
  /** Favorite NFL team (survey), for the banner colors. */
  readonly team: string | null;
  readonly leagues: readonly BirthdayLeague[];
}

export const BIRTHDAYS: readonly Birthday[] = [
];

/** Primary, secondary and text color for each NFL team. */
export const NFL_TEAM_COLORS: Readonly<Record<string, { primary: string; secondary: string; text: string; name: string }>> = {
  ARI: { primary: "#97233F", secondary: "#FFB612", text: "#FFFFFF", name: "Cardinals" },
  ATL: { primary: "#A71930", secondary: "#000000", text: "#FFFFFF", name: "Falcons" },
  BAL: { primary: "#241773", secondary: "#9E7C0C", text: "#FFFFFF", name: "Ravens" },
  BUF: { primary: "#00338D", secondary: "#C60C30", text: "#FFFFFF", name: "Bills" },
  CAR: { primary: "#0085CA", secondary: "#101820", text: "#FFFFFF", name: "Panthers" },
  CHI: { primary: "#0B162A", secondary: "#C83803", text: "#FFFFFF", name: "Bears" },
  CIN: { primary: "#FB4F14", secondary: "#000000", text: "#FFFFFF", name: "Bengals" },
  CLE: { primary: "#311D00", secondary: "#FF3C00", text: "#FFFFFF", name: "Browns" },
  DAL: { primary: "#003594", secondary: "#869397", text: "#FFFFFF", name: "Cowboys" },
  DEN: { primary: "#FB4F14", secondary: "#002244", text: "#FFFFFF", name: "Broncos" },
  DET: { primary: "#0076B6", secondary: "#B0B7BC", text: "#FFFFFF", name: "Lions" },
  GB: { primary: "#203731", secondary: "#FFB612", text: "#FFFFFF", name: "Packers" },
  HOU: { primary: "#03202F", secondary: "#A71930", text: "#FFFFFF", name: "Texans" },
  IND: { primary: "#002C5F", secondary: "#A2AAAD", text: "#FFFFFF", name: "Colts" },
  JAX: { primary: "#006778", secondary: "#D7A22A", text: "#FFFFFF", name: "Jaguars" },
  KC: { primary: "#E31837", secondary: "#FFB81C", text: "#FFFFFF", name: "Chiefs" },
  LV: { primary: "#000000", secondary: "#A5ACAF", text: "#FFFFFF", name: "Raiders" },
  LAC: { primary: "#0080C6", secondary: "#FFC20E", text: "#FFFFFF", name: "Chargers" },
  LAR: { primary: "#003594", secondary: "#FFA300", text: "#FFFFFF", name: "Rams" },
  MIA: { primary: "#008E97", secondary: "#FC4C02", text: "#FFFFFF", name: "Dolphins" },
  MIN: { primary: "#4F2683", secondary: "#FFC62F", text: "#FFFFFF", name: "Vikings" },
  NE: { primary: "#002244", secondary: "#C60C30", text: "#FFFFFF", name: "Patriots" },
  NO: { primary: "#101820", secondary: "#D3BC8D", text: "#FFFFFF", name: "Saints" },
  NYG: { primary: "#0B2265", secondary: "#A71930", text: "#FFFFFF", name: "Giants" },
  NYJ: { primary: "#125740", secondary: "#FFFFFF", text: "#FFFFFF", name: "Jets" },
  PHI: { primary: "#004C54", secondary: "#A5ACAF", text: "#FFFFFF", name: "Eagles" },
  PIT: { primary: "#101820", secondary: "#FFB612", text: "#FFFFFF", name: "Steelers" },
  SF: { primary: "#AA0000", secondary: "#B3995D", text: "#FFFFFF", name: "49ers" },
  SEA: { primary: "#002244", secondary: "#69BE28", text: "#FFFFFF", name: "Seahawks" },
  TB: { primary: "#D50A0A", secondary: "#34302B", text: "#FFFFFF", name: "Buccaneers" },
  TEN: { primary: "#0C2340", secondary: "#4B92DB", text: "#FFFFFF", name: "Titans" },
  WAS: { primary: "#5A1414", secondary: "#FFB612", text: "#FFFFFF", name: "Commanders" },
};

const TEAM_ALIASES: Readonly<Record<string, string>> = { NOS: "NO", WSH: "WAS", JAC: "JAX", LA: "LAR", OAK: "LV", SD: "LAC", GNB: "GB", KAN: "KC", NWE: "NE", SFO: "SF", TAM: "TB" };

export function teamColors(team: string | null | undefined) {
  const code = String(team ?? "").trim().toUpperCase();
  return NFL_TEAM_COLORS[TEAM_ALIASES[code] ?? code] ?? null;
}

export interface BirthdayToday { readonly firstName: string; readonly name: string; readonly team: string | null; readonly primary: string; readonly secondary: string; readonly text: string; readonly teamName: string | null }

/** Month/day for a moment in a time zone (default Eastern, where all three leagues live). */
export function monthDayIn(now: Date, timeZone = "America/New_York"): { month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric", day: "numeric" }).formatToParts(now);
  return { month: Number(parts.find((p) => p.type === "month")?.value), day: Number(parts.find((p) => p.type === "day")?.value) };
}

/** Today's birthdays for one league, with banner colors. Feb 29 birthdays show on Feb 28 in non-leap years. */
export function birthdaysToday(league: BirthdayLeague, now: Date = new Date(), list: readonly Birthday[] = BIRTHDAYS, timeZone?: string): BirthdayToday[] {
  const { month, day } = monthDayIn(now, timeZone);
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: timeZone ?? "America/New_York", year: "numeric" }).format(now));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return list
    .filter((b) => b.leagues.includes(league) && b.month === month && (b.day === day || (!leap && b.month === 2 && b.day === 29 && day === 28)))
    .map((b) => {
      const c = teamColors(b.team);
      return { firstName: b.name.split(" ")[0], name: b.name, team: b.team, primary: c?.primary ?? "#0f172a", secondary: c?.secondary ?? "#f97316", text: c?.text ?? "#ffffff", teamName: c?.name ?? null };
    });
}
