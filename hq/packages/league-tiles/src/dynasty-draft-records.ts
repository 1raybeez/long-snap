
export interface RecordPickInput {
  readonly season: number;
  /** "rookie" drafts are the main scope; anything else (startup, veterans, keeper era) is reported separately. */
  readonly draftType: string;
  readonly eventLabel: string;
  readonly overall: number;
  readonly round: number | null;
  readonly pickInRound: number | null;
  readonly player: string;
  readonly position: string | null;
  readonly teamId: string;
  readonly teamName: string;
  readonly owner: string | null;
}

export interface RecordPickRef { readonly season: number; readonly label: string; readonly player: string; readonly position: string; readonly team: string; readonly owner: string | null }
export interface PositionBar { readonly position: string; readonly count: number }
export interface TeamProfile { readonly teamId: string; readonly team: string; readonly owner: string | null; readonly total: number; readonly byPosition: readonly PositionBar[]; readonly seasons: readonly number[] }
export interface Leader { readonly label: string; readonly count: number; readonly teams: readonly string[] }

export interface DynastyDraftRecords {
  readonly rookie: { readonly picks: number; readonly drafts: number; readonly firstSeason: number | null; readonly lastSeason: number | null; readonly byPosition: readonly PositionBar[] };
  readonly firstOverall: readonly RecordPickRef[];
  readonly earliestByPosition: readonly (RecordPickRef & { readonly overall: number })[];
  readonly leaders: readonly Leader[];
  readonly positionChart: { readonly all: readonly PositionBar[]; readonly rookie: readonly PositionBar[] };
  readonly profiles: readonly TeamProfile[];
  readonly otherDrafts: readonly { readonly label: string; readonly season: number; readonly picks: number; readonly byPosition: readonly PositionBar[] }[];
  readonly archive: { readonly picks: number; readonly drafts: number; readonly byPosition: readonly PositionBar[] };
}

const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB", "IDP"];
const posKey = (p: string | null) => {
  const x = (p ?? "").toUpperCase();
  return x === "DST" || x === "D/ST" ? "DEF" : x || "—";
};
const label = (p: RecordPickInput) => (p.round && p.pickInRound ? `${p.round}.${String(p.pickInRound).padStart(2, "0")}` : `#${p.overall}`);
const ref = (p: RecordPickInput, team: string): RecordPickRef => ({ season: p.season, label: label(p), player: p.player, position: posKey(p.position), team, owner: p.owner });

function countBy(picks: readonly RecordPickInput[]): PositionBar[] {
  const m = new Map<string, number>();
  for (const p of picks) m.set(posKey(p.position), (m.get(posKey(p.position)) ?? 0) + 1);
  return [...m.entries()].map(([position, count]) => ({ position, count })).sort((a, b) => b.count - a.count || POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position));
}
const eventKey = (p: RecordPickInput) => `${p.season}|${p.eventLabel}`;

export function buildDynastyDraftRecords(picks: readonly RecordPickInput[]): DynastyDraftRecords {
  const rookie = picks.filter((p) => p.draftType === "rookie");
  const other = picks.filter((p) => p.draftType !== "rookie");
  // Each franchise shows under its most recent name (identity carries across renames).
  const latest = new Map<string, RecordPickInput>();
  for (const p of picks) { const cur = latest.get(p.teamId); if (!cur || p.season > cur.season) latest.set(p.teamId, p); }
  const teamName = (id: string) => latest.get(id)?.teamName ?? id;
  const ownerOf = (id: string) => latest.get(id)?.owner ?? null;

  const rookieSeasons = [...new Set(rookie.map((p) => p.season))].sort((a, b) => a - b);
  const firstOverall = rookieSeasons.map((season) => rookie.filter((p) => p.season === season).sort((a, b) => a.overall - b.overall)[0]).filter(Boolean).map((p) => ref(p, p.teamName)).reverse();

  const earliestByPosition = POS_ORDER.flatMap((pos) => {
    const hits = rookie.filter((p) => posKey(p.position) === pos);
    if (!hits.length) return [];
    const best = [...hits].sort((a, b) => a.overall - b.overall || a.season - b.season)[0];
    return [{ ...ref(best, best.teamName), overall: best.overall }];
  });

  const byTeam = new Map<string, RecordPickInput[]>();
  for (const p of rookie) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
  const leader = (labelText: string, score: (mine: RecordPickInput[]) => number): Leader | null => {
    const rows = [...byTeam.entries()].map(([id, mine]) => ({ id, n: score(mine) }));
    const max = Math.max(0, ...rows.map((r) => r.n));
    return max ? { label: labelText, count: max, teams: rows.filter((r) => r.n === max).map((r) => teamName(r.id)) } : null;
  };
  const leaders = [
    leader("Most rookie picks", (m) => m.length),
    leader("Most first-round picks", (m) => m.filter((p) => p.round === 1).length),
    ...["QB", "RB", "WR", "TE"].map((pos) => leader(`Most ${pos}s drafted`, (m) => m.filter((p) => posKey(p.position) === pos).length)),
  ].filter((x): x is Leader => Boolean(x));

  const profiles = [...byTeam.entries()].map(([teamId, mine]) => ({
    teamId, team: teamName(teamId), owner: ownerOf(teamId), total: mine.length, byPosition: countBy(mine), seasons: [...new Set(mine.map((p) => p.season))].sort((a, b) => a - b),
  })).sort((a, b) => b.total - a.total || a.team.localeCompare(b.team));

  const otherEvents = [...new Set(other.map(eventKey))].map((key) => {
    const mine = other.filter((p) => eventKey(p) === key);
    return { label: mine[0].eventLabel, season: mine[0].season, picks: mine.length, byPosition: countBy(mine) };
  }).sort((a, b) => a.season - b.season);

  return {
    rookie: { picks: rookie.length, drafts: new Set(rookie.map(eventKey)).size, firstSeason: rookieSeasons[0] ?? null, lastSeason: rookieSeasons[rookieSeasons.length - 1] ?? null, byPosition: countBy(rookie) },
    firstOverall,
    earliestByPosition,
    leaders,
    positionChart: { all: countBy(picks), rookie: countBy(rookie) },
    profiles,
    otherDrafts: otherEvents,
    archive: { picks: picks.length, drafts: new Set(picks.map(eventKey)).size, byPosition: countBy(picks) },
  };
}
