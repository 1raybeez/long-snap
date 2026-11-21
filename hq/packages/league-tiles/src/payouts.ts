
import { matchupPoints, teamRefs, lastScoredWeek, standings, type SleeperBracketMatchLike, type SleeperLeagueSnapshot } from "./sleeper-adapter.ts";

export type PayoutAwardStatus = "PAID" | "APPROVED" | "PENDING" | "CREDITED" | "FORFEITED";

export interface PayoutLine { readonly label: string; readonly amountCents: number; readonly note?: string | null }
export interface PayoutCard { readonly label: string; readonly value: string; readonly note?: string | null }
export interface PayoutAward { readonly label: string; readonly recipient?: string | null; readonly amountCents: number; readonly status?: PayoutAwardStatus | null }
export interface PayoutExpense { readonly label: string; readonly amountCents: number; readonly funding: string }

export interface WeeklyHighScore {
  readonly week: number;
  /** Sleeper roster ids of the winner(s) (more than one only on a tie). */
  readonly rosterIds?: readonly number[];
  readonly teamNames: readonly string[];
  readonly owners: readonly string[];
  readonly score: number;
  readonly prizeCents: number;
  readonly status: PayoutAwardStatus;
}

export interface PayoutCurrentSeason {
  readonly season: number;
  readonly statusLabel: string;
  readonly duesCents: number;
  readonly ownerCount: number;
  readonly poolCents: number;
  readonly paidCount: number | null;
  readonly owedCount: number | null;
  readonly paidNote?: string | null;
  readonly allocation: readonly PayoutLine[];
  readonly championAllocationCents: number;
  readonly ringCostCents: number | null;
  readonly projectedChampionCashCents: number | null;
  readonly awards: readonly PayoutAward[];
  readonly fundLocations: readonly { readonly label: string; readonly note?: string | null }[];
  /** League-specific fee rules (e.g. a new-owner deposit). */
  readonly feeNotes: readonly string[];
}

export interface PayoutSeason {
  readonly season: number;
  readonly statusLabel: string;
  readonly cards: readonly PayoutCard[];
  readonly awards: readonly PayoutLine[];
  readonly weeklyCount: number;
  readonly weeklyTotalCents: number;
  readonly expenses: readonly PayoutExpense[];
  readonly note?: string | null;
}

export interface PayoutEarningRow {
  readonly key: string;
  readonly teamName: string;
  readonly owners: string;
  readonly weeks: readonly number[];
  readonly earnedCents: number;
  readonly settledCents: number;
  readonly owedCents: number;
  readonly pendingCents: number;
  /** Postseason prizes this team has won (e.g. "Division A winner"). */
  readonly prizes?: readonly string[];
  /** Postseason prizes it is in line for but not yet decided (e.g. "Leads Division A"). */
  readonly leading?: readonly string[];
}

/** All-time money by owner (optional; from a league's own audited history). */
export interface PayoutOwnerRow {
  readonly name: string;
  readonly seasons: number;
  readonly feesCents: number;
  readonly winningsCents: number;
  readonly netCents: number;
  readonly titles: number;
}

export interface PayoutsModel {
  readonly leagueName: string;
  readonly current: PayoutCurrentSeason | null;
  readonly weeklyHighs: readonly WeeklyHighScore[];
  /** Season earnings by team (weekly high scores plus decided postseason prizes). */
  readonly earnings?: readonly PayoutEarningRow[];
  /** This season's postseason prizes: who won, or who is in line. */
  readonly postseason?: readonly PostseasonPrize[];
  readonly overall: readonly PayoutCard[];
  readonly seasons: readonly PayoutSeason[];
  /** All-time by owner, best net first. Omit when the league has no audited owner history. */
  readonly owners?: readonly PayoutOwnerRow[];
  readonly ownersNote?: string | null;
  readonly coverage: readonly string[];
  readonly constitutionHref?: string | null;
}

export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
export const toCents = (dollars: number | null | undefined) => Math.round((dollars ?? 0) * 100);

