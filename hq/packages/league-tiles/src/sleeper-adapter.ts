import {
  empty,
  ready,
  type MatchupSide,
  type PlayoffFormat,
  type PlayoffRaceData,
  type PowerRankingRow,
  type PowerRankingsData,
  type ReigningChampionData,
  type StandingRow,
  type TeamRef,
  type TileLink,
  type TileState,
  type WeeklyHighScoreData,
  type WeeklyMatchupsData,
} from "./contract.ts";

/** Minimal Sleeper shapes the adapter relies on (all optional-safe). */
export interface SleeperUserLike { readonly user_id: string; readonly display_name?: string | null; readonly avatar?: string | null; readonly metadata?: Record<string, unknown> | null }
export interface SleeperRosterLike {
  readonly roster_id: number;
  readonly owner_id?: string | null;
  readonly settings?: Record<string, unknown> | null;
  readonly metadata?: Record<string, unknown> | null;
}
export interface SleeperMatchupLike { readonly roster_id: number; readonly matchup_id?: number | null; readonly points?: number | null; readonly custom_points?: number | null }
export interface SleeperLeagueLike { readonly league_id?: string; readonly season?: string; readonly settings?: Record<string, unknown> | null; readonly metadata?: Record<string, unknown> | null }
export interface SleeperBracketMatchLike { readonly r?: number; readonly m?: number; readonly w?: number | null; readonly l?: number | null; readonly p?: number | null }

export interface SleeperLeagueSnapshot {
  readonly league: SleeperLeagueLike;
  readonly users: readonly SleeperUserLike[];
  readonly rosters: readonly SleeperRosterLike[];
  /** Matchups keyed by week. Include the current week and the latest finished week. */
  readonly matchupsByWeek: Readonly<Record<number, readonly SleeperMatchupLike[]>>;
  /** The current NFL week (Sleeper /state/nfl `week`). */
  readonly nflWeek: number;
  /** Sleeper /state/nfl `display_week`: the week Sleeper's own app shows; it moves to the new week on Wednesday. */
  readonly displayWeek?: number | null;
  /** Sleeper /state/nfl `season_type` ("pre", "regular", "post", "off"). */
  readonly seasonType?: string | null;
  readonly asOf: string | null;
  readonly stale?: boolean;
  /** Real names keyed by Sleeper user_id (from HQ's canonical owner identities). Falls back to the Sleeper display name. */
  readonly managerNames?: Readonly<Record<string, string>>;
}

export interface TileLinks {
  readonly matchups?: TileLink;
  readonly standings?: TileLink;
  readonly rankings?: TileLink;
  readonly weeklyResults?: TileLink;
  readonly history?: TileLink;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);
const round2 = (value: number) => Math.round(value * 100) / 100;

