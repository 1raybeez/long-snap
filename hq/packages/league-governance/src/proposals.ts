import { BALLOT_TYPES, MAX_CHANGES_PER_OUTCOME, MAX_OPTION_LABEL, MAX_OPTIONS, MIN_OPTIONS, OPTION_IDS, decideChoice, readBallot, readRuleChanges, tallyBallot, type BallotOption, type BallotResponse, type BallotType, type RuleChange, type StoredBallot } from "./ballots.ts";
import { currentRuleId, isSectionId, nextRuleId, versionHistoryForRules, type AmendmentKind, type ConstitutionSection, type RatifiedRule, type RuleNumbering, type VersionHistoryUpdate } from "./constitution.ts";
import type { LegislativePolicy } from "./policy.ts";
import { windowForProposal, type LegislativeProposalSessionType, type LegislativeSessionConfig } from "./session.ts";
import { decideResult, type DecidedResult, type FranchiseDirectory, type StoredVotes } from "./votes.ts";

/** What the proposal does to the constitution. OTHER = league business, no rule text changes. */
export type ProposalChangeType = "CHANGE" | "ADD" | "DELETE" | "OTHER";
export const CHANGE_TYPE_LABELS: Readonly<Record<ProposalChangeType, string>> = {
  CHANGE: "Change a rule", ADD: "Add a new rule", DELETE: "Delete a rule", OTHER: "League business (no rule text)",
};

/** "closed" = a fill-in-your-answer ballot that has closed (no pass/fail). */
export type ProposalStatus = "active" | "passed" | "failed" | "tied" | "closed";
export type CloseReason = "ALL_VOTED" | "DEADLINE" | "COMMISSIONER";

export interface LegislativeProposal {
  readonly id: string;
  readonly sessionYear: number;
  readonly sessionType?: LegislativeProposalSessionType;

  readonly section: string;
  readonly title: string;
  readonly description: string;
  readonly submittedBy: string;
  readonly managerId?: string;
  readonly managerImage?: string | null;
  readonly status: ProposalStatus;
  readonly votes: StoredVotes;
  readonly createdAt?: string | null;
  readonly createdBy?: string | null;
  readonly changeType?: ProposalChangeType;
  /** CHANGE/DELETE: the rule ("4.3"). ADD: the section the rule goes under ("4"). */
  readonly targetRuleId?: string | null;
  /** CHANGE/ADD: the exact wording that goes into the constitution, one paragraph per entry. */
  readonly proposedText?: readonly string[] | null;
  /** ADD: short title for the new rule. */
  readonly newRuleTitle?: string | null;
  readonly finalizedAt?: string | null;
  readonly finalizedBy?: string | null;
  readonly passedAt?: string | null;
  readonly closeReason?: CloseReason | null;
  readonly result?: DecidedResult | null;
  /** Rule-numbering version targetRuleId was written under (missing = the league's original numbering). */
  readonly ruleNumbering?: number;
  /*
   * Added 2026-11-03 (ballot types; one proposal can change several rules). All optional: a document
   * without them is a Yes / No proposal with at most the one rule change above, exactly as before.
   */
  /** How the league answers. Missing = Yes / No. Multiple choice carries its options and each option's rule changes. */
  readonly ballot?: StoredBallot | null;
  /** Yes / No or True / False with two or more rule changes: every change made if it passes (the single-rule fields mirror the first). */
  readonly yesChanges?: readonly RuleChange[] | null;
  /** Multiple-choice picks and fill-in answers, one per team (Yes / No and True / False stay in `votes`). */
  readonly ballotResponses?: readonly BallotResponse[] | null;
}

/** One rule change as typed on the form. */
export interface RuleChangeInput {
  readonly changeType: string;
  readonly targetRuleId: string;
  readonly proposedText?: string;
  readonly newRuleTitle?: string;
}

