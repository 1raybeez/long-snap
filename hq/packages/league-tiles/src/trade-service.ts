/**
 * Shared Trade Analyzer service (HQ, 2026-10-29). Every league site builds a TradeContext from its
 * own data (rosters, projections, market values, picks) and a TradeLeagueConfig, then answers the
 * browser through these functions. Server only: contexts hold raw market values, and nothing here
 * returns them. Results carry names, bands, percentages and projected-point changes.
 */
import { analyzeMyTeam } from "./gm.ts";
import { analyzeMultiTeam, analyzeTrade, findTradeTargets, planTrades, pricePlayer, suggestCounter, type TradeLeagueConfig, type TradePlayer, type TradeTeam } from "./trade-engine.ts";
import { analyzeWaivers, type WaiverExtras } from "./waivers.ts";
import type { GmPrefs } from "./gm-prefs.ts";
import type { OwnerProfiles } from "./owner-profiles.ts";
import { outcomeLine, type LeagueOutcomes } from "./trade-outcomes.ts";
import { buildCoachReport, coachProposal, type CoachReport } from "./trade-coach.ts";
import type { PlayerNewsBundle } from "./player-news.ts";
import { hasKeeperValues, keeperOutlook, type KeeperOutlook } from "./trade-keepers.ts";

export interface StoredTrade { id: string; week: number; created: number; rosterIds: number[]; adds: Record<string, number>; draftPicks?: { season: string; round: number; roster_id: number; owner_id: number; previous_owner_id: number }[] }
export interface TradeContext { teams: TradeTeam[]; weeks: number[]; slots: string[]; updatedAt: string; trades: StoredTrade[]; rosterToTeam: Record<string, string>; /** The season's trade deadline has passed (tradesAreClosed). */ tradesClosed?: boolean }
export interface TradeSiteMeta { leagueName: string; market: string; marketHref: string; /** A second value source blended in, credited with its own link (Dynasty Dealer). */ market2?: { name: string; href: string } | null; /** When trading reopens, e.g. "March 1" (dynasty leagues); null = not set. */ reopens?: string | null; notice?: string | null; format?: "auction-keeper" | "dynasty" | "redraft"; keeperRule?: { max: number; onePerPosition: boolean } | null }

/** Stable id for a draft pick asset: season, round, and the roster that originally owned it. */
export const pickAssetId = (season: string | number, round: number, originalRosterId: number) => `pick:${season}:${round}:${originalRosterId}`;

export const weeksLabel = (weeks: readonly number[]) => (weeks.length ? `Weeks ${weeks[0]}–${weeks[weeks.length - 1]}` : "rest of season");
const isPick = (p: TradePlayer) => p.kind === "pick" || p.pos === "PICK";

