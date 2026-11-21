
import { BARGAIN_MIN, hasKeeperValues, keeperChangeLine, keeperOutlook, keeperSurplus, keeperTradeCheck, type KeeperTradeCheck } from "./trade-keepers.ts";

export interface TradeLeagueConfig {
  readonly leagueName: string;
  readonly format: "auction-keeper" | "dynasty" | "redraft";
  /** Starting slots, e.g. ["QB","RB","WR","WR","TE","FLEX","K","DEF"]. */
  readonly slots: readonly string[];
  /** Which positions each flex slot accepts. */
  readonly flex: Readonly<Record<string, readonly string[]>>;
  /** Weeks counted for lineup impact (rest of the regular season). */
  readonly weeks: readonly number[];
  readonly keeper?: { readonly max: number; readonly onePerPosition: boolean; readonly rule: string } | null;
  readonly veto: { readonly rule: string; readonly history: string };
  readonly marketLabel: string;
  readonly projectionLabel: string;
  /** Short trade-window note shown with results (e.g. dynasty deadline), optional. */
  readonly tradeWindow?: string | null;
}

export interface TradePlayer {
  readonly id: string;
  readonly name: string;
  readonly pos: string;
  readonly nflTeam: string | null;
  readonly injury: string | null;
  /** Projected points by week. */
  readonly proj: Readonly<Record<number, number>>;
  /** Market value (server only; never sent to the browser). */
  readonly market: number | null;
  readonly keeperNext?: number | null;
  /** Auction-keeper: estimated next-year auction value in dollars (server estimate; see trade-keepers.ts). */
  readonly keeperValue?: number | null;
  /** Dynasty: age in years, and this-season (redraft) value next to the long-term market value. */
  readonly age?: number | null;
  readonly nowValue?: number | null;
  /** Draft picks ride along as assets with pos "PICK" and no projections. */
  readonly kind?: "player" | "pick";
  /** Roster status label, e.g. "Taxi" or "IR". */
  readonly tag?: string | null;
}

export interface TradeTeam {
  readonly id: string;
  readonly name: string;
  readonly owner: string | null;
  readonly record: string | null;
  readonly players: readonly TradePlayer[];
  /** Free-agent budget left (auction/redraft leagues that allow FAAB in trades). */
  readonly faab?: number | null;
  /** The lineup currently set in Sleeper (player ids), when known. */
  readonly starters?: readonly string[] | null;
}

export type Band = "Even" | "Slight edge" | "Clear edge" | "Lopsided";
export type Call = "Accept" | "Close call" | "Decline, or counter";

/** Who actually moves in or out of the lineup in the first week (so a "−5 at QB" shows Goff replacing Lawrence, not a mystery number). */
export interface LineupSwap { readonly week: number; readonly out: string | null; readonly outPts: number; readonly in: string | null; readonly inPts: number; readonly pos: string }
export interface SideLineup { readonly total: number; readonly weekly: readonly { week: number; delta: number }[]; readonly newStarters: readonly string[]; readonly lostStarters: readonly string[]; readonly benchedArrivals: readonly string[]; readonly swaps?: readonly LineupSwap[] }

export interface TradeAnalysis {
  readonly teamA: { id: string; name: string; owner: string | null };
  readonly teamB: { id: string; name: string; owner: string | null };
  readonly aSends: readonly string[];
  readonly bSends: readonly string[];
  readonly market: { band: Band; favors: "A" | "B" | null; pct: number; coverage: "full" | "partial"; missing: readonly string[] };
  readonly lineupA: SideLineup;
  readonly lineupB: SideLineup;
  readonly fit: readonly string[];
  readonly keepers: { applies: boolean; aGives: readonly { name: string; cost: number | null; value?: number | null }[]; aGets: readonly { name: string; cost: number | null; value?: number | null }[]; rule: string | null; check?: KeeperTradeCheck | null } | null;
  readonly fly: { level: "Should stand" | "Might draw a flag" | "Could draw a veto flag"; text: string; rule: string; history: string };
  readonly call: { verdict: Call; headline: string; reason: string };
  readonly theirSide: string;
  /** FAAB dollars each side adds (not part of the market math; shown alongside it). */
  readonly faab: { aSends: number; bSends: number; note: string | null };
  /** Dynasty only: this season vs. long term, ages, picks. */
  readonly future: DynastyOutlook | null;
}

export interface DynastyOutlook {
  /** This-season value comparison (redraft values); null when not available. */
  readonly now: { band: Band; favors: "A" | "B" | null; pct: number } | null;
  readonly later: { band: Band; favors: "A" | "B" | null; pct: number };
  readonly ageGive: number | null;
  readonly ageGet: number | null;
  readonly picksGive: readonly string[];
  readonly picksGet: readonly string[];
  readonly lean: "win now" | "build for later" | "both" | "neither" | "balanced";
  readonly lines: readonly string[];
}

const isPick = (p: TradePlayer) => p.kind === "pick" || p.pos === "PICK";
const avgAge = (ps: readonly TradePlayer[]) => { const xs = ps.filter((p) => !isPick(p) && typeof p.age === "number").map((p) => p.age as number); return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null; };

