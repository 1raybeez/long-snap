import "server-only";
import type { PlatformSession } from "./auth/session.ts";
import { HQ_DATA_URL } from "./hqDataUrl.ts";
import { rewritePath } from "./links.ts";
import type { PlatformLeague } from "./platformLeagues.ts";
import { forwardAsOwner } from "./siteForward.ts";
import { riverCityMoneyModel } from "./riverCityMoney.ts";
import { lccMoneyRead } from "./lccMoney.ts";
import { rvaMoneyRead } from "./rvaMoney.ts";
import { LCC_ENGINE, RVA_ENGINE } from "./leagueFeatures.ts";
import { sitePage } from "./sitePage.ts";
import { withCloseCalls, type MoneyHistorySeason, type MoneyModel } from "../hq/packages/league-tiles/src/money.ts";
import type { PayoutsModel } from "../hq/packages/league-tiles/src/payouts.ts";
import { lastScoredWeek, loadLeagueTileData, matchupPoints } from "../hq/packages/league-tiles/src/index.ts";

const MONEY_LEAGUES: Readonly<Record<string, { readonly assistant: boolean }>> = {
  "river-city-ffl": { assistant: true },
  "long-country-club": { assistant: false },
  "rva-eskimo-brothers": { assistant: true },
};
const NOT_SHOWN: ReadonlySet<string> = new Set(["jeffrey-hudgins"]);

export const hasMoneyPage = (leagueId: string) => Boolean(MONEY_LEAGUES[leagueId]);
export const moneyPath = (league: PlatformLeague) => `/${league.slug}/commish/money`;
export const moneyApiBase = (league: PlatformLeague) => `/api/${league.slug}/money`;

export function canSeeMoney(session: PlatformSession | null, leagueId: string): boolean {
  const cfg = MONEY_LEAGUES[leagueId];
  const role = session?.account ? session.adminLeagues[leagueId] : undefined;
  if (!cfg || !role || NOT_SHOWN.has(session?.account?.ownerId ?? "")) return false;
  return role === "commissioner" || (role === "assistant" && cfg.assistant);
}

function historyFrom(payouts: PayoutsModel | null): MoneyHistorySeason[] {
  return (payouts?.seasons ?? []).map((s) => ({
    season: s.season,
    duesCents: null,
    paidOutCents: s.awards.reduce((n, a) => n + a.amountCents, 0) + s.weeklyTotalCents,
    champion: s.awards.find((a) => /champion/i.test(a.label))?.note ?? null,
  }));
}

async function readRiverCity(session: PlatformSession | null): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    return { status: 200, body: { ok: true, model: await riverCityMoneyModel(session) } };
  } catch (error) {
    console.error("RC_MONEY_READ_FAILED", error instanceof Error ? error.name : "unknown");
    return { status: 503, body: { ok: false, error: "The money records couldn't be read right now." } };
  }
}

export const runsMoneyHere = (leagueId: string) => leagueId === "river-city-ffl" || (leagueId === "long-country-club" && LCC_ENGINE.has("money")) || (leagueId === "rva-eskimo-brothers" && RVA_ENGINE.has("money"));

/** Callers check canSeeMoney(session, league.id) first. */
export async function loadMoney(league: PlatformLeague, session: PlatformSession | null): Promise<{ readonly ok: true; readonly model: MoneyModel } | { readonly ok: false; readonly message: string }> {
  const [r, payouts, tiles] = await Promise.all([
    runsMoneyHere(league.id) ? (league.id === "long-country-club" ? lccMoneyRead() : league.id === "rva-eskimo-brothers" ? rvaMoneyRead() : readRiverCity(session)) : forwardAsOwner(league, "/api/platform/money", { method: "GET", timeoutMs: 30000 }),
    sitePage<{ model: PayoutsModel }>(league, "payouts").catch(() => null),
    league.sleeperLeagueId ? loadLeagueTileData({ hqLeagueId: league.id, sleeperLeagueId: league.sleeperLeagueId, hqDataUrl: HQ_DATA_URL, managerNames: {} }).catch(() => null) : Promise.resolve(null),
  ]);
  if (r.status === 404) return { ok: false, message: `${league.shortName}'s site hasn't been updated with League Money yet. Try again in a few minutes.` };
  if (r.status === 401 || r.status === 403) return { ok: false, message: `${league.shortName}'s site didn't recognize you as its commissioner. Try signing out and back in.` };
  const model = r.body.model as MoneyModel | undefined;
  if (!r.body.ok || !model) return { ok: false, message: typeof r.body.error === "string" ? r.body.error : `${league.shortName}'s money records couldn't be read right now.` };
  const snapshot = tiles?.snapshot ?? null;
  const topTwo = (week: number): [number, number] | null => {
    const pts = (snapshot?.matchupsByWeek[week] ?? []).map((m) => matchupPoints(m)).sort((a, b) => b - a);
    return pts.length >= 2 ? [pts[0], pts[1]] : null;
  };
  const checked = snapshot ? withCloseCalls(model, { lastScoredWeek: lastScoredWeek(snapshot.league), topTwo }) : model;
  return {
    ok: true,
    model: {
      ...checked,
      history: checked.history.length ? checked.history : historyFrom(payouts?.model ?? null),

      fullLedgerHref: checked.fullLedgerHref ? rewritePath(league, checked.fullLedgerHref) : null,
      exportHref: checked.exportHref ? rewritePath(league, checked.exportHref) : null,
    },
  };
}
