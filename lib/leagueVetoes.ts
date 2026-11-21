import "server-only";
import type { PlatformSession } from "./auth/session.ts";
import { adminFirestore } from "./auth/firebaseAdmin.ts";
import { currentSleeperLeagueId, sleeperTeams } from "./auth/teamPicks.ts";
import { commishRole } from "./remoteCommish.ts";
import { PLAYER_NAMES } from "../hq/packages/league-tiles/src/player-names.ts";
import { buildVetoLog, parseVetoFlagInput, type VetoFlag, type VetoLogConfig, type VetoLogModel, type VetoLogTeam } from "../hq/packages/league-tiles/src/veto-log.ts";
import { HQ_LEAGUE_REGISTRY } from "../hq/config/leagues/registry.ts";
import { sleeperFeedFetch } from "./sleeperFeed.ts";

const COLLECTION = "leagueVetoFlags";

export const LEAGUE_VETO_CONFIG: Readonly<Record<string, VetoLogConfig>> = {
  "long-country-club": {
    flagsPerSeason: null,
    pollHours: 8,
    rule: "Sleeper approves a trade once both owners accept. If any owner believes it's unfair, the Commissioner posts an 8-hour Sleeper poll; owners in the trade can't vote, and a simple majority of votes cast decides (Constitution 5.2).",
  },
  "rva-eskimo-brothers": {
    flagsPerSeason: null,
    pollHours: 8,
    rule: "Sleeper approves a trade once both franchises accept. If a franchise believes it's unfair, the Commissioner posts an 8-hour Sleeper poll; franchises in the trade can't vote, each other franchise gets one vote, and a simple majority of votes cast decides, with no quorum (Constitution 5.2).",
  },
};

export const hasLeagueVetoLog = (leagueId: string) => Boolean(LEAGUE_VETO_CONFIG[leagueId]);

const currentSeason = (leagueId: string) => HQ_LEAGUE_REGISTRY.leagues.find((l) => l.id === leagueId)?.currentSeason ?? new Date().getFullYear();

/** This season's Sleeper teams (team id = Sleeper roster id). */
async function vetoTeams(leagueId: string): Promise<VetoLogTeam[]> {
  const sleeperId = currentSleeperLeagueId(leagueId);
  if (!sleeperId) return [];
  return (await sleeperTeams(sleeperId)).map((t) => ({ id: t.rosterId, name: t.name }));
}

export interface VetoTradeOption { readonly id: string; readonly label: string; readonly date: string; readonly week?: number }
type SleeperTx = { transaction_id: string; type: string; status: string; roster_ids: number[]; adds: Record<string, number> | null; draft_picks?: { season: string; round: number; owner_id: number }[] | null; leg?: number; created?: number };

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

/** This season's completed two-team trades (players and picks), newest first, for the commissioner's picker. */
async function vetoTradeOptions(leagueId: string, teams: readonly VetoLogTeam[]): Promise<VetoTradeOption[]> {
  const sleeperId = currentSleeperLeagueId(leagueId);
  if (!sleeperId) return [];
  const get = async <T,>(path: string, fallback: T): Promise<T> => {
    try { const r = await sleeperFeedFetch(`https://api.sleeper.app/v1${path}`, { next: { revalidate: 120 } } as RequestInit); return r.ok ? ((await r.json()) as T) : fallback; } catch { return fallback; }
  };
  const state = await get<{ week?: number }>("/state/nfl", {});
  const weeks = Array.from({ length: Math.min(18, Math.max(1, Number(state.week) || 1) + 1) }, (_, i) => i + 1);
  const all = (await Promise.all(weeks.map((w) => get<SleeperTx[]>(`/league/${sleeperId}/transactions/${w}`, [])))).flat();
  const names = new Map(teams.map((t) => [t.id, t.name]));
  const teamName = (r: number) => names.get(String(r)) ?? `Team ${r}`;
  const player = (id: string) => PLAYER_NAMES[id]?.split("|")[0] ?? "a player";
  return all
    .filter((t) => t.type === "trade" && t.status === "complete" && t.roster_ids.length === 2)
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .map((t) => {
      const side = (r: number) => [...Object.entries(t.adds ?? {}).filter(([, to]) => to === r).map(([id]) => player(id)), ...(t.draft_picks ?? []).filter((p) => p.owner_id === r).map((p) => `${p.season} ${ordinal(p.round)}`)];
      const [a, b] = t.roster_ids as [number, number];
      const when = t.created ? new Date(t.created).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "";
      return { id: t.transaction_id, label: `${teamName(a)} got ${side(a).join(" + ") || "—"} · ${teamName(b)} got ${side(b).join(" + ") || "—"}`, date: `Week ${t.leg ?? "?"}${when ? ` · ${when}` : ""}`, week: t.leg };
    });
}

