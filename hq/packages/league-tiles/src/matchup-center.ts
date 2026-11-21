
import { PLAYER_NAMES } from "./player-names.ts";
import { PLAYER_TEAMS } from "./player-teams.ts";
import archive from "./player-archive.data.json" with { type: "json" };
import { lastScoredWeek, matchupPoints, standings, teamRefs, type SleeperLeagueSnapshot, type SleeperMatchupLike } from "./sleeper-adapter.ts";
import { gameWinProbability, scoringHistory, scoringModel } from "./season-simulator.ts";

export type MatchupStatus = "FINAL" | "LIVE" | "UPCOMING";

export interface MatchupPlayer {
  readonly id: string;
  readonly name: string;
  readonly position: string | null;
  readonly team: string | null;
  readonly points: number | null;
  readonly photo: string | null;
}

export interface MatchupSide {
  readonly rosterId: number;
  readonly teamName: string;
  readonly owners: string;
  readonly avatar: string | null;
  readonly score: number | null;
  readonly record: string | null;
  readonly starters: readonly MatchupPlayer[];
  readonly bench: readonly MatchupPlayer[];
}

/** Data preview: built from league results only (no external projections, no AI at runtime). */
export interface AutoPreview {
  readonly favoriteRosterId: number | null;
  readonly aWinPct: number;
  readonly bWinPct: number;
  /** One line for the card. */
  readonly summary: string;
  /** 2–3 sentences for the expanded detail. */
  readonly text: string;
}

/** A preview written ahead of the week (see README "Written matchup previews"). */
export interface WrittenPreview {
  readonly headline: string;
  readonly preview: string;
  readonly pickRosterId: number | null;
  readonly confidence: "lean" | "solid" | "lock" | null;
  readonly author: string;

  readonly lineupWatch: readonly string[];
  readonly predicted: readonly { readonly rosterId: number; readonly points: number }[];
  readonly tags: readonly string[];
}

export interface PreviewEpisode {
  readonly title: string;
  readonly intro: string;
  readonly author: string;
  readonly rankings: readonly { readonly rank: number; readonly team: string; readonly record: string; readonly pf: number; readonly last3: number | null; readonly streak?: string | null }[];
  readonly spotlight: readonly { readonly label: string; readonly text: string }[];
  readonly signoff: string | null;
}

export interface MatchupCard {
  readonly id: number;
  readonly a: MatchupSide;
  readonly b: MatchupSide;
  readonly status: MatchupStatus;
  readonly label: string | null;
  readonly h2hHref: string | null;
  readonly auto: AutoPreview | null;
  readonly written: WrittenPreview | null;
}

/** File format for written previews: `data/previews/<season>-week-<NN>.json` in each site repo. */
export interface WrittenPreviewFile {
  readonly season: number;
  readonly week: number;
  readonly writtenAt?: string;
  readonly author?: string;
  readonly title?: string;
  readonly intro?: string;
  readonly rankings?: PreviewEpisode["rankings"];
  readonly spotlight?: PreviewEpisode["spotlight"];
  readonly signoff?: string;
  readonly matchups: readonly {
    readonly rosterIds: readonly [number, number] | readonly number[];
    readonly headline: string;
    readonly preview: string;
    readonly pick?: { readonly rosterId: number; readonly confidence?: "lean" | "solid" | "lock" } | null;
    readonly lineupWatch?: readonly string[];
    readonly predicted?: readonly { readonly rosterId: number; readonly points: number }[];
    readonly tags?: readonly string[];
  }[];
}

/** The episode wrapper of a story-style preview file, or null for card-only files. */
export function previewEpisode(file: WrittenPreviewFile | null | undefined): PreviewEpisode | null {
  if (!file?.title || !file.intro) return null;
  return { title: file.title, intro: file.intro, author: file.author ?? "Commissioner's desk", rankings: file.rankings ?? [], spotlight: file.spotlight ?? [], signoff: file.signoff ?? null };
}