export function sleeperAvatarUrl(user: SleeperUserLike | undefined): string | null {
  const custom = user?.metadata?.avatar;
  if (typeof custom === "string" && /^https:\/\//.test(custom)) return custom;
  return user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${encodeURIComponent(user.avatar)}` : null;
}

export function teamRefs(snapshot: Pick<SleeperLeagueSnapshot, "users" | "rosters" | "managerNames">): ReadonlyMap<number, TeamRef> {
  const users = new Map(snapshot.users.map((user) => [user.user_id, user]));
  const refs = new Map<number, TeamRef>();
  for (const roster of snapshot.rosters) {
    const user = roster.owner_id ? users.get(roster.owner_id) : undefined;
    const canonical = roster.owner_id ? snapshot.managerNames?.[roster.owner_id] : undefined;
    const managerName = canonical?.trim() || user?.display_name?.trim() || `Team ${roster.roster_id}`;
    const sleeperName = user?.display_name?.trim() || managerName;
    const teamName = (typeof user?.metadata?.team_name === "string" && user.metadata.team_name.trim()) || sleeperName;
    refs.set(roster.roster_id, { rosterId: roster.roster_id, teamName, managerName, avatarUrl: sleeperAvatarUrl(user) });
  }
  return refs;
}

export const matchupPoints = (row: SleeperMatchupLike) => round2(num(row.custom_points ?? row.points));
export const lastScoredWeek = (league: SleeperLeagueLike) => Math.max(0, Math.trunc(num(league.settings?.last_scored_leg)));

/** Standings sorted by wins, then points for (Sleeper's default tiebreaker). */
export function standings(snapshot: SleeperLeagueSnapshot): readonly Omit<StandingRow, "status">[] {
  const refs = teamRefs(snapshot);

  const noDivisions = snapshot.league.settings?.divisions !== undefined && num(snapshot.league.settings?.divisions) < 1;
  const divisionName = (division: number | null) => {
    if (!division || noDivisions) return null;
    const name = snapshot.league.metadata?.[`division_${division}`];
    return typeof name === "string" && name.trim() ? name.trim() : `Division ${division}`;
  };
  return snapshot.rosters
    .map((roster) => {
      const s = roster.settings ?? {};
      return {
        team: refs.get(roster.roster_id)!,
        wins: num(s.wins),
        losses: num(s.losses),
        ties: num(s.ties),
        pointsFor: round2(num(s.fpts) + num(s.fpts_decimal) / 100),
        division: divisionName(num(s.division) || null),
      };
    })
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.ties - a.ties || b.pointsFor - a.pointsFor)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

type TableRow = Omit<StandingRow, "status">;
const byRecord = (a: TableRow, b: TableRow) => b.wins - a.wins || a.losses - b.losses || b.ties - a.ties || b.pointsFor - a.pointsFor;

/** Seeds the playoff field using the league's own rules (see LEAGUE_PLAYOFF_FORMATS). */
export function seedPlayoffs(table: readonly TableRow[], format: PlayoffFormat): readonly StandingRow[] {
  const remaining = [...table];
  const take = (row: TableRow) => remaining.splice(remaining.indexOf(row), 1)[0];
  const seeded: { row: TableRow; reason: NonNullable<StandingRow["seedReason"]> }[] = [];

  if (format.divisionWinners > 0) {
    const divisions = [...new Set(table.map((row) => row.division).filter((d): d is string => Boolean(d)))];
    const winners = divisions.map((division) => [...table].filter((row) => row.division === division).sort(byRecord)[0]).sort(byRecord).slice(0, format.divisionWinners);
    for (const row of winners) seeded.push({ row: take(row), reason: "DIVISION" });
  }
  for (const row of [...remaining].sort(byRecord).slice(0, format.recordSeeds)) seeded.push({ row: take(row), reason: "RECORD" });
  for (const row of [...remaining].sort((a, b) => b.pointsFor - a.pointsFor || byRecord(a, b)).slice(0, format.pointsSeeds)) seeded.push({ row: take(row), reason: "POINTS" });

  const outside = format.restByPoints || format.chaseByPoints ? remaining.sort((a, b) => b.pointsFor - a.pointsFor || byRecord(a, b)) : remaining.sort(byRecord);
  return [
    ...seeded.map(({ row, reason }, index) => ({ ...row, rank: index + 1, status: "IN" as const, seedReason: reason })),
    ...outside.map((row, index) => ({ ...row, rank: seeded.length + index + 1, status: index < 2 ? "BUBBLE" as const : "OUT" as const, seedReason: null })),
  ];
}

export function playoffRaceTile(snapshot: SleeperLeagueSnapshot, links: TileLinks = {}, format?: PlayoffFormat): TileState<PlayoffRaceData> {
  const through = lastScoredWeek(snapshot.league);
  if (!snapshot.rosters.length) return empty("Standings are not available yet.");
  if (through < 1) return empty("The playoff race starts after Week 1 is final.");
  const spots = Math.max(1, Math.trunc(num(snapshot.league.settings?.playoff_teams)) || 6);
  const rules = format ?? { divisionWinners: 0, recordSeeds: spots, pointsSeeds: 0 };
  const rows = seedPlayoffs(standings(snapshot), rules);
  const start = Math.trunc(num(snapshot.league.settings?.playoff_week_start)) || null;
  return ready({ throughWeek: through, playoffSpots: rules.divisionWinners + rules.recordSeeds + rules.pointsSeeds, playoffStartWeek: start, format: rules, rows, standingsLink: links.standings ?? null }, snapshot.asOf, snapshot.stale);
}

export function matchupDisplayWeek(input: {
  readonly stateWeek: number;
  readonly displayWeek?: number | null;
  readonly lastScoredWeek: number;
  readonly seasonType?: string | null;
  readonly hasMatchups: (week: number) => boolean;
  readonly now?: Date;
}): number {
  const last = Math.max(0, Math.trunc(input.lastScoredWeek));
  const fallback = last || (input.hasMatchups(1) ? 1 : 0);
  if (input.seasonType === "off" || input.seasonType === "pre" || !(input.stateWeek >= 1)) return fallback;
  let week = Number(input.displayWeek);
  if (!(week >= 1)) {
    week = Math.trunc(input.stateWeek);
    const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(input.now ?? new Date());
    if ((day === "Tue" || day === "Mon") && week === last + 1 && last >= 1) week = last;
  }
  week = Math.min(18, Math.trunc(week));
  return input.hasMatchups(week) ? week : fallback;
}

export function weeklyMatchupsTile(snapshot: SleeperLeagueSnapshot, links: TileLinks = {}): TileState<WeeklyMatchupsData> {
  const finished = lastScoredWeek(snapshot.league);
  const week = matchupDisplayWeek({ stateWeek: snapshot.nflWeek, displayWeek: snapshot.displayWeek, lastScoredWeek: finished, seasonType: snapshot.seasonType, hasMatchups: (w) => Boolean(snapshot.matchupsByWeek[w]?.length) });
  const rows = snapshot.matchupsByWeek[week] ?? [];
  if (!week || !rows.length) return empty("This week's matchups are not available yet.");
  const refs = teamRefs(snapshot);
  const standing = new Map(standings(snapshot).map((row) => [row.team.rosterId, `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`]));
  const groups = new Map<number, SleeperMatchupLike[]>();
  for (const row of rows) if (row.matchup_id) groups.set(row.matchup_id, [...(groups.get(row.matchup_id) ?? []), row]);
  const anyPoints = rows.some((row) => matchupPoints(row) > 0);
  const phase: WeeklyMatchupsData["phase"] = week <= finished ? "FINAL" : anyPoints ? "IN_PROGRESS" : "UPCOMING";
  const side = (row: SleeperMatchupLike): MatchupSide => ({ team: refs.get(row.roster_id)!, points: phase === "UPCOMING" ? null : matchupPoints(row), record: standing.get(row.roster_id) ?? null });
  const matchups = [...groups.entries()]
    .filter(([, pair]) => pair.length === 2 && refs.has(pair[0].roster_id) && refs.has(pair[1].roster_id))
    .sort(([a], [b]) => a - b)
    .map(([id, [a, b]]) => ({ id, a: side(a), b: side(b) }));
  if (!matchups.length) return empty("This week's matchups are not available yet.");
  return ready({ week, phase, matchups, matchupsLink: links.matchups ?? null }, snapshot.asOf, snapshot.stale);
}

export function weeklyHighScoreTile(snapshot: SleeperLeagueSnapshot, options: { readonly prize?: string | null; readonly links?: TileLinks } = {}): TileState<WeeklyHighScoreData> {
  const week = lastScoredWeek(snapshot.league);
  const rows = snapshot.matchupsByWeek[week] ?? [];
  if (!week || !rows.length) return empty("The first weekly high score is awarded after Week 1.");
  const refs = teamRefs(snapshot);
  const scored = rows.filter((row) => refs.has(row.roster_id)).map((row) => ({ team: refs.get(row.roster_id)!, points: matchupPoints(row) })).sort((a, b) => b.points - a.points);
  if (!scored.length || scored[0].points <= 0) return empty(`Week ${week} scores are not available.`);
  return ready({ week, team: scored[0].team, points: scored[0].points, prize: options.prize ?? null, runnerUp: scored[1] ?? null, resultsLink: options.links?.weeklyResults ?? null }, snapshot.asOf, snapshot.stale);
}

/**
 * Roster strength for power rankings: a 0–100 score per roster (100 = strongest roster in the
 * league), from a league's own model or FantasyCalc values. Raw player values are never shown.
 */
export interface RosterStrength {
  readonly scores: ReadonlyMap<number, number>;
  /** Shown under the rankings, e.g. "Roster value: FantasyCalc dynasty". */
  readonly label: string;
  readonly credit?: TileLink | null;
}

/** How much roster strength counts: 50% at Week 1, falling 3 points a week to a 25% floor. */
export function rosterWeightForWeek(week: number): number {
  return Math.max(0.25, Math.round((0.5 - 0.03 * Math.max(0, week - 1)) * 100) / 100);
}

export interface ResultLine { readonly rosterId: number; readonly wins: number; readonly losses: number; readonly ties: number; readonly pointsFor: number; readonly recent: number }

/**
 * Season results through `week`: the current table from Sleeper (roster settings) when `week`
 * is the last scored week, or that table with the last week's games taken back out (for last
 * week's order and movement arrows).
 */
export function resultsThrough(snapshot: SleeperLeagueSnapshot, through: number, week: number): readonly ResultLine[] | null {
  const base = standings(snapshot);
  const removed = new Map<number, { w: number; l: number; t: number; pts: number }>();
  for (let w = through; w > week; w -= 1) {
    const rows = snapshot.matchupsByWeek[w];
    if (!rows?.length) return null;
    const median = num(snapshot.league.settings?.league_average_match) === 1 ? [...rows].map(matchupPoints).sort((x, y) => x - y)[Math.floor(rows.length / 2) - 1 + (rows.length % 2)] : null;
    const groups = new Map<number, SleeperMatchupLike[]>();
    for (const row of rows) if (row.matchup_id) groups.set(row.matchup_id, [...(groups.get(row.matchup_id) ?? []), row]);
    const add = (rosterId: number, delta: { w?: number; l?: number; t?: number; pts?: number }) => {
      const cur = removed.get(rosterId) ?? { w: 0, l: 0, t: 0, pts: 0 };
      removed.set(rosterId, { w: cur.w + (delta.w ?? 0), l: cur.l + (delta.l ?? 0), t: cur.t + (delta.t ?? 0), pts: cur.pts + (delta.pts ?? 0) });
    };
    for (const pair of groups.values()) {
      if (pair.length !== 2) continue;
      const [x, y] = pair as [SleeperMatchupLike, SleeperMatchupLike];
      const px = matchupPoints(x), py = matchupPoints(y);
      add(x.roster_id, { pts: px, w: px > py ? 1 : 0, l: px < py ? 1 : 0, t: px === py ? 1 : 0 });
      add(y.roster_id, { pts: py, w: py > px ? 1 : 0, l: py < px ? 1 : 0, t: px === py ? 1 : 0 });
    }
    if (median !== null) for (const row of rows) add(row.roster_id, matchupPoints(row) > median ? { w: 1 } : { l: 1 });
  }
  const recentWeeks = [week, week - 1, week - 2].filter((w) => w >= 1 && snapshot.matchupsByWeek[w]?.length);
  return base.map((row) => {
    const r = removed.get(row.team.rosterId) ?? { w: 0, l: 0, t: 0, pts: 0 };
    const recentValues = recentWeeks.map((w) => snapshot.matchupsByWeek[w]!.find((m) => m.roster_id === row.team.rosterId)).filter(Boolean).map((m) => matchupPoints(m!));
    return { rosterId: row.team.rosterId, wins: row.wins - r.w, losses: row.losses - r.l, ties: row.ties - r.t, pointsFor: round2(row.pointsFor - r.pts), recent: recentValues.length ? recentValues.reduce((a, b) => a + b, 0) / recentValues.length : 0 };
  });
}

const scaleTo100 = (values: readonly number[], value: number) => { const min = Math.min(...values); const max = Math.max(...values); return max === min ? 50 : ((value - min) / (max - min)) * 100; };

/** Ranking order after `week`: results (50% record, 35% points, 15% last three weeks) blended with roster strength. */
function rankingOrder(lines: readonly ResultLine[], week: number, roster: RosterStrength | null): readonly { rosterId: number; score: number; pointsFor: number }[] {
  const pct = lines.map((l) => { const g = l.wins + l.losses + l.ties; return g ? (l.wins + l.ties / 2) / g : 0; });
  const pf = lines.map((l) => l.pointsFor);
  const rf = lines.map((l) => l.recent);
  const rosterWeight = roster ? rosterWeightForWeek(week) : 0;
  return lines.map((l, i) => {
    const results = 0.5 * scaleTo100(pct, pct[i]!) + 0.35 * scaleTo100(pf, pf[i]!) + 0.15 * scaleTo100(rf, rf[i]!);
    const rosterScore = roster?.scores.get(l.rosterId) ?? 50;
    return { rosterId: l.rosterId, score: Math.round(((1 - rosterWeight) * results + rosterWeight * rosterScore) * 10) / 10, pointsFor: l.pointsFor };
  }).sort((a, b) => b.score - a.score || b.pointsFor - a.pointsFor);
}

/**
 * Power rankings: this season's results, blended with roster strength when the league
 * supplies it (results count more as the season goes on). Movement arrows compare with
 * last week's order, recomputed the same way — nothing needs to be stored.
 */
export function powerRankingsTile(
  snapshot: SleeperLeagueSnapshot,
  options: { readonly previousOrder?: readonly number[]; readonly links?: TileLinks; readonly rosterStrength?: RosterStrength | null } = {},
): TileState<PowerRankingsData> {
  const through = lastScoredWeek(snapshot.league);
  if (through < 1 || !snapshot.rosters.length) return empty("Power rankings start after Week 1.");
  const roster = options.rosterStrength && options.rosterStrength.scores.size ? options.rosterStrength : null;
  const current = resultsThrough(snapshot, through, through)!;
  const order = rankingOrder(current, through, roster);
  const refs = teamRefs(snapshot);
  const lastWeek = !options.previousOrder && through >= 2 ? resultsThrough(snapshot, through, through - 1) : null;
  const previousOrder = options.previousOrder ?? (lastWeek ? rankingOrder(lastWeek, through - 1, roster).map((row) => row.rosterId) : null);
  const previous = previousOrder ? new Map(previousOrder.map((rosterId, index) => [rosterId, index + 1])) : null;
  const label = (rank: number, total: number) => (rank <= 2 ? "Title contender" : rank <= Math.ceil(total / 2) ? "Playoff caliber" : rank <= total - 2 ? "In the hunt" : "Rebuilding");
  const rows: PowerRankingRow[] = order.map((row, index) => {
    const before = previous?.get(row.rosterId);
    return { rank: index + 1, team: refs.get(row.rosterId)!, movement: before ? before - (index + 1) : null, label: label(index + 1, order.length), score: row.score };
  });
  const rosterPct = roster ? Math.round(rosterWeightForWeek(through) * 100) : 0;
  return ready({
    throughWeek: through,
    model: roster ? "results-plus-roster-v1" : "record-and-points-v1",
    rows,
    rankingsLink: options.links?.rankings ?? null,
    method: roster ? `${100 - rosterPct}% results · ${rosterPct}% roster` : "Record, points and recent form",
    credit: roster?.credit ?? null,
    rosterSource: roster?.label ?? null,
  }, snapshot.asOf, snapshot.stale);
}

export function reigningChampionFromBracket(input: {
  readonly season: number;
  readonly bracket: readonly SleeperBracketMatchLike[];
  readonly users: readonly SleeperUserLike[];
  readonly rosters: readonly SleeperRosterLike[];
  readonly managerNames?: Readonly<Record<string, string>>;
  readonly links?: TileLinks;
}): TileState<ReigningChampionData> {
  const final = input.bracket.find((match) => match.p === 1 && match.w);
  if (!final?.w) return empty(`The ${input.season} champion is not recorded yet.`);
  const team = teamRefs(input).get(final.w);
  if (!team) return empty(`The ${input.season} champion could not be matched to a team.`);
  const roster = input.rosters.find((r) => r.roster_id === final.w);
  const record = roster ? `${num(roster.settings?.wins)}-${num(roster.settings?.losses)}` : null;
  return ready({ season: input.season, team, record, note: null, historyLink: input.links?.history ?? null });
}
