
import type { TradeLeagueConfig } from "./trade-engine.ts";
import { buildSleeperTradeContext, tradeWindowNote, type SleeperTradeContext } from "./trade-sleeper.ts";

export const C4G_LEAGUE_ID = "";

export async function buildC4gTradeContext(season = 2026): Promise<SleeperTradeContext> {
  const r = await fetch(`https://api.sleeper.app/v1/league/${C4G_LEAGUE_ID}/users`, { cache: "no-store" });
  const users = r.ok ? ((await r.json()) as { user_id: string; display_name: string; metadata?: { team_name?: string } | null }[]) : [];
  return buildSleeperTradeContext({
    leagueId: C4G_LEAGUE_ID,
    season,
    market: "redraft",
    pickYears: 0,
    teams: users.map((u) => ({ id: u.user_id, name: u.metadata?.team_name?.trim() || u.display_name, owner: u.display_name, sleeperUserIds: [u.user_id] })),
  });
}

export function c4gTradeConfig(ctx: SleeperTradeContext): TradeLeagueConfig {
  return {
    leagueName: "C4G",
    format: "redraft",
    slots: ctx.slots.length ? ctx.slots : ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"],
    flex: { FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"], WRRB_FLEX: ["RB", "WR"], REC_FLEX: ["WR", "TE"] },
    weeks: ctx.weeks,
    keeper: null,

    veto: { rule: "C4G's veto process hasn't been entered yet.", history: "" },
    marketLabel: "FantasyCalc (redraft, half-PPR, 1 QB, 10 teams)",
    projectionLabel: "Sleeper weekly projections",
    tradeWindow: tradeWindowNote(ctx, null),
  };
}
