// A commissioner's own league: its history, owner pages, franchises, records and rivalries, built from its Sleeper
// seasons (the chain of league IDs the setup page saved). Same shapes as the files a full league site reads, so the
// shared History, Managers, Records and Rivalries pages work unchanged. Rebuilt at most every few hours.
import type { LeagueData, LeagueGame, LeagueTeam } from "./leagueData.ts";
import type { OwnLeague } from "./ownLeague.ts";
import { ownCurrentSeason, ownSeasonYears } from "./ownLeague.ts";

const SLEEPER = "https://api.sleeper.app/v1";
type Roster = { roster_id: number; owner_id: string | null; co_owners?: string[] | null; settings: Record<string, number> };
type User = { user_id: string; display_name: string; avatar?: string | null; metadata?: { team_name?: string } };
type Bracket = { r: number; m: number; t1: number | null; t2: number | null; w: number | null; l: number | null; p?: number };
type Season = { year: number; league: any; users: User[]; rosters: Roster[]; bracket: Bracket[]; matchups: Record<number, { roster_id: number; matchup_id: number | null; points: number }[]> };

const get = async <T,>(path: string, revalidate = 3600): Promise<T | null> => {
  try {
    const r = await fetch(`${SLEEPER}${path}`, { next: { revalidate } } as RequestInit);
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
};
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "owner";
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
const pts = (st: Record<string, number>, k: string) => (st[k] ?? 0) + (st[`${k}_decimal`] ?? 0) / 100;

async function loadSeason(year: number, id: string, complete: boolean): Promise<Season | null> {
  const [league, users, rosters, bracket] = await Promise.all([get<any>(`/league/${id}`), get<User[]>(`/league/${id}/users`), get<Roster[]>(`/league/${id}/rosters`), get<Bracket[]>(`/league/${id}/winners_bracket`)]);
  if (!league || !users || !rosters) return null;
  const last = complete ? 17 : Math.max(0, Number(league.settings?.last_scored_leg ?? league.settings?.leg ?? 0) - 0);
  const weeks = Array.from({ length: Math.min(last, 18) }, (_, i) => i + 1);
  const matchups: Season["matchups"] = {};
  await Promise.all(weeks.map(async (w) => { const m = await get<Season["matchups"][number]>(`/league/${id}/matchups/${w}`, complete ? 86400 : 600); if (m) matchups[w] = m; }));
  return { year, league, users, rosters, bracket: bracket ?? [], matchups };
}

/** Final place per roster: the winners bracket decides the top, everyone else by record then points. */
function finalPlaces(s: Season): Map<number, number> {
  const order = [...s.rosters].sort((a, b) => (b.settings.wins ?? 0) - (a.settings.wins ?? 0) || pts(b.settings, "fpts") - pts(a.settings, "fpts"));
  const place = new Map<number, number>();
  for (const m of s.bracket) {
    if (!m.w || !m.l) continue;
    if (m.p === 1) { place.set(m.w, 1); place.set(m.l, 2); }
    if (m.p === 3) { place.set(m.w, 3); place.set(m.l, 4); }
    if (m.p === 5) { place.set(m.w, 5); place.set(m.l, 6); }
  }
  const playoff = new Set(s.bracket.flatMap((m) => [m.t1, m.t2]).filter((x): x is number => typeof x === "number"));
  let next = place.size + 1;
  for (const r of order) if (playoff.has(r.roster_id) && !place.has(r.roster_id)) place.set(r.roster_id, next++);
  for (const r of order) if (!place.has(r.roster_id)) place.set(r.roster_id, next++);
  return place;
}

export async function buildOwnLeagueData(l: OwnLeague): Promise<LeagueData | null> {
  const years = ownSeasonYears(l);
  const current = ownCurrentSeason(l);
  const seasons = (await Promise.all(years.map(async (y) => {
    const id = l.seasons[String(y)]!;
    const league = await get<any>(`/league/${id}`);
    return league ? loadSeason(y, id, league.status === "complete") : null;
  }))).filter((s): s is Season => Boolean(s));
  if (!seasons.length) return null;
  const cur = seasons.find((s) => s.year === current) ?? seasons.at(-1)!;

  // People: one owner per Sleeper account; names from the setup page, else the Sleeper name.
  const nameOf = (uid: string, s?: Season) => l.owners?.[uid] || seasons.flatMap((x) => x.users).find((u) => u.user_id === uid)?.display_name || s?.users.find((u) => u.user_id === uid)?.display_name || "Owner";
  const photoOf = (uid: string) => { if (l.photos?.[uid]) return l.photos[uid]!; const u = [...seasons].reverse().flatMap((x) => x.users).find((x) => x.user_id === uid); return u?.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null; };
  const ownerSlug = new Map<string, string>();
  const used = new Set<string>();
  const oid = (uid: string) => {
    let s = ownerSlug.get(uid);
    if (!s) { const base = slug(nameOf(uid)); s = base; let i = 2; while (used.has(s)) s = `${base}-${i++}`; used.add(s); ownerSlug.set(uid, s); }
    return s;
  };
  const owners = new Map<string, { id: string; name: string; photo: string | null; active: boolean }>();
  const ownersOf = (r: Roster) => [r.owner_id, ...(r.co_owners ?? [])].filter((x): x is string => Boolean(x));
  for (const s of seasons) for (const r of s.rosters) for (const u of ownersOf(r)) { const id = oid(u); owners.set(id, { id, name: nameOf(u, s), photo: photoOf(u), active: false }); }
  for (const r of cur.rosters) for (const u of ownersOf(r)) owners.get(oid(u))!.active = true;

  // Franchises: a roster seat; its name is the latest team name, and its eras are who held it.
  const teamName = (s: Season, r: Roster) => s.users.find((u) => u.user_id === r.owner_id)?.metadata?.team_name || `Team ${nameOf(r.owner_id ?? "", s)}`;
  const curTeam = new Map(cur.rosters.map((r) => [r.roster_id, teamName(cur, r)]));
  const fid = (rid: number) => `${slug(curTeam.get(rid) ?? `team-${rid}`)}`;
  const holders = new Map<number, { year: number; owners: string[] }[]>();
  for (const s of seasons) for (const r of s.rosters) (holders.get(r.roster_id) ?? holders.set(r.roster_id, []).get(r.roster_id)!).push({ year: s.year, owners: ownersOf(r).map(oid) });

  // Results and games.
  type Result = { season: number; place: number; teamCount: number; ownerIds: string[]; franchiseId: string; teamName: string | null; champion: boolean; wins?: number; losses?: number; ties?: number; pointsFor?: number };
  const results: Result[] = [];
  const games: LeagueGame[] = [];
  const rgames: LeagueGame[] = [];
  const reg = (s: Season) => Math.max(1, Number(s.league.settings?.playoff_week_start ?? 15) - 1);
  for (const s of seasons) {
    const done = s.league.status === "complete";
    if (done) {
      const place = finalPlaces(s);
      for (const r of s.rosters) {
        const st = r.settings;
        results.push({ season: s.year, place: place.get(r.roster_id)!, teamCount: s.rosters.length, ownerIds: ownersOf(r).map(oid), franchiseId: fid(r.roster_id), teamName: teamName(s, r), champion: place.get(r.roster_id) === 1, wins: st.wins ?? 0, losses: st.losses ?? 0, ties: st.ties ?? 0, pointsFor: Math.round(pts(st, "fpts") * 100) / 100 });
      }
    }
    const stageOf = new Map<string, string>();
    for (const m of s.bracket) for (const t of [m.t1, m.t2]) if (typeof t === "number") stageOf.set(`${m.r}:${t}`, m.p === 1 ? "championship" : m.p ? "other" : "playoff");
    for (const [w, rows] of Object.entries(s.matchups)) {
      const week = Number(w);
      if (!done && week > Number(s.league.settings?.last_scored_leg ?? 0)) continue;
      const pairs = new Map<number, typeof rows>();
      for (const row of rows) if (row.matchup_id) (pairs.get(row.matchup_id) ?? pairs.set(row.matchup_id, []).get(row.matchup_id)!).push(row);
      for (const pair of pairs.values()) {
        if (pair.length !== 2) continue;
        const [a, b] = pair as [typeof rows[number], typeof rows[number]];
        const round = week - reg(s);
        const stage = week <= reg(s) ? "regular" : stageOf.get(`${round}:${a.roster_id}`) && stageOf.get(`${round}:${b.roster_id}`) ? stageOf.get(`${round}:${a.roster_id}`)! : "other";
        const ra = s.rosters.find((r) => r.roster_id === a.roster_id), rb = s.rosters.find((r) => r.roster_id === b.roster_id);
        if (!ra?.owner_id || !rb?.owner_id) continue;
        if (done) games.push({ season: s.year, week, sideA: fid(a.roster_id), sideB: fid(b.roster_id), scoreA: a.points, scoreB: b.points, stage });
        rgames.push({ season: s.year, week, sideA: oid(ra.owner_id), sideB: oid(rb.owner_id), scoreA: a.points, scoreB: b.points, stage });
      }
    }
  }

  const name = (o: string) => owners.get(o)?.name ?? o;
  const href = (o: string) => `/managers/owners/${o}`;
  const frHref = (f: string) => `/managers/franchise/${f}`;
  const series = (a: string, b: string) => {
    let w = 0, lo = 0, t = 0, pf = 0, pa = 0, po = 0;
    for (const g of rgames) {
      if (g.stage === "other") continue;
      const [x, y] = g.sideA === a && g.sideB === b ? [g.scoreA, g.scoreB] : g.sideA === b && g.sideB === a ? [g.scoreB, g.scoreA] : [null, null];
      if (x === null || y === null) continue;
      pf += x; pa += y; if (g.stage !== "regular") po++;
      if (x > y) w++; else if (y > x) lo++; else t++;
    }
    return { w, l: lo, t, pf: Math.round(pf * 100) / 100, pa: Math.round(pa * 100) / 100, po };
  };
  const first = years[0]!;
  const lastDone = Math.max(...results.map((r) => r.season), 0) || null;
  const champ = lastDone ? results.find((r) => r.season === lastDone && r.champion) : undefined;
  const curPlaceOrder = [...cur.rosters].sort((a, b) => (b.settings.wins ?? 0) - (a.settings.wins ?? 0) || pts(b.settings, "fpts") - pts(a.settings, "fpts"));
  const divNames = Object.fromEntries(Object.entries(cur.league.metadata ?? {}).filter(([k]) => /^division_\d+$/.test(k)).map(([k, v]) => [Number(k.split("_")[1]), String(v)]));

  const ownerPages: Record<string, unknown> = {};
  const dirOwners: unknown[] = [];
  for (const o of owners.values()) {
    const rs = results.filter((r) => r.ownerIds.includes(o.id)).sort((a, b) => a.season - b.season);
    const opps = [...owners.keys()].filter((b) => b !== o.id).map((b) => ({ b, ...series(o.id, b) })).filter((x) => x.w + x.l + x.t > 0)
      .map((x) => ({ name: name(x.b), photo: owners.get(x.b)?.photo ?? null, href: href(x.b), wins: x.w, losses: x.l, ties: x.t, pointsFor: x.pf, pointsAgainst: x.pa, playoffGames: x.po, rivalryHref: `/managers/owners/${o.id}/opponents/${x.b}` }))
      .sort((a, b) => (b.wins + b.losses + b.ties) - (a.wins + a.losses + a.ties) || Math.abs(a.wins - a.losses) - Math.abs(b.wins - b.losses));
    const top = opps[0];
    const W = rs.reduce((a, r) => a + (r.wins ?? 0), 0), L = rs.reduce((a, r) => a + (r.losses ?? 0), 0), T = rs.reduce((a, r) => a + (r.ties ?? 0), 0);
    const titles = rs.filter((r) => r.champion).length, pods = rs.filter((r) => r.place <= 3).length;
    const curRoster = cur.rosters.find((r) => ownersOf(r).map(oid).includes(o.id));
    const team = curRoster ? teamName(cur, curRoster) : rs.at(-1)?.teamName ?? null;
    const facts = curRoster ? [{ label: "Current team", value: teamName(cur, curRoster) }, ...(divNames[curRoster.settings.division ?? 0] ? [{ label: "Division", value: divNames[curRoster.settings.division!]! }] : []), { label: "League rank", value: ordinal(curPlaceOrder.indexOf(curRoster) + 1) }, { label: "Record", value: `${curRoster.settings.wins ?? 0}-${curRoster.settings.losses ?? 0}` }] : [];
    const franchiseIds = [...new Set(rs.map((r) => r.franchiseId))];
    ownerPages[o.id] = {
      leagueName: l.short,
      owner: { id: o.id, name: o.name, photo: o.photo, teamName: o.active ? team : null, badges: o.active ? [] : ["Former owner"], status: o.active ? "ACTIVE" : "FORMER", bio: null },
      backLink: { label: "Back to Managers", href: "/managers" },
      record: rs.length ? { wins: W, losses: L, ties: T, coverage: `Regular-season records from ${first} on (the league's Sleeper seasons).` } : null,
      success: { titles, podiums: pods, bestFinish: rs.length ? Math.min(...rs.map((r) => r.place)) : null, seasons: rs.length },
      scouting: null,
      rival: top ? { id: top.href.split("/").at(-1), name: top.name, photo: top.photo, href: top.href, rivalryHref: top.rivalryHref, wins: top.wins, losses: top.losses, ties: top.ties } : null,
      rivalryHubHref: "/league-info/rivalries", contact: null,
      legacy: franchiseIds.map((f) => ({ name: [...curTeam.entries()].find(([rid]) => fid(rid) === f)?.[1] ?? f, href: frHref(f), years: `${Math.min(...rs.filter((r) => r.franchiseId === f).map((r) => r.season))}–${o.active ? "Present" : Math.max(...rs.filter((r) => r.franchiseId === f).map((r) => r.season))}`, role: "Owner", current: o.active, ownershipHistory: [], highlights: [] })),
      snapshot: null,
      timeline: rs.length ? [{ season: String(rs[0]!.season), title: "Joined the league", detail: `${rs[0]!.teamName ?? ""} · Finished ${ordinal(rs[0]!.place)}`, tone: null }, ...rs.filter((r) => r.place <= 3).map((r) => ({ season: String(r.season), title: r.champion ? "League Champion" : r.place === 2 ? "Runner-up" : "Third place", detail: r.teamName, tone: r.champion ? "gold" : r.place === 2 ? "silver" : "bronze" }))] : [],
      seasons: [...rs].reverse().map((r) => ({ season: r.season, team: r.teamName, finish: r.place, teamCount: r.teamCount, record: `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`, pointsFor: r.pointsFor ?? null, note: null })),
      opponents: opps, opponentCoverage: `Head-to-head records from ${first} on, regular season and playoffs.`,
      currentSeason: curRoster ? { title: `${current} Current Season`, facts, note: `Points for: ${pts(curRoster.settings, "fpts").toFixed(2)}` } : null,
    };
    dirOwners.push({ id: o.id, name: o.name, photo: o.photo, href: href(o.id), teamName: o.active ? team : null, coOwner: null, titles, podiums: pods, seasons: rs.length,
      averageFinish: rs.length ? rs.reduce((a, r) => a + r.place, 0) / rs.length : null, toilets: rs.filter((r) => r.place === r.teamCount).length, active: o.active, tag: null, mode: null, group: null });
  }

  const franchisePages: Record<string, unknown> = {};
  const dirFranchises: unknown[] = [];
  for (const [rid, hs] of holders) {
    const f = fid(rid);
    const eras: { years: string; owners: string[] }[] = [];
    for (const h of hs.sort((a, b) => a.year - b.year)) {
      const last = eras.at(-1);
      if (last && last.owners.join() === h.owners.join()) last.years = `${last.years.split("–")[0]}–${h.year}`;
      else eras.push({ years: `${h.year}–${h.year}`, owners: h.owners });
    }
    if (eras.length) eras.at(-1)!.years = `${eras.at(-1)!.years.split("–")[0]}–present`;
    const rs = results.filter((r) => r.franchiseId === f).sort((a, b) => a.season - b.season);
    const nowOwners = eras.at(-1)?.owners ?? [];
    franchisePages[f] = { leagueName: l.short, name: curTeam.get(rid) ?? f, image: null, currentOwners: nowOwners.map((o) => ({ name: name(o), href: href(o) })), since: hs[0]?.year ?? first, until: null,
      eras: eras.map((e) => ({ years: e.years, note: null, owners: e.owners.map((o) => ({ name: name(o), href: href(o), photo: owners.get(o)?.photo ?? null })) })), notes: [], seasons: rs, recordLabel: `Regular-season W–L since ${first}`, backLink: { label: "Back to Franchises", href: "/managers?view=franchises" } };
    dirFranchises.push({ id: f, name: curTeam.get(rid) ?? f, image: null, href: frHref(f), owners: nowOwners.map((o) => ({ name: name(o), href: href(o) })), since: hs[0]?.year ?? first, ownershipChanges: Math.max(0, eras.length - 1), titles: rs.filter((r) => r.champion).length, record: rs.length ? `${rs.reduce((a, r) => a + (r.wins ?? 0), 0)}-${rs.reduce((a, r) => a + (r.losses ?? 0), 0)}` : null });
  }

  const typeName = { redraft: "redraft league", keeper: "keeper league", auction: "auction keeper league", dynasty: "dynasty league" }[l.type];
  const h2hByFranchise: Record<string, string> = {};
  for (const a of owners.keys()) for (const b of owners.keys()) if (a < b && series(a, b).w + series(a, b).l + series(a, b).t > 0) h2hByFranchise[`${a}|${b}`] = `/managers/owners/${a}/opponents/${b}`;
  const rosterOwner = new Map(cur.rosters.filter((r) => r.owner_id).map((r) => [r.roster_id, oid(r.owner_id!)]));
  const teams: LeagueTeam[] = cur.rosters.map((r) => ({ rosterId: r.roster_id, franchiseId: fid(r.roster_id), name: teamName(cur, r), ownerLabel: ownersOf(r).map((u) => nameOf(u, cur).split(" ")[0]).join(" · "), image: null }));
  const people = {
    overview: {
      title: `${l.name} at a glance`, description: "How the league is organized, what defines the current season, and where to find its records.",
      snapshot: [{ label: "League", value: l.name }, { label: "On Sleeper since", value: String(first) }, { label: "Teams", value: String(cur.rosters.length) }, { label: "Season", value: String(current) }],
      currentSeason: { paragraphs: [`${current} is the active season, played on Sleeper as a ${cur.rosters.length}-team ${typeName}.`], reigningChampion: champ ? { name: champ.ownerIds.map(name).join(" & "), season: champ.season, href: href(champ.ownerIds[0]!) } : null, links: [] },
      format: { title: "League Format", bullets: [`${cur.rosters.length}-team ${typeName}`, ...(l.keepers ? [`Up to ${l.keepers.max} keepers${l.keepers.raise != null ? ` (last price + $${l.keepers.raise})` : ""}`] : []), `${l.seeding.divisionWinners + l.seeding.recordSeeds + l.seeding.pointsSeeds}-team playoffs`], links: [] },
      history: { paragraphs: [`League history on Long Snap covers every Sleeper season since ${first}.`], link: { label: "Explore league history", href: "/history" } },
      story: { title: "Our Story", teaser: null, emptyText: "The commissioner hasn't written the league's story yet.", link: null },
    },
    directory: { owners: dirOwners, franchises: dirFranchises, staff: [] },
    ownerPages, franchisePages, franchiseRedirects: {}, ownerNames: Object.fromEntries([...owners.values()].map((o) => [o.id, o.name])),
    sides: [...owners.values()].map((o) => ({ id: o.id, name: o.name, photo: o.photo, href: href(o.id), active: o.active })), h2hByFranchise, rivalryGames: rgames,
    recordSides: { ...Object.fromEntries([...owners.values()].map((o) => [o.id, { name: o.name, href: href(o.id), photo: o.photo }])), ...Object.fromEntries(teams.map((t) => [t.franchiseId, { name: t.name ?? t.franchiseId, href: frHref(t.franchiseId), photo: null }])) },
  };
  const history = {
    results, owners: [...owners.values()],
    config: { leagueName: l.short, currentSeason: current, formatValue: `${cur.rosters.length}-team`, formatNote: typeName[0]!.toUpperCase() + typeName.slice(1), eras: [{ years: `${first}–Present`, text: "THE SLEEPER ERA" }],
      coverageNote: `History covers every Sleeper season since ${first}.`, annals: null, lore: null,
      exploreLinks: [{ label: "Rivalries", href: "/league-info/rivalries" }, { label: "Records", href: "/league-info/records" }, { label: "Managers", href: "/managers" }],
      activeFranchises: cur.rosters.map((r) => ({ franchiseId: fid(r.roster_id), name: teamName(cur, r), primaryOwnerId: r.owner_id ? oid(r.owner_id) : "", coOwnerIds: (r.co_owners ?? []).map(oid) })),
      methodologyNotes: ["Final places: the playoff bracket decides the top finishers; everyone else is ranked by record, then points for."], backLink: { label: "Back to League Info", href: "/league-info" }, trophyLeagueLabel: l.name, mergeConstantCoOwners: false },
  };
  return {
    season: current,
    leagueIdsBySeason: l.seasons as Record<string, string>,
    managerNames: Object.fromEntries(seasons.flatMap((s) => s.users).map((u) => [u.user_id, nameOf(u.user_id)])),
    teams, games, h2h: Object.fromEntries(cur.rosters.flatMap((a) => cur.rosters.filter((b) => a.roster_id < b.roster_id && rosterOwner.get(a.roster_id) && rosterOwner.get(b.roster_id)).map((b) => [`${a.roster_id}-${b.roster_id}`, `/managers/owners/${rosterOwner.get(a.roster_id)}/opponents/${rosterOwner.get(b.roster_id)}`]))),
    preview: () => null, recap: () => null,
    champion: champ ? { season: champ.season, teamName: champ.teamName ?? "", managerName: champ.ownerIds.map(name).join(" & "), image: null } : null,
    finances: { entryFee: null, teamCount: cur.rosters.length, weeklyHighPayout: null, payouts: {} },
    history: history as unknown as LeagueData["history"],
    people: people as unknown as LeagueData["people"],
    copy: { rivalrySideLabel: "owner", rivalryCoverage: `Head-to-head games are on record from ${first} on (the league's Sleeper seasons).`, recordsCoverage: [`Games come from the league's Sleeper seasons since ${first}.`, "Titles and finishes cover every completed season."], draftLine: "Every draft pick by pick.", draftTabs: l.type === "auction" ? "auction" : "dynasty" },
    regularSeasonWeeks: Number(cur.league.settings?.playoff_week_start ?? 15) - 1,
    birthdays: null,
    rules: { draftOrder: "standings", draftRuleText: "Draft order follows the league's Sleeper settings.", dynasty: l.type === "dynasty" },
  };
}

/** The season page (/history/<year>) for a commissioner's own league, from its built history. */
export function ownSeasonPage(d: LeagueData, season: number): unknown | null {
  const rs = (d.history.results as unknown as { season: number; place: number; ownerIds: string[]; teamName?: string | null; wins?: number; losses?: number; pointsFor?: number }[]).filter((r) => r.season === season).sort((a, b) => a.place - b.place);
  if (!rs.length) return null;
  const names = d.people.ownerNames;
  const person = (ids: readonly string[]) => ids.map((id) => ({ name: names[id] ?? id, href: `/managers/owners/${id}` }));
  const all = [...new Set((d.history.results as { season: number }[]).map((r) => r.season))];
  const top = [...rs].filter((r) => r.pointsFor != null).sort((a, b) => (b.pointsFor ?? 0) - (a.pointsFor ?? 0))[0];
  return {
    leagueName: d.history.config.leagueName, season, eraLabel: "The Sleeper Era", backLink: { label: "League history", href: "/history" },
    podium: [{ label: "Champion", people: person(rs[0]!.ownerIds) }, { label: "Runner-up", people: person(rs[1]?.ownerIds ?? []) }, { label: "Third place", people: person(rs[2]?.ownerIds ?? []) }, { label: "Last place", people: person(rs.at(-1)!.ownerIds) }],
    standings: rs.map((r) => ({ place: r.place, people: person(r.ownerIds), detail: `${r.teamName ?? ""}${r.wins != null ? ` · ${r.wins}-${r.losses} · ${(r.pointsFor ?? 0).toFixed(1)} PF` : ""}` })),
    awards: top ? [{ key: "pf", type: "points", label: `Most points (${(top.pointsFor ?? 0).toFixed(1)})`, people: person(top.ownerIds) }] : [],
    finance: null, notes: [],
    previousHref: all.includes(season - 1) ? `/history/${season - 1}` : null, nextHref: all.includes(season + 1) ? `/history/${season + 1}` : null,
  };
}