/** Dynasty outlook: long-term market (dynasty values) vs. this season (redraft values), ages and picks. */
export function dynastyOutlook(aOut: readonly TradePlayer[], bOut: readonly TradePlayer[], them: string): DynastyOutlook {
  const later = compareMarket(aOut, bOut);
  const hasNow = [...aOut, ...bOut].some((p) => typeof p.nowValue === "number");
  let now: DynastyOutlook["now"] = null;
  if (hasNow) {
    const aGets = packageValue(bOut.map((p) => (isPick(p) ? 0 : p.nowValue ?? 0)));
    const bGets = packageValue(aOut.map((p) => (isPick(p) ? 0 : p.nowValue ?? 0)));
    const big = Math.max(aGets, bGets);
    const raw = big > 0 ? (Math.abs(aGets - bGets) / big) * 100 : 0;
    const band = bandFor(raw);
    now = { band, favors: band === "Even" ? null : aGets > bGets ? "A" : "B", pct: Math.round(raw) };
  }
  const ageGive = avgAge(aOut);
  const ageGet = avgAge(bOut);
  const picksGive = aOut.filter(isPick).map((p) => p.name);
  const picksGet = bOut.filter(isPick).map((p) => p.name);
  const nowA = now?.favors === "A" && now.band !== "Even";
  const nowB = now?.favors === "B" && now.band !== "Even";
  const laterA = later.favors === "A";
  const laterB = later.favors === "B";
  const lean: DynastyOutlook["lean"] = nowA && laterA ? "both" : nowB && laterB ? "neither" : nowA && !laterA ? "win now" : nowB && !laterB ? "build for later" : laterA && !nowB ? "build for later" : "balanced";
  const lines: string[] = [];
  if (now) lines.push(now.band === "Even" ? "This season: about even." : `This season: ${now.favors === "A" ? "you get" : `${them} gets`} about ${now.pct}% more value for the rest of this year.`);
  lines.push(later.band === "Even" ? "Long term: about even." : `Long term: ${later.favors === "A" ? "you get" : `${them} gets`} about ${later.pct}% more dynasty value.`);
  if (ageGive !== null || ageGet !== null) {
    const diff = ageGive !== null && ageGet !== null ? Math.round((ageGive - ageGet) * 10) / 10 : null;
    lines.push(`Ages: you give ${ageGive === null ? "no players" : `an average of ${ageGive}`}, you get ${ageGet === null ? "no players" : `an average of ${ageGet}`}${diff !== null && Math.abs(diff) >= 1.5 ? ` (you get ${diff > 0 ? "younger" : "older"} by ${Math.abs(diff)} years)` : ""}.`);
  }
  if (picksGive.length || picksGet.length) lines.push(`Picks: ${picksGive.length ? `you give ${list(picksGive)}` : "you give no picks"}; ${picksGet.length ? `you get ${list(picksGet)}` : "you get no picks"}.`);
  return { now, later: { band: later.band, favors: later.favors, pct: later.pct }, ageGive, ageGet, picksGive, picksGet, lean, lines };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => (n > 0 ? `+${round1(n).toFixed(1)}` : n < 0 ? `−${Math.abs(round1(n)).toFixed(1)}` : "0.0");
const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Optimal starting lineup for one week (fixed slots first, then flex: optimal for single-position slots + flex). */
export function bestLineup(players: readonly TradePlayer[], config: TradeLeagueConfig, week: number): { points: number; starters: string[] } {
  const pts = (p: TradePlayer) => p.proj[week] ?? 0;
  const sorted = [...players].sort((a, b) => pts(b) - pts(a));
  const used = new Set<string>();
  let points = 0;
  const fixed = config.slots.filter((s) => !config.flex[s]);
  const flexes = config.slots.filter((s) => config.flex[s]);
  for (const slot of fixed) {
    const p = sorted.find((x) => !used.has(x.id) && x.pos === slot);
    if (p) { used.add(p.id); points += pts(p); }
  }
  for (const slot of flexes) {
    const ok = config.flex[slot];
    const p = sorted.find((x) => !used.has(x.id) && ok.includes(x.pos));
    if (p) { used.add(p.id); points += pts(p); }
  }
  return { points, starters: [...used] };
}

function lineupChange(before: readonly TradePlayer[], after: readonly TradePlayer[], arrivals: readonly TradePlayer[], departures: readonly TradePlayer[], config: TradeLeagueConfig): SideLineup {
  const startsBefore = new Map<string, number>();
  const startsAfter = new Map<string, number>();
  const weekly = config.weeks.map((week) => {
    const b = bestLineup(before, config, week);
    const a = bestLineup(after, config, week);
    b.starters.forEach((id) => startsBefore.set(id, (startsBefore.get(id) ?? 0) + 1));
    a.starters.forEach((id) => startsAfter.set(id, (startsAfter.get(id) ?? 0) + 1));
    return { week, delta: round1(a.points - b.points) };
  });
  const half = Math.max(1, Math.ceil(config.weeks.length / 2));
  // First-week swaps, paired by position.
  const swaps: LineupSwap[] = [];
  const w0 = config.weeks[0];
  if (w0 !== undefined) {
    const b = new Set(bestLineup(before, config, w0).starters), a = new Set(bestLineup(after, config, w0).starters);
    const byId = new Map([...before, ...after].map((p) => [p.id, p] as const));
    const outs = [...b].filter((id) => !a.has(id)).map((id) => byId.get(id)!);
    const ins = [...a].filter((id) => !b.has(id)).map((id) => byId.get(id)!);
    const pts = (p: TradePlayer) => round1(p.proj[w0] ?? 0);
    for (const o of outs) {
      const i = ins.findIndex((x) => x.pos === o.pos) >= 0 ? ins.findIndex((x) => x.pos === o.pos) : 0;
      const n = ins.splice(i, 1)[0] ?? null;
      swaps.push({ week: w0, out: o.name, outPts: pts(o), in: n?.name ?? null, inPts: n ? pts(n) : 0, pos: o.pos });
    }
    for (const n of ins) swaps.push({ week: w0, out: null, outPts: 0, in: n.name, inPts: pts(n), pos: n.pos });
  }
  return {
    swaps,
    total: round1(weekly.reduce((s, w) => s + w.delta, 0)),
    weekly,
    newStarters: arrivals.filter((p) => (startsAfter.get(p.id) ?? 0) >= half).map((p) => p.name),
    lostStarters: departures.filter((p) => (startsBefore.get(p.id) ?? 0) >= half).map((p) => p.name),
    benchedArrivals: arrivals.filter((p) => (startsAfter.get(p.id) ?? 0) < half).map((p) => p.name),
  };
}

/** Package value: the best piece counts fully, each lesser piece a little less (1, .85, .72, …). */
export function packageValue(values: readonly number[]): number {
  return [...values].sort((a, b) => b - a).reduce((s, v, i) => s + v * Math.pow(0.85, i), 0);
}

export function bandFor(pct: number): Band {
  if (pct < 5) return "Even";
  if (pct < 15) return "Slight edge";
  if (pct < 30) return "Clear edge";
  return "Lopsided";
}

/** Market comparison: pct = how much more the favored side receives, as a share of the bigger package. */
export function compareMarket(aSends: readonly TradePlayer[], bSends: readonly TradePlayer[]) {
  const missing = [...aSends, ...bSends].filter((p) => p.market === null).map((p) => p.name);
  const aGets = packageValue(bSends.map((p) => p.market ?? 0));
  const bGets = packageValue(aSends.map((p) => p.market ?? 0));
  const big = Math.max(aGets, bGets);
  const raw = big > 0 ? (Math.abs(aGets - bGets) / big) * 100 : 0;
  const pct = Math.round(raw);
  const band = bandFor(raw);
  return { band, favors: band === "Even" ? null : aGets > bGets ? ("A" as const) : ("B" as const), pct, coverage: missing.length ? ("partial" as const) : ("full" as const), missing };
}

const short = (owner: string | null, team: string) => (owner ? owner.split(/\s*[/+]\s*/)[0].split(" ")[0] : team);

export function analyzeTrade(input: { config: TradeLeagueConfig; teamA: TradeTeam; teamB: TradeTeam; aSends: readonly string[]; bSends: readonly string[]; aFaab?: number; bFaab?: number }): TradeAnalysis {
  const { config, teamA, teamB } = input;
  const pick = (team: TradeTeam, ids: readonly string[]) => team.players.filter((p) => ids.includes(p.id));
  const aOut = pick(teamA, input.aSends);
  const bOut = pick(teamB, input.bSends);
  const aAfter = [...teamA.players.filter((p) => !input.aSends.includes(p.id)), ...bOut];
  const bAfter = [...teamB.players.filter((p) => !input.bSends.includes(p.id)), ...aOut];
  const marketRaw = compareMarket(aOut, bOut);
  const faabOnly = (!aOut.length && (input.aFaab ?? 0) > 0) || (!bOut.length && (input.bFaab ?? 0) > 0);
  const market = faabOnly ? { ...marketRaw, coverage: "partial" as const, missing: [...marketRaw.missing, "FAAB (one side is FAAB only)"] } : marketRaw;
  const lineupA = lineupChange(teamA.players, aAfter, bOut, aOut, config);
  const lineupB = lineupChange(teamB.players, bAfter, aOut, bOut, config);
  const them = short(teamB.owner, teamB.name);
  const weeks = config.weeks.length;
  const wkLabel = weeks ? `through Week ${config.weeks[weeks - 1]}` : "";

  // 2 · Fit: positional surplus and who starts.
  const fit: string[] = [];
  const need = (pos: string) => config.slots.filter((s) => s === pos).length;
  for (const pos of ["QB", "TE", "RB", "WR"]) {
    const have = teamA.players.filter((p) => p.pos === pos).length;
    const slots = need(pos);
    if (slots && have >= slots + (pos === "QB" || pos === "TE" ? 2 : 3)) {
      const sending = aOut.filter((p) => p.pos === pos);
      const sendsStarter = sending.some((p) => lineupA.lostStarters.includes(p.name));
      fit.push(`${config.leagueName} starts ${slots} ${pos}${slots > 1 ? "s" : ""}. You roster ${have}, so ${pos} depth is your surplus${!sending.length ? ", but you aren't trading from it." : sendsStarter ? ", but you're trading a starter, not the depth." : " and this trade uses it."}`);
    }
  }
  if (lineupA.newStarters.length) fit.push(`${list(lineupA.newStarters)} would start for you.`);
  if (lineupA.benchedArrivals.length) fit.push(`${list(lineupA.benchedArrivals)} would mostly sit on your bench.`);
  if (lineupA.lostStarters.length) fit.push(`You lose ${list(lineupA.lostStarters)} from your starting lineup.`);
  const injured = [...aOut, ...bOut].filter((p) => p.injury && !/^$/.test(p.injury)).map((p) => `${p.name} (${p.injury})`);
  if (injured.length) fit.push(`Injury report: ${list(injured)}.`);

  // 4 · Keepers (auction keeper leagues).

  const keeperCheck = config.format === "auction-keeper" && config.keeper && hasKeeperValues([teamA, teamB])
    ? keeperTradeCheck({ rule: config.keeper, teamA, teamB, aSends: input.aSends, bSends: input.bSends, them, market })
    : null;
  const kv = (p: TradePlayer) => (typeof p.keeperValue === "number" ? Math.round(p.keeperValue) : null);
  const keepers = config.format === "auction-keeper" && config.keeper
    ? { applies: true, aGives: aOut.map((p) => ({ name: p.name, cost: p.keeperNext ?? null, value: kv(p) })), aGets: bOut.map((p) => ({ name: p.name, cost: p.keeperNext ?? null, value: kv(p) })), rule: config.keeper.rule, check: keeperCheck }
    : null;

  // 6 · Will it fly?
  const fly = market.band === "Lopsided"
    ? { level: "Could draw a veto flag" as const, text: `It's lopsided enough that an owner may flag it.` }
    : market.band === "Clear edge"
      ? { level: "Might draw a flag" as const, text: `One side clearly gets more value; expect questions.` }
      : { level: "Should stand" as const, text: `The values are close enough that a flag would be hard to justify.` };

  // The call, from team A's point of view.
  const threshold = Math.max(3, weeks * 0.75);
  const gives = market.favors === "B" && (market.band === "Clear edge" || market.band === "Lopsided");
  const future = config.format === "dynasty" ? dynastyOutlook(aOut, bOut, them) : null;
  let verdict: Call;
  let headline: string;
  let reason: string;
  if (future) {
    const getsMore = market.favors === "A";
    const bigEdge = market.band === "Clear edge" || market.band === "Lopsided";
    const overpay = gives && market.band === "Lopsided" && market.pct >= 40;
    if ((gives && lineupA.total < threshold) || overpay) {
      verdict = "Decline, or counter";
      headline = `You give up about ${market.pct}% more dynasty value than you get.`;
      reason = overpay && lineupA.total >= threshold ? `Your lineup gains about ${Math.round(lineupA.total)} points ${wkLabel}, but that's a steep long-term price even for a title push.` : lineupA.total > 0 ? `Your lineup only gains about ${Math.round(lineupA.total)} points ${wkLabel}, not enough to pay that price.` : `And your lineup doesn't get better this season.`;
    } else if (gives) {
      verdict = "Close call";
      headline = `A win-now move: about ${fmt(lineupA.total)} projected points ${wkLabel}, but ${them} gets about ${market.pct}% more long-term value.`;
      reason = `Worth it only if you're chasing this year's title.`;
    } else if (lineupA.total <= -threshold) {
      verdict = "Close call";
      headline = `A build-for-later move: your lineup loses about ${Math.abs(Math.round(lineupA.total))} points ${wkLabel}${getsMore ? `, but you get about ${market.pct}% more dynasty value` : ""}.`;
      reason = getsMore ? `Good if you're rebuilding; costly if you're in the playoff race.` : `The long-term values are close, so this mostly costs you this season.`;
    } else if ((getsMore || market.band === "Even") && (lineupA.total >= threshold || (getsMore && bigEdge))) {
      verdict = "Accept";
      headline = lineupA.total >= threshold ? `Your lineup gains about ${Math.round(lineupA.total)} projected points ${wkLabel}${getsMore ? " and you get more dynasty value" : " at a fair long-term price"}.` : `You get about ${market.pct}% more dynasty value without hurting your lineup.`;
      reason = getsMore && bigEdge ? `If ${them} accepts, it ${fly.level === "Should stand" ? "should stand" : "may draw a flag"}.` : `The values are fair, so it should stand.`;
    } else {
      verdict = "Close call";
      headline = `About ${fmt(lineupA.total)} projected points for you ${wkLabel}; long-term value ${market.band === "Even" ? "is about even" : `${getsMore ? "favors you" : `favors ${them}`} slightly`}.`;
      reason = `This one comes down to whether you're playing for this season or later.`;
    }
  } else if (lineupA.total <= -threshold || (gives && lineupA.total < threshold)) {
    verdict = "Decline, or counter";
    headline = lineupA.total < 0 ? `Your lineup loses about ${Math.abs(Math.round(lineupA.total))} projected points ${wkLabel}.` : `You give up more value than you get.`;
    reason = [lineupA.total < 0 ? `Your starting lineup gets worse` : null, gives ? `${them} gets about ${market.pct}% more market value` : null, lineupA.benchedArrivals.length ? `${list(lineupA.benchedArrivals)} rarely starts for you` : null].filter(Boolean).join("; ") + ".";
  } else if (lineupA.total >= threshold && !(market.favors === "B" && market.band !== "Slight edge")) {
    verdict = "Accept";
    headline = `Your lineup gains about ${Math.round(lineupA.total)} projected points ${wkLabel}.`;
    reason = market.favors === "A" && market.band !== "Slight edge" ? `You also get more value. If ${them} accepts, it ${fly.level === "Should stand" ? "should stand" : "may draw a flag"}.` : `The values are fair, so it should stand.`;
  } else {
    verdict = "Close call";
    headline = `About ${fmt(lineupA.total)} projected points for you ${wkLabel}.`;
    reason = keepers ? `This one is decided by next year's keepers more than this season.` : `The difference is small; decide on your roster's needs.`;
  }

  const theirSide = lineupB.total > 0
    ? `${them}'s lineup gains about ${Math.round(lineupB.total)} projected points ${wkLabel}.${lineupB.lostStarters.length ? ` He loses ${list(lineupB.lostStarters)} from his lineup.` : ""}`
    : lineupB.total < 0
      ? `${them}'s lineup loses about ${Math.abs(Math.round(lineupB.total))} projected points ${wkLabel}, so expect him to say no unless he ${config.format === "dynasty" ? "is building for later" : "wants next year's value"}.`
      : `${them}'s lineup barely changes.`;

  const aF = Math.max(0, Math.round(input.aFaab ?? 0));
  const bF = Math.max(0, Math.round(input.bFaab ?? 0));
  const faabNote = aF || bF
    ? `FAAB in the deal: ${aF ? `you send $${aF}${teamA.faab !== undefined && teamA.faab !== null ? ` of your $${teamA.faab}` : ""}` : ""}${aF && bF ? "; " : ""}${bF ? `${them} sends $${bF}${teamB.faab !== undefined && teamB.faab !== null ? ` of his $${teamB.faab}` : ""}` : ""}. FAAB isn't in the player-value math, so weigh it on top: it buys free agents for the rest of the season.`
    : null;
  if (faabNote) fit.push(faabNote);
  return {
    faab: { aSends: aF, bSends: bF, note: faabNote },
    future,
    teamA: { id: teamA.id, name: teamA.name, owner: teamA.owner },
    teamB: { id: teamB.id, name: teamB.name, owner: teamB.owner },
    aSends: aOut.map((p) => p.name),
    bSends: bOut.map((p) => p.name),
    market,
    lineupA,
    lineupB,
    fit,
    keepers,
    fly: { ...fly, rule: config.veto.rule, history: config.veto.history },
    call: { verdict, headline, reason },
    theirSide,
  };
}

/**
 * A fair counter: keep what you asked for (or part of it) and find what you could send from your
 * roster so the market is within ~8% and your lineup doesn't get worse. Locked players are never used.
 */
export function suggestCounter(input: { config: TradeLeagueConfig; teamA: TradeTeam; teamB: TradeTeam; bSends: readonly string[]; locked?: readonly string[] }): { aSends: string[]; bSends: string[]; analysis: TradeAnalysis } | null {
  const locked = new Set(input.locked ?? []);
  const pool = input.teamA.players.filter((p) => !locked.has(p.id) && p.market !== null && p.market > 0 && !["K", "DEF"].includes(p.pos));
  const wanted = input.teamB.players.filter((p) => input.bSends.includes(p.id));
  const wantSets: string[][] = [wanted.map((p) => p.id)];
  if (wanted.length > 1) wanted.forEach((p) => wantSets.push([p.id]));
  let best: { score: number; aSends: string[]; bSends: string[]; analysis: TradeAnalysis } | null = null;
  for (const bIds of wantSets) {
    const target = packageValue(input.teamB.players.filter((p) => bIds.includes(p.id)).map((p) => p.market ?? 0));
    const cands: TradePlayer[][] = [];
    for (let i = 0; i < pool.length; i++) {
      cands.push([pool[i]]);
      for (let j = i + 1; j < pool.length; j++) {
        cands.push([pool[i], pool[j]]);
        for (let k = j + 1; k < pool.length; k++) cands.push([pool[i], pool[j], pool[k]]);
      }
    }
    for (const c of cands) {
      const v = packageValue(c.map((p) => p.market ?? 0));
      if (Math.abs(v - target) / Math.max(v, target) > 0.08) continue;
      const analysis = analyzeTrade({ config: input.config, teamA: input.teamA, teamB: input.teamB, aSends: c.map((p) => p.id), bSends: bIds });
      if (analysis.lineupA.total < 0) continue;
      const score = analysis.lineupA.total + Math.min(analysis.lineupB.total, 10) * 0.5 - analysis.market.pct * 0.2 - c.length * 0.5;
      if (!best || score > best.score) best = { score, aSends: c.map((p) => p.id), bSends: bIds, analysis };
    }
  }
  return best ? { aSends: best.aSends, bSends: best.bSends, analysis: best.analysis } : null;
}

/** What a player should fetch from each other team: a one-for-one if close, else the closest two-player package. */
export function pricePlayer(input: { player: TradePlayer; ownerTeamId: string; teams: readonly TradeTeam[] }): { teamId: string; team: string; owner: string | null; get: string[]; band: "Even" | "Close" }[] {
  const target = input.player.market ?? 0;
  if (!target) return [];
  const out: { teamId: string; team: string; owner: string | null; get: string[]; band: "Even" | "Close"; gap: number }[] = [];
  for (const team of input.teams) {
    if (team.id === input.ownerTeamId) continue;
    const pool = team.players.filter((p) => (p.market ?? 0) > 0 && !["K", "DEF"].includes(p.pos));
    let best: { gap: number; ps: TradePlayer[] } | null = null;
    for (const p of pool) {
      const gap = Math.abs((p.market ?? 0) - target) / target;
      if (gap <= 0.1 && (!best || gap < best.gap)) best = { gap, ps: [p] };
    }
    if (!best) {
      for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i], b = pool[j];
        if ((a.market ?? 0) > target || (b.market ?? 0) > target) continue;
        const gap = Math.abs(packageValue([a.market ?? 0, b.market ?? 0]) - target) / target;
        if (gap <= 0.1 && (!best || gap < best.gap)) best = { gap, ps: [a, b] };
      }
    }
    if (best) out.push({ teamId: team.id, team: team.name, owner: team.owner, get: best.ps.map((p) => `${p.name} (${p.pos})`), band: best.gap <= 0.05 ? "Even" : "Close", gap: best.gap });
  }
  return out.sort((a, b) => a.gap - b.gap).map(({ gap: _gap, ...rest }) => rest);
}