export interface ProposalSubmission {
  /** Single-rule proposals (the original form). With `yesChanges` or a ballot type this may be left out. */
  readonly changeType?: ProposalChangeType;
  /** The rule or section (single-rule form), or the related rule for league business. */
  readonly targetRuleId: string;
  readonly title: string;
  readonly description: string;
  readonly proposedText?: string;
  readonly newRuleTitle?: string;
  /** 2026-11-03. Missing = Yes / No. */
  readonly ballotType?: string;
  /** Yes / No or True / False: the rule changes made if it passes (any number up to the limit). */
  readonly yesChanges?: readonly RuleChangeInput[];
  /** Multiple choice: 2–6 options in order (A, B, C…), each with optional rule changes. */
  readonly options?: readonly { readonly label: string; readonly changes?: readonly RuleChangeInput[] }[];
}

export type LegislativeProposalErrorCode = "CONTENT_REQUIRED" | "TOO_LONG" | "UNKNOWN_RULE" | "WORDING_REQUIRED" | "INVALID_TYPE" | "SESSION_CLOSED" | "NOT_ACTIVE" | "INVALID_BALLOT" | "OPTIONS_COUNT" | "OPTION_LABEL" | "TOO_MANY_CHANGES" | "DUPLICATE_RULE";
export class LegislativeProposalError extends Error {
  readonly code: string;
  constructor(code: LegislativeProposalErrorCode) { super(code); this.code = code; }
}

export const PROPOSAL_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CONTENT_REQUIRED: "Add a short title and explain the change.",
  TOO_LONG: "That proposal is too long. Shorten it and try again.",
  UNKNOWN_RULE: "Pick the rule (or section) this proposal is about.",
  WORDING_REQUIRED: "Write the exact wording that should go in the constitution.",
  INVALID_TYPE: "Pick what the proposal does: change, add, or delete a rule.",
  SESSION_CLOSED: "A new legislative session has to be set up before proposals can be submitted.",
  NOT_ACTIVE: "This proposal is no longer open for voting.",
  NOT_ELIGIBLE: "Your account isn't linked to a team that can vote.",
  INVALID_CHOICE: "Pick one of the choices on this ballot.",
  INVALID_ANSWER: "Type an answer (up to 280 characters).",
  INVALID_BALLOT: "Pick how the league should answer: Yes / No, True / False, multiple choice, or fill in.",
  OPTIONS_COUNT: "A multiple-choice ballot needs 2 to 6 options.",
  OPTION_LABEL: "Give every option a short description (up to 120 characters).",
  TOO_MANY_CHANGES: "That's too many rule changes for one answer (10 at most).",
  DUPLICATE_RULE: "The same rule is listed twice for one answer. Put all of its new wording in one change.",
};

/**
 * A submission from a site's JSON request body (both sites use this, so they accept the same fields).
 * Only strings, and lists one item over each limit, get through; prepareSubmission then checks everything.
 * A body from the original form (no ballotType / yesChanges / options) reads exactly as before.
 */
export function submissionFromBody(body: Record<string, unknown>): ProposalSubmission {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const changes = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_CHANGES_PER_OUTCOME + 1).map((c) => { const r = (c && typeof c === "object" ? c : {}) as Record<string, unknown>; return { changeType: str(r.changeType), targetRuleId: str(r.targetRuleId), proposedText: str(r.proposedText), newRuleTitle: str(r.newRuleTitle) }; }) : undefined);
  const options = Array.isArray(body.options) ? body.options.slice(0, MAX_OPTIONS + 1).map((o) => { const r = (o && typeof o === "object" ? o : {}) as Record<string, unknown>; return { label: str(r.label), changes: changes(r.changes) ?? [] }; }) : undefined;
  return {
    changeType: str(body.changeType) as ProposalChangeType, targetRuleId: str(body.targetRuleId), title: str(body.title), description: str(body.description),
    proposedText: str(body.proposedText), newRuleTitle: str(body.newRuleTitle),
    ...(body.ballotType !== undefined ? { ballotType: str(body.ballotType) } : {}),
    ...(body.yesChanges !== undefined ? { yesChanges: changes(body.yesChanges) ?? [] } : {}),
    ...(options ? { options } : {}),
  };
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max + 1) : "");

