// Long Snap demo: answers Sleeper API requests for the made-up leagues from local files (data/demo/),
// so the platform's real pages render them exactly like any Sleeper league. Requests for anything else
// (NFL state, the player list) still go to Sleeper's public API.
import { readFileSync } from "node:fs";
import { MockAgent, setGlobalDispatcher } from "undici";
import path from "node:path";
import { DEMO_KEYS, DEMO_SEASONS, demoDraftId, demoLeagueId, demoUserId, parseDemoLeagueId, type DemoKey } from "./demoLeagues.ts";

const DATA = process.env.LONGSNAP_DEMO_DATA ?? path.join(process.cwd(), "data", "demo");
const cache = new Map<string, any>();

/** Names for every player in the made-up leagues (id → [first, last, position, NFL team]). */
let playerNames: Record<string, [string, string, string, string]> | null = null;
export function players() {
  playerNames ??= JSON.parse(readFileSync(path.join(DATA, "players.json"), "utf8"));
  return playerNames!;
}

/** One season of a made-up league, with owner IDs turned into Sleeper-style numeric IDs. */
export function season(key: DemoKey, s: number) {
  const k = `${key}:${s}`;
  if (cache.has(k)) return cache.get(k);
  const d = JSON.parse(readFileSync(path.join(DATA, key, "seasons", `${s}.json`), "utf8"));
  const id = demoLeagueId(key, s);
  d.users = d.users.map((u: any) => ({ ...u, user_id: demoUserId(u.user_id), league_id: id, display_name: u.display_name, avatar: null,
    metadata: { team_name: u.metadata.team_name } }));
  d.rosters = d.rosters.map((r: any) => ({ ...r, league_id: id, owner_id: demoUserId(r.owner_id), co_owners: r.co_owners?.map(demoUserId) ?? null,
    starters: (d.matchups[String(Math.min(d.league.settings.leg, 17))] ?? []).find((m: any) => m.roster_id === r.roster_id)?.starters ?? [] }));
  d.draft.picks = d.draft.picks.map((p: any) => {
    const pl = players()[p.player_id];
    const meta = pl ? { first_name: pl[0], last_name: pl[1], position: p.metadata?.position ?? pl[2], team: pl[3] } : {};
    return { ...p, picked_by: demoUserId(p.picked_by), draft_id: demoDraftId(key, s), metadata: { ...meta, ...p.metadata } };
  });
  if (d.draft.draft_order) d.draft.draft_order = Object.fromEntries(Object.entries(d.draft.draft_order).map(([u, v]) => [demoUserId(u), v]));
  const done = d.league.status === "complete" ? 17 : d.league.settings.leg;
  d.league = { ...d.league, settings: { ...d.league.settings, last_scored_leg: done, leg: d.league.status === "complete" ? 17 : done + 1, start_week: 1, playoff_type: 0, playoff_round_type: 0 },
    league_id: id, previous_league_id: s > DEMO_SEASONS[0] ? demoLeagueId(key, s - 1) : null, draft_id: demoDraftId(key, s), avatar: null };
  cache.set(k, d);
  return d;
}

const draftOut = (key: DemoKey, s: number) => {
  const d = season(key, s);
  const { picks: _picks, ...draft } = d.draft;
  return { ...draft, draft_id: demoDraftId(key, s), league_id: demoLeagueId(key, s), status: "complete", season: String(s),
    type: draft.type === "linear" ? "linear" : draft.type, settings: { ...draft.settings } };
};

export function fakeSleeperResponse(url: string): unknown | undefined {
  const u = url.replace(/\?.*$/, "");
  let m = u.match(/^https:\/\/api\.sleeper\.app\/v1\/league\/(\d+)(?:\/([a-z_]+))?(?:\/(\d+))?$/);
  if (m) {
    const hit = parseDemoLeagueId(m[1]);
    if (!hit) return undefined;
    const d = season(hit.key, hit.season);
    const [, , sub, arg] = m;
    switch (sub) {
      case undefined: return d.league;
      case "users": return d.users;
      case "rosters": return d.rosters;
      case "matchups": return d.matchups[arg ?? "1"] ?? [];
      case "winners_bracket": return d.winners_bracket ?? [];
      case "losers_bracket": return [];
      case "traded_picks": return d.traded_picks ?? [];
      case "transactions": return d.transactions.filter((t: any) => String(t.leg) === String(arg ?? "1"))
        .map((t: any) => ({ ...t, creator: null, consenter_ids: t.roster_ids, waiver_budget: [], metadata: null }));
      case "drafts": return [draftOut(hit.key, hit.season)];
      default: return undefined;
    }
  }
  m = u.match(/^https:\/\/api\.sleeper\.app\/v1\/draft\/(\d+)(?:\/(picks|traded_picks))?$/);
  if (m) {
    const hit = parseDemoLeagueId(m[1].slice(0, -1));
    if (!hit) return undefined;
    if (!m[2]) return draftOut(hit.key, hit.season);
    if (m[2] === "picks") return season(hit.key, hit.season).draft.picks;
    return [];
  }
  m = u.match(/^https:\/\/api\.sleeper\.app\/v1\/user\/(8\d+)$/);
  if (m) {
    for (const key of DEMO_KEYS) for (const usr of season(key, DEMO_SEASONS.at(-1)!).users) if (usr.user_id === m[1]) return { user_id: usr.user_id, username: usr.display_name.toLowerCase(), display_name: usr.display_name, avatar: null };
    return null;
  }
  return undefined;
}

export function installFakeSleeper() {
  const g = globalThis as any;
  if (g.__longsnapFake) return;
  g.__longsnapFake = true;
  const real = g.fetch.bind(g);
  g.fetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? String(input);
    if (url.startsWith("https://api.sleeper.app/")) {
      const body = fakeSleeperResponse(url);
      if (process.env.LONGSNAP_DEBUG) console.error("FAKE_SLEEPER", url, body === undefined ? "pass" : "served");
      if (body !== undefined) return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    return real(input, init);
  };
  // Next can refresh a cached fetch with the original fetch, around the wrapper above. Answer at the network layer too,
  // so every request for a made-up league is served from the files, however it is made.
  const agent = new MockAgent();
  agent.enableNetConnect();
  agent.get("https://api.sleeper.app").intercept({ path: (p: string) => fakeSleeperResponse(`https://api.sleeper.app${p}`) !== undefined, method: "GET" })
    .reply((opts: { path: string }) => ({ statusCode: 200, data: JSON.stringify(fakeSleeperResponse(`https://api.sleeper.app${opts.path}`)), responseOptions: { headers: { "content-type": "application/json" } } }))
    .persist();
  setGlobalDispatcher(agent);
}
