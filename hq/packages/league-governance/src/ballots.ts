import type { LegislativePolicy } from "./policy.ts";
import { franchiseForVoter, LegislativeVoteError, readStoredVotes, tallyVotes, viewerVote, type FranchiseDirectory, type StoredVotes } from "./votes.ts";

export type BallotType = "YES_NO" | "TRUE_FALSE" | "MULTIPLE_CHOICE" | "FILL_IN";
export const BALLOT_TYPES: readonly BallotType[] = ["YES_NO", "TRUE_FALSE", "MULTIPLE_CHOICE", "FILL_IN"];
export const BALLOT_TYPE_LABELS: Readonly<Record<BallotType, string>> = { YES_NO: "Yes / No", TRUE_FALSE: "True / False", MULTIPLE_CHOICE: "Multiple choice", FILL_IN: "Fill in your answer" };

export const OPTION_IDS = ["A", "B", "C", "D", "E", "F"] as const;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_OPTION_LABEL = 120;
export const MAX_ANSWER_LENGTH = 280;
/** Rule changes one outcome (Yes, or one option) can make. */
export const MAX_CHANGES_PER_OUTCOME = 10;

/** One edit to the rule book. Same meaning as the original single-rule fields on a proposal. */
export interface RuleChange {
  readonly changeType: "CHANGE" | "ADD" | "DELETE";
  /** CHANGE/DELETE: the rule ("6.2"). ADD: the section the new rule goes under ("8"). */
  readonly targetRuleId: string;
  /** Display label of the rule or section when the proposal was filed, e.g. "6.2 Trade Deadline". */
  readonly section: string;
  /** CHANGE/ADD: exact wording, one paragraph per entry. DELETE: null. */
  readonly proposedText: readonly string[] | null;
  /** ADD: the new rule's short title. */
  readonly newRuleTitle: string | null;
}

export interface BallotOption {
  readonly id: string;
  readonly label: string;
  /** Applied in order if this option wins. Empty = "keep the current rules". */
  readonly changes: readonly RuleChange[];
}

/** Stored in `proposals/{id}.ballot`. Missing = Yes / No. */
export interface StoredBallot {
  readonly type: BallotType;
  readonly options?: readonly BallotOption[];
}

/** Stored in `proposals/{id}.ballotResponses`: one entry per team. */
export interface BallotResponse {
  readonly voterId: string;
  /** MULTIPLE_CHOICE: the option id ("A"). */
  readonly choice?: string;
  /** FILL_IN: the team's answer. */
  readonly answer?: string;
  readonly at: string;
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

function readChange(value: unknown): RuleChange | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const changeType = c.changeType === "CHANGE" || c.changeType === "ADD" || c.changeType === "DELETE" ? c.changeType : null;
  if (!changeType || !text(c.targetRuleId)) return null;
  const lines = Array.isArray(c.proposedText) ? c.proposedText.filter((l): l is string => typeof l === "string") : null;
  return { changeType, targetRuleId: text(c.targetRuleId), section: text(c.section) || text(c.targetRuleId), proposedText: changeType === "DELETE" ? null : lines, newRuleTitle: changeType === "ADD" ? text(c.newRuleTitle) || null : null };
}

export function readRuleChanges(value: unknown): readonly RuleChange[] {
  return Array.isArray(value) ? value.map(readChange).filter((c): c is RuleChange => c !== null) : [];
}

/** The proposal's ballot. Old documents (no `ballot` field, or anything unreadable) are Yes / No. */
export function readBallot(value: unknown): StoredBallot {
  const b = (value && typeof value === "object" ? value : {}) as { type?: unknown; options?: unknown };
  const type = BALLOT_TYPES.includes(b.type as BallotType) ? (b.type as BallotType) : "YES_NO";
  if (type !== "MULTIPLE_CHOICE") return { type };
  const options = (Array.isArray(b.options) ? b.options : []).map((o, i): BallotOption | null => {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    return { id: text(r.id) || OPTION_IDS[i] || String(i + 1), label: text(r.label), changes: readRuleChanges(r.changes) };
  }).filter((o): o is BallotOption => o !== null);
  return { type, options };
}