const paragraphs = (v: string) => v.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export type PreparedSubmission = Pick<LegislativeProposal, "changeType" | "targetRuleId" | "section" | "title" | "description" | "proposedText" | "newRuleTitle"> & { readonly ballot?: StoredBallot; readonly yesChanges?: readonly RuleChange[] };

/**
 * Checks an owner's submission against the constitution and returns the fields to store.
 * A submission without a ballot type or change list is the original single-rule form and is stored exactly as before.
 */
export function prepareSubmission(base: readonly ConstitutionSection[], input: ProposalSubmission): PreparedSubmission {
  if (input.ballotType === undefined && input.yesChanges === undefined && input.options === undefined) return prepareSingleRule(base, input);
  const type = input.ballotType ?? "YES_NO";
  if (!BALLOT_TYPES.includes(type as BallotType)) throw new LegislativeProposalError("INVALID_BALLOT");
  const ballotType = type as BallotType;
  const title = clean(input.title, 180), description = clean(input.description, 5000);
  if (!title || !description) throw new LegislativeProposalError("CONTENT_REQUIRED");
  if (title.length > 180 || description.length > 5000) throw new LegislativeProposalError("TOO_LONG");
  // League business / question with no rule text: an optional related rule, as before.
  const business = (): PreparedSubmission => {
    const related = prepareSingleRule(base, { changeType: "OTHER", targetRuleId: input.targetRuleId, title, description });
    return { ...related, ...(ballotType === "YES_NO" ? {} : { ballot: { type: ballotType } }) };
  };

  if (ballotType === "YES_NO" || ballotType === "TRUE_FALSE") {
    const changes = input.yesChanges !== undefined
      ? prepareChanges(base, input.yesChanges)
      : input.changeType && input.changeType !== "OTHER" ? prepareChanges(base, [{ changeType: input.changeType, targetRuleId: input.targetRuleId, proposedText: input.proposedText, newRuleTitle: input.newRuleTitle }]) : [];
    if (!changes.length) return business();
    // The single-rule fields describe the first change, so one-rule proposals are stored exactly as before.
    const first = changes[0]!;
    return {
      changeType: first.changeType, targetRuleId: first.targetRuleId, section: changes.map((c) => c.section).join("; "), title, description,
      proposedText: first.proposedText, newRuleTitle: first.changeType === "ADD" ? first.newRuleTitle || title : null,
      ...(changes.length > 1 ? { yesChanges: changes } : {}),
      ...(ballotType === "TRUE_FALSE" ? { ballot: { type: ballotType } } : {}),
    };
  }

  if (ballotType === "MULTIPLE_CHOICE") {
    const raw = Array.isArray(input.options) ? input.options : [];
    if (raw.length < MIN_OPTIONS || raw.length > MAX_OPTIONS) throw new LegislativeProposalError("OPTIONS_COUNT");
    const options: BallotOption[] = raw.map((option, i) => {
      const label = clean(option && typeof option === "object" ? option.label : "", MAX_OPTION_LABEL);
      if (!label || label.length > MAX_OPTION_LABEL) throw new LegislativeProposalError("OPTION_LABEL");
      return { id: OPTION_IDS[i]!, label, changes: prepareChanges(base, option.changes ?? []) };
    });
    const sections = [...new Set(options.flatMap((o) => o.changes.map((c) => c.section)))];
    const fields = business();
    // Stored as league business so nothing that only knows the single-rule fields could ratify it; the winning option's changes are applied instead.
    return { ...fields, section: input.targetRuleId?.trim() || !sections.length ? fields.section : sections.join("; "), ballot: { type: ballotType, options } };
  }

  // FILL_IN: a question for the league. It never changes the rule book.
  return business();
}

