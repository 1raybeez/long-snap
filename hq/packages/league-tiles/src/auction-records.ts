import { auctionPrice, type SleeperDraftPickLike } from "./draft-board-data.ts";

export interface AuctionSeasonInput {
  readonly season: number;
  /** Starting budget per team, when Sleeper reports it. */
  readonly budget: number | null;
  readonly picks: readonly SleeperDraftPickLike[];
  /** Sleeper user id -> owner name. */
  readonly owners: Readonly<Record<string, string>>;
  /** Player points scored while rostered that season (completed seasons only). */
  readonly points?: ReadonlyMap<string, number> | null;
}

export interface AuctionRecordEntry {
  readonly value: string;
  readonly who: string;
  readonly detail: string;
}

export interface AuctionRecord {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly entries: readonly AuctionRecordEntry[];
}

interface Buy {
  readonly season: number;
  readonly owner: string;
  readonly ownerId: string;
  readonly player: string;
  readonly position: string;
  readonly price: number;
  /** Price on the league's biggest budget (a $35 buy on a $100 budget = $70), so eras compare fairly. */
  readonly scaled: number;
  /** Shown when this season's budget was smaller than the biggest one. */
  readonly era: string;
  readonly points: number | null;
}

const name = (pick: SleeperDraftPickLike) => {
  const m = pick.metadata ?? {};
  const full = `${typeof m.first_name === "string" ? m.first_name : ""} ${typeof m.last_name === "string" ? m.last_name : ""}`.trim();
  return full || (typeof m.full_name === "string" ? m.full_name : "Unknown player");
};
const money = (n: number) => `$${Math.round(n)}`;
const pts = (n: number) => `${n.toFixed(1)} pts`;
const top = <T,>(rows: readonly T[], n: number, by: (row: T) => number) => [...rows].sort((a, b) => by(b) - by(a)).slice(0, n);

export function auctionRecords(seasons: readonly AuctionSeasonInput[]): { readonly records: AuctionRecord[]; readonly seasons: number[]; readonly pointSeasons: number[] } {
  const buys: Buy[] = [];
  const drafts: { season: number; ownerId: string; owner: string; spent: number; dollarPlayers: number; byPosition: Record<string, number>; budget: number | null; scale: number; era: string }[] = [];

  const ref = Math.max(0, ...seasons.map((x) => x.budget ?? 0)) || null;

  for (const s of seasons) {
    const bids = s.picks.filter((p) => !p.is_keeper && auctionPrice(p) !== null);
    if (!bids.length) continue;
    const perOwner = new Map<string, (typeof drafts)[number]>();
    const scale = ref && s.budget ? ref / s.budget : 1;
    const era = ref && s.budget && s.budget < ref ? ` · ${money(s.budget)} budget` : "";
    for (const pick of s.picks) {
      const price = auctionPrice(pick);
      const ownerId = pick.picked_by ?? "";
      if (price === null || !ownerId) continue;
      const owner = s.owners[ownerId] ?? "Unknown owner";
      const position = typeof pick.metadata?.position === "string" ? pick.metadata.position : "?";
      const row = perOwner.get(ownerId) ?? { season: s.season, ownerId, owner, spent: 0, dollarPlayers: 0, byPosition: {}, budget: s.budget, scale, era };
      row.spent += price;
      if (!pick.is_keeper) {
        if (price <= 1) row.dollarPlayers += 1;
        row.byPosition[position] = (row.byPosition[position] ?? 0) + price;
        buys.push({ season: s.season, owner, ownerId, player: name(pick), position, price, scaled: price * scale, era, points: s.points && pick.player_id ? s.points.get(pick.player_id) ?? 0 : null });
      }
      perOwner.set(ownerId, row);
    }
    drafts.push(...perOwner.values());
  }

  const scored = buys.filter((b) => b.points !== null) as (Buy & { points: number })[];
  const records: AuctionRecord[] = [];
  const push = (r: AuctionRecord) => { if (r.entries.length) records.push(r); };

  push({ id: "biggest-bid", title: "Biggest Bid Ever", blurb: "The paddle went up and never came down.",
    entries: top(buys, 5, (b) => b.scaled + b.season / 1e6).map((b) => ({ value: money(b.price), who: b.owner, detail: `${b.player} (${b.position}) · ${b.season}${b.era}` })) });

  push({ id: "why-though", title: "Why Though?", blurb: "Most ever paid for a kicker or defense.",
    entries: top(buys.filter((b) => b.position === "K" || b.position === "DEF"), 3, (b) => b.scaled).filter((b) => b.price > 1).map((b) => ({ value: money(b.price), who: b.owner, detail: `${b.player} (${b.position}) · ${b.season}${b.era}` })) });

  push({ id: "dollar-hero", title: "Dollar Store Hero", blurb: "Best season from a $1 player.",
    entries: top(scored.filter((b) => b.price <= 1 && b.position !== "K" && b.position !== "DEF"), 3, (b) => b.points).map((b) => ({ value: pts(b.points), who: b.owner, detail: `${b.player} (${b.position}) for $1 · ${b.season}` })) });

  push({ id: "bang-for-buck", title: "Bang for the Buck", blurb: "Most points per dollar (players who cost $10 or more on a $200 budget).",
    entries: top(scored.filter((b) => b.scaled >= 10), 3, (b) => b.points / b.scaled).map((b) => ({ value: `${(b.points / b.scaled).toFixed(1)} pts/$`, who: b.owner, detail: `${b.player} for ${money(b.price)}, ${pts(b.points)} · ${b.season}${b.era}` })) });

  push({ id: "money-pit", title: "Money Pit", blurb: "Paid $30 or more, got the fewest points back.",
    entries: [...scored.filter((b) => b.scaled >= 30)].sort((a, b) => a.points / a.scaled - b.points / b.scaled).slice(0, 3).map((b) => ({ value: money(b.price), who: b.owner, detail: `${b.player}: ${pts(b.points)} · ${b.season}${b.era}` })) });

  const allIn = drafts.flatMap((d) => Object.entries(d.byPosition).map(([position, spent]) => ({ ...d, position, positionSpent: spent })));
  push({ id: "all-in", title: "All-In", blurb: "Most money on one position in one draft.",
    entries: top(allIn.filter((d) => d.position !== "?"), 3, (d) => d.positionSpent * d.scale).map((d) => ({ value: money(d.positionSpent), who: d.owner, detail: `on ${d.position}s · ${d.season}${d.era}` })) });

  push({ id: "left-on-table", title: "Left Money on the Table", blurb: "Most budget never spent.",
    entries: top(drafts.filter((d) => d.budget !== null && d.budget - d.spent > 0), 3, (d) => (d.budget! - d.spent) * d.scale).map((d) => ({ value: money(d.budget! - d.spent), who: d.owner, detail: `unspent of ${money(d.budget!)} · ${d.season}` })) });

  push({ id: "dollar-shopper", title: "Dollar Store Shopper", blurb: "Most $1 players in one draft.",
    entries: top(drafts.filter((d) => d.dollarPlayers > 0), 3, (d) => d.dollarPlayers + d.season / 1e6).map((d) => ({ value: `${d.dollarPlayers}`, who: d.owner, detail: `$1 players · ${d.season}` })) });

  return {
    records,
    seasons: [...new Set(drafts.map((d) => d.season))].sort((a, b) => a - b),
    pointSeasons: [...new Set(scored.map((b) => b.season))].sort((a, b) => a - b),
  };
}