/** What the browser gets: names, positions, keeper costs, ages, tags. No market values, no projections. */
export function publicTradeContext(ctx: TradeContext, meta: TradeSiteMeta, myTeamId: string | null) {
  const all = ctx.teams.flatMap((t) => t.players);
  const nameOf = (id: string) => all.find((p) => p.id === id)?.name ?? null;
  const teamName = (rosterId: number) => ctx.teams.find((t) => t.id === ctx.rosterToTeam[String(rosterId)])?.name ?? `Team ${rosterId}`;
  const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
  return {
    ok: true as const,
    leagueName: meta.leagueName,
    notice: meta.notice ?? null,
    format: meta.format ?? "auction-keeper",
    keeperRule: meta.keeperRule ?? null,
    tradesClosed: ctx.tradesClosed ?? false,
    reopens: meta.reopens ?? null,
    teams: ctx.teams.map((t) => {
      // Order inside each position group: best projected first (a rank only; no numbers leave the server).
      const total = (p: TradePlayer) => Object.values(p.proj).reduce((a, b) => a + b, 0);
      const ranked = [...t.players].filter((p) => !isPick(p)).sort((a, b) => total(b) - total(a)).map((p) => p.id);
      const pickRank = (p: TradePlayer) => { const m = /^(\d{4})\D+(\d)/.exec(p.name); return m ? Number(m[1]) * 10 + Number(m[2]) : 99999; };
      return {
        id: t.id, name: t.name, owner: t.owner, record: t.record, faab: t.faab ?? null,
        players: t.players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, nflTeam: p.nflTeam, injury: p.injury, ...(p.keeperNext !== undefined ? { keeperNext: p.keeperNext } : {}), ...(typeof p.keeperValue === "number" ? { keeperValue: Math.round(p.keeperValue) } : {}), age: typeof p.age === "number" ? Math.floor(p.age) : null, tag: p.tag ?? null, kind: isPick(p) ? "pick" : "player", rank: isPick(p) ? pickRank(p) : ranked.indexOf(p.id) + 1 })),
      };
    }),
    myTeamId: myTeamId && ctx.teams.some((t) => t.id === myTeamId) ? myTeamId : null,
    updatedAt: ctx.updatedAt,
    weeksLabel: weeksLabel(ctx.weeks),
    sources: { market: meta.market, marketHref: meta.marketHref, market2: meta.market2 ?? null, projections: `Sleeper, ${weeksLabel(ctx.weeks)}` },
    trades: ctx.trades.map((t) => {
      const [a, b] = t.rosterIds;
      const pickLabel = (p: NonNullable<StoredTrade["draftPicks"]>[number]) => `${p.season} ${ordinal(p.round)}`;
      const toA = [...Object.entries(t.adds).filter(([, r]) => r === a).map(([id]) => nameOf(id) ?? "a player"), ...(t.draftPicks ?? []).filter((p) => p.owner_id === a).map(pickLabel)];
      const toB = [...Object.entries(t.adds).filter(([, r]) => r === b).map(([id]) => nameOf(id) ?? "a player"), ...(t.draftPicks ?? []).filter((p) => p.owner_id === b).map(pickLabel)];
      return { id: t.id, label: `${teamName(a)} got ${toA.join(" + ") || "—"} · ${teamName(b)} got ${toB.join(" + ") || "—"}`, date: `Week ${t.week}${t.created ? ` · ${new Date(t.created).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` : ""}` };
    }),
  };
}

function sideNote(config: TradeLeagueConfig, teamA: TradeTeam, teamB: TradeTeam, aSends: string[], bSends: string[]) {
  if (!config.keeper) return null;
  const cost = (t: TradeTeam, ids: string[]) => t.players.filter((p) => ids.includes(p.id)).map((p) => `${p.name} ${p.keeperNext === null || p.keeperNext === undefined ? "(cost ?)" : `$${p.keeperNext}`}`);
  return `Next year's keeper costs: you give ${cost(teamA, aSends).join(", ")}; you get ${cost(teamB, bSends).join(", ")}.`;
}

