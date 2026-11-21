
export type VetoOutcome = "pending" | "upheld" | "overturned" | "withdrawn";

export interface VetoFlag {
  readonly id: string;
  readonly season: number;
  readonly week: number | null;
  /** Team id of the owner who threw the flag (null when the record doesn't say). */
  readonly flaggedBy: string | null;
  /** Display name for flaggedBy when it isn't a current team (e.g. an owner who has left). */
  readonly flaggedByName?: string | null;
  readonly tradeId?: string | null;

  readonly trade: string;
  readonly reason: string;
  readonly outcome: VetoOutcome;
  readonly pollYes?: number | null;
  readonly pollNo?: number | null;
  readonly notes?: string | null;
  readonly flaggedOn?: string | null;
  /** "history" = from the league's records before the log existed; "log" = recorded in the Veto Log. */
  readonly source: "history" | "log";
}

export interface VetoLogTeam { readonly id: string; readonly name: string }
export interface VetoLogConfig { readonly flagsPerSeason: number | null; readonly pollHours: number; readonly rule: string }

export interface VetoLogModel {
  readonly currentSeason: number;
  readonly flagsPerSeason: number | null;
  readonly rule: string;
  readonly allowance: readonly { readonly team: VetoLogTeam; readonly used: number; readonly left: number | null }[];
  readonly seasons: readonly { readonly season: number; readonly flags: readonly (VetoFlag & { readonly flaggedByLabel: string })[] }[];
  readonly totals: { readonly flags: number; readonly overturned: number; readonly upheld: number; readonly pending: number };
}

export const OUTCOME_LABEL: Record<VetoOutcome, string> = { pending: "Poll open", upheld: "Trade stands", overturned: "Trade overturned", withdrawn: "Flag withdrawn" };

export function buildVetoLog(flags: readonly VetoFlag[], teams: readonly VetoLogTeam[], currentSeason: number, config: VetoLogConfig): VetoLogModel {
  const name = new Map(teams.map((t) => [t.id, t.name]));
  const labelled = flags.map((f) => ({ ...f, flaggedByLabel: (f.flaggedBy && name.get(f.flaggedBy)) || f.flaggedByName || "Not recorded" }));
  const seasons = [...new Set(labelled.map((f) => f.season))].sort((a, b) => b - a).map((season) => ({
    season,
    flags: labelled.filter((f) => f.season === season).sort((a, b) => (b.week ?? 0) - (a.week ?? 0) || String(b.flaggedOn ?? "").localeCompare(String(a.flaggedOn ?? ""))),
  }));
  // A withdrawn flag still counts as used: the owner spent it.
  const usedBy = (id: string) => labelled.filter((f) => f.season === currentSeason && f.flaggedBy === id).length;
  const allowance = teams.map((team) => {
    const used = usedBy(team.id);
    return { team, used, left: config.flagsPerSeason === null ? null : Math.max(0, config.flagsPerSeason - used) };
  });
  return {
    currentSeason,
    flagsPerSeason: config.flagsPerSeason,
    rule: config.rule,
    allowance,
    seasons,
    totals: {
      flags: labelled.length,
      overturned: labelled.filter((f) => f.outcome === "overturned").length,
      upheld: labelled.filter((f) => f.outcome === "upheld").length,
      pending: labelled.filter((f) => f.outcome === "pending").length,
    },
  };
}

const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const int = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < 1000 ? n : null; };

/** Validate a commissioner's form submission into a storable flag (without id/source). */
export function parseVetoFlagInput(input: Record<string, unknown>, teams: readonly VetoLogTeam[]): { ok: true; flag: Omit<VetoFlag, "id" | "source"> } | { ok: false; error: string } {
  const season = Number(input.season);
  if (!Number.isInteger(season) || season < 2011 || season > 2100) return { ok: false, error: "Pick a season." };
  const flaggedBy = clip(input.flaggedBy, 40) || null;
  if (flaggedBy && !teams.some((t) => t.id === flaggedBy)) return { ok: false, error: "Pick the team that threw the flag." };
  const trade = clip(input.trade, 400);
  if (trade.length < 5) return { ok: false, error: "Describe the trade (or pick it from the list)." };
  const reason = clip(input.reason, 600);
  if (reason.length < 3) return { ok: false, error: "Add why the flag was thrown." };
  const outcome = String(input.outcome ?? "pending") as VetoOutcome;
  if (!(outcome in OUTCOME_LABEL)) return { ok: false, error: "Pick an outcome." };
  return {
    ok: true,
    flag: {
      season,
      week: int(input.week),
      flaggedBy,
      flaggedByName: flaggedBy ? null : clip(input.flaggedByName, 60) || null,
      tradeId: clip(input.tradeId, 40) || null,
      trade,
      reason,
      outcome,
      pollYes: int(input.pollYes),
      pollNo: int(input.pollNo),
      notes: clip(input.notes, 600) || null,
      flaggedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(input.flaggedOn ?? "")) ? String(input.flaggedOn) : null,
    },
  };
}