async function readFlags(leagueId: string): Promise<VetoFlag[]> {
  try {
    const snap = await adminFirestore().collection(COLLECTION).where("leagueId", "==", leagueId).get();
    return snap.docs.map((d) => { const { leagueId: _l, createdBy: _c, updatedBy: _u, createdAt: _ca, updatedAt: _ua, ...f } = d.data() as Record<string, unknown>; void _l; void _c; void _u; void _ca; void _ua; return { ...(f as Omit<VetoFlag, "id" | "source">), id: d.id, source: "log" as const }; })
      .sort((a, b) => b.season - a.season || (b.week ?? 0) - (a.week ?? 0));
  } catch (error) {
    console.error("Veto log read failed", leagueId, error);
    return [];
  }
}

export async function leaguePublicVetoLog(leagueId: string): Promise<{ model: VetoLogModel; constitutionHref: string }> {
  const [flags, teams] = await Promise.all([readFlags(leagueId), vetoTeams(leagueId).catch(() => [])]);
  return { model: buildVetoLog(flags, teams, currentSeason(leagueId), LEAGUE_VETO_CONFIG[leagueId]!), constitutionHref: "/league-info/constitution#constitution-subsection-5.2" };
}

export async function leagueVetoAdmin(leagueId: string): Promise<{ teams: VetoLogTeam[]; trades: VetoTradeOption[]; flags: VetoFlag[]; season: number }> {
  const teams = await vetoTeams(leagueId).catch(() => []);
  const trades = await vetoTradeOptions(leagueId, teams).catch(() => []);
  return { teams, trades, flags: await readFlags(leagueId), season: currentSeason(leagueId) };
}

/** Pending flags this season (for the Commissioner Hub's "needs attention"). */
export async function leaguePendingVetoes(leagueId: string): Promise<number> {
  const season = currentSeason(leagueId);
  return (await readFlags(leagueId)).filter((f) => f.season === season && f.outcome === "pending").length;
}

type Result = { status: number; body: Record<string, unknown> };

export async function leagueVetoAction(leagueId: string, session: PlatformSession | null, bodyText: string): Promise<Result> {
  if (!commishRole(session, leagueId) || !session?.email) return { status: 401, body: { ok: false, error: "Commissioner access required." } };
  let body: Record<string, unknown> = {};
  try { const parsed = JSON.parse(bodyText) as unknown; if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>; } catch { body = {}; }
  const action = String(body.action ?? "");
  const id = typeof body.id === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(body.id) ? body.id : null;
  const col = adminFirestore().collection(COLLECTION);
  try {
    if (action === "delete") {
      if (!id) return { status: 400, body: { ok: false, error: "Missing flag." } };
      const doc = await col.doc(id).get();
      if (doc.data()?.leagueId !== leagueId) return { status: 404, body: { ok: false, error: "Flag not found." } };
      await col.doc(id).delete();
    } else if (action === "create" || action === "update") {
      const parsed = parseVetoFlagInput(body, await vetoTeams(leagueId));
      if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } };
      const now = new Date().toISOString();
      const data = { ...parsed.flag, leagueId, updatedAt: now, updatedBy: session.email };
      if (action === "update") {
        if (!id) return { status: 400, body: { ok: false, error: "Missing flag." } };
        const doc = await col.doc(id).get();
        if (doc.data()?.leagueId !== leagueId) return { status: 404, body: { ok: false, error: "Flag not found." } };
        await col.doc(id).set(data, { merge: true });
      } else await col.add({ ...data, createdAt: now, createdBy: session.email });
    } else return { status: 400, body: { ok: false, error: "Unknown action." } };
    return { status: 200, body: { ok: true, flags: await readFlags(leagueId) } };
  } catch (error) {
    console.error("Veto log write failed", leagueId, error);
    return { status: 500, body: { ok: false, error: "Couldn't save the veto flag." } };
  }
}