export function runAnalyze(ctx: TradeContext, config: TradeLeagueConfig, input: { teamA: string; teamB: string; aSends: string[]; bSends: string[]; locked: string[]; aFaab?: number; bFaab?: number }, profiles?: OwnerProfiles | null, coach?: { outcomes: LeagueOutcomes | null | undefined; me: string | null; week: number; preseason: boolean }) {
  const teamA = ctx.teams.find((t) => t.id === input.teamA);
  const teamB = ctx.teams.find((t) => t.id === input.teamB);
  if (!teamA || !teamB || teamA.id === teamB.id) return null;
  const aSends = input.aSends.filter((id) => teamA.players.some((p) => p.id === id));
  const bSends = input.bSends.filter((id) => teamB.players.some((p) => p.id === id));
  const clamp = (v: number | undefined, max: number | null | undefined) => Math.max(0, Math.min(typeof max === "number" ? max : 0, Math.round(v ?? 0)));
  const aFaab = clamp(input.aFaab, teamA.faab);
  const bFaab = clamp(input.bFaab, teamB.faab);
  if ((!aSends.length && !aFaab) || (!bSends.length && !bFaab)) return null;
  const analysis = analyzeTrade({ config, teamA, teamB, aSends, bSends, aFaab, bFaab });
  let counter = null;
  if (analysis.call.verdict !== "Accept" && bSends.length) {
    const c = suggestCounter({ config, teamA, teamB, bSends, locked: input.locked });
    const sameAsAsked = c && c.aSends.length === aSends.length && c.aSends.every((id) => aSends.includes(id)) && c.bSends.length === bSends.length;
    if (c && !sameAsAsked) {
      const names = (t: TradeTeam, ids: string[]) => t.players.filter((p) => ids.includes(p.id)).map((p) => p.name);
      const note = sideNote(config, teamA, teamB, c.aSends, c.bSends) ?? (c.analysis.future ? c.analysis.future.lines.filter((l) => !l.startsWith("This season")).join(" ") : null);
      counter = { aSends: names(teamA, c.aSends), bSends: names(teamB, c.bSends), lineupA: c.analysis.lineupA.total, lineupB: c.analysis.lineupB.total, band: c.analysis.market.band, pct: c.analysis.market.pct, keeperNote: note };
    }
  }
  const posOf = (t: TradeTeam, idsIn: string[]) => t.players.filter((p) => idsIn.includes(p.id)).map((p) => p.pos);
  // Trade coach: only for the signed-in owner, about their own side of the deal.
  let coaching: { tone: "warning" | "strength"; text: string }[] = [];
  if (coach?.outcomes && coach.me && (coach.me === teamA.id || coach.me === teamB.id)) {
    const meIsA = coach.me === teamA.id;
    const [mine, theirs, myTeam, theirTeam] = meIsA ? [aSends, bSends, teamA, teamB] : [bSends, aSends, teamB, teamA];
    const pk = (t: TradeTeam, ids: string[]) => t.players.filter((p) => ids.includes(p.id));
    coaching = coachProposal(buildCoachReport(coach.outcomes, coach.me), {
      givePicks: pk(myTeam, mine).filter(isPick).length, getPicks: pk(theirTeam, theirs).filter(isPick).length,
      givePlayers: pk(myTeam, mine).filter((p) => !isPick(p)).length, getPlayers: pk(theirTeam, theirs).filter((p) => !isPick(p)).length,
      givePositions: pk(myTeam, mine).map((p) => p.pos), getPositions: pk(theirTeam, theirs).map((p) => p.pos),
      week: coach.week, preseason: coach.preseason,
    });
  }
  return { ok: true as const, analysis, counter, partnerNote: partnerNote(profiles, teamB.id, posOf(teamA, aSends), posOf(teamB, bSends)), coaching };
}

export function runPrice(ctx: TradeContext, playerId: string) {
  const owner = ctx.teams.find((t) => t.players.some((p) => p.id === playerId));
  const player = owner?.players.find((p) => p.id === playerId);
  if (!owner || !player) return null;
  const rows = pricePlayer({ player, ownerTeamId: owner.id, teams: ctx.teams });
  return { ok: true as const, player: player.name, rows: rows.map((r) => ({ team: r.team, owner: r.owner, get: r.get, band: r.band })) };
}

/** Veto check: rebuild both rosters as they were just before a completed trade, then analyze it. */
export function runHistory(ctx: TradeContext, config: TradeLeagueConfig, tradeId: string, outcomes?: LeagueOutcomes | null) {
  const t = ctx.trades.find((x) => x.id === tradeId);
  if (!t) return null;
  const [ra, rb] = t.rosterIds;
  const A = ctx.teams.find((x) => x.id === ctx.rosterToTeam[String(ra)]);
  const B = ctx.teams.find((x) => x.id === ctx.rosterToTeam[String(rb)]);
  if (!A || !B) return null;
  const all = new Map(ctx.teams.flatMap((x) => x.players).map((p) => [p.id, p] as const));
  const picksTo = (r: number) => (t.draftPicks ?? []).filter((p) => p.owner_id === r).map((p) => pickAssetId(p.season, p.round, p.roster_id));
  const gotA = [...Object.entries(t.adds).filter(([, r]) => r === ra).map(([id]) => id), ...picksTo(ra)].filter((id) => all.has(id));
  const gotB = [...Object.entries(t.adds).filter(([, r]) => r === rb).map(([id]) => id), ...picksTo(rb)].filter((id) => all.has(id));
  if (!gotA.length || !gotB.length) return null;
  const before = (team: TradeTeam, received: string[], sent: string[]): TradeTeam => ({ ...team, players: [...team.players.filter((p) => !received.includes(p.id)), ...sent.map((id) => all.get(id)!)].filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i) });
  const teamA = before(A, gotA, gotB);
  const teamB = before(B, gotB, gotA);
  const analysis = analyzeTrade({ config, teamA, teamB, aSends: gotB, bSends: gotA });
  const o = outcomes?.trades.find((x) => x.id === tradeId);
  const nameOf = (rid: number) => ctx.teams.find((x) => x.id === ctx.rosterToTeam[String(rid)])?.name ?? `Team ${rid}`;
  const outcome = o ? { label: o.verdict.label, status: o.verdict.status, weeks: o.weeksCounted, winner: o.verdict.winner === null ? null : (() => { const w = o.sides.find((x) => x.rosterId === o.verdict.winner); return ctx.teams.find((t) => t.id === w?.teamId)?.name ?? w?.teamName ?? nameOf(o.verdict.winner!); })(), sides: o.sides.map((x) => ({ team: ctx.teams.find((t) => t.id === x.teamId)?.name ?? x.teamName ?? nameOf(x.rosterId), line: outcomeLine(x, outcomes!.kind) })) } : null;
  return { ok: true as const, analysis, counter: null, outcome };
}