/** The written preview for a matchup, matched by its two Sleeper roster ids in either order. */
export function findWrittenPreview(file: WrittenPreviewFile | null | undefined, rosterA: number, rosterB: number): WrittenPreview | null {
  const entry = file?.matchups?.find((m) => m.rosterIds?.length === 2 && ((m.rosterIds[0] === rosterA && m.rosterIds[1] === rosterB) || (m.rosterIds[0] === rosterB && m.rosterIds[1] === rosterA)));
  if (!entry || !entry.headline || !entry.preview) return null;
  return { headline: entry.headline, preview: entry.preview, pickRosterId: entry.pick?.rosterId ?? null, confidence: entry.pick?.confidence ?? null, author: file?.author ?? "Commissioner's desk", lineupWatch: entry.lineupWatch ?? [], predicted: entry.predicted ?? [], tags: entry.tags ?? [] };
}

export interface MatchupCardOptions {

  readonly ownerLabel?: (rosterId: number, fallback: string) => string;
  readonly h2hHref?: (rosterA: number, rosterB: number) => string | null;
  /** League-owned team image (e.g. a franchise logo) instead of the Sleeper avatar. */
  readonly avatar?: (rosterId: number) => string | null;
  /** All-time series between the two sides, from the league's own history. */
  readonly series?: (rosterA: number, rosterB: number) => { readonly aWins: number; readonly bWins: number; readonly ties: number } | null;
  /** Better names for players missing from the shared list (retired players in past seasons). */
  readonly playerName?: (playerId: string) => { readonly name: string; readonly position?: string | null; readonly team?: string | null } | null;
  readonly written?: WrittenPreviewFile | null;
  /** Previews only make sense for the season in progress. */
  readonly previews?: boolean;
  readonly playoffWeekStart?: number | null;
  /** Records on the cards; off for past seasons, where Sleeper only has final records. */
  readonly showRecords?: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;
const pct = (p: number) => Math.round(p * 100);
const DEF = /^[A-Z]{2,3}$/;

function player(id: string, points: number | null, options: MatchupCardOptions): MatchupPlayer {
  const known = PLAYER_NAMES[id] ?? (archive as { players: Record<string, string> }).players[id];
  const [name, pos] = known ? known.split("|") : [null, null];
  const fallback = !known ? options.playerName?.(id) ?? null : null;
  const def = DEF.test(id);
  return {
    id,
    name: name ?? fallback?.name ?? (def ? `${id} defense` : `Player ${id}`),
    position: pos ?? fallback?.position ?? (def ? "DEF" : null),
    team: def ? id : PLAYER_TEAMS[id] ?? fallback?.team ?? null,
    points,
    photo: def ? `https://sleepercdn.com/images/team_logos/nfl/${id.toLowerCase()}.png` : /^\d+$/.test(id) ? `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg` : null,
  };
}

function lineup(row: SleeperMatchupLike & { starters?: readonly string[] | null; players?: readonly string[] | null; players_points?: Readonly<Record<string, number>> | null; starters_points?: readonly number[] | null }, scored: boolean, options: MatchupCardOptions) {
  const starters = (row.starters ?? []).filter((id) => id && id !== "0");
  const pts = (id: string, i?: number) => (!scored ? null : row.players_points?.[id] ?? (i !== undefined ? row.starters_points?.[i] ?? null : null));
  const starterSet = new Set(starters);
  return {
    starters: (row.starters ?? []).flatMap((id, i) => (id && id !== "0" ? [player(id, pts(id, i), options)] : [])),
    bench: (row.players ?? []).filter((id) => !starterSet.has(id)).map((id) => player(id, pts(id), options)).sort((x, y) => (y.points ?? 0) - (x.points ?? 0) || x.name.localeCompare(y.name)),
  };
}

/** Status of a week: final once Sleeper has scored it, live once points appear, otherwise upcoming. */
export function weekStatus(snapshot: SleeperLeagueSnapshot, week: number): MatchupStatus {
  if (week <= lastScoredWeek(snapshot.league)) return "FINAL";
  return (snapshot.matchupsByWeek[week] ?? []).some((row) => matchupPoints(row) > 0) ? "LIVE" : "UPCOMING";
}

export function buildMatchupCards(snapshot: SleeperLeagueSnapshot, week: number, options: MatchupCardOptions = {}): MatchupCard[] {
  const rows = snapshot.matchupsByWeek[week] ?? [];
  const refs = teamRefs(snapshot);
  const status = weekStatus(snapshot, week);
  const scored = status !== "UPCOMING";
  const table = standings(snapshot);
  const record = new Map(table.map((row) => [row.team.rosterId, `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`]));
  const settings = (snapshot.league.settings ?? {}) as Record<string, unknown>;
  const playoffStart = options.playoffWeekStart ?? (Number(settings.playoff_week_start) || 15);
  const through = Math.min(lastScoredWeek(snapshot.league), playoffStart - 1);
  const model = options.previews && status !== "FINAL" ? scoringModel(snapshot, through, table.map((r) => r.team.rosterId)) : null;
  const history = model ? scoringHistory(snapshot, through) : null;

  const groups = new Map<number, SleeperMatchupLike[]>();
  for (const row of rows) if (row.matchup_id) groups.set(row.matchup_id, [...(groups.get(row.matchup_id) ?? []), row]);
  return [...groups.entries()]
    .filter(([, pair]) => pair.length === 2 && refs.has(pair[0]!.roster_id) && refs.has(pair[1]!.roster_id))
    .sort(([x], [y]) => x - y)
    .map(([id, [ra, rb]]) => {
      const side = (row: SleeperMatchupLike): MatchupSide => {
        const ref = refs.get(row.roster_id)!;
        return { rosterId: row.roster_id, teamName: ref.teamName, owners: options.ownerLabel ? options.ownerLabel(row.roster_id, ref.managerName) : ref.managerName, avatar: options.avatar?.(row.roster_id) ?? ref.avatarUrl ?? null, score: scored ? round(matchupPoints(row)) : null, record: options.showRecords === false ? null : record.get(row.roster_id) ?? null, ...lineup(row as never, scored, options) };
      };
      const a = side(ra!), b = side(rb!);
      let auto: AutoPreview | null = null;
      if (model && history) {
        const pA = gameWinProbability(model.mu.get(a.rosterId) ?? model.leagueMean, model.mu.get(b.rosterId) ?? model.leagueMean, model.leagueSd);
        auto = autoPreview(a, b, pA, history, options.series?.(a.rosterId, b.rosterId) ?? null, status);
      }
      return {
        id, a, b, status,
        label: week >= playoffStart ? "Playoffs" : null,
        h2hHref: options.h2hHref?.(a.rosterId, b.rosterId) ?? null,
        auto,
        written: findWrittenPreview(options.written, a.rosterId, b.rosterId),
      };
    });
}

function autoPreview(a: MatchupSide, b: MatchupSide, pA: number, history: Map<number, number[]>, series: { aWins: number; bWins: number; ties: number } | null, status: MatchupStatus): AutoPreview {
  const aPct = pct(pA), bPct = 100 - aPct;
  const fav = aPct === bPct ? null : aPct > bPct ? a : b, dog = fav === a ? b : a;
  const favPct = Math.max(aPct, bPct);
  const last3 = (id: number) => { const s = history.get(id) ?? []; const r = s.slice(-3); return r.length ? r.reduce((t, x) => t + x, 0) / r.length : null; };
  const total = (id: number) => (history.get(id) ?? []).reduce((t, x) => t + x, 0);
  const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(1));
  const rec = (s: MatchupSide) => (s.record ? ` (${s.record})` : "");
  const lead = fav ? `${fav.teamName}${rec(fav)} is a ${favPct}% favorite over ${dog.teamName}${rec(dog)}.` : `${a.teamName}${rec(a)} and ${b.teamName}${rec(b)} grade out as a coin flip.`;
  const form = `Over the last three weeks ${a.teamName} averaged ${fmt(last3(a.rosterId))} and ${b.teamName} ${fmt(last3(b.rosterId))}; season points for are ${total(a.rosterId).toFixed(1)} to ${total(b.rosterId).toFixed(1)}.`;
  const games = series ? series.aWins + series.bWins + series.ties : 0;
  const seriesLine = !series || !games ? " This is their first meeting on record." : series.aWins === series.bWins ? ` The all-time series is tied ${series.aWins}–${series.bWins}${series.ties ? `–${series.ties}` : ""}.` : ` ${series.aWins > series.bWins ? a.teamName : b.teamName} leads the all-time series ${Math.max(series.aWins, series.bWins)}–${Math.min(series.aWins, series.bWins)}${series.ties ? `–${series.ties}` : ""}.`;
  const live = status === "LIVE" ? " (pregame odds; the game is under way)" : "";
  return {
    favoriteRosterId: fav?.rosterId ?? null,
    aWinPct: aPct,
    bWinPct: bPct,
    summary: fav ? `${fav.teamName} ${favPct}% to win${live}` : `Coin flip${live}`,
    text: `${lead} ${form}${seriesLine}`,
  };
}
