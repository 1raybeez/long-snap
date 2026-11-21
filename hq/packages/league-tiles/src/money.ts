

export type MoneyPrizeStatus =
  /** The week or game isn't final yet. */
  | "waiting"
  /** Final, but close enough that a Sleeper stat correction could change the winner. */
  | "close"
  /** Tied: the commissioner decides how it's awarded (on the league site). */
  | "tie"
  | "ready"
  | "paid"
  | "credited";

export interface MoneyDuesRow {
  readonly teamId: string;
  readonly team: string;
  readonly owner: string;
  readonly dueCents: number;
  readonly paidCents: number;
  /** e.g. "Settles from his winnings". */
  readonly note?: string | null;
}

export interface MoneyPrize {
  readonly id: string;
  readonly kind: "weekly-high" | "postseason";
  readonly week: number | null;
  readonly label: string;
  readonly team: string | null;
  readonly owner: string | null;
  readonly points: number | null;
  /** Second-best score (weekly high), for the close-call check. */
  readonly runnerUpPoints: number | null;
  readonly amountCents: number;
  readonly status: MoneyPrizeStatus;
  /** The league allows crediting this prize to next season's dues. */
  readonly canCredit: boolean;
  readonly settledAt?: string | null;
}

export interface MoneyHolding { readonly label: string; readonly cents: number; readonly note?: string | null }

export interface MoneySummary {
  readonly collectedCents: number;
  readonly owedCents: number;
  readonly paidOutCents: number;
  /** Prizes ready (or waiting) to be paid. */
  readonly prizesDueCents: number;
  readonly holdings: readonly MoneyHolding[];
  /** Shown only when something doesn't add up. One line each. */
  readonly warnings: readonly string[];
}

export interface MoneyHistorySeason { readonly season: number; readonly duesCents: number | null; readonly paidOutCents: number | null; readonly champion?: string | null }

export interface MoneyModel {
  readonly leagueName: string;
  readonly season: number;
  readonly dues: readonly MoneyDuesRow[];
  readonly prizes: readonly MoneyPrize[];
  readonly summary: MoneySummary;
  readonly history: readonly MoneyHistorySeason[];
  /** Full ledger on the league's own site ("Fix a mistake"), and its export. */
  readonly fullLedgerHref: string | null;
  readonly exportHref: string | null;
  readonly asOf: string;
}

export type MoneyPaymentMethod = "venmo" | "paypal" | "other";
export const MONEY_PAYMENT_METHODS: readonly { readonly value: MoneyPaymentMethod; readonly label: string }[] = [{ value: "venmo", label: "Venmo" }, { value: "paypal", label: "PayPal" }, { value: "other", label: "Cash / other" }];

/** `requestId` is made once per tap on the page, so a double tap or a retry never records the same money twice. */
export type MoneyAction =
  | { readonly action: "markDuesPaid"; readonly teamId: string; readonly amountCents: number; readonly method: MoneyPaymentMethod; readonly requestId: string }
  | { readonly action: "settlePrize"; readonly prizeId: string; readonly mode: "paid" | "credited"; readonly requestId: string };

/**
 * Close-call rule: a weekly high whose lead is under this many points can still change when Sleeper applies stat
 * corrections, so it waits until scoring settles (Sleeper corrects stats into midweek; see withCloseCalls).
 */
export const CLOSE_CALL_POINTS = 2;
export function prizeIsClose(points: number | null, runnerUp: number | null): boolean {
  return points !== null && runnerUp !== null && points - runnerUp < CLOSE_CALL_POINTS;
}

const cents = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0);

/** Checks a request body against the two allowed actions. Returns null when it isn't one of them. */
export function parseMoneyAction(body: unknown): MoneyAction | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const requestId = typeof b.requestId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(b.requestId) ? b.requestId : null;
  if (!requestId) return null;
  if (b.action === "markDuesPaid") {
    const teamId = typeof b.teamId === "string" ? b.teamId.trim() : "";
    const amountCents = cents(b.amountCents);
    const method = MONEY_PAYMENT_METHODS.find((m) => m.value === b.method)?.value;
    if (!teamId || teamId.length > 120 || amountCents <= 0 || amountCents > 100_000_00 || !method) return null;
    return { action: "markDuesPaid", teamId, amountCents, method, requestId };
  }
  if (b.action === "settlePrize") {
    const prizeId = typeof b.prizeId === "string" ? b.prizeId.trim() : "";
    if (!prizeId || prizeId.length > 300 || (b.mode !== "paid" && b.mode !== "credited")) return null;
    return { action: "settlePrize", prizeId, mode: b.mode, requestId };
  }
  return null;
}

/** Today's date in New York as YYYY-MM-DD (the ledgers' payment date). */
export function todayInNewYork(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Marks the latest week's weekly high as a close call while Sleeper can still correct stats (Tuesday and Wednesday
 * after the week; settled from Thursday noon ET). `topTwo` gives each week's best and second-best score from Sleeper.
 */
export function withCloseCalls(model: MoneyModel, input: { readonly lastScoredWeek: number; readonly topTwo: (week: number) => readonly [number, number] | null; readonly now?: Date }): MoneyModel {
  const now = input.now ?? new Date();
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = ny.getDay(); // 0 Sun … 6 Sat
  const correctionsOpen = day === 2 || day === 3 || (day === 4 && ny.getHours() < 12);
  return {
    ...model,
    prizes: model.prizes.map((p) => {
      if (p.kind !== "weekly-high" || p.week === null) return p;
      const top = input.topTwo(p.week);
      const points = p.points ?? top?.[0] ?? null;
      const runnerUpPoints = p.runnerUpPoints ?? top?.[1] ?? null;
      const close = p.status === "ready" && p.week === input.lastScoredWeek && correctionsOpen && prizeIsClose(points, runnerUpPoints);
      return { ...p, points, runnerUpPoints, status: close ? "close" : p.status };
    }),
  };
}

/** Prizes in the order the commissioner works them: to pay first (oldest week first), then waiting, then done (newest first). */
export function orderPrizes(prizes: readonly MoneyPrize[]): readonly MoneyPrize[] {
  const rank: Record<MoneyPrizeStatus, number> = { ready: 0, tie: 1, close: 2, waiting: 3, paid: 4, credited: 4 };
  return [...prizes].sort((a, b) => rank[a.status] - rank[b.status] || (rank[a.status] >= 4 ? (b.week ?? 99) - (a.week ?? 99) : (a.week ?? 99) - (b.week ?? 99)) || a.label.localeCompare(b.label));
}

export const formatMoney = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(Math.abs(c) % 100 ? 2 : 0)}`;