export function runPlan(ctx: TradeContext, config: TradeLeagueConfig, input: { me: string; steps: { partnerId: string; give: string[]; get: string[]; giveFaab?: number; getFaab?: number }[] }) {
  const me = ctx.teams.find((t) => t.id === input.me);
  if (!me || !input.steps.length) return null;
  return { ok: true as const, plan: planTrades({ config, me, teams: ctx.teams, steps: input.steps.slice(0, 4) }) };
}

const TARGET_POSITIONS = ["QB", "RB", "WR", "TE"];
export function runTargets(ctx: TradeContext, config: TradeLeagueConfig, input: { me: string; locked: string[]; positions: string[]; goal?: "now" | "later" | "keepers" }, profiles?: OwnerProfiles | null, outcomes?: LeagueOutcomes | null) {
  const me = ctx.teams.find((t) => t.id === input.me);
  if (!me) return null;
  const positions = input.positions.filter((p) => TARGET_POSITIONS.includes(p));
  const { targets, searched } = findTradeTargets({ config, me, teams: ctx.teams, locked: input.locked, positions, goal: config.format === "dynasty" && input.goal === "later" ? "later" : config.format === "auction-keeper" && config.keeper && input.goal === "keepers" ? "keepers" : "now" });
  const withNotes = targets.map((t) => ({ ...t, partnerNote: partnerNote(profiles, t.partnerId, t.give.map((x) => x.pos), t.get.map((x) => x.pos), outcomes) }));
  return { ok: true as const, targets: withNotes, searched, norms: profiles?.norms ?? null };
}

export function reversedTrade(ctx: TradeContext, moves: readonly { playerId?: string; from: string; to: string }[]): { id: string } | null {
  const players = moves.filter((m) => m.playerId);
  if (players.length < 2) return null;
  for (const t of ctx.trades) {
    const teamOf = (rid: number) => ctx.rosterToTeam[String(rid)];
    const undone = players.every((m) => { const rid = t.adds[m.playerId!]; return rid !== undefined && teamOf(rid) === m.from && t.rosterIds.some((r) => r !== rid && teamOf(r) === m.to); });
    if (undone) return { id: t.id };
  }
  return null;
}

export function runMulti(ctx: TradeContext, config: TradeLeagueConfig, input: { me: string | null; moves: { playerId?: string; faab?: number; from: string; to: string }[]; neutral?: boolean }) {
  const faabLeft = new Map(ctx.teams.map((t) => [t.id, t.faab ?? 0] as const));
  const moves = input.moves.slice(0, 40).map((m) => (m.faab ? { ...m, faab: Math.max(0, Math.min(faabLeft.get(m.from) ?? 0, Math.round(m.faab))) } : m));
  return { ok: true as const, result: analyzeMultiTeam({ config, teams: ctx.teams, moves, meId: input.neutral ? null : input.me, minTeams: input.neutral ? 2 : 3 }), reversedTradeId: reversedTrade(ctx, moves)?.id ?? null };
}

