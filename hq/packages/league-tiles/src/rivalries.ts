
export type MeetingStage = "regular" | "playoff" | "championship" | "other";

export interface RivalryMeeting {
  readonly season: number;
  readonly week: number | null;
  readonly sideA: string;
  readonly sideB: string;
  readonly scoreA: number;
  readonly scoreB: number;
  /** "other" = consolation/placement games: shown in facts, excluded from the score. */
  readonly stage: MeetingStage;
}

export interface RivalrySide { readonly id: string; readonly name: string; readonly photo: string | null; readonly href: string | null; readonly active: boolean }

export interface GameNote { readonly season: number; readonly week: number | null; readonly winner: string; readonly margin: number; readonly score: string }

export interface Rivalry {
  readonly key: string;
  readonly sides: readonly [string, string];
  readonly meetings: number;
  readonly winsA: number;
  readonly winsB: number;
  readonly ties: number;
  readonly pointsA: number;
  readonly pointsB: number;
  readonly playoffMeetings: number;
  readonly championshipMeetings: number;
  readonly seasons: readonly number[];
  readonly firstSeason: number | null;
  readonly lastSeason: number | null;
  readonly eligible: boolean;
  readonly score: number | null;
  readonly rank: number | null;
  readonly dimensions: { readonly competitiveness: number; readonly frequency: number | null; readonly postseason: number | null; readonly recency: number | null; readonly longevity: number | null };
  readonly biggestBlowout: GameNote | null;
  readonly closestGame: GameNote | null;
  readonly recognized?: { readonly name: string | null; readonly story: string | null } | null;
}

export const RIVALRY_WEIGHTS = { competitiveness: 0.3, frequency: 0.25, postseason: 0.2, recency: 0.15, longevity: 0.1 } as const;
export const RIVALRY_MIN_MEETINGS = 4;
export const RIVALRY_MIN_SEASONS = 2;

const round2 = (v: number) => Math.round(v * 100) / 100;

function percentiles(values: readonly { key: string; raw: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!values.length) return out;
  const ordered = [...values].sort((a, b) => a.raw - b.raw || a.key.localeCompare(b.key));
  if (ordered.every((v) => v.raw === 0)) { ordered.forEach((v) => out.set(v.key, 0)); return out; }
  if (ordered.every((v) => v.raw === ordered[0]!.raw)) { ordered.forEach((v) => out.set(v.key, 1)); return out; }
  let start = 0;
  while (start < ordered.length) {
    let end = start;
    while (end + 1 < ordered.length && ordered[end + 1]!.raw === ordered[start]!.raw) end += 1;
    const p = ordered[start]!.raw === 0 ? 0 : (start + end) / 2 / (ordered.length - 1);
    for (let i = start; i <= end; i += 1) out.set(ordered[i]!.key, Math.min(1, Math.max(0, p)));
    start = end + 1;
  }
  return out;
}