/** One step in a multi-trade plan: you trade with one partner. */
export interface PlanStep { readonly partnerId: string; readonly give: readonly string[]; readonly get: readonly string[]; readonly giveFaab?: number; readonly getFaab?: number }

export interface PlanResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly steps: readonly { partner: string; owner: string | null; give: string[]; get: string[]; lineupYou: number; lineupThem: number; band: Band; favors: "A" | "B" | null; pct: number; fly: TradeAnalysis["fly"]["level"]; call: Call }[];
  readonly total: { lineup: number; weekly: readonly { week: number; delta: number }[]; startersBefore: readonly string[]; startersAfter: readonly string[]; keeperGive: readonly { name: string; cost: number | null }[]; keeperGet: readonly { name: string; cost: number | null }[] } | null;
  readonly verdict: string;
}

export function planTrades(input: { config: TradeLeagueConfig; me: TradeTeam; teams: readonly TradeTeam[]; steps: readonly PlanStep[] }): PlanResult {
  const issues: string[] = [];
  let mine: TradeTeam = { ...input.me, players: [...input.me.players] };
  const others = new Map(input.teams.filter((t) => t.id !== input.me.id).map((t) => [t.id, { ...t, players: [...t.players] }]));
  const out: PlanResult["steps"][number][] = [];
  const nameOf = (id: string) => input.teams.flatMap((t) => t.players).find((p) => p.id === id)?.name ?? id;
  input.steps.slice(0, 4).forEach((step, i) => {
    const partner = others.get(step.partnerId);
    if (!partner) { issues.push(`Trade ${i + 1}: pick a partner.`); return; }
    const missingMine = step.give.filter((id) => !mine.players.some((p) => p.id === id));
    const missingTheirs = step.get.filter((id) => !partner.players.some((p) => p.id === id));
    if ((!step.give.length && !step.giveFaab) || !step.get.length) { issues.push(`Trade ${i + 1}: add what you send (players or FAAB) and what you get.`); return; }
    if (missingMine.length) { issues.push(`Trade ${i + 1}: you no longer have ${missingMine.map(nameOf).join(", ")} at that point.`); return; }
    if (missingTheirs.length) { issues.push(`Trade ${i + 1}: ${partner.name} no longer has ${missingTheirs.map(nameOf).join(", ")} at that point.`); return; }
    const a = analyzeTrade({ config: input.config, teamA: mine, teamB: partner, aSends: step.give, bSends: step.get, aFaab: step.giveFaab, bFaab: step.getFaab });
    out.push({ partner: partner.name, owner: partner.owner, give: [...a.aSends, ...(step.giveFaab ? [`$${step.giveFaab} FAAB`] : [])], get: [...a.bSends, ...(step.getFaab ? [`$${step.getFaab} FAAB`] : [])], lineupYou: a.lineupA.total, lineupThem: a.lineupB.total, band: a.market.band, favors: a.market.favors, pct: a.market.pct, fly: a.fly.level, call: a.call.verdict });
    const gave = mine.players.filter((p) => step.give.includes(p.id));
    const got = partner.players.filter((p) => step.get.includes(p.id));
    mine = { ...mine, players: [...mine.players.filter((p) => !step.give.includes(p.id)), ...got] };
    others.set(partner.id, { ...partner, players: [...partner.players.filter((p) => !step.get.includes(p.id)), ...gave] });
  });
  if (!out.length) return { ok: false, issues: issues.length ? issues : ["Add at least one trade."], steps: [], total: null, verdict: "" };
  const before = input.me.players;
  const after = mine.players;
  const weekly = input.config.weeks.map((week) => ({ week, delta: Math.round((bestLineup(after, input.config, week).points - bestLineup(before, input.config, week).points) * 10) / 10 }));
  const lineup = Math.round(weekly.reduce((s, w) => s + w.delta, 0) * 10) / 10;
  const w0 = input.config.weeks[0];
  const names = (team: readonly TradePlayer[], ids: string[]) => ids.map((id) => team.find((p) => p.id === id)?.name ?? id);
  const startersBefore = w0 === undefined ? [] : names(before, bestLineup(before, input.config, w0).starters);
  const startersAfter = w0 === undefined ? [] : names(after, bestLineup(after, input.config, w0).starters);
  const goneIds = new Set(before.filter((p) => !after.some((q) => q.id === p.id)).map((p) => p.id));
  const newIds = new Set(after.filter((p) => !before.some((q) => q.id === p.id)).map((p) => p.id));
  const keeps = Boolean(input.config.keeper);
  const keeperGive = keeps ? before.filter((p) => goneIds.has(p.id)).map((p) => ({ name: p.name, cost: p.keeperNext ?? null })) : [];
  const keeperGet = keeps ? after.filter((p) => newIds.has(p.id)).map((p) => ({ name: p.name, cost: p.keeperNext ?? null })) : [];
  const sumSteps = Math.round(out.reduce((s, x) => s + x.lineupYou, 0) * 10) / 10;
  const threshold = Math.max(3, input.config.weeks.length * 0.75);
  const flagged = out.filter((x) => x.fly !== "Should stand").length;
  const losers = out.filter((x) => x.lineupThem < 0).length;
  const verdict = `${lineup >= threshold ? "Worth pursuing" : lineup <= -threshold ? "Not worth it" : "Small change"}: all ${out.length} trade${out.length > 1 ? "s" : ""} together ${lineup >= 0 ? "add" : "cost"} about ${Math.abs(Math.round(lineup))} projected points${w0 !== undefined ? ` through Week ${input.config.weeks[input.config.weeks.length - 1]}` : ""}${Math.abs(sumSteps - lineup) >= 2 ? ` (the trades one at a time add up to ${sumSteps >= 0 ? "+" : "−"}${Math.abs(Math.round(sumSteps))}, because each one changes who starts for the next)` : ""}.${losers ? ` ${losers} partner${losers > 1 ? "s" : ""} would lose lineup points, so expect pushback there.` : ""}${flagged ? ` ${flagged} trade${flagged > 1 ? "s" : ""} could draw a veto flag.` : ""}`;
  return { ok: issues.length === 0, issues, steps: out, total: { lineup, weekly, startersBefore, startersAfter, keeperGive, keeperGet }, verdict };
}

