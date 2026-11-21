import "server-only";
import { fantasyCalcUrl, type FantasyCalcRow } from "../../hq/packages/league-tiles/src/trade-sleeper.ts";
import type { RookieHistory } from "./analysis.ts";
import { draftOrder, predictPicks, rosterNeeds, suggestPick, type LiveDraft, type LivePick, type LiveRoster, type LiveTradedPick, type PlayerValue, type RookieValue } from "./draftDay.ts";

const SLEEPER = "https://api.sleeper.app/v1";
const TTL = { live: 45_000, slow: 5 * 60_000, values: 15 * 60_000 } as const;
const cache = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();

/** One cached GET per address (failures aren't kept). */
export function cachedJson<T>(url: string, ttl: number): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = fetch(url, { cache: "no-store" }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
  value.catch(() => cache.delete(url));
  if (cache.size > 300) cache.clear();
  cache.set(url, { at: Date.now(), ttl, value });
  return value;
}

type SleeperDraft = { draft_id: string; season: string; status: string; type: string; start_time?: number | null; settings?: { rounds?: number; teams?: number }; slot_to_roster_id?: Record<string, number> | null };
type SleeperLeague = { league_id: string; season: string; previous_league_id?: string | null; roster_positions?: string[]; settings?: { num_teams?: number }; scoring_settings?: Record<string, number> };
type SleeperRoster = { roster_id: number; owner_id?: string | null; co_owners?: string[] | null; players?: string[] | null };

const OPEN = new Set(["pre_draft", "drafting", "paused"]);
/** A rookie draft (not a startup: at most 6 rounds) that hasn't finished. */
const isOpenRookieDraft = (d: SleeperDraft) => OPEN.has(d.status) && (d.settings?.rounds ?? 99) <= 6;

/**
 * The league's current or upcoming rookie draft: an open draft in the current Sleeper league, or in next season's
 * league once Sleeper has renewed it (found through an owner's leagues: the one whose previous_league_id is this one).
 */
export async function findRookieDraft(sleeperLeagueId: string, season: number, ownerSleeperId: string | null): Promise<{ draft: SleeperDraft; leagueId: string } | null> {
  const here = await cachedJson<SleeperDraft[]>(`${SLEEPER}/league/${sleeperLeagueId}/drafts`, TTL.live).catch(() => [] as SleeperDraft[]);
  const open = (here ?? []).find(isOpenRookieDraft);
  if (open) return { draft: open, leagueId: sleeperLeagueId };
  if (!ownerSleeperId) return null;
  const next = await cachedJson<SleeperLeague[]>(`${SLEEPER}/user/${ownerSleeperId}/leagues/nfl/${season + 1}`, TTL.slow).catch(() => [] as SleeperLeague[]);
  const renewed = (next ?? []).find((l) => l.previous_league_id === sleeperLeagueId);
  if (!renewed) return null;
  const drafts = await cachedJson<SleeperDraft[]>(`${SLEEPER}/league/${renewed.league_id}/drafts`, TTL.live).catch(() => [] as SleeperDraft[]);
  const upcoming = (drafts ?? []).find(isOpenRookieDraft);
  return upcoming ? { draft: upcoming, leagueId: renewed.league_id } : null;
}

/** Slot → roster from Sleeper's draft_order (user id → slot) and each roster's owner, when slot_to_roster_id is missing. */
function slotsFromOrder(order: Record<string, number> | null, rosters: readonly SleeperRoster[]): Record<string, number> | null {
  if (!order || !Object.keys(order).length) return null;
  const out: Record<string, number> = {};
  for (const [user, slot] of Object.entries(order)) {
    const r = rosters.find((x) => x.owner_id === user || (x.co_owners ?? []).includes(user));
    if (r) out[String(slot)] = r.roster_id;
  }
  return Object.keys(out).length ? out : null;
}

export type DraftDayView =
  | { state: "none"; nextSeason: number; message: string }
  | { state: "error"; message: string }
  | {
    state: "live";
    draft: { season: number; status: string; type: string; rounds: number; startTime: number | null };
    orderSet: boolean;
    onClock: { pick: number; round: number; label: string; mine: boolean } | null;
    upcoming: { pick: number; round: number; label: string; mine: boolean; position: string | null; reason: string }[];
    myPicks: { pick: number; round: number; slot: string }[];
    recent: { pick: number; round: number; label: string; player: string; position: string | null }[];
    available: { rank: number; name: string; position: string; team: string | null; posRank: number }[];
    suggestion: ReturnType<typeof suggestPick>;
    values: { source: string; href: string | null; note: string };
  };

