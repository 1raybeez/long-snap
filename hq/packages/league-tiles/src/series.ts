

export type SeriesBasis = "owner" | "franchise";

export const SERIES_BASIS: Readonly<Record<string, SeriesBasis>> = {
  "river-city-ffl": "owner",
  "long-country-club": "franchise",
  "rva-eskimo-brothers": "franchise",
};

/** One game between two units (a co-owned side lists every owner). */
export interface SeriesGame {
  readonly season: number;
  readonly week: number | null;
  readonly sideA: readonly string[];
  readonly sideB: readonly string[];
  readonly scoreA: number;
  readonly scoreB: number;
}

export interface SeriesRecord {
  readonly aWins: number;
  readonly bWins: number;
  readonly ties: number;
  readonly meetings: number;
  readonly last: { readonly season: number; readonly week: number | null; readonly winner: "a" | "b" | "tie" } | null;
}

/** The record of unit `a` against unit `b`. */
export function seriesBetween(games: readonly SeriesGame[], a: string, b: string): SeriesRecord {
  let aWins = 0;
  let bWins = 0;
  let ties = 0;
  let last: SeriesRecord["last"] = null;
  for (const g of games) {
    let x: number | null = null;
    let y: number | null = null;
    if (g.sideA.includes(a) && g.sideB.includes(b)) { x = g.scoreA; y = g.scoreB; }
    else if (g.sideA.includes(b) && g.sideB.includes(a)) { x = g.scoreB; y = g.scoreA; }
    if (x === null || y === null) continue;
    const winner = x > y ? "a" : y > x ? "b" : "tie";
    if (winner === "a") aWins += 1; else if (winner === "b") bWins += 1; else ties += 1;
    if (!last || g.season > last.season || (g.season === last.season && (g.week ?? 0) > (last.week ?? 0))) last = { season: g.season, week: g.week, winner };
  }
  return { aWins, bWins, ties, meetings: aWins + bWins + ties, last };
}

/** The best record between two sides made of several units (a co-owned team): the pair with the most meetings. */
export function seriesBetweenSides(games: readonly SeriesGame[], sideA: readonly string[], sideB: readonly string[]): (SeriesRecord & { readonly unitA: string; readonly unitB: string }) | null {
  let best: (SeriesRecord & { unitA: string; unitB: string }) | null = null;
  for (const a of sideA) for (const b of sideB) {
    const r = seriesBetween(games, a, b);
    if (!best || r.meetings > best.meetings) best = { ...r, unitA: a, unitB: b };
  }
  return best;
}

/** "leads 5–2", "trails 2–5", "tied 3–3" (+ "–1" ties), from `a`'s side. */
export function seriesText(r: SeriesRecord): string {
  if (!r.meetings) return "first meeting";
  const t = r.ties ? `–${r.ties}` : "";
  if (r.aWins > r.bWins) return `leads ${r.aWins}–${r.bWins}${t}`;
  if (r.bWins > r.aWins) return `trails ${r.aWins}–${r.bWins}${t}`;
  return `tied ${r.aWins}–${r.bWins}${t}`;
}

// ---- Building the games from a league's export (apps/platform/lib/generated/<league>-export.json) ----

type ExportGame = { season: number; week: number | null; sideA: string; sideB: string; scoreA: number; scoreB: number; stage: string };
type FranchisePage = { seasons?: { season: number; ownerIds?: string[] }[] };
export interface LeagueExportLike {
  readonly league: { readonly season: number; readonly teams: readonly { rosterId: number; franchiseId: string }[] };
  readonly games: readonly ExportGame[];
  readonly people?: { readonly rivalryGames?: readonly ExportGame[]; readonly franchisePages?: Readonly<Record<string, FranchisePage>> };
}

const counts = (stage: string) => stage !== "other";

function ownerFranchiseBySeason(pages: Readonly<Record<string, FranchisePage>>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [fid, page] of Object.entries(pages)) for (const s of page.seasons ?? []) for (const o of s.ownerIds ?? []) map.set(`${s.season}|${o}`, fid);
  return map;
}