/** One player (or FAAB) moving in a 3–4 team trade. */
export interface TeamMove { readonly playerId?: string; readonly faab?: number; readonly from: string; readonly to: string }

export interface MultiTeamResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly teams: readonly { id: string; name: string; owner: string | null; gives: string[]; gets: string[]; lineup: number; band: Band; netPct: number; direction: "gets more" | "gives more" | "even"; newStarters: string[]; keeperGive: { name: string; cost: number | null }[]; keeperGet: { name: string; cost: number | null }[] }[];
  readonly fly: { level: TradeAnalysis["fly"]["level"]; text: string; rule: string; history: string };
  readonly verdict: string;
}

export function analyzeMultiTeam(input: { config: TradeLeagueConfig; teams: readonly TradeTeam[]; moves: readonly TeamMove[]; meId?: string | null; minTeams?: number }): MultiTeamResult {
  const issues: string[] = [];
  const ids = [...new Set(input.moves.flatMap((m) => [m.from, m.to]))];
  const teams = ids.map((id) => input.teams.find((t) => t.id === id)).filter((t): t is TradeTeam => Boolean(t));
  const minTeams = input.minTeams ?? 3;
  if (teams.length < minTeams) issues.push(minTeams <= 2 ? "Pick at least two teams and something each one sends." : "A multi-team trade needs at least three teams; use the Trade Analyzer for two.");
  if (teams.length > 4) issues.push("Trades go up to four teams.");
  for (const m of input.moves) {
    if (m.from === m.to) issues.push("A player can't go to the team he's already on.");
    if (m.playerId && !input.teams.find((t) => t.id === m.from)?.players.some((p) => p.id === m.playerId)) issues.push("A player in the trade isn't on that team's roster.");
  }
  const dup = input.moves.filter((m) => m.playerId).map((m) => m.playerId as string).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dup.length) issues.push("A player can only move once in a trade.");
  for (const t of teams) {
    if (!input.moves.some((m) => m.from === t.id)) issues.push(`${t.name} has to send something.`);
    if (!input.moves.some((m) => m.to === t.id)) issues.push(`${t.name} has to get something.`);
  }
  const fly0 = { rule: input.config.veto.rule, history: input.config.veto.history };
  if (issues.length) return { ok: false, issues, teams: [], fly: { level: "Should stand", text: "", ...fly0 }, verdict: "" };
  const all = new Map(input.teams.flatMap((t) => t.players).map((p) => [p.id, p] as const));
  const rows = teams.map((t) => {
    const outIds = input.moves.filter((m) => m.from === t.id && m.playerId).map((m) => m.playerId as string);
    const inIds = input.moves.filter((m) => m.to === t.id && m.playerId).map((m) => m.playerId as string);
    const outP = outIds.map((id) => all.get(id)!).filter(Boolean);
    const inP = inIds.map((id) => all.get(id)!).filter(Boolean);
    const faabOut = input.moves.filter((m) => m.from === t.id && m.faab).reduce((s, m) => s + (m.faab ?? 0), 0);
    const faabIn = input.moves.filter((m) => m.to === t.id && m.faab).reduce((s, m) => s + (m.faab ?? 0), 0);
    const after = [...t.players.filter((p) => !outIds.includes(p.id)), ...inP];
    const ln = lineupChange(t.players, after, inP, outP, input.config);
    const vIn = packageValue(inP.map((p) => p.market ?? 0));
    const vOut = packageValue(outP.map((p) => p.market ?? 0));
    const big = Math.max(vIn, vOut);
    const raw = big ? (Math.abs(vIn - vOut) / big) * 100 : 0;
    return {
      id: t.id, name: t.name, owner: t.owner,
      gives: [...outP.map((p) => p.name), ...(faabOut ? [`$${faabOut} FAAB`] : [])],
      gets: [...inP.map((p) => p.name), ...(faabIn ? [`$${faabIn} FAAB`] : [])],
      lineup: ln.total, band: bandFor(raw), netPct: Math.round(raw),
      direction: (bandFor(raw) === "Even" ? "even" : vIn > vOut ? "gets more" : "gives more") as "gets more" | "gives more" | "even",
      newStarters: [...ln.newStarters],
      keeperGive: input.config.keeper ? outP.map((p) => ({ name: p.name, cost: p.keeperNext ?? null })) : [],
      keeperGet: input.config.keeper ? inP.map((p) => ({ name: p.name, cost: p.keeperNext ?? null })) : [],
    };
  });
  const worst = [...rows].filter((r) => r.direction === "gives more").sort((a, b) => b.netPct - a.netPct)[0];
  const fly = !worst || worst.band === "Slight edge"
    ? { level: "Should stand" as const, text: "No team gives up clearly more value than it gets." }
    : worst.band === "Clear edge"
      ? { level: "Might draw a flag" as const, text: `${worst.name} gives up about ${worst.netPct}% more value than it gets.` }
      : { level: "Could draw a veto flag" as const, text: `${worst.name} gives up about ${worst.netPct}% more value than it gets.` };
  const me = rows.find((r) => r.id === input.meId);
  const losers = rows.filter((r) => r.lineup < 0).map((r) => r.owner?.split(/\s*[/+]\s*/)[0] ?? r.name);
  const verdict = `${me ? `For you: ${me.lineup >= 0 ? "+" : "−"}${Math.abs(me.lineup).toFixed(1)} projected points. ` : ""}${losers.length ? `${losers.join(", ")} ${losers.length > 1 ? "lose" : "loses"} lineup points, so ${losers.length > 1 ? "they" : "he"} may need a sweetener.` : "Every team's lineup holds or improves."}`;
  return { ok: true, issues: [], teams: rows, fly: { ...fly, ...fly0 }, verdict };
}

