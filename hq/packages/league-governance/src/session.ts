
export type LegislativeSessionPhase = "COLLECTING" | "ANNUAL_VOTING" | "INTERIM" | "CLOSED";
export type LegislativeProposalSessionType = "ANNUAL" | "INTERIM";

export interface LegislativeSessionConfig {
  readonly sessionYear: number;
  readonly phase?: LegislativeSessionPhase | null;
  readonly meetingDate: string;
  readonly annualVotingOpensAt: string;
  readonly annualVotingClosesAt: string;
  readonly interimVotingOpensAt?: string | null;
  readonly interimVotingClosesAt?: string | null;
  readonly cycleBoundaryDate?: string | null;
  readonly updatedAt?: string | null;
  readonly updatedBy?: string | null;
  readonly source: "persisted" | "legacy-fallback" | "default";
}

export interface VotingWindow { readonly opensAt: string; readonly closesAt: string; readonly type: LegislativeProposalSessionType }

const DAY_MS = 86_400_000;

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Voting opens when the meeting starts and runs `days` days. */
export function sessionForMeeting(sessionYear: number, meetingDate: string, days: number): LegislativeSessionConfig {
  const opens = ms(meetingDate);
  if (opens === null) throw new Error("A valid meeting date is required.");
  return {
    sessionYear,
    phase: null,
    meetingDate: new Date(opens).toISOString(),
    annualVotingOpensAt: new Date(opens).toISOString(),
    annualVotingClosesAt: new Date(opens + days * DAY_MS).toISOString(),
    interimVotingOpensAt: null,
    interimVotingClosesAt: null,
    cycleBoundaryDate: null,
    source: "default",
  };
}

export function votingWindows(config: LegislativeSessionConfig): readonly VotingWindow[] {
  const windows: VotingWindow[] = [];
  if (ms(config.annualVotingOpensAt) !== null && ms(config.annualVotingClosesAt) !== null) windows.push({ opensAt: config.annualVotingOpensAt, closesAt: config.annualVotingClosesAt, type: "ANNUAL" });
  if (ms(config.interimVotingOpensAt) !== null && ms(config.interimVotingClosesAt) !== null) windows.push({ opensAt: config.interimVotingOpensAt!, closesAt: config.interimVotingClosesAt!, type: "INTERIM" });
  return windows.sort((a, b) => ms(a.opensAt)! - ms(b.opensAt)!);
}

export function resolveSessionPhase(config: LegislativeSessionConfig, now = new Date()): LegislativeSessionPhase {
  if (config.phase) return config.phase;
  const t = now.getTime();
  const boundary = ms(config.cycleBoundaryDate);
  if (boundary !== null && t >= boundary) return "CLOSED";
  const open = ms(config.annualVotingOpensAt);
  const close = ms(config.annualVotingClosesAt);
  if (open !== null && t < open) return "COLLECTING";
  if (open !== null && close !== null && t <= close) return "ANNUAL_VOTING";
  return "INTERIM";
}

export function isVotingOpen(config: LegislativeSessionConfig, now = new Date(), commissionerOverride = false): boolean {
  if (commissionerOverride) return true;
  const t = now.getTime();
  return votingWindows(config).some((w) => t >= ms(w.opensAt)! && t <= ms(w.closesAt)!);
}

export function proposalSessionType(config: LegislativeSessionConfig, now = new Date()): LegislativeProposalSessionType {
  return resolveSessionPhase(config, now) === "INTERIM" ? "INTERIM" : "ANNUAL";
}

/**
 * The voting window a proposal belongs to: the first window that had not
 * closed when it was submitted. Proposals without a date belong to the annual window.
 */
export function windowForProposal(config: LegislativeSessionConfig, createdAt: string | null | undefined): VotingWindow | null {
  const windows = votingWindows(config);
  const created = ms(createdAt ?? null);
  if (created === null) return windows.find((w) => w.type === "ANNUAL") ?? windows[0] ?? null;
  return windows.find((w) => ms(w.closesAt)! >= created) ?? null;
}
