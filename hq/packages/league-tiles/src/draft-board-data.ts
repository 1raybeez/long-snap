import type { DraftBoardPick, DraftBoardTeam } from "./draft-board.tsx";

/** Raw Sleeper shapes used by the draft board (only the fields we read). */
export interface SleeperDraftPickLike {
  readonly pick_no?: number | null;
  readonly round?: number | null;
  readonly draft_slot?: number | null;
  readonly player_id?: string | null;
  readonly picked_by?: string | null;
  readonly roster_id?: number | string | null;
  readonly is_keeper?: boolean | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}
export interface SleeperDraftUserLike { readonly user_id: string; readonly display_name?: string | null; readonly avatar?: string | null; readonly metadata?: { readonly team_name?: string | null } | null }
export interface SleeperDraftLike { readonly draft_order?: Readonly<Record<string, number>> | null; readonly type?: string | null; readonly settings?: Readonly<Record<string, unknown>> | null }

/** Auction price for a Sleeper pick (Sleeper stores it as metadata.amount, a string). */
export function auctionPrice(pick: SleeperDraftPickLike): number | null {
  const raw = (pick.metadata?.amount ?? pick.metadata?.price) as unknown;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function sleeperPickToBoard(pick: SleeperDraftPickLike, index: number, options: { readonly auction: boolean }): DraftBoardPick {
  const m = pick.metadata ?? {};
  return {
    key: `p:${pick.pick_no ?? index}:${pick.player_id ?? ""}`,
    pickNo: pick.pick_no ?? null,
    round: pick.round ?? null,
    slot: pick.draft_slot ?? null,
    playerId: pick.player_id ?? null,
    firstName: str(m.first_name),
    lastName: str(m.last_name) || str(m.full_name) || "Unknown",
    position: str(m.position) || null,
    nflTeam: str(m.team) || null,
    price: options.auction ? auctionPrice(pick) : null,
    keeper: Boolean(pick.is_keeper),
  };
}

/**
 * Columns for a Sleeper draft: one per drafter in draft-order slot order (or first-pick order),
 * picks in pick order. `names` maps Sleeper user ids to real owner names when known.
 */
export function sleeperDraftToBoard(input: {
  readonly picks: readonly SleeperDraftPickLike[];
  readonly users: readonly SleeperDraftUserLike[];
  readonly draft: SleeperDraftLike | null;
  readonly names?: Readonly<Record<string, string>>;
}): { readonly teams: DraftBoardTeam[]; readonly auction: boolean } {
  const auction = input.draft?.type === "auction" || input.picks.some((p) => auctionPrice(p) !== null);
  const order = input.draft?.draft_order ?? {};
  const byUser = new Map(input.users.map((u) => [u.user_id, u]));
  const drafters = Object.keys(order).length
    ? Object.keys(order).sort((a, b) => order[a] - order[b])
    : [...new Set(input.picks.map((p) => p.picked_by).filter((id): id is string => Boolean(id)))];
  const teams = drafters.map((userId, i) => {
    const user = byUser.get(userId);
    const picks = input.picks
      .filter((p) => p.picked_by === userId)
      .sort((a, b) => (a.pick_no ?? 0) - (b.pick_no ?? 0))
      .map((p, idx) => sleeperPickToBoard(p, idx, { auction }));
    return {
      id: userId,
      slot: order[userId] ?? i + 1,
      name: user?.metadata?.team_name || user?.display_name || `Team ${i + 1}`,
      owner: input.names?.[userId] ?? user?.display_name ?? null,
      avatarUrl: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
      picks,
    } satisfies DraftBoardTeam;
  });
  return { teams, auction };
}

export interface HistoryPickLike {
  readonly overall: number | null;
  readonly round: number | null;
  readonly pickInRound: number | null;
  /** Sleeper draft slot: the column the pick originally belonged to. */
  readonly slot: number | null;
  readonly playerId: string | null;
  readonly playerName: string | null;
  readonly position: string | null;
  readonly nflTeam: string | null;
  /** Who made the pick (owner or franchise id). */
  readonly teamId: string | null;
  readonly teamName: string;
  readonly owner?: string | null;
}

/**
 * Columns for a saved rookie/startup draft: one per team, placed at its own draft slot
 * (the slot most of its picks came from). A pick from another team's slot shows "via" that team.
 */
export function historyDraftToBoard(picks: readonly HistoryPickLike[]): DraftBoardTeam[] {
  const byTeam = new Map<string, HistoryPickLike[]>();
  for (const p of picks) if (p.teamId) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
  const homeSlot = new Map<string, number>();
  for (const [id, mine] of byTeam) {
    const counts = new Map<number, number>();
    for (const p of mine) if (p.slot !== null) counts.set(p.slot, (counts.get(p.slot) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (best) homeSlot.set(id, best[0]);
  }
  const slotOwner = new Map<number, string>();
  for (const [id, slot] of homeSlot) if (!slotOwner.has(slot)) slotOwner.set(slot, id);
  const nameOf = (id: string) => byTeam.get(id)?.[0]?.teamName ?? "";
  return [...byTeam.entries()]
    .map(([id, mine]) => {
      const sorted = [...mine].sort((a, b) => (a.overall ?? 0) - (b.overall ?? 0));
      return {
        id,
        slot: homeSlot.get(id) ?? 99,
        name: sorted[0]?.teamName ?? id,
        owner: sorted[0]?.owner ?? null,
        avatarUrl: null,
        picks: sorted.map((p, i) => {
          const [first, ...rest] = (p.playerName ?? "Unknown").split(" ");
          const original = p.slot !== null ? slotOwner.get(p.slot) : undefined;
          return {
            key: `h:${p.overall ?? i}:${p.playerId ?? ""}`,
            pickNo: p.overall,
            round: p.round,
            slot: p.pickInRound ?? p.slot,
            playerId: p.playerId,
            firstName: rest.length ? first : "",
            lastName: rest.length ? rest.join(" ") : first,
            position: p.position,
            nflTeam: p.nflTeam,
            via: original && original !== id ? nameOf(original) : null,
          } satisfies DraftBoardPick;
        }),
      } satisfies DraftBoardTeam;
    })
    .sort((a, b) => a.slot - b.slot || a.name.localeCompare(b.name));
}