/** The rule changes for one outcome: each one checked like the original single-rule form. */
function prepareChanges(base: readonly ConstitutionSection[], input: unknown): readonly RuleChange[] {
  const list = Array.isArray(input) ? input : [];
  if (list.length > MAX_CHANGES_PER_OUTCOME) throw new LegislativeProposalError("TOO_MANY_CHANGES");
  const changes = list.map((item): RuleChange => {
    if (!item || typeof item !== "object") throw new LegislativeProposalError("INVALID_TYPE");
    const c = item as RuleChangeInput;
    if (c.changeType !== "CHANGE" && c.changeType !== "ADD" && c.changeType !== "DELETE") throw new LegislativeProposalError("INVALID_TYPE");
    const fields = prepareSingleRule(base, { changeType: c.changeType, targetRuleId: typeof c.targetRuleId === "string" ? c.targetRuleId : "", title: "x", description: "x", proposedText: typeof c.proposedText === "string" ? c.proposedText : "", newRuleTitle: typeof c.newRuleTitle === "string" ? c.newRuleTitle : "" });
    const newRuleTitle = c.changeType === "ADD" ? clean(c.newRuleTitle, 120) || null : null;
    return { changeType: c.changeType, targetRuleId: fields.targetRuleId!, section: fields.section, proposedText: fields.proposedText ?? null, newRuleTitle };
  });
  const edited = changes.filter((c) => c.changeType !== "ADD").map((c) => c.targetRuleId);
  if (new Set(edited).size !== edited.length) throw new LegislativeProposalError("DUPLICATE_RULE");
  return changes;
}

/** The original single-rule form (change, add, delete, or league business). */
function prepareSingleRule(base: readonly ConstitutionSection[], input: ProposalSubmission): Pick<LegislativeProposal, "changeType" | "targetRuleId" | "section" | "title" | "description" | "proposedText" | "newRuleTitle"> {
  const changeType = input.changeType as ProposalChangeType;
  if (!["CHANGE", "ADD", "DELETE", "OTHER"].includes(changeType)) throw new LegislativeProposalError("INVALID_TYPE");
  const title = clean(input.title, 180), description = clean(input.description, 5000);
  const wording = clean(input.proposedText, 5000), newRuleTitle = clean(input.newRuleTitle, 120);
  if (!title || !description) throw new LegislativeProposalError("CONTENT_REQUIRED");
  if (title.length > 180 || description.length > 5000 || wording.length > 5000 || newRuleTitle.length > 120) throw new LegislativeProposalError("TOO_LONG");
  const target = clean(input.targetRuleId, 20);
  const section = base.find((s) => s.id === target);
  const sub = base.flatMap((s) => s.subsections ?? []).find((s) => s.id === target);
  if (changeType === "ADD" && !section) throw new LegislativeProposalError("UNKNOWN_RULE");
  if ((changeType === "CHANGE" || changeType === "DELETE") && !sub) throw new LegislativeProposalError("UNKNOWN_RULE");
  if ((changeType === "CHANGE" || changeType === "ADD") && !wording) throw new LegislativeProposalError("WORDING_REQUIRED");
  const label = sub?.title ?? section?.title ?? (target || "General business");
  return {
    changeType,
    targetRuleId: changeType === "OTHER" ? (sub || section ? target : null) : target,
    section: label,
    title,
    description,
    proposedText: changeType === "CHANGE" || changeType === "ADD" ? paragraphs(wording) : null,
    newRuleTitle: changeType === "ADD" ? newRuleTitle || title : null,
  };
}

