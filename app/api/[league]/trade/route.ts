import { NextResponse } from "next/server";
import { dispatchTradeRequest } from "../../../../hq/packages/league-tiles/src/trade-service.ts";
import { handleGmPrefsRequest } from "../../../../hq/packages/league-tiles/src/gm-prefs.ts";
import { dailyStamp } from "../../../../hq/packages/league-tiles/src/sleeper-schedule.ts";
import { getSession } from "@/lib/auth/session";
import { gmPrefsStore } from "@/lib/gmPrefsStore";
import { loadLeagueData } from "@/lib/leagueData";
import { platformLeague } from "@/lib/platformLeagues";
import { historyStamp, ownerProfiles, publicContext, teamNews, tradeContext, tradeOutcomes, tradeSetup, waiverExtras } from "@/lib/tradeLeagues";
import { hasRemoteGm, remoteGm } from "@/lib/remoteGm";
import { GM_ENGINE_LEAGUES } from "@/lib/leagueFeatures";
import { riverCityGmGet, riverCityGmPost } from "@/lib/riverCityGm";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };
const deny = (league: string) => NextResponse.json({ ok: false, error: `Sign in as a member of ${league} to use the GM tools.` }, { status: 401, headers: PRIVATE });

async function load(slug: string) {
  const league = platformLeague(slug);
  if (!league || (!tradeSetup(league.id) && !hasRemoteGm(league.id) && !GM_ENGINE_LEAGUES.has(league.id))) return null;
  const session = await getSession();
  const membership = session?.leagues[league.id];
  if (!membership) return { league, member: null as null };
  const data = await loadLeagueData(league.id, league.currentSiteUrl);
  if (!data) return null;
  const myTeam = data.teams.find((t) => String(t.rosterId) === String(membership.sleeperRosterId))?.franchiseId ?? membership.franchiseId ?? null;
  return { league, data, member: { myTeam } };
}

export async function GET(_request: Request, { params }: { params: Promise<{ league: string }> }) {
  const x = await load((await params).league);
  if (!x) return NextResponse.json({ ok: false, error: "Unknown league." }, { status: 404, headers: PRIVATE });
  if (!x.member) return deny(x.league.shortName);
  if (GM_ENGINE_LEAGUES.has(x.league.id)) { const r = await riverCityGmGet(x.member.myTeam); return NextResponse.json(r.body, { status: r.status, headers: PRIVATE }); }
  if (hasRemoteGm(x.league.id)) { const r = await remoteGm(x.league, "GET", null, x.member.myTeam); return NextResponse.json(r.body, { status: r.status, headers: PRIVATE }); }
  try {
    const ctx = await tradeContext(x.league, x.data);
    return NextResponse.json(publicContext(x.league, ctx, x.member.myTeam), { headers: PRIVATE });
  } catch (error) {
    console.error("Trade analyzer context failed", error);
    return NextResponse.json({ ok: false, error: "Roster data is unavailable right now." }, { status: 503, headers: PRIVATE });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ league: string }> }) {
  const x = await load((await params).league);
  if (!x) return NextResponse.json({ ok: false, error: "Unknown league." }, { status: 404, headers: PRIVATE });
  if (!x.member) return deny(x.league.shortName);
  const { league, data, member } = x;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400, headers: PRIVATE }); }

  if (GM_ENGINE_LEAGUES.has(league.id)) { const r = await riverCityGmPost(body, member.myTeam); return NextResponse.json(r.body, { status: r.status, headers: PRIVATE }); }
  if (hasRemoteGm(league.id)) { const r = await remoteGm(league, "POST", body, member.myTeam); return NextResponse.json(r.body, { status: r.status, headers: PRIVATE }); }
  const setup = tradeSetup(league.id)!;
  const store = gmPrefsStore(league.id);
  const prefsOut = await handleGmPrefsRequest(body, { store, signedInTeamId: member.myTeam }).catch((e) => { console.error("GM style failed", e); return { ok: false as const, error: "Couldn't save right now." }; });
  if (prefsOut) return NextResponse.json(prefsOut, { status: prefsOut.ok ? 200 : 400, headers: PRIVATE });
  try {
    const ctx = await tradeContext(league, data);
    const sid = league.sleeperLeagueId!;
    const mode = String(body.mode);
    const me = String(body.me ?? member.myTeam ?? "");
    const prefs = (mode === "waivers" || mode === "brief") && store ? await store.get(me).catch(() => null) : null;
    const profiles = ["targets", "analyze", "profiles"].includes(mode) ? await ownerProfiles(sid, data.season, ctx.rosterToTeam, historyStamp(ctx, data.season)).catch((e) => { console.error("Owner profiles failed", e); return null; }) : null;
    const myTeam = mode === "myteam" || mode === "brief" ? ctx.teams.find((t) => t.id === me) : null;
    const news = myTeam ? await teamNews(myTeam.players.filter((p) => p.kind !== "pick" && p.pos !== "PICK").map((p) => ({ id: p.id, name: p.name, team: p.nflTeam }))).catch((e) => { console.error("Team news failed", e); return null; }) : null;
    const outcomes = ["targets", "history", "profiles", "analyze"].includes(mode) ? await tradeOutcomes(sid, setup.market === "dynasty" ? "dynasty" : "redraft", ctx.rosterToTeam, dailyStamp()).catch((e) => { console.error("Trade outcomes failed", e); return null; }) : null;
    const waivers = mode === "waivers" || mode === "brief" ? await waiverExtras(sid, data.season, setup.market, ctx.weeks, ctx.rosterToTeam, dailyStamp()).catch((e) => { console.error("Waiver data failed", e); return null; }) : null;
    if (mode === "waivers" && !waivers) return NextResponse.json({ ok: false, error: "Waiver data is unavailable right now." }, { status: 503, headers: PRIVATE });
    const out = dispatchTradeRequest(body, { ctx, config: setup.config(ctx), signedInTeamId: member.myTeam, waivers, prefs, profiles, news, outcomes });
    if (!out) return NextResponse.json({ ok: false, error: "That trade, player or pick isn't on the current rosters." }, { status: 400, headers: PRIVATE });
    return NextResponse.json(out, { headers: PRIVATE });
  } catch (error) {
    console.error("Trade analyzer failed", error);
    return NextResponse.json({ ok: false, error: "The analyzer is unavailable right now." }, { status: 503, headers: PRIVATE });
  }
}