/** GM · My Team: start/sit, weak spots, drops for one team (defaults to the signed-in owner's). */
export function runMyTeam(ctx: TradeContext, config: TradeLeagueConfig, input: { me: string }, news?: Record<string, PlayerNewsBundle> | null) {
  const me = ctx.teams.find((t) => t.id === input.me);
  if (!me) return null;
  const report = analyzeMyTeam({ config, teams: ctx.teams, meId: me.id, sleeperStarters: me.starters ?? null });
  if (report && news) {
    const day = Date.now() - 36 * 3600000;
    report.news = me.players.filter((p) => news[p.id] && (news[p.id].news.length || news[p.id].status)).map((p) => ({ player: { id: p.id, name: p.name, pos: p.pos, nflTeam: p.nflTeam, injury: p.injury, tag: p.tag ?? null }, status: news[p.id].status, fresh: (news[p.id].newsUpdated ?? 0) > day || news[p.id].news.some((n) => n.at > day), items: news[p.id].news }))
      .sort((a, b) => Number(b.fresh) - Number(a.fresh) || (b.items[0]?.at ?? 0) - (a.items[0]?.at ?? 0)).slice(0, 12);
  }
  return report ? { ok: true as const, report } : null;
}

export interface GmTodo { readonly kind: "lineup" | "waiver" | "weak" | "news" | "keepers"; readonly urgent: boolean; readonly title: string; readonly detail: string; readonly page: "my-team" | "waivers" | "trades" }
export function runBrief(ctx: TradeContext, config: TradeLeagueConfig, input: { me: string }, deps: { waivers?: WaiverExtras | null; prefs?: GmPrefs | null; news?: Record<string, PlayerNewsBundle> | null }) {
  const me = ctx.teams.find((t) => t.id === input.me);
  if (!me) return null;
  const todo: GmTodo[] = [];
  const team = runMyTeam(ctx, config, { me: me.id }, deps.news)?.report ?? null;
  if (team?.week) {
    const real = team.sleeper.moves.filter((m) => !m.tossUp);
    if (!team.sleeper.set) todo.push({ kind: "lineup", urgent: true, title: `Set your Week ${team.week} lineup`, detail: "We couldn't read a lineup in Sleeper for you.", page: "my-team" });
    else if (real.length) todo.push({ kind: "lineup", urgent: true, title: `${real.length} lineup change${real.length > 1 ? "s" : ""} for Week ${team.week}`, detail: real.slice(0, 3).map((m) => `Start ${m.start.name}${m.sit ? ` over ${m.sit.name}` : ""} (+${m.gain.toFixed(1)})`).join("; ") + ".", page: "my-team" });
    for (const a of team.alerts.slice(0, 2)) todo.push({ kind: "lineup", urgent: true, title: "Lineup alert", detail: a, page: "my-team" });
  }
  const freshNews = (team?.news ?? []).filter((n) => n.fresh);
  if (freshNews.length) todo.push({ kind: "news", urgent: false, title: `News on ${freshNews.length} of your players`, detail: freshNews.slice(0, 4).map((n) => `${n.player.name}${n.status ? ` (${n.status})` : ""}`).join(", ") + ".", page: "my-team" });
  const weak = team?.weakSpots.filter((w) => w.level === "weak").sort((a, b) => b.rank - a.rank)[0];
  if (weak) todo.push({ kind: "weak", urgent: false, title: `Weakest spot: ${weak.group}`, detail: `You rank ${weak.rank} of ${weak.of} at ${weak.group}. Check waivers or trade targets there.`, page: "waivers" });
  const w = deps.waivers ? runWaivers(ctx, config, { me: me.id }, deps.waivers, deps.prefs)?.report ?? null : null;
  const top = w?.targets.find((t) => t.bid) ?? w?.targets[0];
  if (w && top) todo.push({ kind: "waiver", urgent: false, title: `Waiver target: ${top.player.name} (${top.player.pos})`, detail: `${top.fills ? `Fills ${top.fills}. ` : ""}${top.bid && w.faabWaivers ? `Suggested bid $${top.bid.amount} ($${top.bid.low}–$${top.bid.high}). ` : ""}${top.drop ? `Drop ${top.drop.name}.` : ""}`.trim() || "Best pickup for your lineup.", page: "waivers" });
  let keepers: KeeperOutlook | null = null;
  if (config.format === "auction-keeper" && config.keeper && hasKeeperValues([me])) {
    keepers = keeperOutlook(me.players, config.keeper);
    const keptLine = keepers.keepers.length ? `Best now: ${keepers.keepers.map((k) => `${k.name} (saves ~$${k.surplus})`).join(", ")}.${keepers.spares.length ? ` Spare bargains to trade: ${keepers.spares.map((k) => k.name).join(", ")}.` : ""}` : "No bargain keepers yet. Keeper mode in Trade Targets looks for some.";
    const closeLine = keepers.closeCalls.length ? ` Close calls: ${keepers.closeCalls.map((k) => `${k.name} (${k.surplus >= 0 ? `saves ~$${k.surplus}` : `$${-k.surplus} over`})`).join(", ")}.` : "";
    todo.push({ kind: "keepers", urgent: false, title: "Next year's keepers", detail: keptLine + closeLine, page: "trades" });
  }
  return { ok: true as const, brief: { team: { id: me.id, name: me.name, record: me.record }, week: team?.week ?? null, todo, keepers } };
}

