import type { LegislativePolicy, VoteThreshold } from "./policy.ts";

/** A team and every login that may vote for it (co-owners share one vote). */
export interface VotingFranchise {
  readonly franchiseId: string;
  readonly name: string;
  readonly voterIds: readonly string[];
}
export type FranchiseDirectory = readonly VotingFranchise[];

export interface StoredVotes { readonly yes: readonly string[]; readonly no: readonly string[] }
export type VoteChoice = "yes" | "no";

export class LegislativeVoteError extends Error {
  readonly code: "NOT_ELIGIBLE" | "INVALID_CHOICE" | "INVALID_ANSWER";
  constructor(code: "NOT_ELIGIBLE" | "INVALID_CHOICE" | "INVALID_ANSWER") { super(code); this.code = code; }
}

export function readStoredVotes(value: unknown): StoredVotes {
  const v = (value && typeof value === "object" ? value : {}) as { yes?: unknown; no?: unknown };
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);
  return { yes: ids(v.yes), no: ids(v.no) };
}

export function franchiseForVoter(directory: FranchiseDirectory, voterId: string): VotingFranchise | null {
  return directory.find((f) => f.voterIds.includes(voterId)) ?? null;
}

/**
 * Records a team's vote. Any earlier vote by the same team (either co-owner) is
 * replaced, so a team can change its vote while voting is open but never vote twice.
 */
export function applyVote(votes: StoredVotes, directory: FranchiseDirectory, voterId: string, choice: VoteChoice): StoredVotes {
  if (choice !== "yes" && choice !== "no") throw new LegislativeVoteError("INVALID_CHOICE");
  const franchise = franchiseForVoter(directory, voterId);
  if (!franchise) throw new LegislativeVoteError("NOT_ELIGIBLE");
  const team = new Set(franchise.voterIds);
  const yes = votes.yes.filter((id) => !team.has(id));
  const no = votes.no.filter((id) => !team.has(id));
  return choice === "yes" ? { yes: [...yes, voterId], no } : { yes, no: [...no, voterId] };
}

export interface VoteTally {
  readonly yes: number;
  readonly no: number;
  readonly cast: number;
  readonly eligible: number;
  /** Teams that have not voted yet. */
  readonly waitingOn: readonly string[];
  /** Teams recorded on both sides (only possible in records made before one-vote-per-team). Not counted. */
  readonly conflicted: readonly string[];
}

/** Counts one vote per team. Unknown voter ids (old records) count individually. */
export function tallyVotes(votes: StoredVotes, directory: FranchiseDirectory): VoteTally {
  let yes = 0, no = 0;
  const conflicted: string[] = [], waitingOn: string[] = [];
  const known = new Set(directory.flatMap((f) => f.voterIds));
  for (const franchise of directory) {
    const saidYes = franchise.voterIds.some((id) => votes.yes.includes(id));
    const saidNo = franchise.voterIds.some((id) => votes.no.includes(id));
    if (saidYes && saidNo) conflicted.push(franchise.name);
    else if (saidYes) yes += 1;
    else if (saidNo) no += 1;
    else waitingOn.push(franchise.name);
  }
  yes += new Set(votes.yes.filter((id) => !known.has(id))).size;
  no += new Set(votes.no.filter((id) => !known.has(id))).size;
  return { yes, no, cast: yes + no, eligible: directory.length, waitingOn, conflicted };
}

export function viewerVote(votes: StoredVotes, directory: FranchiseDirectory, voterId: string | null): VoteChoice | null {
  if (!voterId) return null;
  const team = franchiseForVoter(directory, voterId)?.voterIds ?? [voterId];
  if (team.some((id) => votes.yes.includes(id))) return "yes";
  if (team.some((id) => votes.no.includes(id))) return "no";
  return null;
}

/** "closed" = a fill-in-your-answer ballot: no pass/fail, the answers are the result (2026-11-03). */
export type LegislativeOutcome = "passed" | "failed" | "tied" | "closed";

export interface DecidedResult {
  readonly outcome: LegislativeOutcome;
  readonly yes: number;
  readonly no: number;
  readonly threshold: VoteThreshold;
  readonly quorumMet: boolean;
  readonly explanation: string;
  /** Multiple choice only (2026-11-03): votes per option and the winner (null = nothing won). */
  readonly optionCounts?: Readonly<Record<string, number>>;
  readonly winningOptionId?: string | null;
}

export function meetsThreshold(yes: number, no: number, threshold: VoteThreshold): boolean {
  if (yes + no === 0 || yes <= no) return false;
  return threshold === "SIMPLE_MAJORITY" ? true : yes * 3 >= (yes + no) * 2;
}

export function decideResult(yes: number, no: number, policy: LegislativePolicy, changesConstitution: boolean): DecidedResult {
  const threshold = changesConstitution ? policy.ruleChangeThreshold : policy.ordinaryThreshold;
  const quorumMet = policy.quorum === null || yes + no >= policy.quorum;
  if (!quorumMet) return { outcome: "failed", yes, no, threshold, quorumMet, explanation: `Only ${yes + no} teams voted; ${policy.quorum} needed.` };
  if (yes + no === 0) return { outcome: "failed", yes, no, threshold, quorumMet, explanation: "No votes were cast." };
  if (yes === no) return { outcome: "tied", yes, no, threshold, quorumMet, explanation: `Tied ${yes}-${no}.` };
  const passed = meetsThreshold(yes, no, threshold);
  return { outcome: passed ? "passed" : "failed", yes, no, threshold, quorumMet, explanation: `${passed ? "Passed" : "Failed"} ${yes}-${no}${threshold === "TWO_THIRDS" ? " (two-thirds needed)" : ""}.` };
}
