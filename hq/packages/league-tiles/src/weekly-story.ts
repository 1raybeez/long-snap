import { empty, ready, type TeamRef, type TileLink, type TileState, type WeeklyRecapData } from "./contract.ts";
import { PLAYER_NAMES } from "./player-names.ts";
import { lastScoredWeek, matchupPoints, resultsThrough, teamRefs, type SleeperLeagueSnapshot, type SleeperMatchupLike } from "./sleeper-adapter.ts";

/**
 * Automatic weekly recap ("full recap" page) written from Sleeper results for any league:
 * headline, honors, a short story for every matchup (with each side's top starter), standings
 * and next week's games to watch. Deterministic: the same week always reads the same way.
 * A commissioner-written recap, where a league has one, takes priority (see tiles `preferRecap`).
 */

export interface StoryPlayer { readonly name: string; readonly position: string; readonly points: number }
export interface StorySide { readonly team: TeamRef; readonly points: number; readonly record: string; readonly top: StoryPlayer | null }
export interface StoryGame { readonly matchupId: number; readonly winner: StorySide; readonly loser: StorySide; readonly margin: number; readonly tie: boolean; readonly story: string }
export interface StoryStanding { readonly rank: number; readonly team: TeamRef; readonly record: string; readonly pointsFor: number }
export interface WeeklyStory {
  readonly season: string | null;
  readonly week: number;
  readonly title: string;
  readonly dek: string;
  readonly honors: {
    readonly highScore: { readonly team: TeamRef; readonly points: number };
    readonly lowScore: { readonly team: TeamRef; readonly points: number };
    readonly closest: StoryGame | null;
    readonly blowout: StoryGame | null;
    readonly topPlayer: (StoryPlayer & { readonly team: TeamRef }) | null;
  };
  readonly toughLuck: string | null;
  readonly games: readonly StoryGame[];
  readonly standings: readonly StoryStanding[];
  readonly weekAhead: readonly string[];
}

const fmt = (value: number) => value.toFixed(2);
const recordText = (w: number, l: number, t: number) => `${w}-${l}${t ? `-${t}` : ""}`;
/** Stable pick from a list so wording varies across games but never between page loads. */
const pick = <T,>(options: readonly T[], seed: number): T => options[Math.abs(seed) % options.length]!;

function playerName(id: string): { name: string; position: string } | null {
  const raw = PLAYER_NAMES[id];
  if (!raw) return null;
  const [name, position] = raw.split("|");
  return name ? { name, position: position ?? "" } : null;
}

function topStarter(row: SleeperMatchupLike): StoryPlayer | null {
  const r = row as SleeperMatchupLike & { starters?: readonly string[] | null; starters_points?: readonly number[] | null };
  const starters = r.starters ?? [];
  const points = r.starters_points ?? [];
  let best: StoryPlayer | null = null;
  starters.forEach((id, index) => {
    const value = Number(points[index] ?? 0);
    const who = id && id !== "0" ? playerName(id) : null;
    if (who && (!best || value > best.points)) best = { name: who.name, position: who.position, points: Math.round(value * 100) / 100 };
  });
  return best;
}

/** Head-to-head results by roster for weeks 1..week, in order (W/L/T), for streaks. */
function resultHistory(snapshot: SleeperLeagueSnapshot, week: number): Map<number, string[]> {
  const history = new Map<number, string[]>();
  for (let w = 1; w <= week; w += 1) {
    const groups = new Map<number, SleeperMatchupLike[]>();
    for (const row of snapshot.matchupsByWeek[w] ?? []) if (row.matchup_id) groups.set(row.matchup_id, [...(groups.get(row.matchup_id) ?? []), row]);
    for (const pair of groups.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair as [SleeperMatchupLike, SleeperMatchupLike];
      const pa = matchupPoints(a), pb = matchupPoints(b);
      const push = (id: number, r: string) => history.set(id, [...(history.get(id) ?? []), r]);
      push(a.roster_id, pa > pb ? "W" : pa < pb ? "L" : "T");
      push(b.roster_id, pb > pa ? "W" : pb < pa ? "L" : "T");
    }
  }
  return history;
}

