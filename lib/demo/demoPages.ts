// Long Snap demo: the page models a league's own site would hand the platform (Fees & Payouts, the Draft page,
// season pages, resources), built from the made-up leagues' files with the shared kit's builders.
import { readFileSync } from "node:fs";
import path from "node:path";
import { auctionRecords } from "../../hq/packages/league-tiles/src/auction-records.ts";
import { sleeperDraftToBoard } from "../../hq/packages/league-tiles/src/draft-board-data.ts";
import { buildDynastyDraftRecords } from "../../hq/packages/league-tiles/src/dynasty-draft-records.ts";
import { letterFor, } from "../../hq/packages/league-tiles/src/draft-grades.ts";
import { lockedView, type GradeView, type SeasonGrades } from "../../hq/packages/league-tiles/src/draft-grade-views.ts";
import type { PayoutsModel, WeeklyHighScore, PayoutSeason } from "../../hq/packages/league-tiles/src/payouts.ts";
import type { SeasonPageModel } from "../../hq/packages/league-tiles/src/season-view.tsx";
import { DEMO_LEAGUES, DEMO_SEASONS, demoKeyForSlug, type DemoKey } from "./demoLeagues.ts";
import { players, season } from "./fakeSleeper.ts";

const DIR = path.join(process.cwd(), "data", "demo");
const json = (key: DemoKey, file: string) => JSON.parse(readFileSync(path.join(DIR, key, file), "utf8"));
const owners = (): Record<string, string> => JSON.parse(readFileSync(path.join(DIR, "owners.json"), "utf8")).owners;
const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`; };
const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const CURRENT = 2026;
const REG = 14;

type Season = any;
const teamsOf = (d: Season) => {
  const names = owners();
  return new Map<number, { id: string; name: string; owner: string; userId: string }>(d.rosters.map((r: any) => {
    const u = d.users.find((x: any) => x.user_id === r.owner_id);
    const co = (r.co_owners ?? []).map((c: string) => names[c]?.split(" ")[0]).filter(Boolean);
    return [r.roster_id, { id: `r${r.roster_id}`, name: u?.metadata?.team_name ?? `Team ${r.roster_id}`, owner: [names[r.owner_id] ?? u?.display_name, ...co].join(" & "), userId: r.owner_id }];
  }));
};
const lastWeek = (d: Season) => (d.league.status === "complete" ? 17 : d.league.settings.last_scored_leg);

function weeklyHighs(d: Season, prizeCents: number, settled: boolean): WeeklyHighScore[] {
  const t = teamsOf(d);
  const out: WeeklyHighScore[] = [];
  for (let w = 1; w <= Math.min(lastWeek(d), REG); w++) {
    const rows = (d.matchups[String(w)] ?? []) as { roster_id: number; points: number }[];
    if (!rows.length) continue;
    const top = Math.max(...rows.map((r) => r.points));
    const win = rows.filter((r) => r.points === top);
    out.push({ week: w, rosterIds: win.map((r) => r.roster_id), teamNames: win.map((r) => t.get(r.roster_id)!.name), owners: win.map((r) => t.get(r.roster_id)!.owner), score: top, prizeCents, status: settled || w < Math.min(lastWeek(d), REG) ? "PAID" : "APPROVED" });
  }
  return out;
}

function finalPlaces(key: DemoKey, s: number): Map<string, number> {
  const h = json(key, "site/history.json");
  return new Map(h.results.filter((r: any) => r.season === s).map((r: any) => [r.franchiseId, r.place]));
}

function payouts(key: DemoKey): { model: PayoutsModel; defaultSeason: string } {
  const lg = json(key, "site/league.json");
  const f = lg.finances;
  const fr = json(key, "site/people.json").franchisePages;
  const p = f.payouts;
  const weeklyCents = f.weeklyHighPayout * 100;
  const pool = f.entryFee * 100 * 12;
  const divisions = Boolean(p.divisionWinner);
  const allocation = [
    { label: "Champion", amountCents: p.championBase * 100 },
    { label: "Runner-up", amountCents: p.runnerUp * 100 },
    { label: "Third place", amountCents: p.thirdPlace * 100 },
    ...(divisions ? [{ label: "Division winners (3)", amountCents: p.divisionWinner * 300, note: `$${p.divisionWinner} each` }] : []),
    { label: `Weekly high score (${REG} weeks)`, amountCents: weeklyCents * REG, note: `$${f.weeklyHighPayout} a week` },
  ];
  const cur = season(key, CURRENT);
  const highs = weeklyHighs(cur, weeklyCents, false);
  const t = teamsOf(cur);
  const earnings = [...t.entries()].map(([rid, team]) => {
    const weeks = highs.filter((h) => h.rosterIds?.includes(rid)).map((h) => h.week);
    return { key: team.id, teamName: team.name, owners: team.owner, weeks, earnedCents: weeks.length * weeklyCents, settledCents: Math.max(0, weeks.length - (weeks.includes(highs.at(-1)?.week ?? -1) ? 1 : 0)) * weeklyCents, owedCents: 0, pendingCents: weeks.includes(highs.at(-1)?.week ?? -1) ? weeklyCents : 0 };
  }).sort((a, b) => b.earnedCents - a.earnedCents || a.teamName.localeCompare(b.teamName));
  const seasons: PayoutSeason[] = DEMO_SEASONS.filter((s) => s < CURRENT).reverse().map((s) => {
    const d = season(key, s);
    const places = finalPlaces(key, s);
    const who = (place: number) => { const fid = [...places.entries()].find(([, pl]) => pl === place)?.[0]; return fid ? `${fr[fid]?.name} (${fr[fid]?.currentOwners.map((o: any) => o.name).join(" & ")})` : "—"; };
    const wk = weeklyHighs(d, weeklyCents, true);
    return {
      season: s, statusLabel: "Paid out",
      cards: [{ label: "Prize pool", value: money(pool) }, { label: "Champion", value: who(1) }, { label: "Weekly winners", value: `${new Set(wk.flatMap((w) => w.teamNames)).size} teams` }],
      awards: [{ label: `Champion · ${who(1)}`, amountCents: p.championBase * 100 }, { label: `Runner-up · ${who(2)}`, amountCents: p.runnerUp * 100 }, { label: `Third place · ${who(3)}`, amountCents: p.thirdPlace * 100 }],
      weeklyCount: wk.length, weeklyTotalCents: wk.length * weeklyCents, expenses: [], note: null,
    };
  });
  const model: PayoutsModel = {
    leagueName: DEMO_LEAGUES[key].name,
    current: {
      season: CURRENT, statusLabel: "Season in progress", duesCents: f.entryFee * 100, ownerCount: 12, poolCents: pool, paidCount: 12, owedCount: 0, paidNote: "All 12 teams paid before the draft",
      allocation, championAllocationCents: p.championBase * 100, ringCostCents: null, projectedChampionCashCents: p.championBase * 100, awards: [],
      fundLocations: [{ label: "League payment app", note: "the commissioner holds it" }], feeNotes: ["Dues are due before the draft (Constitution 2.1)."],
    },
    weeklyHighs: highs, earnings,
    overall: [{ label: "Seasons on record", value: String(DEMO_SEASONS.length) }, { label: "Paid out since 2022", value: money(seasons.reduce((s, x) => s + x.awards.reduce((a, b) => a + b.amountCents, 0) + x.weeklyTotalCents, 0)) }, { label: "Dues per team", value: money(f.entryFee * 100) }],
    seasons, coverage: ["Payout records begin with the 2022 Sleeper season.", "This is a made-up demo league: no real money."], constitutionHref: "/league-info/constitution",
  };
  return { model: JSON.parse(JSON.stringify(model)), defaultSeason: String(CURRENT - 1) };
}

/** Points each drafted player scored for the team that drafted him, that season. */
function pointsByPick(d: Season): Map<string, number> {
  const out = new Map<string, number>();
  for (let w = 1; w <= 17; w++) for (const row of (d.matchups[String(w)] ?? []) as { roster_id: number; starters?: string[]; players_points?: Record<string, number> }[]) {
    for (const pid of row.starters ?? []) { const k = `${row.roster_id}:${pid}`; out.set(k, (out.get(k) ?? 0) + (row.players_points?.[pid] ?? 0)); }
  }
  return out;
}

function afterSeasonView(key: DemoKey, s: number, auction: boolean): GradeView {
  const d = season(key, s);
  if (d.league.status !== "complete") return lockedView("after-season", `Unlocks when the ${s} season ends.`);
  const t = teamsOf(d);
  const pts = pointsByPick(d);
  const P = players();
  const picks = d.draft.picks.filter((p: any) => !p.is_keeper).map((p: any) => {
    const points = pts.get(`${p.roster_id}:${p.player_id}`) ?? 0;
    const price = Number(p.metadata?.amount ?? 0);
    const expected = auction ? price * 4.5 : Math.max(0, 260 - p.pick_no * 1.6);
    return { rid: p.roster_id, name: P[p.player_id] ? `${P[p.player_id]![0]} ${P[p.player_id]![1]}` : p.player_id, label: auction ? `$${price} · ${p.metadata?.position}` : `Pick ${p.round}.${String(((p.pick_no - 1) % 12) + 1).padStart(2, "0")} · ${p.metadata?.position}`, points, delta: Math.round(points - expected) };
  });
  const byTeam = [...t.keys()].map((rid) => {
    const mine = picks.filter((p: any) => p.rid === rid);
    const total = mine.reduce((a: number, p: any) => a + p.points, 0);
    const best = [...mine].sort((a: any, b: any) => b.points - a.points)[0];
    return { rid, total, value: mine.reduce((a: number, p: any) => a + p.delta, 0), best };
  });
  const mean = byTeam.reduce((a, b) => a + b.total, 0) / byTeam.length;
  const sd = Math.sqrt(byTeam.reduce((a, b) => a + (b.total - mean) ** 2, 0) / byTeam.length) || 1;
  const ranked = [...byTeam].sort((a, b) => b.total - a.total);
  const valueRank = [...byTeam].sort((a, b) => b.value - a.value);
  const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
  const sorted = [...picks].sort((a: any, b: any) => b.delta - a.delta);
  return {
    id: "after-season", status: "ready", note: `What each team's ${s} draft actually scored in starting lineups that season.`,
    columns: ["Starter points", auction ? "Points per dollar rank" : "Value vs. slot rank", "Best pick"],
    rows: ranked.map((r, i) => ({ teamId: t.get(r.rid)!.id, team: t.get(r.rid)!.name, owner: t.get(r.rid)!.owner, rank: i + 1, grade: letterFor((r.total - mean) / sd), cols: [r.total.toFixed(1), `#${valueRank.indexOf(r) + 1}`, r.best ? `${r.best.name} · ${r.best.points.toFixed(1)}` : "—"], href: null })),
    steals: sorted.slice(0, 5).map((p: any) => ({ player: p.name, detail: p.label, team: t.get(p.rid)!.name, value: sign(p.delta) })),
    reaches: sorted.slice(-5).reverse().map((p: any) => ({ player: p.name, detail: p.label, team: t.get(p.rid)!.name, value: sign(p.delta) })),
    stealTitle: "Biggest steals", reachTitle: "Biggest reaches",
    method: auction ? "Starter points from every non-keeper buy, compared with what that price usually returns (about 4.5 points per dollar)." : "Starter points from every pick, compared with what that draft slot usually returns.",
  };
}

