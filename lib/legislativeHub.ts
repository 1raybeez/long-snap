import "server-only";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "./auth/session.ts";
import { forwardAsOwner } from "./siteForward.ts";
import { RIVER_CITY_LEAGUE_ID, riverCityLegislativeHub, riverCitySubmitProposal, riverCityVote } from "./riverCityLegislative.ts";
import { lccLegislativeCommissioner, lccLegislativeHub, lccSubmitProposal, lccVote } from "./lccLegislative.ts";
import { rvaLegislativeCommissioner, rvaLegislativeHub, rvaSubmitProposal, rvaVote } from "./rvaLegislative.ts";
import { LCC_ENGINE, RVA_ENGINE } from "./leagueFeatures.ts";
import { demoLegislativeHub } from "./demo/demoGovernance.ts";
import { DEMO_SLUGS } from "./demo/demoLeagues.ts";
import type { PlatformLeague } from "./platformLeagues.ts";
import type { LegislativeHubState, RuleOption } from "../hq/packages/league-governance/src/index.ts";

export interface LegislativeViewer { readonly signedIn: boolean; readonly voterId: string | null; readonly name: string | null; readonly email: string | null; readonly isCommissioner: boolean }
export interface LegislativeHubPageData { readonly available: boolean; readonly state: LegislativeHubState | null; readonly viewer: LegislativeViewer; readonly rules: readonly RuleOption[]; readonly teamsVoted: Readonly<Record<string, number>> }

type Api = { readonly hub: string; readonly vote: string; readonly commissioner: string | null; readonly shape: "hub" | "river-city" };
const LCC = "long-country-club";
const RVA = "rva-eskimo-brothers";
const API: Readonly<Record<string, Api>> = {
  "long-country-club": { hub: "/api/league-info/legislative/hub", vote: "/api/league-info/legislative/hub/vote", commissioner: "/api/league-info/legislative/hub/commissioner", shape: "hub" },
  "rva-eskimo-brothers": { hub: "/api/league-info/legislative/hub", vote: "/api/league-info/legislative/hub/vote", commissioner: "/api/league-info/legislative/hub/commissioner", shape: "hub" },

  // Its commissioner controls live on its Commissioner Hub (/commish/proposals), not on the hub page.
  "river-city-ffl": { hub: "/api/league-info/legislative", vote: "/api/league-info/legislative/vote", commissioner: null, shape: "river-city" },
};

export const hasLegislativeHub = (leagueId: string) => Boolean(API[leagueId]) || DEMO_SLUGS.includes(leagueId);
export const legislativeApiBase = (league: PlatformLeague) => `/api/${league.slug}/legislative`;

export async function callLeagueLegislative(league: PlatformLeague, action: "hub" | "vote" | "commissioner", init: { method: "GET" | "POST"; body?: string }): Promise<{ status: number; body: Record<string, unknown> }> {
  if (DEMO_SLUGS.includes(league.id)) return { status: 403, body: { ok: false, error: "This is a demo league. In your own league, owners sign in and vote here." } };
  const api = API[league.id];
  const path = api ? (action === "hub" ? api.hub : action === "vote" ? api.vote : api.commissioner) : null;
  if (!api || !path) return { status: 404, body: { ok: false, error: "Not available for this league." } };
  if (league.id === LCC && LCC_ENGINE.has("legislative")) {
    if (init.method !== "POST") return { status: 405, body: { ok: false, error: "Not allowed." } };
    const body = init.body ?? "";
    return action === "vote" ? lccVote(body) : action === "commissioner" ? lccLegislativeCommissioner(body) : lccSubmitProposal(body);
  }
  if (league.id === RVA && RVA_ENGINE.has("legislative")) {
    if (init.method !== "POST") return { status: 405, body: { ok: false, error: "Not allowed." } };
    const body = init.body ?? "";
    return action === "vote" ? rvaVote(body) : action === "commissioner" ? rvaLegislativeCommissioner(body) : rvaSubmitProposal(body);
  }
  if (league.id === RIVER_CITY_LEAGUE_ID) {
    if (init.method !== "POST") return { status: 405, body: { ok: false, error: "Not allowed." } };
    const session = await getSession();
    return action === "vote" ? riverCityVote(session, init.body ?? "") : riverCitySubmitProposal(session, init.body ?? "");
  }
  const r = await forwardAsOwner(league, path, init);

  return { status: r.status, body: { ...r.body, ok: r.status < 400 && r.body.ok !== false && r.body.success !== false } };
}

/** The hub as the shared page wants it, for any of the three leagues. */
export async function loadLegislativeHub(league: PlatformLeague, leagueNameFallback: { meetingName: string; ruleChangeThreshold: string }): Promise<LegislativeHubPageData> {
  if (DEMO_SLUGS.includes(league.id)) return demoLegislativeHub(league.id);
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  if (league.id === RIVER_CITY_LEAGUE_ID) return riverCityLegislativeHub(await getSession(), league, leagueNameFallback, signedIn);
  if (league.id === LCC && LCC_ENGINE.has("legislative")) {
    try {
      return await lccLegislativeHub();
    } catch (error) {
      console.error("LCC_LEGISLATIVE_HUB_FAILED", error instanceof Error ? error.name : "unknown");
      return { available: false, state: null, viewer: { signedIn, voterId: null, name: null, email: null, isCommissioner: false }, rules: [], teamsVoted: {} };
    }
  }
  if (league.id === RVA && RVA_ENGINE.has("legislative")) {
    try {
      return await rvaLegislativeHub();
    } catch (error) {
      console.error("RVA_LEGISLATIVE_HUB_FAILED", error instanceof Error ? error.name : "unknown");
      return { available: false, state: null, viewer: { signedIn, voterId: null, name: null, email: null, isCommissioner: false }, rules: [], teamsVoted: {} };
    }
  }
  const empty: LegislativeHubPageData = { available: false, state: null, viewer: { signedIn, voterId: null, name: null, email: null, isCommissioner: false }, rules: [], teamsVoted: {} };
  const r = await callLeagueLegislative(league, "hub", { method: "GET" });
  if (r.status >= 500 && !r.body.state && !r.body.voteNow) return empty;
  const b = r.body as Record<string, unknown>;
  if (API[league.id]?.shape === "hub") {
    const v = (b.viewer ?? {}) as { signedIn?: boolean; canVote?: boolean; isCommissioner?: boolean };
    return {
      available: Boolean(b.available), state: (b.state as LegislativeHubState | null) ?? null,
      // The site answers canVote, not the team id; the page only needs to know there is one.
      viewer: { signedIn: Boolean(v.signedIn), voterId: v.canVote ? "me" : null, name: null, email: null, isCommissioner: Boolean(v.isCommissioner) },
      rules: (b.rules as RuleOption[]) ?? [], teamsVoted: (b.teamsVoted as Record<string, number>) ?? {},
    };
  }
  return empty;
}
