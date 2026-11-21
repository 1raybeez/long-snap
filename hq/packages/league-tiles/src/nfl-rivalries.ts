
export const NFL_DIVISIONS: Readonly<Record<string, readonly string[]>> = {
  "AFC East": ["BUF", "MIA", "NE", "NYJ"],
  "AFC North": ["BAL", "CIN", "CLE", "PIT"],
  "AFC South": ["HOU", "IND", "JAX", "TEN"],
  "AFC West": ["DEN", "KC", "LV", "LAC"],
  "NFC East": ["DAL", "NYG", "PHI", "WAS"],
  "NFC North": ["CHI", "DET", "GB", "MIN"],
  "NFC South": ["ATL", "CAR", "NO", "TB"],
  "NFC West": ["ARI", "LAR", "SF", "SEA"],
};

export const NFL_TEAM_NAMES: Readonly<Record<string, string>> = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears", CIN: "Bengals", CLE: "Browns",
  DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers", HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs",
  LV: "Raiders", LAC: "Chargers", LAR: "Rams", MIA: "Dolphins", MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants",
  NYJ: "Jets", PHI: "Eagles", PIT: "Steelers", SEA: "Seahawks", SF: "49ers", TB: "Buccaneers", TEN: "Titans", WAS: "Commanders",
};

const ALIASES: Readonly<Record<string, string>> = { NOS: "NO", NOR: "NO", WSH: "WAS", JAC: "JAX", LA: "LAR", OAK: "LV", SD: "LAC", STL: "LAR", GNB: "GB", KAN: "KC", SFO: "SF", TAM: "TB", NWE: "NE" };

/** "ATL ", "nos", "WSH" → "ATL", "NO", "WAS"; null when it isn't an NFL team ("N/A"). */
export function nflTeamCode(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim().toUpperCase();
  const code = ALIASES[t] ?? t;
  return NFL_TEAM_NAMES[code] ? code : null;
}

const divisionOf = new Map(Object.entries(NFL_DIVISIONS).flatMap(([d, teams]) => teams.map((t) => [t, d] as const)));

/** The division two teams share, when they're different teams in the same division. */
export function nflRivalDivision(a: string | null, b: string | null): string | null {
  if (!a || !b || a === b) return null;
  const d = divisionOf.get(a);
  return d && d === divisionOf.get(b) ? d : null;
}