function drafts(key: DemoKey) {
  const auction = key === "auction";
  const names = owners();
  const boards = DEMO_SEASONS.slice().reverse().map((s) => {
    const d = season(key, s);
    const { teams } = sleeperDraftToBoard({ picks: d.draft.picks, users: d.users, draft: d.draft, names });
    return { id: `${s}`, season: s, label: `${s} ${auction ? "Auction" : key === "dynasty" && s > 2022 ? "Rookie Draft" : key === "dynasty" ? "Startup Draft" : "Draft"}`, teams };
  });
  const grades: SeasonGrades[] = DEMO_SEASONS.slice().reverse().map((s) => ({
    season: s, title: `${s} ${auction ? "Auction" : "Draft"} Grades`,
    views: [lockedView("draft-day", "Draft-day market grades come from FantasyCalc in your own league."), afterSeasonView(key, s, auction), lockedView("today", "Today's grades come from FantasyCalc in your own league.")],
    recap: null,
  }));
  let records: unknown;
  if (auction) {
    records = auctionRecords(DEMO_SEASONS.map((s) => {
      const d = season(key, s);
      const pts = pointsByPick(d);
      return { season: s, budget: 200, picks: d.draft.picks, owners: names, points: d.league.status === "complete" ? new Map(d.draft.picks.map((p: any) => [p.player_id, pts.get(`${p.roster_id}:${p.player_id}`) ?? 0])) : null };
    }));
  } else {
    records = buildDynastyDraftRecords(DEMO_SEASONS.flatMap((s) => {
      const d = season(key, s);
      const t = teamsOf(d);
      return d.draft.picks.map((p: any) => ({ season: s, draftType: key === "dynasty" && s > 2022 ? "rookie" : key === "dynasty" ? "startup" : "rookie", eventLabel: `${s} Draft`, overall: p.pick_no, round: p.round, pickInRound: ((p.pick_no - 1) % 12) + 1,
        player: `${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim(), position: p.metadata?.position ?? null, teamId: t.get(p.roster_id)!.id, teamName: t.get(p.roster_id)!.name, owner: t.get(p.roster_id)!.owner }));
    }));
  }
  let future: { rounds: number; picks: unknown[] } | undefined;
  if (key === "dynasty") {
    const d = season(key, CURRENT);
    const t = teamsOf(d);
    const traded = new Map<string, number>((d.traded_picks ?? []).map((tp: any) => [`${tp.season}:${tp.round}:${tp.roster_id}`, tp.owner_id]));
    const picks = [];
    for (const yr of [2027, 2028, 2029]) for (let rd = 1; rd <= 4; rd++) for (const [rid, team] of t) {
      const now = traded.get(`${yr}:${rd}:${rid}`) ?? rid;
      const holder = t.get(now)!;
      picks.push({ id: `${yr}-${rd}-${rid}`, season: yr, round: rd, originalTeamId: team.id, originalManager: team.owner, originalTeam: team.name, currentTeamId: holder.id, currentManager: holder.owner, currentTeam: holder.name, order: now });
    }
    future = { rounds: 4, picks };
  }
  const model = { grades, featured: null, boards, boardMode: auction ? "auction" : "rookie", resources: resources(key), future, records, privateReportHref: null };
  return JSON.parse(JSON.stringify(model));
}

function resources(key: DemoKey) {
  return {
    groups: [
      { id: "research", label: "Draft research", resources: [
        { id: "fantasycalc", name: "FantasyCalc", description: "Trade values and rankings built from real trades.", url: "https://www.fantasycalc.com", type: "free" },
        { id: "sleeper", name: "Sleeper", description: "Where the league plays: rosters, waivers and the draft room.", url: "https://sleeper.com", type: "free" },
      ] },
      { id: "rules", label: "League rules", resources: [
        { id: "constitution", name: "Rules of Play", description: "The league constitution, updated automatically when owners pass a change.", url: "/league-info/constitution", type: "free" },
      ] },
    ],
    leagueLinks: [{ name: `${DEMO_LEAGUES[key].name} on Sleeper`, description: "In your own league this opens your real Sleeper league.", url: "https://sleeper.com" }],
  };
}

function seasonPage(key: DemoKey, s: number): SeasonPageModel | null {
  const h = json(key, "site/history.json");
  const people = json(key, "site/people.json");
  const rs = h.results.filter((r: any) => r.season === s).sort((a: any, b: any) => a.place - b.place);
  if (!rs.length) return null;
  const person = (ids: string[]) => ids.map((id) => ({ name: people.ownerNames[id] ?? id, href: `/managers/owners/${id}` }));
  const fr = people.franchisePages;
  const seasons = [...new Set(h.results.map((r: any) => r.season))] as number[];
  const lg = json(key, "site/league.json").finances;
  const era = (h.config.eras as { years: string; text: string }[]).find((e) => { const [a, b] = e.years.split("–"); return s >= Number(a) && (b === "Present" || s <= Number(b)); });
  const sleeper = s >= 2022;
  return {
    leagueName: h.config.leagueName, season: s, eraLabel: era ? era.text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : null,
    backLink: { label: "League history", href: "/history" },
    podium: [{ label: "Champion", people: person(rs[0].ownerIds) }, { label: "Runner-up", people: person(rs[1].ownerIds) }, { label: "Third place", people: person(rs[2].ownerIds) }, { label: "Last place", people: person(rs.at(-1).ownerIds) }],
    standings: rs.map((r: any) => ({ place: r.place, people: person(r.ownerIds), detail: `${fr[r.franchiseId]?.name ?? ""}${r.wins != null ? ` · ${r.wins}-${r.losses} · ${r.pointsFor.toFixed(1)} PF` : ""}` })),
    awards: sleeper ? (() => {
      const top = [...rs].filter((r: any) => r.pointsFor != null).sort((a: any, b: any) => b.pointsFor - a.pointsFor)[0];
      return top ? [{ key: "pf", type: "points", label: `Most points (${top.pointsFor.toFixed(1)})`, people: person(top.ownerIds) }] : [];
    })() : [],
    finance: sleeper ? (() => {
      const won = new Map<string, number>();
      const add = (ids: string[], dollars: number) => { for (const id of ids) won.set(id, (won.get(id) ?? 0) + dollars / ids.length); };
      add(rs[0].ownerIds, lg.payouts.championBase); add(rs[1].ownerIds, lg.payouts.runnerUp); add(rs[2].ownerIds, lg.payouts.thirdPlace);
      const fidOf = new Map<number, string>(json(key, "site/league.json").teams.map((t: any) => [t.rosterId, t.franchiseId]));
      if (s < CURRENT) for (const w of weeklyHighs(season(key, s), lg.weeklyHighPayout * 100, true)) for (const rid of w.rosterIds ?? []) { const r = rs.find((x: any) => x.franchiseId === fidOf.get(rid)); if (r) add(r.ownerIds, lg.weeklyHighPayout); }
      const managers = [...won.entries()].sort((a, b) => b[1] - a[1]).map(([id, d]) => ({ person: { name: people.ownerNames[id] ?? id, href: `/managers/owners/${id}` }, payouts: `$${Math.round(d)}`, net: `${d - lg.entryFee >= 0 ? "+" : "−"}$${Math.abs(Math.round(d - lg.entryFee))}` }));
      return { facts: [{ label: "Dues", value: `$${lg.entryFee} a team` }, { label: "Prize pool", value: `$${(lg.entryFee * 12).toLocaleString()}` }, { label: "Champion's prize", value: `$${lg.payouts.championBase}` }], managers };
    })() : null,
    notes: sleeper ? [] : ["Final standings only: game-by-game records begin with the 2022 Sleeper season."],
    previousHref: seasons.includes(s - 1) ? `/history/${s - 1}` : null, nextHref: seasons.includes(s + 1) ? `/history/${s + 1}` : null,
  };
}

/** Same contract as sitePage(): the model for a view, or null when the page doesn't exist. */
export function demoSitePage<T>(slug: string, view: string, params: Record<string, string | number> = {}): T | null {
  const key = demoKeyForSlug(slug);
  if (!key) return null;
  switch (view) {
    case "payouts": return payouts(key) as T;
    case "drafts": return drafts(key) as T;
    case "resources": return resources(key) as T;
    case "season": return seasonPage(key, Number(params.season)) as T | null;
    default: return null;
  }
}