/** GM · Waivers: best pickups, suggested FAAB bids, rivals' budgets (needs the waiver extras loaded by the site). */
export function runWaivers(ctx: TradeContext, config: TradeLeagueConfig, input: { me: string }, extras: WaiverExtras | null | undefined, prefs?: GmPrefs | null) {
  if (!extras) return null;
  const me = ctx.teams.find((t) => t.id === input.me);
  if (!me) return null;
  const report = analyzeWaivers({ config, teams: ctx.teams, meId: me.id, extras, prefs });
  return report ? { ok: true as const, report } : null;
}

/** What an owner's trade history says about a deal: their habits, and whether this deal fits them. */
export interface PartnerNote { summary: string; traits: string[]; likely: boolean; fit: string | null; record?: string | null }

/** A team's trade results from the after-the-fact grades: "4 won, 2 lost, 1 even (+2 wins)". */
export type { CoachReport };
export function tradeRecord(outcomes: LeagueOutcomes | null | undefined, teamId: string): string | null {
  if (!outcomes) return null;
  let won = 0, lost = 0, even = 0, wins = 0;
  for (const t of outcomes.trades) {
    const side = t.sides.find((x) => x.teamId === teamId);
    if (!side || t.verdict.status === "Early read") continue;
    wins += side.wins;
    if (t.verdict.winner === null) even += 1; else if (t.verdict.winner === side.rosterId) won += 1; else lost += 1;
  }
  return won + lost + even ? `Trade results: ${won} won, ${lost} lost, ${even} even (${wins > 0 ? "+" : ""}${wins} win${Math.abs(wins) === 1 ? "" : "s"} from trades)` : null;
}
const PL: Record<string, string> = { QB: "QBs", RB: "RBs", WR: "WRs", TE: "TEs" };
export function partnerNote(profiles: OwnerProfiles | null | undefined, partnerId: string, theyGet: readonly string[], theyGive: readonly string[], outcomes?: LeagueOutcomes | null): PartnerNote | null {
  const p = profiles?.profiles[partnerId];
  if (!p) return null;
  const likely = p.trades >= Math.max(2, profiles!.norms.perTeam) || p.tradesThisSeason >= 2;
  const fits: string[] = [];
  for (const pos of new Set(theyGet)) if ((p.netByPos[pos] ?? 0) >= 2) fits.push(`they've been buying ${PL[pos] ?? pos}`);
  for (const pos of new Set(theyGive)) if ((p.netByPos[pos] ?? 0) <= -2) fits.push(`they've been selling ${PL[pos] ?? pos}`);
  if (theyGive.includes("PICK") && p.picksOut - p.picksIn >= 2) fits.push("they've traded picks away before");
  if (theyGet.includes("PICK") && p.picksIn - p.picksOut >= 2) fits.push("they collect picks");
  const fit = fits.length ? `Fits their history: ${fits.join(", ")}.` : p.trades === 0 ? "They haven't made a trade on record; expect a harder sell." : null;
  return { summary: p.summary, traits: p.traits, likely, fit, record: tradeRecord(outcomes, partnerId) };
}