/** Whether a proposal should close now, and why. */
export function closeReason(proposal: LegislativeProposal, ctx: { readonly session: LegislativeSessionConfig; readonly policy: LegislativePolicy; readonly directory: FranchiseDirectory; readonly now: Date; readonly commissionerOverride?: boolean }): CloseReason | null {
  if (proposal.status !== "active" || proposal.sessionYear !== ctx.session.sessionYear) return null;
  const tally = tallyBallot(proposal, ctx.directory);
  if (ctx.policy.closeWhenAllTeamsVote && ctx.directory.length > 0 && tally.waitingOn.length === 0 && tally.conflicted.length === 0) return "ALL_VOTED";
  if (ctx.commissionerOverride) return null;
  const window = windowForProposal(ctx.session, proposal.createdAt);
  if (window && ctx.now.getTime() > Date.parse(window.closesAt)) return "DEADLINE";
  return null;
}

export interface FinalizedProposal {
  readonly proposal: LegislativeProposal;
  /** The first rule change (kept for callers written before one proposal could change several rules). */
  readonly ratifiedRule: RatifiedRule | null;
  /** Every rule change, in the order applied. */
  readonly ratifiedRules: readonly RatifiedRule[];
  readonly versionHistory: VersionHistoryUpdate | null;
}

function legacySectionId(section: string): string { return section.trim().match(/^\d+(?:\.\d+)*/)?.[0] ?? section.trim(); }

/** The rule changes a Yes / True result makes: the list, or the original single-rule fields as a one-item list. */
export function yesOutcomeChanges(p: Pick<LegislativeProposal, "yesChanges" | "changeType" | "targetRuleId" | "section" | "proposedText" | "newRuleTitle">): readonly RuleChange[] {
  const listed = readRuleChanges(p.yesChanges);
  if (listed.length) return listed;
  if (p.changeType !== "CHANGE" && p.changeType !== "ADD" && p.changeType !== "DELETE") return [];
  return [{ changeType: p.changeType, targetRuleId: p.targetRuleId ?? "", section: p.section, proposedText: p.changeType === "DELETE" ? null : p.proposedText ?? null, newRuleTitle: p.newRuleTitle ?? null }];
}

type FinalizeContext = { readonly policy: LegislativePolicy; readonly directory: FranchiseDirectory; readonly base: readonly ConstitutionSection[]; readonly currentSections: readonly { readonly id: string; readonly subsections?: readonly { readonly id: string }[] }[]; readonly now: Date; readonly reason: CloseReason; readonly actor: string; readonly numbering?: RuleNumbering | null };

/**
 * Turns an outcome's rule changes into amendments, in order, with the same machinery as a single rule.
 * An added rule takes the next free number, counting rules added earlier in the same list.
 */
function ratifyChanges(proposal: LegislativeProposal, changes: readonly RuleChange[], ctx: FinalizeContext, iso: string, voteTotals: RatifiedRule["voteTotals"], outcomeLabel?: string): readonly RatifiedRule[] {
  let sections = ctx.currentSections.map((s) => ({ id: s.id, subsections: (s.subsections ?? []).map((sub) => ({ id: sub.id })) }));
  return changes.map((change, index): RatifiedRule => {
    // A proposal filed before a renumbering targets the rule's old number.
    const target = currentRuleId(change.targetRuleId, ctx.numbering, proposal.ruleNumbering);
    const kind: AmendmentKind = change.changeType === "CHANGE" ? "REPLACE" : change.changeType === "ADD" ? "ADD" : "REPEAL";
    const content = change.changeType === "DELETE" ? [] : [...(change.proposedText ?? [proposal.description])];
    const newRuleId = change.changeType === "ADD" && isSectionId(ctx.base, target) ? nextRuleId(sections, target) : null;
    if (newRuleId) sections = sections.map((s) => (s.id === target ? { ...s, subsections: [...s.subsections, { id: newRuleId }] } : s));
    return {
      proposalId: proposal.id, sectionId: target, title: proposal.title, content, passedAt: iso, voteTotals, changeType: kind, newRuleId,
      newRuleTitle: newRuleId ? `${newRuleId} ${change.newRuleTitle ?? proposal.title}` : null,
      ...(ctx.numbering ? { ruleNumbering: ctx.numbering.version } : {}),
      ...(changes.length > 1 ? { changeIndex: index } : {}),
      ...(outcomeLabel ? { outcomeLabel } : {}),
    };
  });
}