/** Weekly top scorer(s) for every finished regular-season week, straight from Sleeper matchup totals. */
export function weeklyHighScoresFromSnapshot(
  snapshot: SleeperLeagueSnapshot,
  options: { readonly prizeCents: number; readonly regularSeasonWeeks: number; readonly status?: (week: number) => PayoutAwardStatus },
): WeeklyHighScore[] {
  const refs = teamRefs(snapshot);
  const last = Math.min(lastScoredWeek(snapshot.league), options.regularSeasonWeeks);
  const out: WeeklyHighScore[] = [];
  for (let week = 1; week <= last; week += 1) {
    const rows = (snapshot.matchupsByWeek[week] ?? []).map((row) => ({ rosterId: row.roster_id, points: matchupPoints(row) })).filter((row) => row.points > 0);
    if (!rows.length) continue;
    const top = Math.max(...rows.map((row) => row.points));
    const winnerRows = rows.filter((row) => row.points === top);
    const winners = winnerRows.map((row) => refs.get(row.rosterId));
    out.push({
      week,
      rosterIds: winnerRows.map((row) => row.rosterId),
      teamNames: winners.map((ref) => ref?.teamName ?? "Team unavailable"),
      owners: winners.map((ref) => ref?.managerName ?? "Owner unavailable"),
      score: top,
      prizeCents: winners.length > 1 ? Math.round(options.prizeCents / winners.length) : options.prizeCents,
      status: options.status?.(week) ?? "PENDING",
    });
  }
  return out;
}

/** A league's postseason prize, from its own rules (nothing here assumes another league's amounts). */
export type PostseasonPrizeRule =
  | { readonly kind: "division"; readonly amountCents: number; readonly label?: string }
  | { readonly kind: "place"; readonly place: 1 | 2 | 3 | 4; readonly amountCents: number; readonly label?: string; readonly note?: string | null };

export type PostseasonPrizeState = "WON" | "LEADING" | "TIED" | "OPEN";

/** One prize this season: decided (WON), a current leader (LEADING), tied for the lead, or not started (OPEN). */
export interface PostseasonPrize {
  readonly key: string;
  readonly label: string;
  readonly amountCents: number;
  readonly state: PostseasonPrizeState;
  readonly rosterIds: readonly number[];
  readonly teamNames: readonly string[];
  readonly owners: readonly string[];
  /** Payment status once won (from the league's award ledger); null before then. */
  readonly status: PayoutAwardStatus | null;
  /** When it is decided, or why it is not yet. */
  readonly note: string | null;
}

const PLACE_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: "Champion", 2: "Runner-up", 3: "Third place", 4: "Fourth place" };
/** Sleeper bracket: the place-1 game decides 1st/2nd, the place-3 game decides 3rd/4th. */
const PLACE_GAME: Record<1 | 2 | 3 | 4, { readonly p: number; readonly side: "w" | "l" }> = { 1: { p: 1, side: "w" }, 2: { p: 1, side: "l" }, 3: { p: 3, side: "w" }, 4: { p: 3, side: "l" } };

export function postseasonPrizes(
  snapshot: SleeperLeagueSnapshot,
  options: {
    readonly rules: readonly PostseasonPrizeRule[];
    readonly regularSeasonWeeks: number;
    readonly bracket?: readonly SleeperBracketMatchLike[] | null;
    /** Payment status for a won prize, by prize key (e.g. "division:Division A", "place:1") and roster id. */
    readonly status?: (key: string, rosterId: number) => PayoutAwardStatus | null;
    readonly ownerLabel?: (rosterId: number, fallback: string) => string;
  },
): PostseasonPrize[] {
  const refs = teamRefs(snapshot);
  const owner = (id: number) => { const ref = refs.get(id); return ref ? (options.ownerLabel ? options.ownerLabel(id, ref.managerName) : ref.managerName) : "Owner unavailable"; };
  const who = (ids: readonly number[]) => ({ rosterIds: ids, teamNames: ids.map((id) => refs.get(id)?.teamName ?? "Team unavailable"), owners: ids.map(owner) });
  const scored = lastScoredWeek(snapshot.league);
  const regularDone = scored >= options.regularSeasonWeeks;
  const table = standings(snapshot);
  const out: PostseasonPrize[] = [];
  for (const rule of options.rules) {
    if (rule.kind === "division") {
      const divisions = [...new Set(table.map((row) => row.division).filter((d): d is string => Boolean(d)))].sort();
      for (const division of divisions) {
        const key = `division:${division}`;
        const rows = table.filter((row) => row.division === division);
        const top = rows[0];
        const tied = top ? rows.filter((row) => row.wins === top.wins && row.losses === top.losses && row.ties === top.ties && row.pointsFor === top.pointsFor) : [];
        const base = { key, label: rule.label ?? `${division} winner`, amountCents: rule.amountCents };
        if (!top || scored < 1) { out.push({ ...base, state: "OPEN", ...who([]), status: null, note: `Decided after week ${options.regularSeasonWeeks}` }); continue; }
        const ids = tied.map((row) => row.team.rosterId);
        if (tied.length > 1) { out.push({ ...base, state: "TIED", ...who(ids), status: null, note: regularDone ? "Tied on record and points; the commissioner decides" : `Tied for the lead · decided after week ${options.regularSeasonWeeks}` }); continue; }
        const record = `${top.wins}-${top.losses}${top.ties ? `-${top.ties}` : ""}`;
        out.push(regularDone
          ? { ...base, state: "WON", ...who(ids), status: options.status?.(key, ids[0]!) ?? "PENDING", note: `${record} · final regular-season standings` }
          : { ...base, state: "LEADING", ...who(ids), status: null, note: `Leads at ${record} through week ${Math.min(scored, options.regularSeasonWeeks)} · decided after week ${options.regularSeasonWeeks}` });
      }
    } else {
      const key = `place:${rule.place}`;
      const game = PLACE_GAME[rule.place];
      const match = options.bracket?.find((m) => m.p === game.p && m.w && m.l);
      const id = match ? (game.side === "w" ? match.w : match.l) : null;
      const base = { key, label: rule.label ?? PLACE_LABEL[rule.place], amountCents: rule.amountCents };
      out.push(id
        ? { ...base, state: "WON", ...who([id]), status: options.status?.(key, id) ?? "PENDING", note: rule.note ?? null }
        : { ...base, state: "OPEN", ...who([]), status: null, note: [rule.place <= 2 ? "Decided by the championship game" : "Decided by the third-place game", rule.note].filter(Boolean).join(" · ") });
    }
  }
  return out;
}