export interface TradeTarget {
  readonly partnerId: string; readonly partner: string; readonly owner: string | null;
  readonly give: readonly { id: string; name: string; pos: string }[];
  readonly get: readonly { id: string; name: string; pos: string }[];
  readonly lineupMe: number; readonly lineupThem: number;
  readonly band: Band; readonly pct: number; readonly favors: "A" | "B" | null;
  readonly newStarters: readonly string[];
  readonly fly: TradeAnalysis["fly"]["level"];
  readonly keeperNote: string | null;
}

/**
 * Trade Targets: search every other roster for fair trades (1–2 players each way) that
 * improve my weekly lineup at the positions I want, without making the other lineup worse.
 */
export function findTradeTargets(input: {
  config: TradeLeagueConfig; me: TradeTeam; teams: readonly TradeTeam[];
  locked?: readonly string[]; positions?: readonly string[];
  minGain?: number; maxGap?: number; perPartner?: number; limit?: number;
  /** "now" (default): upgrade my lineup. "later" (dynasty): sell production to a team that wants it, for youth or picks at a fair dynasty price. "keepers" (auction keeper): add next year's keeper value. */
  goal?: "now" | "later" | "keepers";
}): { targets: TradeTarget[]; searched: number } {
  if (input.goal === "keepers") return findKeeperTargets(input);
  const later = input.goal === "later";
  /** Contenders (winning record) are the teams most likely to pay for this season's production. */
  const winning = (record: string | null) => { const m = /^(\d+)-(\d+)/.exec(record ?? ""); return m ? Number(m[1]) > Number(m[2]) : false; };
  const locked = new Set(input.locked ?? []);
  const want = new Set(input.positions?.length ? input.positions : ["QB", "RB", "WR", "TE"]);
  const minGain = input.minGain ?? 2;
  const maxGap = input.maxGap ?? 0.12;
  const pool = input.me.players.filter((p) => !locked.has(p.id) && (p.market ?? 0) > 0 && !["K", "DEF"].includes(p.pos));
  const combos = <T,>(xs: readonly T[]) => { const out: T[][] = []; for (let i = 0; i < xs.length; i++) { out.push([xs[i]]); for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]); } return out; };
  const { config } = input;
  const weeks = config.weeks;
  const total = (p: TradePlayer) => weeks.reduce((sum, w) => sum + (p.proj[w] ?? 0), 0);
  // How often each of my players starts now: sending starters costs lineup points, so try bench pieces first.
  const startWeeks = new Map<string, number>();
  for (const w of weeks) for (const id of bestLineup(input.me.players, config, w).starters) startWeeks.set(id, (startWeeks.get(id) ?? 0) + 1);
  // Upgrade check: a player is worth asking for only if he outscores my weakest starter at a slot he can fill.
  const slotOk = (slot: string, pos: string) => slot === pos || (config.flex[slot] ?? []).includes(pos);
  const starters = input.me.players.filter((p) => (startWeeks.get(p.id) ?? 0) * 2 >= Math.max(1, weeks.length));
  const floorFor = (pos: string) => { const xs = starters.filter((p) => config.slots.some((slot) => slotOk(slot, pos) && slotOk(slot, p.pos))).map(total); return xs.length ? Math.min(...xs) : 0; };
  const floors = new Map(["QB", "RB", "WR", "TE"].map((pos) => [pos, floorFor(pos)] as const));
  const isUpgrade = (p: TradePlayer) => want.has(p.pos) && total(p) > (floors.get(p.pos) ?? Infinity);
  const myBefore = weeks.map((w) => bestLineup(input.me.players, config, w).points);
  const quickGain = (before: readonly number[], players: readonly TradePlayer[], outIds: ReadonlySet<string>, inP: readonly TradePlayer[]) => {
    const after = [...players.filter((p) => !outIds.has(p.id)), ...inP];
    return weeks.reduce((sum, w, i) => sum + bestLineup(after, config, w).points - before[i], 0);
  };
  const youngOrPick = (p: TradePlayer) => isPick(p) || (want.has(p.pos) && typeof p.age === "number" && p.age <= 25);
  const sends = combos(pool).map((s) => ({ s, v: packageValue(s.map((p) => p.market ?? 0)), cost: later ? -s.reduce((n, p) => n + (isPick(p) ? 0 : p.age ?? 25), 0) : s.reduce((n, p) => n + (isPick(p) ? Math.max(1, weeks.length / 2) : startWeeks.get(p.id) ?? 0), 0), ids: new Set(s.map((p) => p.id)) }));
  const perGet = 8;
  const found: (TradeTarget & { score: number })[] = [];
  const cands: { team: TradeTeam; s: TradePlayer[]; g: TradePlayer[]; quick: number }[] = [];
  let analyzed = 0;
  let searched = 0;
  for (const team of input.teams) {
    if (team.id === input.me.id) continue;
    const theirs = team.players.filter((p) => (p.market ?? 0) > 0 && !["K", "DEF"].includes(p.pos));
    const theirBefore = weeks.map((w) => bestLineup(team.players, config, w).points);
    // Build for later: only offer packages with at least one player who'd start for this partner.
    let sendPool = sends;
    const theirStartAny = new Set<string>();
    const gainBySend = new Map<string, number>();
    if (later) {
      const theirStarts = new Map<string, number>();
      for (const w of weeks) for (const id of bestLineup(team.players, config, w).starters) theirStarts.set(id, (theirStarts.get(id) ?? 0) + 1);
      const theirStarters = team.players.filter((p) => (theirStarts.get(p.id) ?? 0) * 2 >= Math.max(1, weeks.length));
      const theirFloor = (pos: string) => { const xs = theirStarters.filter((q) => config.slots.some((slot) => slotOk(slot, pos) && slotOk(slot, q.pos))).map(total); return xs.length ? Math.min(...xs) : 0; };
      const floorsB = new Map(["QB", "RB", "WR", "TE"].map((pos) => [pos, theirFloor(pos)] as const));
      const helps = (p: TradePlayer) => !isPick(p) && total(p) > (floorsB.get(p.pos) ?? Infinity);
      sendPool = sends.filter(({ s: pk }) => pk.some(helps));
      theirStarts.forEach((_, id) => theirStartAny.add(id));
    }
    for (const g of combos(theirs)) {
      if (later ? !g.some(youngOrPick) : !g.some(isUpgrade)) continue;
      const vg = packageValue(g.map((p) => p.market ?? 0));
      const gIds = new Set(g.map((p) => p.id));
      const fits = sendPool.filter(({ v }) => Math.abs(vg - v) / Math.max(vg, v) <= maxGap).sort((x, y) => x.cost - y.cost || Math.abs(x.v - vg) - Math.abs(y.v - vg)).slice(0, perGet);
      for (const { s, ids } of fits) {
        searched++;
        if (!later && quickGain(myBefore, input.me.players, ids, g) < minGain) continue;
        // Players who never start for them don't change their lineup when they leave, so the gain from what they receive can be reused.
        let theirGain: number;
        if (later && !g.some((p) => theirStartAny.has(p.id))) {
          const k = s.map((p) => p.id).join(",");
          theirGain = gainBySend.get(k) ?? quickGain(theirBefore, team.players, new Set(), s);
          gainBySend.set(k, theirGain);
        } else theirGain = quickGain(theirBefore, team.players, gIds, s);
        if (theirGain < (later ? minGain : 0)) continue;
        if (later && (avgAge(s) ?? 0) - (avgAge(g) ?? avgAge(s) ?? 0) < 1 && !g.some(isPick)) continue;
        // Cheap first-pass score; only the most promising candidates get the full six-answer analysis.
        const ageGap = (avgAge(s) ?? 0) - (avgAge(g) ?? avgAge(s) ?? 0);
        const quick = later
          ? 0.4 * Math.min(theirGain, 25) + (winning(team.record) ? 4 : 0) + 2.5 * ageGap + 4 * g.filter(isPick).length
          : quickGain(myBefore, input.me.players, ids, g) + 0.5 * Math.min(theirGain, 10) - 3 * s.filter(isPick).length;
        cands.push({ team, s, g, quick });
      }
    }
  }
  cands.sort((x, y) => y.quick - x.quick);
  const perTeamCap = new Map<string, number>();
  for (const { team, s, g } of cands) {
    if (analyzed >= 400) break;
    if ((perTeamCap.get(team.id) ?? 0) >= 60) continue;
    perTeamCap.set(team.id, (perTeamCap.get(team.id) ?? 0) + 1);
    analyzed++;
    {
      {
        const a = analyzeTrade({ config: input.config, teamA: input.me, teamB: team, aSends: s.map((p) => p.id), bSends: g.map((p) => p.id) });
        if (later) {
          const younger = (avgAge(s) ?? 0) - (avgAge(g) ?? avgAge(s) ?? 0);
          const picksIn = g.filter(isPick).length;
          if (a.lineupB.total < minGain || (younger < 1 && !picksIn)) continue;
        } else {
          if (a.lineupA.total < minGain || a.lineupB.total < 0) continue;
          if (!a.lineupA.newStarters.length) continue;
        }
        const keeperNote = input.config.keeper ? `Keepers next year: you give ${s.map((p) => `${p.name} ${p.keeperNext == null ? "$?" : `$${p.keeperNext}`}`).join(", ")}; you get ${g.map((p) => `${p.name} ${p.keeperNext == null ? "$?" : `$${p.keeperNext}`}`).join(", ")}.` : a.future ? a.future.lines.filter((l) => !l.startsWith("This season")).join(" ") : null;
        found.push({
          partnerId: team.id, partner: team.name, owner: team.owner,
          give: s.map((p) => ({ id: p.id, name: p.name, pos: p.pos })), get: g.map((p) => ({ id: p.id, name: p.name, pos: p.pos })),
          lineupMe: a.lineupA.total, lineupThem: a.lineupB.total, band: a.market.band, pct: a.market.pct, favors: a.market.favors,
          newStarters: [...a.lineupA.newStarters], fly: a.fly.level, keeperNote,
          score: later
            ? 0.4 * Math.min(a.lineupB.total, 25) + (winning(team.record) ? 4 : 0) + 2.5 * ((avgAge(s) ?? 0) - (avgAge(g) ?? avgAge(s) ?? 0)) + 4 * g.filter(isPick).length + (a.market.favors === "A" ? 0.3 : -0.3) * a.market.pct + 0.1 * a.lineupA.total - (s.length + g.length - 2) * 0.75
            : a.lineupA.total + 0.5 * Math.min(a.lineupB.total, 10) - 0.15 * a.market.pct - (s.length + g.length - 2) * 0.75 - 3 * s.filter(isPick).length,
        });
      }
    }
  }
  found.sort((x, y) => y.score - x.score);
  const perPartner = input.perPartner ?? 2;
  const limit = input.limit ?? 12;
  const used = new Map<string, number>();
  const seenGet = new Set<string>();
  const giveUsed = new Map<string, number>();
  const targets: TradeTarget[] = [];
  for (const f of found) {
    const key = f.partnerId + ":" + f.get.map((p) => p.id).sort().join(",");
    const giveKey = f.give.map((p) => p.id).sort().join(",");
    const sameDeal = f.partnerId + "|" + giveKey;
    if (seenGet.has(key) || seenGet.has(sameDeal) || (used.get(f.partnerId) ?? 0) >= perPartner || (giveUsed.get(giveKey) ?? 0) >= 2) continue;
    seenGet.add(key); seenGet.add(sameDeal); used.set(f.partnerId, (used.get(f.partnerId) ?? 0) + 1); giveUsed.set(giveKey, (giveUsed.get(giveKey) ?? 0) + 1);
    const { score: _score, ...t } = f; void _score;
    targets.push(t);
    if (targets.length >= limit) break;
  }
  return { targets, searched };
}