const streakOf = (results: readonly string[] | undefined) => {
  if (!results?.length) return { kind: "", length: 0 };
  const last = results[results.length - 1]!;
  let length = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i -= 1) length += 1;
  return { kind: last, length };
};

function writeStory(game: Omit<StoryGame, "story">, ctx: { week: number; rankOf: (rosterId: number) => number; teams: number; winStreak: number; loseStreak: number; median: number }): string {
  const { winner: w, loser: l, margin } = game;
  const seed = ctx.week * 31 + game.matchupId * 7;
  const wName = w.team.teamName, lName = l.team.teamName;
  if (game.tie) return `${wName} and ${lName} finished dead even at ${fmt(w.points)}. Nobody gets the win, nobody takes the loss, and both managers will be staring at their benches all week.`;

  const lines: string[] = [];
  const wRank = ctx.rankOf(w.team.rosterId), lRank = ctx.rankOf(l.team.rosterId);
  if (margin < 5) {
    lines.push(pick([
      `${wName} survived ${lName} ${fmt(w.points)}–${fmt(l.points)}, a ${fmt(margin)}-point finish that came down to the last snaps.`,
      `This one went to the wire: ${wName} edged ${lName} by just ${fmt(margin)} (${fmt(w.points)}–${fmt(l.points)}).`,
      `${wName} squeaked past ${lName}, ${fmt(w.points)} to ${fmt(l.points)}. ${fmt(margin)} points is one dropped pass.`,
    ], seed));
  } else if (margin >= 40) {
    lines.push(pick([
      `${wName} flattened ${lName} ${fmt(w.points)}–${fmt(l.points)}, a ${fmt(margin)}-point beatdown that was over early.`,
      `No drama here. ${wName} rolled ${lName} by ${fmt(margin)}, ${fmt(w.points)} to ${fmt(l.points)}.`,
    ], seed));
  } else if (wRank <= 2) {
    lines.push(pick([
      `${wName} put up ${fmt(w.points)}, one of the week's best, and handled ${lName} (${fmt(l.points)}) by ${fmt(margin)}.`,
      `A statement from ${wName}: ${fmt(w.points)} points and a ${fmt(margin)}-point win over ${lName}.`,
    ], seed));
  } else {
    lines.push(pick([
      `${wName} beat ${lName} ${fmt(w.points)}–${fmt(l.points)}, winning by ${fmt(margin)}.`,
      `${wName} took care of business against ${lName}, ${fmt(w.points)} to ${fmt(l.points)}.`,
      `${wName} got past ${lName} by ${fmt(margin)} (${fmt(w.points)}–${fmt(l.points)}).`,
    ], seed));
  }
  if (w.top) lines.push(pick([`${w.top.name} led the way with ${fmt(w.top.points)}.`, `${w.top.name}${w.top.position && w.top.position !== "DEF" ? ` (${w.top.position})` : ""} did the heavy lifting with ${fmt(w.top.points)}.`, `The difference-maker was ${w.top.name}, good for ${fmt(w.top.points)}.`], seed + 1));
  if (l.points > ctx.median && lRank <= Math.ceil(ctx.teams / 3)) lines.push(`${lName} scored more than most of the league and still lost. Brutal draw.`);
  else if (w.points < ctx.median) lines.push(`${wName} won with a below-average score, so take it and move on.`);
  else if (l.top) lines.push(`${lName} got ${fmt(l.top.points)} from ${l.top.name}, but it wasn't enough.`);
  if (ctx.winStreak >= 3) lines.push(`That's ${ctx.winStreak} straight wins for ${wName} (${w.record}).`);
  else if (ctx.loseStreak >= 3) lines.push(`${lName} has now lost ${ctx.loseStreak} in a row and sits at ${l.record}.`);
  else lines.push(`${wName} moves to ${w.record}; ${lName} falls to ${l.record}.`);
  return lines.join(" ");
}

