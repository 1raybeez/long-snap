/**
 * Full team names for survey answers stored as codes ("IND", "UGA"). Shared by every league;
 * NFL and college lists are separate because codes collide (TEN = Titans vs. Tennessee).
 * Unknown answers are shown exactly as the owner typed them.
 */
const NFL: Readonly<Record<string, string>> = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills", CAR: "Carolina Panthers",
  CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns", DAL: "Dallas Cowboys", DEN: "Denver Broncos",
  DET: "Detroit Lions", GB: "Green Bay Packers", HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs", LV: "Las Vegas Raiders", LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams", MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NOS: "New Orleans Saints", NYG: "New York Giants",
  NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SF: "San Francisco 49ers", SEA: "Seattle Seahawks",
  TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders", WSH: "Washington Commanders",
};

const COLLEGE: Readonly<Record<string, string>> = {
  UGA: "Georgia Bulldogs", UVA: "Virginia Cavaliers", "UVA: HOOS YOUR DADDY": "Virginia Cavaliers", GT: "Georgia Tech Yellow Jackets",
  TEN: "Tennessee Volunteers", MICH: "Michigan Wolverines", VCU: "VCU Rams", WFU: "Wake Forest Demon Deacons", UNC: "North Carolina Tar Heels",
  USC: "South Carolina Gamecocks", TEX: "Texas Longhorns", VT: "Virginia Tech Hokies", "THE OHIO STATE": "Ohio State Buckeyes", OSU: "Ohio State Buckeyes",
  JMU: "James Madison Dukes", ODU: "Old Dominion Monarchs", WVU: "West Virginia Mountaineers",
  PSU: "Penn State Nittany Lions", BAMA: "Alabama Crimson Tide", LSU: "LSU Tigers", ND: "Notre Dame Fighting Irish", FSU: "Florida State Seminoles",
  CLEM: "Clemson Tigers", UF: "Florida Gators", UK: "Kentucky Wildcats", UMD: "Maryland Terrapins", RICH: "Richmond Spiders",
};

export function nflTeamName(value: string): string {
  return NFL[value.trim().toUpperCase()] ?? value;
}

export function collegeTeamName(value: string): string {
  return COLLEGE[value.trim().toUpperCase()] ?? value;
}