/**
 * Season earnings for every team, including teams that have not won anything ($0). Paid and
 * applied-to-dues count as settled; approved awards are owed; a winner Sleeper has finalized but
 * the Tuesday check has not approved yet is pending.
 */
export function seasonEarnings(snapshot: SleeperLeagueSnapshot, weeklyHighs: readonly WeeklyHighScore[], ownerLabel?: (rosterId: number, fallback: string) => string, postseason: readonly PostseasonPrize[] = []): PayoutEarningRow[] {
  const refs = teamRefs(snapshot);
  const rows = new Map<number, { weeks: number[]; earned: number; settled: number; owed: number; pending: number; prizes: string[]; leading: string[] }>();
  for (const ref of refs.values()) rows.set(ref.rosterId, { weeks: [], earned: 0, settled: 0, owed: 0, pending: 0, prizes: [], leading: [] });
  const add = (row: { earned: number; settled: number; owed: number; pending: number }, cents: number, status: PayoutAwardStatus | null) => {
    row.earned += cents;
    if (status === "PAID" || status === "CREDITED") row.settled += cents;
    else if (status === "APPROVED") row.owed += cents;
    else if (status === "PENDING") row.pending += cents;
  };
  for (const w of weeklyHighs) {
    for (const rosterId of w.rosterIds ?? []) {
      const row = rows.get(rosterId);
      if (!row) continue;
      row.weeks.push(w.week);
      add(row, w.prizeCents, w.status);
    }
  }
  for (const prize of postseason) {
    for (const rosterId of prize.rosterIds) {
      const row = rows.get(rosterId);
      if (!row) continue;
      if (prize.state === "WON") { row.prizes.push(prize.label); add(row, prize.amountCents, prize.status); }
      else if (prize.state === "LEADING") row.leading.push(prize.label);
    }
  }
  return [...rows.entries()].map(([rosterId, row]) => {
    const ref = refs.get(rosterId)!;
    return { key: String(rosterId), teamName: ref.teamName, owners: ownerLabel ? ownerLabel(rosterId, ref.managerName) : ref.managerName, weeks: row.weeks, earnedCents: row.earned, settledCents: row.settled, owedCents: row.owed, pendingCents: row.pending, prizes: row.prizes, leading: row.leading };
  }).sort((a, b) => b.earnedCents - a.earnedCents || a.teamName.localeCompare(b.teamName));
}

/** A completed season's ledger in the shape both dynasty sites already keep. */
export interface PayoutLedgerSeason {
  readonly season: number;
  readonly statusLabel: string;
  readonly duesPaid: number;
  readonly payoutsRecorded: number;
  readonly awards: readonly { readonly type: string; readonly amount: number | null }[];
  readonly expenses: readonly { readonly label: string; readonly amount: number; readonly funding?: string | null }[];
  readonly note?: string | null;
  /** Why money was left over, when known (e.g. deposits held for future seasons). */
  readonly leftNote?: string | null;
}