function findKeeperTargets(input: {
  config: TradeLeagueConfig; me: TradeTeam; teams: readonly TradeTeam[];
  locked?: readonly string[]; positions?: readonly string[]; maxGap?: number; perPartner?: number; limit?: number;
}): { targets: TradeTarget[]; searched: number } {
  const { config } = input;
  const rule = config.keeper;
  if (config.format !== "auction-keeper" || !rule || !hasKeeperValues([input.me, ...input.teams])) return { targets: [], searched: 0 };
  const winning = (record: string | null) => { const m = /^(\d+)-(\d+)/.exec(record ?? ""); return m ? Number(m[1]) > Number(m[2]) : false; };
  const locked = new Set(input.locked ?? []);
  const want = new Set(input.positions?.length ? input.positions : ["QB", "RB", "WR", "TE"]);
  const maxGap = input.maxGap ?? 0.2;
  const weeks = config.weeks;
  const combos = <T,>(xs: readonly T[]) => { const out: T[][] = []; for (let i = 0; i < xs.length; i++) { out.push([xs[i]]); for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]); } return out; };
  const myOutlook = keeperOutlook(input.me.players, rule);
  const myKept = new Set(myOutlook.keepers.map((k) => k.id));
  // What I can send: anything not locked and not one of my own best keepers (selling those defeats the purpose).
  const pool = input.me.players.filter((p) => !locked.has(p.id) && !myKept.has(p.id) && !isPick(p) && (p.market ?? 0) > 0 && !["K", "DEF"].includes(p.pos))
    .sort((a, b) => (b.market ?? 0) - (a.market ?? 0)).slice(0, 14);
  const sends = combos(pool).map((s) => ({ s, v: packageValue(s.map((p) => p.market ?? 0)), ids: new Set(s.map((p) => p.id)) }));
  const myBefore = weeks.map((w) => bestLineup(input.me.players, config, w).points);
  const gain = (before: readonly number[], players: readonly TradePlayer[], outIds: ReadonlySet<string>, inP: readonly TradePlayer[]) => {
    const after = [...players.filter((p) => !outIds.has(p.id)), ...inP];
    return weeks.reduce((sum, w, i) => sum + bestLineup(after, config, w).points - before[i], 0);
  };
  const cands: { team: TradeTeam; s: TradePlayer[]; g: TradePlayer[]; quick: number }[] = [];
  let searched = 0;
  for (const team of input.teams) {
    if (team.id === input.me.id) continue;
    const theirs = keeperOutlook(team.players, rule);
    const spare = new Set(theirs.spares.map((k) => k.id));
    const only = theirs.bargains.length === 1 ? theirs.bargains[0]!.id : null;
    // Ask for one bargain at a position I want (a second player only as a throw-in with no keeper value to them).
    const asks = team.players.filter((p) => want.has(p.pos) && (keeperSurplus(p) ?? 0) >= BARGAIN_MIN);
    const throwIns = team.players.filter((p) => !isPick(p) && (p.market ?? 0) > 0 && !["K", "DEF"].includes(p.pos) && (keeperSurplus(p) ?? 0) < BARGAIN_MIN);
    const theirBefore = weeks.map((w) => bestLineup(team.players, config, w).points);
    const contender = winning(team.record);
    for (const ask of asks) {
      const gets: TradePlayer[][] = [[ask], ...throwIns.slice(0, 6).map((t) => [ask, t])];
      for (const g of gets) {
        const vg = packageValue(g.map((p) => p.market ?? 0));
        const fits = sends.filter(({ v }) => Math.abs(vg - v) / Math.max(vg, v, 1) <= maxGap).sort((x, y) => Math.abs(x.v - vg) - Math.abs(y.v - vg)).slice(0, 10);
        for (const { s, ids } of fits) {
          searched++;
          if (s.length >= 2 && g.length === 1) continue; // two good for one great
          const check = keeperTradeCheck({ rule, teamA: input.me, teamB: team, aSends: [...ids], bSends: g.map((p) => p.id), them: team.name });
          if (check.a.change < 3) continue;
          const theirGain = gain(theirBefore, team.players, new Set(g.map((p) => p.id)), s);
          // Contenders need this-season help; anyone must come out ahead somewhere.
          if (contender ? theirGain < 2 : theirGain + check.b.change < 0) continue;
          const quick = check.a.change + (spare.has(ask.id) ? 6 : 0) - (only === ask.id ? 8 : 0) + 0.3 * Math.min(theirGain, 20) + (contender ? 0 : 3) + 0.4 * Math.min(0, check.b.change);
          cands.push({ team, s, g, quick });
        }
      }
    }
  }
  cands.sort((x, y) => y.quick - x.quick);
  const found: (TradeTarget & { score: number })[] = [];
  let analyzed = 0;
  for (const { team, s, g, quick } of cands) {
    if (analyzed >= 250) break;
    analyzed++;
    const a = analyzeTrade({ config, teamA: input.me, teamB: team, aSends: s.map((p) => p.id), bSends: g.map((p) => p.id) });
    if (a.market.band === "Lopsided" && a.market.favors === "A") continue; // a lowball
    const check = a.keepers?.check;
    if (!check || check.flags.includes("two-for-one-great")) continue;
    const myLineup = gain(myBefore, input.me.players, new Set(s.map((p) => p.id)), g);
    const keeperNote = [keeperChangeLine(check, short(team.owner, team.name)), ...check.notes].join(" ");
    found.push({
      partnerId: team.id, partner: team.name, owner: team.owner,
      give: s.map((p) => ({ id: p.id, name: p.name, pos: p.pos })), get: g.map((p) => ({ id: p.id, name: p.name, pos: p.pos })),
      lineupMe: Math.round(myLineup * 10) / 10, lineupThem: a.lineupB.total, band: a.market.band, pct: a.market.pct, favors: a.market.favors,
      newStarters: [...a.lineupA.newStarters], fly: a.fly.level, keeperNote,
      score: quick + (a.market.favors === "B" ? 0.05 : -0.1) * a.market.pct - (s.length + g.length - 2) * 0.75,
    });
  }
  found.sort((x, y) => y.score - x.score);
  const perPartner = input.perPartner ?? 2;
  const limit = input.limit ?? 12;
  const used = new Map<string, number>();
  const seen = new Set<string>();
  const targets: TradeTarget[] = [];
  for (const f of found) {
    const key = f.partnerId + ":" + f.get.map((p) => p.id).sort().join(",");
    if (seen.has(key) || (used.get(f.partnerId) ?? 0) >= perPartner) continue;
    seen.add(key); used.set(f.partnerId, (used.get(f.partnerId) ?? 0) + 1);
    const { score: _score, ...t } = f; void _score;
    targets.push(t);
    if (targets.length >= limit) break;
  }
  return { targets, searched };
}
