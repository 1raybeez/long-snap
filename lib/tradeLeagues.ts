import "server-only";
import { unstable_cache } from "next/cache";
import type { TradeLeagueConfig } from "../hq/packages/league-tiles/src/trade-engine.ts";
import { publicTradeContext } from "../hq/packages/league-tiles/src/trade-service.ts";
import { buildSleeperTradeContext, tradeWindowNote, type SleeperTradeContext } from "../hq/packages/league-tiles/src/trade-sleeper.ts";
import { c4gTradeConfig } from "../hq/packages/league-tiles/src/trade-c4g.ts";
import { loadWaiverExtras } from "../hq/packages/league-tiles/src/waivers.ts";
import { loadOwnerProfiles } from "../hq/packages/league-tiles/src/owner-profiles.ts";
import { loadTradeOutcomes } from "../hq/packages/league-tiles/src/trade-outcomes.ts";
import { loadPlayerNewsBundle } from "../hq/packages/league-tiles/src/player-news.ts";
import { tradeHistoryStamp } from "../hq/packages/league-tiles/src/sleeper-schedule.ts";
import type { LeagueData } from "./leagueData.ts";
import type { PlatformLeague } from "./platformLeagues.ts";
import { GM_LEAGUES } from "./leagueFeatures.ts";

/**
 * The shared Trade Analyzer and GM tools on the platform. Each league brings its own rules (never assumed from another
 * league); the engine, Sleeper loader and views are the shared kit, the same ones its current site uses.
 */
type Setup = {
  market: "dynasty" | "redraft";
  /** Future rookie picks that can be traded (drafts out). */
  pickYears: number;
  pickOrder?: Parameters<typeof buildSleeperTradeContext>[0]["pickOrder"];
  reopens: string | null;
  config(ctx: SleeperTradeContext): TradeLeagueConfig;
  meta: { market: string; marketHref: string; market2?: { name: string; href: string } | null };

  dynastyDealer?: boolean;
};

const FLEX = { FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"], WRRB_FLEX: ["RB", "WR"], REC_FLEX: ["WR", "TE"] } as const;
const DEMO_SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];
const demoSetup = (o: { name: string; format: "auction-keeper" | "dynasty" | "redraft"; market: "dynasty" | "redraft"; pickYears: number; reopens: string | null;
  keeper: TradeLeagueConfig["keeper"]; veto: string; pickOrder?: Setup["pickOrder"] }): Setup => ({
  market: o.market,
  pickYears: o.pickYears,
  pickOrder: o.pickOrder,
  reopens: o.reopens,
  meta: { market: `FantasyCalc (${o.market})`, marketHref: "https://fantasycalc.com" },
  config: (ctx) => ({
    leagueName: o.name,
    format: o.format,
    slots: ctx.slots.length ? ctx.slots : DEMO_SLOTS,
    flex: FLEX,
    weeks: ctx.weeks,
    keeper: o.keeper,
    veto: { rule: o.veto, history: "" },
    marketLabel: `FantasyCalc (${o.market}, half-PPR, 1 QB, 12 teams)`,
    projectionLabel: "Sleeper projections blended with season-to-date points",
    tradeWindow: tradeWindowNote(ctx, o.reopens),
  }),
});

const SETUPS: Record<string, Setup> = {
  // Long Snap demo leagues: each commissioner's answers from the setup page.
  "harbor-city-ffl": demoSetup({ name: "Harbor City", format: "auction-keeper", market: "redraft", pickYears: 0, reopens: null,
    keeper: { max: 2, onePerPosition: true, rule: "Keep up to 2, one per position. A keeper costs his last price + $10." },
    veto: "A trade is reversed only if 6 of the 10 teams not in it vote to veto within 24 hours." }),
  "mill-creek-ffl": demoSetup({ name: "Mill Creek", format: "redraft", market: "redraft", pickYears: 0, reopens: null, keeper: null,
    veto: "A trade is reversed only if 6 of the 10 teams not in it vote to veto within 48 hours." }),
  "ironworks-dynasty": demoSetup({ name: "Ironworks", format: "dynasty", market: "dynasty", pickYears: 3, reopens: "March 1", keeper: null,
    pickOrder: { playoffTeams: 6, pointsSeeds: 2, nonPlayoff: "maxPf" }, veto: "No vetoes; the commissioner reviews trades." }),
  "lakeview-ffl": demoSetup({ name: "Lakeview", format: "redraft", market: "redraft", pickYears: 0, reopens: null, keeper: null,
    veto: "The commissioner reviews trades." }),




  // its own Sleeper league (dynasty, 10 teams, 1 QB, full PPR, 3-round rookie drafts); FantasyCalc's values are picked from

  // are whatever its Sleeper league is set to (pick slots follow Sleeper's own draft order).
};