const AWARD_LABELS: Readonly<Record<string, string>> = {
  champion: "Champion", finalist: "Finalists", runnerUp: "Runner-up", thirdPlace: "Third place", fourthPlace: "Fourth place", playoffBerth: "Made the playoffs",
  ringReserve: "Ring allocation", futureDeposit: "Future-season deposit", other: "Other recorded awards", adjustment: "Adjustments",
};
const AWARD_ORDER = ["champion", "finalist", "runnerUp", "thirdPlace", "fourthPlace", "playoffBerth", "ringReserve", "other", "futureDeposit", "adjustment"];

/** Season money in the reference format: winnings to owners, cash paid, league expenses (the ring counts as one) and what is left. */
function ledgerTotals(ledger: PayoutLedgerSeason) {
  const ring = ledger.awards.filter((a) => a.type === "ringReserve").reduce((t, a) => t + toCents(a.amount), 0);
  const winnings = ledger.awards.filter((a) => a.type !== "ringReserve" && a.type !== "futureDeposit").reduce((t, a) => t + toCents(a.amount), 0);
  const otherExpenses = ledger.expenses.reduce((t, e) => t + toCents(e.amount), 0);
  const dues = toCents(ledger.duesPaid);
  const cash = Math.max(0, toCents(ledger.payoutsRecorded) - ring);
  const expenses = ring + otherExpenses;
  return { dues, winnings, cash, ring, otherExpenses, expenses, left: dues - cash - expenses };
}

const leftCard = (left: number, note: string | null): PayoutCard => ({
  label: left === 0 ? "Left over" : left > 0 ? "Not paid out" : "Paid beyond dues",
  value: money(Math.abs(left)),
  note: left === 0 ? "Every dollar accounted for" : note,
});

export function payoutSeasonFromLedger(ledger: PayoutLedgerSeason): PayoutSeason {
  const sum = (type: string) => ledger.awards.filter((a) => a.type === type).reduce((t, a) => t + toCents(a.amount), 0);
  const weekly = ledger.awards.filter((a) => a.type === "weeklyHigh");
  const t = ledgerTotals(ledger);
  return {
    season: ledger.season,
    statusLabel: ledger.statusLabel,
    cards: [
      { label: "Dues paid", value: money(t.dues) },
      { label: "Recorded winnings", value: money(t.winnings) },
      { label: "Cash paid", value: money(t.cash), note: t.cash === t.winnings ? null : "As recorded in the league ledger" },
      { label: "League expenses", value: money(t.expenses), note: t.ring ? `Championship ring ${money(t.ring)}` : t.expenses ? null : "None recorded" },
      leftCard(t.left, ledger.leftNote ?? "As recorded in the league ledger"),
    ],
    awards: AWARD_ORDER.filter((type) => type !== "ringReserve" && ledger.awards.some((a) => a.type === type)).map((type) => ({ label: AWARD_LABELS[type] ?? type, amountCents: sum(type) })),
    weeklyCount: weekly.length,
    weeklyTotalCents: weekly.reduce((total, a) => total + toCents(a.amount), 0),
    expenses: [
      ...(t.ring ? [{ label: "Championship ring", amountCents: t.ring, funding: "Dues funded" }] : []),
      ...ledger.expenses.map((e) => ({ label: e.label, amountCents: toCents(e.amount), funding: e.funding ?? "Dues funded" })),
    ],
    note: ledger.note ?? null,
  };
}

/** All-time totals in the reference set: reconciled seasons, dues, winnings, cash, expenses and what is left. */
export function overallFromLedgers(ledgers: readonly PayoutLedgerSeason[], reconciled: number, discrepancies: number, leftNote?: string | null): PayoutCard[] {
  const totals = ledgers.map(ledgerTotals);
  const add = (key: keyof ReturnType<typeof ledgerTotals>) => totals.reduce((t, x) => t + x[key], 0);
  const years = ledgers.map((l) => l.season);
  const ring = add("ring"), other = add("otherExpenses");
  return [
    { label: "Reconciled seasons", value: String(reconciled), note: `${ledgers.length} on record${years.length ? `, ${Math.min(...years)}–${Math.max(...years)}` : ""}${discrepancies ? ` · ${discrepancies} with a documented variance` : ""}` },
    { label: "Dues paid", value: money(add("dues")) },
    { label: "Recorded winnings", value: money(add("winnings")) },
    { label: "Cash paid", value: money(add("cash")) },
    { label: "League expenses", value: money(add("expenses")), note: ring || other ? [ring ? `${money(ring)} championship rings` : "", other ? `${money(other)} other` : ""].filter(Boolean).join("; ") : "None recorded" },
    leftCard(add("left"), leftNote ?? "Across all seasons, as recorded"),
  ];
}