/** Finished seasons' games in the league's counting unit. This season's games come from Sleeper (currentSeasonGames). */
export function historySeriesGames(leagueId: string, data: LeagueExportLike): SeriesGame[] {
  const basis = SERIES_BASIS[leagueId] ?? "franchise";
  const current = data.league.season;
  if (basis === "owner") {
    const rows = data.people?.rivalryGames ?? data.games;
    // A co-owned side is written "owner-a+owner-b": its game counts for each owner.
    return rows.filter((g) => g.season < current && counts(g.stage)).map((g) => ({ season: g.season, week: g.week, sideA: g.sideA.split("+"), sideB: g.sideB.split("+"), scoreA: g.scoreA, scoreB: g.scoreB }));
  }
  const pages = data.people?.franchisePages ?? {};
  const byOwner = ownerFranchiseBySeason(pages);
  const franchiseIds = new Set(Object.keys(pages));
  const unit = (season: number, side: string) => (franchiseIds.has(side) ? side : byOwner.get(`${season}|${side}`) ?? side);
  return data.games.filter((g) => g.season < current && counts(g.stage)).map((g) => ({ season: g.season, week: g.week, sideA: [unit(g.season, g.sideA)], sideB: [unit(g.season, g.sideB)], scoreA: g.scoreA, scoreB: g.scoreB }));
}

/** This season's units for each Sleeper roster: its owners (owner basis) or its franchise (franchise basis). */
export function rosterUnits(leagueId: string, data: LeagueExportLike): Map<number, string[]> {
  const basis = SERIES_BASIS[leagueId] ?? "franchise";
  const pages = data.people?.franchisePages ?? {};
  const out = new Map<number, string[]>();
  for (const t of data.league.teams) {
    const page = pages[t.franchiseId];
    const latestOwners = page?.seasons?.length ? [...page.seasons].sort((a, b) => b.season - a.season)[0]!.ownerIds ?? [] : [];
    if (basis === "owner") { out.set(t.rosterId, latestOwners.length ? latestOwners : [t.franchiseId]); continue; }
    if (page) { out.set(t.rosterId, [t.franchiseId]); continue; }

    const fid = Object.entries(pages).find(([, p]) => { const last = [...(p.seasons ?? [])].sort((a, b) => b.season - a.season)[0]; return last?.ownerIds?.includes(t.franchiseId); })?.[0];
    out.set(t.rosterId, [fid ?? t.franchiseId]);
  }
  return out;
}

/** This season's finished regular-season games from Sleeper matchups (`weeks`: week → that week's matchup rows). */
export function currentSeasonGames(season: number, weeks: Readonly<Record<number, readonly { roster_id: number; matchup_id?: number | null; points?: number | null; custom_points?: number | null }[]>>, units: Map<number, string[]>): SeriesGame[] {
  const games: SeriesGame[] = [];
  for (const [w, rows] of Object.entries(weeks)) {
    const byMatch = new Map<number, { roster_id: number; points?: number | null; custom_points?: number | null }[]>();
    for (const r of rows) if (r.matchup_id) byMatch.set(r.matchup_id, [...(byMatch.get(r.matchup_id) ?? []), r]);
    for (const pair of byMatch.values()) {
      if (pair.length !== 2) continue;
      const [x, y] = pair as [{ roster_id: number; points?: number | null; custom_points?: number | null }, { roster_id: number; points?: number | null; custom_points?: number | null }];
      const a = units.get(x.roster_id);
      const b = units.get(y.roster_id);
      if (!a || !b) continue;
      games.push({ season, week: Number(w), sideA: a, sideB: b, scoreA: Number(x.custom_points ?? x.points ?? 0), scoreB: Number(y.custom_points ?? y.points ?? 0) }); // a commissioner's score override wins, as on Sleeper
    }
  }
  return games;
}