export function buildRivalries(meetings: readonly RivalryMeeting[], recognized: readonly { readonly sides: readonly [string, string]; readonly name?: string | null; readonly story?: string | null }[] = []): Rivalry[] {
  const pairs = new Map<string, { a: string; b: string; games: RivalryMeeting[] }>();
  for (const m of meetings) {
    if (m.sideA === m.sideB) continue;
    const [a, b] = m.sideA < m.sideB ? [m.sideA, m.sideB] : [m.sideB, m.sideA];
    const key = `${a}|${b}`;
    const entry = pairs.get(key) ?? { a, b, games: [] };
    entry.games.push(m);
    pairs.set(key, entry);
  }
  const recognizedByKey = new Map(recognized.map((r) => { const [a, b] = [...r.sides].sort(); return [`${a}|${b}`, r]; }));

  const drafts = [...pairs.entries()].map(([key, { a, b, games }]) => {
    const view = games.map((g) => (g.sideA === a ? g : { ...g, sideA: g.sideB, sideB: g.sideA, scoreA: g.scoreB, scoreB: g.scoreA }));
    const competitive = view.filter((g) => g.stage !== "other");
    let winsA = 0, winsB = 0, ties = 0, pointsA = 0, pointsB = 0;
    for (const g of competitive) { pointsA += g.scoreA; pointsB += g.scoreB; if (g.scoreA > g.scoreB) winsA += 1; else if (g.scoreB > g.scoreA) winsB += 1; else ties += 1; }
    const seasons = [...new Set(competitive.map((g) => g.season))].sort((x, y) => x - y);
    const playoff = competitive.filter((g) => g.stage === "playoff" || g.stage === "championship").length;
    const championship = competitive.filter((g) => g.stage === "championship").length;
    const n = competitive.length;
    const pct = n ? (winsA + ties / 2) / n : null;
    const note = (g: RivalryMeeting): GameNote => ({ season: g.season, week: g.week, winner: g.scoreA >= g.scoreB ? a : b, margin: round2(Math.abs(g.scoreA - g.scoreB)), score: `${Math.max(g.scoreA, g.scoreB).toFixed(2)}–${Math.min(g.scoreA, g.scoreB).toFixed(2)}` });
    const decided = competitive.filter((g) => g.scoreA !== g.scoreB);
    const byMargin = [...decided].sort((x, y) => Math.abs(y.scoreA - y.scoreB) - Math.abs(x.scoreA - x.scoreB));
    return {
      key, sides: [a, b] as const, meetings: n, winsA, winsB, ties, pointsA: round2(pointsA), pointsB: round2(pointsB),
      playoffMeetings: playoff, championshipMeetings: championship, seasons,
      firstSeason: seasons[0] ?? null, lastSeason: seasons.at(-1) ?? null,
      eligible: n >= RIVALRY_MIN_MEETINGS && seasons.length >= RIVALRY_MIN_SEASONS,
      competitiveness: pct === null ? 0 : Math.min(1, Math.max(0, 1 - Math.abs(pct - 0.5) * 2)),
      biggestBlowout: byMargin[0] ? note(byMargin[0]) : null,
      closestGame: byMargin.at(-1) ? note(byMargin.at(-1)!) : null,
      recognized: recognizedByKey.has(key) ? { name: recognizedByKey.get(key)!.name ?? null, story: recognizedByKey.get(key)!.story ?? null } : null,
    };
  });

  const eligible = drafts.filter((d) => d.eligible);
  const freq = percentiles(eligible.map((d) => ({ key: d.key, raw: d.meetings })));
  const post = percentiles(eligible.map((d) => ({ key: d.key, raw: d.playoffMeetings + d.championshipMeetings })));
  const rec = percentiles(eligible.map((d) => ({ key: d.key, raw: d.lastSeason ?? 0 })));
  const lon = percentiles(eligible.map((d) => ({ key: d.key, raw: d.seasons.length })));

  const scored = drafts.map((d) => {
    if (!d.eligible) return { ...d, score: null, rank: null, dimensions: { competitiveness: d.competitiveness, frequency: null, postseason: null, recency: null, longevity: null } };
    const dims = { competitiveness: d.competitiveness, frequency: freq.get(d.key) ?? 0, postseason: post.get(d.key) ?? 0, recency: rec.get(d.key) ?? 0, longevity: lon.get(d.key) ?? 0 };
    const score = round2(100 * (dims.competitiveness * RIVALRY_WEIGHTS.competitiveness + dims.frequency * RIVALRY_WEIGHTS.frequency + dims.postseason * RIVALRY_WEIGHTS.postseason + dims.recency * RIVALRY_WEIGHTS.recency + dims.longevity * RIVALRY_WEIGHTS.longevity));
    return { ...d, score, rank: null as number | null, dimensions: dims };
  });
  const ranked = scored.filter((r) => r.score !== null).sort((x, y) => (y.score! - x.score!) || y.meetings - x.meetings || y.playoffMeetings - x.playoffMeetings || (y.lastSeason ?? 0) - (x.lastSeason ?? 0) || x.key.localeCompare(y.key));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return scored.map(({ competitiveness: _c, ...r }) => r as Rivalry).sort((x, y) => (x.rank ?? 1e9) - (y.rank ?? 1e9) || y.meetings - x.meetings || x.key.localeCompare(y.key));
}

