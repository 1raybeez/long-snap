
import { NFL_TEAM_NAMES, nflRivalDivision } from "./nfl-rivalries.ts";

export interface RivalryPickSide { readonly who: string; readonly nfl: readonly string[]; readonly picks: readonly string[] }
export interface RivalryPicks { readonly source: string; readonly sides: Readonly<Record<string, RivalryPickSide>> }
export interface Recognition { readonly sides: readonly [string, string]; readonly name: string; readonly story: string }

/** Recognized rivalries for every pair of sides the survey covers. */
export function rivalryRecognitions(data: RivalryPicks | null | undefined): Recognition[] {
  if (!data) return [];
  const ids = Object.keys(data.sides).sort();
  const out: Recognition[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i]!, b = ids[j]!;
    const A = data.sides[a]!, B = data.sides[b]!;
    const aPicked = A.picks.includes(b), bPicked = B.picks.includes(a);
    const fan = A.nfl.flatMap((x) => B.nfl.map((y) => ({ x, y, d: nflRivalDivision(x, y) }))).find((f) => f.d);
    if (!aPicked && !bPicked && !fan) continue;
    const names: string[] = [];
    const lines: string[] = [];
    if (aPicked && bPicked) { names.push("Mutual rivals"); lines.push(`${A.who} and ${B.who} named each other as rivals (${data.source}).`); }
    else if (aPicked || bPicked) { names.push("Owner-picked rival"); lines.push(`${aPicked ? A.who : B.who} named ${aPicked ? B.who : A.who} as a rival (${data.source}).`); }
    if (fan) { names.push("NFL fan rivals"); lines.push(`${NFL_TEAM_NAMES[fan.x]} fan${A.who.includes(" & ") ? "s" : ""} vs. ${NFL_TEAM_NAMES[fan.y]} fan${B.who.includes(" & ") ? "s" : ""}: ${fan.d} rivals.`); }
    out.push({ sides: [a, b], name: names.join(" · "), story: lines.join(" ") });
  }
  return out;
}