/**
 * Builds the story for `week`. `snapshot.matchupsByWeek` should hold weeks 1 through the last
 * scored week (for records and streaks) plus `week + 1` (for the week ahead). Returns null
 * when the week has no final scores.
 */
export function buildWeeklyStory(snapshot: SleeperLeagueSnapshot, week: number): WeeklyStory | null {
  const finished = lastScoredWeek(snapshot.league);
  if (week < 1 || week > finished) return null;
  const rows = snapshot.matchupsByWeek[week] ?? [];
  const refs = teamRefs(snapshot);
  if (!rows.length || rows.every((row) => matchupPoints(row) <= 0)) return null;

  const results = resultsThrough(snapshot, finished, week) ?? [];
  const recordOf = new Map(results.map((line) => [line.rosterId, line]));
  const record = (rosterId: number) => { const r = recordOf.get(rosterId); return r ? recordText(r.wins, r.losses, r.ties) : ""; };
  const history = resultHistory(snapshot, week);

  const scored = rows.filter((row) => refs.has(row.roster_id)).map((row) => ({ row, points: matchupPoints(row) })).sort((a, b) => b.points - a.points);
  const rankOf = (rosterId: number) => scored.findIndex((entry) => entry.row.roster_id === rosterId) + 1;
  const median = scored.length ? (scored[Math.floor((scored.length - 1) / 2)]!.points + scored[Math.ceil((scored.length - 1) / 2)]!.points) / 2 : 0;

  const groups = new Map<number, SleeperMatchupLike[]>();
  for (const row of rows) if (row.matchup_id && refs.has(row.roster_id)) groups.set(row.matchup_id, [...(groups.get(row.matchup_id) ?? []), row]);
  const side = (row: SleeperMatchupLike): StorySide => ({ team: refs.get(row.roster_id)!, points: matchupPoints(row), record: record(row.roster_id), top: topStarter(row) });
  const games: StoryGame[] = [...groups.entries()].filter(([, pair]) => pair.length === 2).sort(([a], [b]) => a - b).map(([matchupId, [a, b]]) => {
    const [win, lose] = matchupPoints(a!) >= matchupPoints(b!) ? [a!, b!] : [b!, a!];
    const base = { matchupId, winner: side(win), loser: side(lose), margin: Math.round(Math.abs(matchupPoints(a!) - matchupPoints(b!)) * 100) / 100, tie: matchupPoints(a!) === matchupPoints(b!) };
    const ws = streakOf(history.get(win.roster_id)), ls = streakOf(history.get(lose.roster_id));
    return { ...base, story: writeStory(base, { week, rankOf, teams: scored.length, winStreak: ws.kind === "W" ? ws.length : 0, loseStreak: ls.kind === "L" ? ls.length : 0, median }) };
  }).sort((x, y) => x.margin - y.margin);

  const high = scored[0]!, low = scored[scored.length - 1]!;
  const decided = games.filter((game) => !game.tie);
  const closest = decided[0] ?? null;
  const blowout = decided.length ? decided[decided.length - 1]! : null;
  const allTops = games.flatMap((game) => [game.winner, game.loser]).filter((s) => s.top).sort((a, b) => b.top!.points - a.top!.points);
  const topPlayer = allTops[0] ? { ...allTops[0].top!, team: allTops[0].team } : null;
  const unluckiest = [...games].filter((g) => !g.tie).map((g) => g.loser).sort((a, b) => b.points - a.points)[0];
  const toughLuck = unluckiest && rankOf(unluckiest.team.rosterId) <= Math.ceil(scored.length / 3)
    ? `${unluckiest.team.teamName} scored ${fmt(unluckiest.points)}, ${ordinal(rankOf(unluckiest.team.rosterId))}-best in the league, and still lost.`
    : null;

  const highTeam = refs.get(high.row.roster_id)!, lowTeam = refs.get(low.row.roster_id)!;
  const title = pick([
    `Week ${week}: ${highTeam.teamName} sets the pace`,
    `Week ${week}: ${highTeam.teamName} leads the way`,
    closest && closest.margin < 5 ? `Week ${week}: ${closest.winner.team.teamName} survives a thriller` : `Week ${week}: ${highTeam.teamName} on top`,
  ], week);
  const dek = `${highTeam.teamName} led Week ${week} with ${fmt(high.points)}${closest ? `, ${closest.winner.team.teamName} won the closest game by ${fmt(closest.margin)}` : ""}${topPlayer ? `, and ${topPlayer.name} was the week's top starter (${fmt(topPlayer.points)})` : ""}.`;

  const standings: StoryStanding[] = [...results]
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.pointsFor - a.pointsFor)
    .flatMap((line, index) => (refs.has(line.rosterId) ? [{ rank: index + 1, team: refs.get(line.rosterId)!, record: recordText(line.wins, line.losses, line.ties), pointsFor: line.pointsFor }] : []));

  const nextRows = snapshot.matchupsByWeek[week + 1] ?? [];
  const nextGroups = new Map<number, SleeperMatchupLike[]>();
  for (const row of nextRows) if (row.matchup_id && refs.has(row.roster_id)) nextGroups.set(row.matchup_id, [...(nextGroups.get(row.matchup_id) ?? []), row]);
  const standingRank = new Map(standings.map((s) => [s.team.rosterId, s.rank]));
  const weekAhead = [...nextGroups.values()].filter((pair) => pair.length === 2).map(([a, b]) => {
    const ta = refs.get(a!.roster_id)!, tb = refs.get(b!.roster_id)!;
    const ra = standingRank.get(a!.roster_id) ?? 99, rb = standingRank.get(b!.roster_id) ?? 99;
    const note = ra <= 3 && rb <= 3 ? " — a top-three showdown." : Math.abs(ra - rb) <= 1 ? " — neighbors in the standings." : "";
    return { text: `${ta.teamName} (${record(a!.roster_id)}) vs ${tb.teamName} (${record(b!.roster_id)})${note}`, weight: ra + rb };
  }).sort((x, y) => x.weight - y.weight).map((entry) => entry.text);

  return {
    season: snapshot.league.season ?? null,
    week,
    title,
    dek,
    honors: { highScore: { team: highTeam, points: high.points }, lowScore: { team: lowTeam, points: low.points }, closest, blowout, topPlayer },
    toughLuck,
    games,
    standings,
    weekAhead,
  };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Homepage Weekly Recap tile for the last finished week, linking to the full recap page. */
export function autoWeeklyRecapTile(snapshot: SleeperLeagueSnapshot, link: TileLink | ((week: number) => TileLink) | null = null): TileState<WeeklyRecapData> {
  const week = lastScoredWeek(snapshot.league);
  if (!week) return empty("The weekly recap appears after the first week is final.");
  const story = buildWeeklyStory(snapshot, week);
  if (!story) return empty(`Week ${week} scores are not available yet.`);
  return ready({ week, headline: story.title, summary: story.dek, author: null, publishedAt: null, recapLink: typeof link === "function" ? link(week) : link }, snapshot.asOf, snapshot.stale);
}

/** The commissioner's recap when it covers the latest finished week, otherwise the automatic one. */
export function preferRecap(commissioner: TileState<WeeklyRecapData>, automatic: TileState<WeeklyRecapData>): TileState<WeeklyRecapData> {
  if (commissioner.status !== "READY") return automatic.status === "READY" ? automatic : commissioner;
  if (automatic.status === "READY" && automatic.data.week > commissioner.data.week) return automatic;
  return commissioner;
}