export function readBallotResponses(value: unknown): readonly BallotResponse[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const r = v as Record<string, unknown>;
    if (!text(r.voterId)) return [];
    return [{ voterId: text(r.voterId), ...(typeof r.choice === "string" ? { choice: r.choice } : {}), ...(typeof r.answer === "string" ? { answer: r.answer } : {}), at: text(r.at) }];
  });
}

/** The parts of a proposal the ballot needs (keeps this file independent of proposals.ts). */
export interface BallotSource {
  readonly ballot?: StoredBallot | null;
  readonly votes: StoredVotes;
  readonly ballotResponses?: readonly BallotResponse[] | null;
}

/**
 * Records a team's multiple-choice pick or fill-in answer. Any earlier response by the same team
 * (either co-owner) is replaced, so a team can change it while voting is open but never answers twice.
 */
export function applyBallotResponse(source: BallotSource, directory: FranchiseDirectory, voterId: string, input: { readonly choice?: unknown; readonly answer?: unknown }, now: Date): readonly BallotResponse[] {
  const ballot = readBallot(source.ballot);
  const franchise = franchiseForVoter(directory, voterId);
  if (!franchise) throw new LegislativeVoteError("NOT_ELIGIBLE");
  let entry: BallotResponse;
  if (ballot.type === "MULTIPLE_CHOICE") {
    const choice = typeof input.choice === "string" ? input.choice : "";
    if (!(ballot.options ?? []).some((o) => o.id === choice)) throw new LegislativeVoteError("INVALID_CHOICE");
    entry = { voterId, choice, at: now.toISOString() };
  } else if (ballot.type === "FILL_IN") {
    const answer = typeof input.answer === "string" ? input.answer.trim() : "";
    if (!answer || answer.length > MAX_ANSWER_LENGTH) throw new LegislativeVoteError("INVALID_ANSWER");
    entry = { voterId, answer, at: now.toISOString() };
  } else throw new LegislativeVoteError("INVALID_CHOICE");
  const team = new Set(franchise.voterIds);
  return [...readBallotResponses(source.ballotResponses).filter((r) => !team.has(r.voterId)), entry];
}

/** Yes/No and True/False choices as stored in `votes` ("true" counts as yes). */
export function yesNoChoice(type: BallotType, choice: unknown): "yes" | "no" {
  if (type === "TRUE_FALSE") { if (choice === "true") return "yes"; if (choice === "false") return "no"; }
  else if (type === "YES_NO") { if (choice === "yes" || choice === "no") return choice; }
  throw new LegislativeVoteError("INVALID_CHOICE");
}

export interface BallotTally {
  readonly type: BallotType;
  /** Teams that have voted / answered. */
  readonly cast: number;
  readonly eligible: number;
  readonly waitingOn: readonly string[];
  readonly conflicted: readonly string[];
  readonly yes: number;
  readonly no: number;
  /** MULTIPLE_CHOICE: votes per option id, in option order. */
  readonly optionCounts: Readonly<Record<string, number>>;
}

/** Counts one response per team, whatever the ballot type. Unknown voter ids (a team that changed hands) count individually, as with yes/no. */
export function tallyBallot(source: BallotSource, directory: FranchiseDirectory): BallotTally {
  const ballot = readBallot(source.ballot);
  if (ballot.type === "YES_NO" || ballot.type === "TRUE_FALSE") {
    const t = tallyVotes(readStoredVotes(source.votes), directory);
    return { type: ballot.type, cast: t.cast, eligible: t.eligible, waitingOn: t.waitingOn, conflicted: t.conflicted, yes: t.yes, no: t.no, optionCounts: {} };
  }
  const responses = readBallotResponses(source.ballotResponses);
  const valid = ballot.type === "MULTIPLE_CHOICE" ? responses.filter((r) => (ballot.options ?? []).some((o) => o.id === r.choice)) : responses.filter((r) => r.answer);
  const counted = new Map<string, BallotResponse>();
  const waitingOn: string[] = [];
  const known = new Set(directory.flatMap((f) => f.voterIds));
  directory.forEach((franchise, index) => {
    // Latest response by the team wins (only one is ever stored; this guards hand-edited records).
    const mine = valid.filter((r) => franchise.voterIds.includes(r.voterId)).at(-1);
    if (mine) counted.set(`team:${index}`, mine); else waitingOn.push(franchise.name);
  });
  for (const r of valid) if (!known.has(r.voterId)) counted.set(`voter:${r.voterId}`, r);
  const optionCounts: Record<string, number> = {};
  for (const o of ballot.options ?? []) optionCounts[o.id] = 0;
  for (const r of counted.values()) if (r.choice && r.choice in optionCounts) optionCounts[r.choice] += 1;
  return { type: ballot.type, cast: counted.size, eligible: directory.length, waitingOn, conflicted: [], yes: 0, no: 0, optionCounts };
}