export type RivalryCategory = "most-competitive" | "most-played" | "championship" | "series-leads" | "recently-active" | "recognized";
export const RIVALRY_CATEGORIES: readonly { readonly id: RivalryCategory; readonly label: string; readonly description: string }[] = [
  { id: "most-competitive", label: "Most Competitive", description: "The most balanced eligible series." },
  { id: "most-played", label: "Most Played", description: "The eligible pairs with the most regular-season and playoff meetings." },
  { id: "championship", label: "Championship Rivalries", description: "Pairs ordered by title-game meetings, then all playoff meetings." },
  { id: "series-leads", label: "Biggest Series Leads", description: "The largest win gaps among eligible series." },
  { id: "recently-active", label: "Recently Active", description: "Eligible rivalries ordered by their latest meeting." },
  { id: "recognized", label: "Recognized Rivalries", description: "League-recognized rivalries, curated separately from the calculated rankings." },
];

const desc = (x: number | null, y: number | null) => (y ?? -Infinity) - (x ?? -Infinity);

export function rivalriesForCategory(all: readonly Rivalry[], category: RivalryCategory): Rivalry[] {
  const eligible = all.filter((r) => r.eligible);
  switch (category) {
    case "most-competitive": return [...eligible].sort((a, b) => desc(a.dimensions.competitiveness, b.dimensions.competitiveness) || b.meetings - a.meetings || desc(a.lastSeason, b.lastSeason) || a.key.localeCompare(b.key));
    case "most-played": return [...eligible].sort((a, b) => b.meetings - a.meetings || b.seasons.length - a.seasons.length || desc(a.lastSeason, b.lastSeason) || a.key.localeCompare(b.key));
    case "championship": return all.filter((r) => r.playoffMeetings > 0).sort((a, b) => b.championshipMeetings - a.championshipMeetings || b.playoffMeetings - a.playoffMeetings || desc(a.score, b.score) || desc(a.lastSeason, b.lastSeason) || a.key.localeCompare(b.key));
    case "series-leads": return [...eligible].sort((a, b) => Math.abs(b.winsA - b.winsB) - Math.abs(a.winsA - a.winsB) || b.meetings - a.meetings || a.key.localeCompare(b.key));
    case "recently-active": return [...eligible].sort((a, b) => desc(a.lastSeason, b.lastSeason) || desc(a.score, b.score) || a.key.localeCompare(b.key));
    case "recognized": return all.filter((r) => r.recognized);
  }
}

/** Sleeper winners-bracket entry (t1/t2 = roster ids, p = placement game: 1 title, 3 third, 5 fifth). */
export interface WinnersBracketMatch { readonly r?: number | null; readonly t1?: number | null; readonly t2?: number | null; readonly p?: number | null }

/**
 * Stage for one season's postseason games (Week 15+): winners-bracket games count as playoff
 * (the title game as championship); placement (3rd/5th) and consolation games are "other".
 * A pair that meets twice in one postseason is matched to its bracket games in round order.
 */
export function postseasonStages(games: readonly { readonly week: number; readonly rosterA: number; readonly rosterB: number }[], bracket: readonly WinnersBracketMatch[]): MeetingStage[] {
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const byPair = new Map<string, WinnersBracketMatch[]>();
  for (const m of [...bracket].sort((x, y) => (x.r ?? 0) - (y.r ?? 0))) {
    if (typeof m.t1 !== "number" || typeof m.t2 !== "number") continue;
    const k = key(m.t1, m.t2);
    byPair.set(k, [...(byPair.get(k) ?? []), m]);
  }
  const order = games.map((g, i) => ({ g, i })).sort((x, y) => x.g.week - y.g.week);
  const used = new Map<string, number>();
  const out: MeetingStage[] = games.map(() => "other");
  for (const { g, i } of order) {
    const k = key(g.rosterA, g.rosterB);
    const n = used.get(k) ?? 0;
    const match = byPair.get(k)?.[n];
    used.set(k, n + 1);
    if (!match) continue;
    out[i] = match.p === 1 ? "championship" : match.p ? "other" : "playoff";
  }
  return out;
}