const ids = (v: unknown, max = 12) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64).slice(0, max) : []);
const money = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

/** One POST handler body for every league: parses and bounds the request, then runs the mode. */
export function dispatchTradeRequest(body: Record<string, unknown>, deps: { ctx: TradeContext; config: TradeLeagueConfig; signedInTeamId: string | null; waivers?: WaiverExtras | null; prefs?: GmPrefs | null; profiles?: OwnerProfiles | null; news?: Record<string, PlayerNewsBundle> | null; outcomes?: LeagueOutcomes | null }) {
  const { ctx, config } = deps;
  switch (body.mode) {
    case "analyze":
      return runAnalyze(ctx, config, { teamA: String(body.teamA ?? ""), teamB: String(body.teamB ?? ""), aSends: ids(body.aSends), bSends: ids(body.bSends), locked: ids(body.locked, 40), aFaab: money(body.aFaab), bFaab: money(body.bFaab) }, deps.profiles, { outcomes: deps.outcomes, me: deps.signedInTeamId, week: ctx.weeks[0] ?? 0, preseason: !ctx.weeks.length || (ctx.weeks[0] ?? 0) <= 1 });
    case "price":
      return runPrice(ctx, String(body.playerId ?? ""));
    case "plan": {
      const steps = Array.isArray(body.steps) ? body.steps.slice(0, 4).map((st) => { const x = (st ?? {}) as Record<string, unknown>; return { partnerId: String(x.partnerId ?? ""), give: ids(x.give), get: ids(x.get), giveFaab: money(x.giveFaab), getFaab: money(x.getFaab) }; }).filter((st) => st.partnerId) : [];
      return runPlan(ctx, config, { me: String(body.me ?? ""), steps });
    }
    case "multi": {
      const moves = Array.isArray(body.moves) ? body.moves.slice(0, 40).flatMap((m) => { const x = (m ?? {}) as Record<string, unknown>; const from = String(x.from ?? ""), to = String(x.to ?? ""); const playerId = typeof x.playerId === "string" ? x.playerId.slice(0, 64) : undefined; const faab = money(x.faab); return from && to && (playerId || faab) ? [{ from, to, ...(playerId ? { playerId } : {}), ...(faab ? { faab } : {}) }] : []; }) : [];
      return runMulti(ctx, config, { me: deps.signedInTeamId, moves, neutral: body.neutral === true });
    }
    case "targets":
      return runTargets(ctx, config, { me: String(body.me ?? ""), locked: ids(body.locked, 40), positions: ids(body.positions), goal: body.goal === "later" ? "later" : body.goal === "keepers" ? "keepers" : "now" }, deps.profiles, deps.outcomes);
    case "profiles":
      return deps.profiles ? { ok: true as const, norms: deps.profiles.norms, owners: ctx.teams.map((t) => ({ id: t.id, name: t.name, owner: t.owner, summary: deps.profiles!.profiles[t.id]?.summary ?? "No history", traits: deps.profiles!.profiles[t.id]?.traits ?? [], record: tradeRecord(deps.outcomes, t.id) })), coach: deps.outcomes && deps.signedInTeamId ? buildCoachReport(deps.outcomes, deps.signedInTeamId) : null } : null;
    case "myteam":
      return runMyTeam(ctx, config, { me: String(body.me ?? deps.signedInTeamId ?? "") }, deps.news);
    case "waivers":
      return runWaivers(ctx, config, { me: String(body.me ?? deps.signedInTeamId ?? "") }, deps.waivers, deps.prefs);
    case "brief":
      return runBrief(ctx, config, { me: String(body.me ?? deps.signedInTeamId ?? "") }, { waivers: deps.waivers, prefs: deps.prefs, news: deps.news });
    case "history":
      return runHistory(ctx, config, String(body.tradeId ?? ""), deps.outcomes);
    default:
      return null;
  }
}