export function hasTradeTools(leagueId: string): boolean {
  return GM_LEAGUES.has(leagueId) && (Boolean(SETUPS[leagueId]) || leagueId === "river-city-ffl");
}

export function tradeSetup(leagueId: string): Setup | null {
  return SETUPS[leagueId] ?? null;
}

const contextFor = unstable_cache(
  async (leagueId: string, sleeperLeagueId: string, season: number, teams: { id: string; name: string; owner: string | null; rosterId: number }[]) => {
    const s = SETUPS[leagueId];
    return buildSleeperTradeContext({ leagueId: sleeperLeagueId, season, teams, market: s.market, pickYears: s.pickYears, pickOrder: s.pickOrder, dynastyDealer: s.dynastyDealer });
  },
  ["platform-trade-context-v4"], { revalidate: 120 },
);

export function tradeContext(league: PlatformLeague, data: LeagueData): Promise<SleeperTradeContext> {
  if (!league.sleeperLeagueId) throw new Error("No Sleeper league");
  return contextFor(league.id, league.sleeperLeagueId, data.season, data.teams.map((t) => ({ id: t.franchiseId, name: t.name ?? t.franchiseId, owner: t.ownerLabel, rosterId: t.rosterId })));
}

export function publicContext(league: PlatformLeague, ctx: SleeperTradeContext, myTeamId: string | null) {
  const s = SETUPS[league.id];
  const notice = [tradeWindowNote(ctx, s.reopens), ctx.scoringNote].filter(Boolean).join(" ");
  return publicTradeContext(ctx, { leagueName: league.name, market: s.meta.market, marketHref: s.meta.marketHref, market2: s.meta.market2 ?? null, reopens: s.reopens, notice: notice || null, format: s.market }, myTeamId);
}

export const ownerProfiles = unstable_cache(
  (sleeperLeagueId: string, season: number, rosterToTeam: Record<string, string>, _stamp: string) => loadOwnerProfiles({ leagueId: sleeperLeagueId, season, rosterToTeam }),
  ["platform-owner-profiles-v1"], { revalidate: false },
);

export const tradeOutcomes = unstable_cache(
  (sleeperLeagueId: string, kind: "dynasty" | "keeper" | "redraft", rosterToTeam: Record<string, string>, _day: string) => loadTradeOutcomes({ leagueId: sleeperLeagueId, rosterToTeam, kind }),
  ["platform-trade-outcomes-v1"], { revalidate: false },
);

export const waiverExtras = unstable_cache(
  (sleeperLeagueId: string, season: number, market: "dynasty" | "redraft", weeks: number[], rosterToTeam: Record<string, string>, _day: string) => loadWaiverExtras({ leagueId: sleeperLeagueId, season, weeks, market, rosterToTeam }),
  ["platform-waivers-v1"], { revalidate: false },
);

export const teamNews = unstable_cache(
  (players: { id: string; name: string; team: string | null }[]) => loadPlayerNewsBundle(players),
  ["platform-team-news-v1"], { revalidate: 1800 },
);

export const historyStamp = (ctx: SleeperTradeContext, season: number) => tradeHistoryStamp({ season, nowWeek: ctx.nowWeek, deadlineWeek: ctx.deadlineWeek, seasonType: ctx.seasonType });