/**
 * Closes a proposal: counts one vote per team, applies the league's rule and, if it passed
 * (or a multiple-choice option won) and changes the constitution, produces the amendments and one history entry.
 * `currentSections` = the constitution as it stands (needed to number an added rule).
 */
export function finalizeProposal(proposal: LegislativeProposal, ctx: FinalizeContext): FinalizedProposal {
  if (proposal.status !== "active") throw new LegislativeProposalError("NOT_ACTIVE");
  const ballot = readBallot(proposal.ballot);
  const tally = tallyBallot(proposal, ctx.directory);
  const iso = ctx.now.toISOString();
  const close = (result: DecidedResult, status: ProposalStatus): LegislativeProposal => ({ ...proposal, status, result, closeReason: ctx.reason, finalizedAt: iso, finalizedBy: ctx.actor, passedAt: status === "passed" ? iso : null });
  const done = (closed: LegislativeProposal, rules: readonly RatifiedRule[]): FinalizedProposal => ({ proposal: closed, ratifiedRule: rules[0] ?? null, ratifiedRules: rules, versionHistory: versionHistoryForRules(rules, ctx.now) });

  if (ballot.type === "FILL_IN") {
    // No pass/fail: the answers are the result. Never changes the rule book.
    const result: DecidedResult = { outcome: "closed", yes: 0, no: 0, threshold: ctx.policy.ordinaryThreshold, quorumMet: true, explanation: `${tally.cast} of ${tally.eligible} teams answered.` };
    return done(close(result, "closed"), []);
  }

  if (ballot.type === "MULTIPLE_CHOICE") {
    const options = ballot.options ?? [];
    const choice = decideChoice(options, tally.optionCounts, ctx.policy);
    const winner = options.find((o) => o.id === choice.winningOptionId) ?? null;
    const top = winner ? choice.optionCounts[winner.id] ?? 0 : Math.max(0, ...Object.values(choice.optionCounts));
    const result: DecidedResult = { outcome: choice.outcome, yes: top, no: choice.cast - top, threshold: winner?.changes.length ? ctx.policy.ruleChangeThreshold : ctx.policy.ordinaryThreshold, quorumMet: choice.quorumMet, explanation: choice.explanation, optionCounts: choice.optionCounts, winningOptionId: choice.winningOptionId };
    const closed = close(result, choice.outcome);
    if (!winner || !winner.changes.length) return done(closed, []);
    return done(closed, ratifyChanges(proposal, winner.changes, ctx, iso, { yes: top, no: choice.cast - top }, choice.explanation.replace(/\.$/, "")));
  }

  // Yes / No and True / False: the original rules (quorum, threshold, ties do not pass).
  const changes = yesOutcomeChanges(proposal);
  const changesConstitution = proposal.changeType ? changes.length > 0 : true;
  const decided = decideResult(tally.yes, tally.no, ctx.policy, changesConstitution);
  const result: DecidedResult = ballot.type === "TRUE_FALSE" ? { ...decided, explanation: `${decided.explanation.replace(/\.$/, "")} (True ${tally.yes} · False ${tally.no}).` } : decided;
  const closed = close(result, result.outcome);
  if (result.outcome !== "passed" || !changesConstitution) return done(closed, []);
  const voteTotals = { yes: result.yes, no: result.no };
  if (!proposal.changeType) {

    return done(closed, [{ proposalId: proposal.id, sectionId: legacySectionId(proposal.section), title: proposal.title, content: [proposal.description], passedAt: iso, voteTotals }]);
  }
  return done(closed, ratifyChanges(proposal, changes, ctx, iso, voteTotals));
}