/** Draft-day view for one owner (ownerKey = that league's owner id, from the sign-in). */
export async function draftDayView(h: RookieHistory, sleeperLeagueId: string, ownerKey: string): Promise<DraftDayView> {
  const nextSeason = h.currentSeason + 1;
  const ownerSleeper = h.people[ownerKey]?.sleeperUserId ?? Object.values(h.people).find((p) => p.current && p.sleeperUserId)?.sleeperUserId ?? null;
  let found: Awaited<ReturnType<typeof findRookieDraft>>;
  try { found = await findRookieDraft(sleeperLeagueId, h.currentSeason, ownerSleeper); } catch { found = null; }
  if (!found) return { state: "none", nextSeason, message: `Draft day mode opens when the ${nextSeason} rookie draft is created in Sleeper.` };
  const { leagueId } = found;
  try {
    // The league's draft list leaves out the order; the draft itself has it (slot_to_roster_id, or draft_order by user).
    const d = await cachedJson<SleeperDraft & { draft_order?: Record<string, number> | null }>(`${SLEEPER}/draft/${found.draft.draft_id}`, TTL.live).catch(() => found.draft as SleeperDraft & { draft_order?: Record<string, number> | null });
    const [picksRaw, tradedRaw, rostersRaw, league] = await Promise.all([
      cachedJson<{ pick_no: number; round: number; roster_id: number; player_id: string; metadata?: { first_name?: string; last_name?: string; position?: string } }[]>(`${SLEEPER}/draft/${d.draft_id}/picks`, TTL.live),
      cachedJson<{ round: number; roster_id: number; owner_id: number }[]>(`${SLEEPER}/draft/${d.draft_id}/traded_picks`, TTL.live).catch(() => []),
      cachedJson<SleeperRoster[]>(`${SLEEPER}/league/${leagueId}/rosters`, TTL.slow),
      cachedJson<SleeperLeague>(`${SLEEPER}/league/${leagueId}`, TTL.slow),
    ]);
    const fc = await cachedJson<FantasyCalcRow[]>(fantasyCalcUrl(league, true), TTL.values).catch(() => [] as FantasyCalcRow[]);
    const draft: LiveDraft = { draftId: d.draft_id, season: Number(d.season), status: d.status, type: d.type, rounds: d.settings?.rounds ?? 4, teams: d.settings?.teams ?? 12, startTime: d.start_time ?? null, slotToRoster: d.slot_to_roster_id ?? slotsFromOrder(d.draft_order ?? null, rostersRaw ?? []) };
    const picks: LivePick[] = (picksRaw ?? []).map((p) => ({ pick: p.pick_no, round: p.round, rosterId: p.roster_id, playerId: p.player_id, player: `${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim(), position: p.metadata?.position ?? null }));
    const traded: LiveTradedPick[] = (tradedRaw ?? []).filter((t) => (t as { season?: string }).season === undefined || String((t as { season?: string }).season) === String(draft.season)).map((t) => ({ round: t.round, originalRosterId: t.roster_id, ownerRosterId: t.owner_id }));
    const keyBySleeper = new Map(Object.entries(h.people).filter(([, p]) => p.current && p.sleeperUserId).map(([k, p]) => [p.sleeperUserId!, k]));
    const rosters: LiveRoster[] = (rostersRaw ?? []).map((r) => {
      const ownerKeys = [r.owner_id, ...(r.co_owners ?? [])].filter((x): x is string => Boolean(x)).map((id) => keyBySleeper.get(id)).filter((k): k is string => Boolean(k));
      return { rosterId: r.roster_id, ownerKeys, label: ownerKeys.map((k) => h.people[k].name).join(" · ") || `Roster ${r.roster_id}`, players: r.players ?? [] };
    });
    const values = new Map<string, PlayerValue>(fc.flatMap((row) => (row.player?.sleeperId && row.player.position && typeof row.value === "number" ? [[row.player.sleeperId, { position: row.player.position, value: row.value }] as const] : [])));
    const taken = new Set(picks.map((p) => p.playerId));
    const rookieRow = (row: FantasyCalcRow) => {
      const p = row.player as (FantasyCalcRow["player"] & { maybeYoe?: number | null; maybeDraftInfo?: { year?: number } | null }) | undefined;
      return Boolean(p?.sleeperId) && (p!.maybeDraftInfo?.year === draft.season || p!.maybeYoe === 0);
    };
    const available: RookieValue[] = fc.filter((row) => rookieRow(row) && ["QB", "RB", "WR", "TE"].includes(row.player?.position ?? "") && !taken.has(row.player!.sleeperId!) && typeof row.value === "number")
      .map((row) => ({ playerId: row.player!.sleeperId!, name: row.player!.name ?? "", position: row.player!.position!, team: row.player!.maybeTeam ?? null, value: row.value! }))
      .sort((a, b) => b.value - a.value);

    const order = draftOrder(draft, traded);
    const made = new Set(picks.map((p) => p.pick));
    const remaining = order.filter((o) => !made.has(o.pick));
    const mine = rosters.find((r) => r.ownerKeys.includes(ownerKey))?.rosterId ?? null;
    const label = (rid: number) => rosters.find((r) => r.rosterId === rid)?.label ?? `Roster ${rid}`;
    const needs = rosterNeeds(rosters, values);
    const myRemaining = remaining.filter((o) => o.rosterId === mine);
    const nextMine = myRemaining[0] ?? null;
    const following = myRemaining[1] ?? null;
    const upcomingSlots = remaining.slice(0, Math.max(8, nextMine ? remaining.indexOf(nextMine) + 1 : 0)).slice(0, 14);
    const predictions = predictPicks(h, upcomingSlots.filter((o) => o.rosterId !== mine), rosters, needs, available);
    const between = nextMine ? predictPicks(h, remaining.filter((o) => o.pick > nextMine.pick && (!following || o.pick < following.pick) && o.rosterId !== mine), rosters, needs, available) : [];
    const posRank = new Map<string, number>();
    const counts: Record<string, number> = {};
    for (const r of available) { counts[r.position] = (counts[r.position] ?? 0) + 1; posRank.set(r.playerId, counts[r.position]); }
    const teams = draft.teams;
    return {
      state: "live",
      draft: { season: draft.season, status: draft.status, type: draft.type, rounds: draft.rounds, startTime: draft.startTime },
      orderSet: order.length > 0,
      onClock: remaining[0] && draft.status !== "pre_draft" ? { pick: remaining[0].pick, round: remaining[0].round, label: label(remaining[0].rosterId), mine: remaining[0].rosterId === mine } : null,
      upcoming: upcomingSlots.map((o) => {
        const p = predictions.find((x) => x.pick === o.pick);
        return { pick: o.pick, round: o.round, label: label(o.rosterId), mine: o.rosterId === mine, position: p?.position ?? null, reason: p?.reason ?? "Your pick." };
      }),
      myPicks: myRemaining.map((o) => ({ pick: o.pick, round: o.round, slot: `${o.round}.${String(((o.pick - 1) % teams) + 1).padStart(2, "0")}` })),
      recent: [...picks].sort((a, b) => b.pick - a.pick).slice(0, 6).map((p) => ({ pick: p.pick, round: p.round, label: label(p.rosterId), player: p.player, position: p.position })),
      available: available.slice(0, 30).map((r, i) => ({ rank: i + 1, name: r.name, position: r.position, team: r.team, posRank: posRank.get(r.playerId) ?? 0 })),
      suggestion: nextMine ? suggestPick({ available, myNeeds: mine != null ? needs.get(mine) ?? null : null, between, teams }) : null,
      values: available.length
        ? { source: "FantasyCalc", href: "https://fantasycalc.com", note: "Rookie order from FantasyCalc dynasty values for this league's settings (ranks only)." }
        : { source: "none", href: null, note: "FantasyCalc rookie values weren't available, so there's no rookie board or suggestion right now. The order and likely positions still come from Sleeper and this league's history." },
    };
  } catch {
    return { state: "error", message: "Sleeper didn't answer just now. Draft day mode will try again in a minute." };
  }
}