/** How many current teams have voted (the "6 of 12 teams have voted" line). */
export function teamsVotedCount(source: BallotSource, directory: FranchiseDirectory): number {
  const t = tallyBallot(source, directory);
  return directory.length - t.waitingOn.length;
}

/** The viewer's team's response: "yes"/"no" (True/False are stored as yes/no), an option id, or its answer. */
export function viewerResponse(source: BallotSource, directory: FranchiseDirectory, voterId: string | null): { readonly choice: string | null; readonly answer: string | null } {
  if (!voterId) return { choice: null, answer: null };
  const ballot = readBallot(source.ballot);
  if (ballot.type === "YES_NO" || ballot.type === "TRUE_FALSE") return { choice: viewerVote(readStoredVotes(source.votes), directory, voterId), answer: null };
  const team = franchiseForVoter(directory, voterId)?.voterIds ?? [voterId];
  const mine = readBallotResponses(source.ballotResponses).filter((r) => team.includes(r.voterId)).at(-1);
  return { choice: mine?.choice ?? null, answer: mine?.answer ?? null };
}

export interface ChoiceResult {
  readonly outcome: "passed" | "failed" | "tied";
  /** The winning option, or null when nothing won (tie, no quorum, two-thirds not met). */
  readonly winningOptionId: string | null;
  readonly optionCounts: Readonly<Record<string, number>>;
  readonly cast: number;
  readonly quorumMet: boolean;
  readonly explanation: string;
}

/** "7–4–1": the winner's count first, then the rest from most to fewest. */
function scoreLine(counts: readonly number[], first: number): string {
  const rest = [...counts];
  rest.splice(rest.indexOf(first), 1);
  return [first, ...rest.sort((a, b) => b - a)].join("–");
}

/**
 * Multiple choice, counted by the league's own policy (never another league's):
 *  - Quorum: the league's quorum, counting teams that picked any option.
 *  - The option with the most votes wins. If two or more tie for most, nothing wins and nothing changes.
 *  - If the league's rule-change threshold is two-thirds and the winning option changes the rule book,
 *    it needs two-thirds of the votes cast. Otherwise most votes wins.
 */
export function decideChoice(options: readonly BallotOption[], optionCounts: Readonly<Record<string, number>>, policy: LegislativePolicy): ChoiceResult {
  const counts = options.map((o) => optionCounts[o.id] ?? 0);
  const cast = counts.reduce((a, b) => a + b, 0);
  const quorumMet = policy.quorum === null || cast >= policy.quorum;
  const base = { optionCounts: Object.fromEntries(options.map((o, i) => [o.id, counts[i]!])), cast, quorumMet };
  if (!quorumMet) return { ...base, outcome: "failed", winningOptionId: null, explanation: `Only ${cast} teams voted; ${policy.quorum} needed. Nothing changes.` };
  if (cast === 0) return { ...base, outcome: "failed", winningOptionId: null, explanation: "No votes were cast. Nothing changes." };
  const top = Math.max(...counts);
  const leaders = options.filter((_, i) => counts[i] === top);
  if (leaders.length > 1) {
    const names = leaders.map((o) => `Option ${o.id}`);
    return { ...base, outcome: "tied", winningOptionId: null, explanation: `Tied: ${names.slice(0, -1).join(", ")} and ${names.at(-1)} had ${top} vote${top === 1 ? "" : "s"} each. Nothing changes.` };
  }
  const winner = leaders[0]!;
  const score = scoreLine(counts, top);
  if (winner.changes.length > 0 && policy.ruleChangeThreshold === "TWO_THIRDS" && top * 3 < cast * 2) {
    return { ...base, outcome: "failed", winningOptionId: null, explanation: `Option ${winner.id} led ${score} but a rule change needs two-thirds of the votes cast. Nothing changes.` };
  }
  return { ...base, outcome: "passed", winningOptionId: winner.id, explanation: `Option ${winner.id} won ${score}.` };
}
