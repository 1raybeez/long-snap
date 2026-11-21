import type { LegislativeSnapshot } from "./firestore.ts";
import type { LegislativePolicy } from "./policy.ts";
import { closeReason, yesOutcomeChanges, type CloseReason, type LegislativeProposal, type ProposalChangeType } from "./proposals.ts";
import { franchiseForVoter, type FranchiseDirectory } from "./votes.ts";
import { readBallot, readBallotResponses, tallyBallot, viewerResponse, type BallotType, type RuleChange } from "./ballots.ts";
import type { LegislativeProposalSessionType, LegislativeSessionPhase } from "./session.ts";
import { currentRuleId, type RuleNumbering } from "./constitution.ts";

export interface ArchivedProposal {
  readonly id: string;
  readonly year: number;
  readonly title: string;
  readonly status: "passed" | "failed" | "tied" | "unclear" | "informational";
  readonly description: string;
  readonly sourceFile: string;
  readonly section?: string;
  readonly category?: string;
  readonly sponsor?: string;
  readonly voteTotals?: { readonly yes?: number; readonly no?: number; readonly absent?: number };
  readonly options?: readonly { readonly label: string; readonly count: number }[];
  readonly winningOption?: string;
  readonly notes?: string;
  /** Where the vote happened, e.g. "Sleeper poll" or "Owners meeting (paper ballot)". */
  readonly sourceLabel?: string;
}
export interface LegislativeArchiveSession { readonly year: number; readonly title: string; readonly notes?: string; readonly proposals: readonly ArchivedProposal[] }

export type LegislativeRecordStatus = "active" | "passed" | "failed" | "tied" | "closed" | "unclear" | "informational";

/** One rule change as the hub shows it (numbers translated to the current rule book). */
export interface RuleChangeView {
  readonly changeType: "CHANGE" | "ADD" | "DELETE";
  /** The rule (CHANGE/DELETE) or the section a new rule goes under (ADD). */
  readonly ruleId: string;
  readonly label: string;
  readonly proposedText: readonly string[] | null;
  readonly newRuleTitle: string | null;
  /** Link to the rule on the constitution page once it's in force; null otherwise. */
  readonly href: string | null;
}
export interface BallotOptionView {
  readonly id: string;
  readonly label: string;
  readonly changes: readonly RuleChangeView[];
  readonly votes: number;
  readonly won: boolean;
}

export interface NormalizedLegislativeRecord {
  readonly id: string;
  readonly source: "legacy" | "live" | "reconciled";
  readonly sessionYear: number | null;
  readonly sessionType: LegislativeProposalSessionType | null;
  readonly title: string;
  readonly summary: string | null;
  readonly description: string | null;
  readonly sectionId: string | null;
  readonly sectionLabel: string | null;
  readonly changeType: ProposalChangeType | null;
  readonly proposedText: readonly string[] | null;
  readonly proposer: string | null;
  readonly status: LegislativeRecordStatus;
  readonly yesVotes: number | null;
  readonly noVotes: number | null;
  readonly totalVotes: number | null;
  readonly eligibleVoteCount: number;
  readonly waitingOn: readonly string[];
  readonly viewerVote: "yes" | "no" | null;
  readonly createdAt: string | null;
  readonly finalizedAt: string | null;
  readonly ratifiedAt: string | null;
  readonly closeReason: CloseReason | null;
  readonly resultExplanation: string | null;
  readonly currentRuleHref: string | null;
  readonly amendmentHistoryHref: string | null;
  readonly legacySourceId: string | null;
  readonly reconciledProposalId: string | null;
  readonly allEligibleVotesCast: boolean | null;
  readonly resultSourceLabel: string | null;
  /* Ballot types and several rule changes per proposal (2026-11-03). */
  readonly ballotType: BallotType;
  /** Yes / No and True / False: what a Yes / True result changes (empty = league business). */
  readonly ruleChanges: readonly RuleChangeView[];
  /** Multiple choice: the options with their running (or final) counts. */
  readonly options: readonly BallotOptionView[] | null;
  readonly winningOptionId: string | null;
  /** Fill-in: answers with team names, shown once voting has closed (null while open). */
  readonly answers: readonly { readonly team: string; readonly answer: string }[] | null;
  /** Teams that have voted or answered. */
  readonly votedCount: number;
  readonly viewerVoted: boolean;
  /** "yes"/"no" (True / False are stored as yes/no) or an option id. */
  readonly viewerChoice: string | null;
  readonly viewerAnswer: string | null;
  /** The result changed the rule book (shows "Constitution updated"). */
  readonly rulebookChanged: boolean;
}

export interface ReadModelOptions {
  readonly directory: FranchiseDirectory;
  readonly viewerVoterId: string | null;
  /** Link to a rule on the constitution page, or null if the id isn't a current rule. */
  readonly ruleHref: (ruleId: string | null) => string | null;
  readonly versionHistoryHref: string;
  /** Set when the league renumbered its constitution: proposals filed under the old numbers show the new ones. */
  readonly numbering?: RuleNumbering | null;
  /** Archive record id → live proposal id, for meetings recorded in both places. */
  readonly reconciliation?: Readonly<Record<string, string>>;
}

const leadingRuleId = (v: string | null | undefined) => (v ? v.trim().match(/^\d+(?:\.\d+)*/)?.[0] ?? null : null);
const summary = (v: string | null | undefined) => (!v ? null : v.trim().length > 280 ? `${v.trim().slice(0, 277).trimEnd()}…` : v.trim());

export function normalizeLiveProposal(p: LegislativeProposal, o: ReadModelOptions): NormalizedLegislativeRecord {
  const ballot = readBallot(p.ballot);
  const yesNo = ballot.type === "YES_NO" || ballot.type === "TRUE_FALSE";
  const ext = (p as { externalResult?: { yes?: number; no?: number; total?: number; sourceLabel?: string } }).externalResult;
  const external = yesNo && ext && Number.isInteger(ext.yes) && Number.isInteger(ext.no) && typeof ext.sourceLabel === "string" ? ext : null;
  const tally = tallyBallot(p, o.directory);
  const yes = external?.yes ?? tally.yes, no = external?.no ?? tally.no;
  const renum = (id: string | null) => (id ? currentRuleId(id, o.numbering, p.ruleNumbering) : null);
  const storedId = p.targetRuleId ?? leadingRuleId(p.section);
  const ruleId = p.changeType === "ADD" ? null : renum(storedId);
  // "2.5 Trading" filed before a renumbering reads "5.2 Trading" now.
  const relabel = (l: string | null) => { const lead = leadingRuleId(l); const now = renum(lead); return l && lead && now && now !== lead ? `${now}${l.slice(lead.length)}` : l; };
  const label = (p.section || null) && (p.section.split("; ").map((part) => relabel(part)).join("; "));
  const passed = p.status === "passed";
  const winning = p.result?.winningOptionId ?? null;
  const view = (inForce: boolean) => (c: RuleChange): RuleChangeView => {
    const id = renum(c.targetRuleId)!;
    return { changeType: c.changeType, ruleId: id, label: relabel(c.section) ?? id, proposedText: c.proposedText, newRuleTitle: c.newRuleTitle, href: inForce && c.changeType === "CHANGE" ? o.ruleHref(id) : null };
  };
  const ruleChanges = yesNo ? yesOutcomeChanges(p).map(view(passed)) : [];
  const options = ballot.type === "MULTIPLE_CHOICE" ? (ballot.options ?? []).map((opt) => ({ id: opt.id, label: opt.label, changes: opt.changes.map(view(passed && winning === opt.id)), votes: tally.optionCounts[opt.id] ?? 0, won: passed && winning === opt.id })) : null;
  const rulebookChanged = passed && (yesNo ? !p.changeType || ruleChanges.length > 0 : Boolean(options?.find((opt) => opt.won)?.changes.length));
  const answers = ballot.type === "FILL_IN" && p.status !== "active"
    ? readBallotResponses(p.ballotResponses).filter((r) => r.answer).map((r) => ({ team: franchiseForVoter(o.directory, r.voterId)?.name ?? "Former team", answer: r.answer! })).sort((a, b) => a.team.localeCompare(b.team))
    : null;
  const mine = viewerResponse(p, o.directory, o.viewerVoterId);
  return {
    id: p.id, source: "live", sessionYear: p.sessionYear || null, sessionType: p.sessionType ?? null,
    title: p.title, summary: summary(p.description), description: p.description || null,
    sectionId: renum(storedId), sectionLabel: label,
    changeType: p.changeType ?? null, proposedText: p.proposedText ?? null,
    proposer: p.submittedBy || null, status: p.status,
    yesVotes: yesNo ? yes : null, noVotes: yesNo ? no : null, totalVotes: yesNo ? yes + no : tally.cast, eligibleVoteCount: o.directory.length,
    waitingOn: p.status === "active" ? tally.waitingOn : [],
    viewerVote: yesNo ? (mine.choice as "yes" | "no" | null) : null,
    createdAt: p.createdAt ?? null, finalizedAt: p.finalizedAt ?? null, ratifiedAt: p.passedAt ?? null,
    closeReason: p.closeReason ?? null, resultExplanation: p.result?.explanation ?? null,
    currentRuleHref: passed && yesNo && ruleChanges.length <= 1 ? o.ruleHref(ruleId) : null,
    amendmentHistoryHref: rulebookChanged ? o.versionHistoryHref : null,
    legacySourceId: null, reconciledProposalId: null,
    allEligibleVotesCast: tally.waitingOn.length === 0,
    resultSourceLabel: external?.sourceLabel ?? null,
    ballotType: ballot.type, ruleChanges, options, winningOptionId: winning, answers,
    votedCount: o.directory.length - tally.waitingOn.length,
    viewerVoted: Boolean(mine.choice || mine.answer), viewerChoice: mine.choice, viewerAnswer: mine.answer,
    rulebookChanged,
  };
}

function normalizeArchived(a: ArchivedProposal, o: ReadModelOptions): NormalizedLegislativeRecord {
  const yes = a.voteTotals?.yes ?? null, no = a.voteTotals?.no ?? null;
  const reconciled = o.reconciliation?.[a.id] ?? null;
  return {
    id: reconciled ?? a.id, source: reconciled ? "reconciled" : "legacy", sessionYear: a.year, sessionType: null,
    title: a.title, summary: summary(a.description), description: a.description,
    sectionId: leadingRuleId(a.section), sectionLabel: a.section ?? null, changeType: null, proposedText: null,
    proposer: a.sponsor ?? null, status: a.status,
    yesVotes: yes, noVotes: no, totalVotes: yes !== null || no !== null ? (yes ?? 0) + (no ?? 0) : null,
    eligibleVoteCount: o.directory.length, waitingOn: [], viewerVote: null,
    createdAt: null, finalizedAt: null, ratifiedAt: null, closeReason: null, resultExplanation: null,
    // Archived meetings use the numbering of their day; link to where the rule lives now.
    currentRuleHref: a.status === "passed" ? o.ruleHref((() => { const id = leadingRuleId(a.section); return id ? currentRuleId(id, o.numbering) : null; })()) : null,
    amendmentHistoryHref: a.status === "passed" ? o.versionHistoryHref : null,
    legacySourceId: a.id, reconciledProposalId: reconciled, allEligibleVotesCast: null, resultSourceLabel: a.sourceLabel ?? null,
    ballotType: "YES_NO", ruleChanges: [], options: null, winningOptionId: null, answers: null,
    votedCount: 0, viewerVoted: false, viewerChoice: null, viewerAnswer: null, rulebookChanged: a.status === "passed",
  };
}

/** Live proposals + the digitized archive, with archive entries merged into their live twins. */
export function buildLegislativeRecords(live: readonly LegislativeProposal[], archive: readonly LegislativeArchiveSession[], o: ReadModelOptions): readonly NormalizedLegislativeRecord[] {
  const liveById = new Map(live.map((p) => [p.id, normalizeLiveProposal(p, o)]));
  const legacy = archive.flatMap((s) => s.proposals.map((a) => normalizeArchived(a, o)));
  const reconciledIds = new Set(legacy.map((r) => r.reconciledProposalId).filter((id): id is string => Boolean(id)));
  const reconciled = legacy.filter((r) => r.reconciledProposalId && liveById.has(r.reconciledProposalId)).map((r) => {
    const l = liveById.get(r.reconciledProposalId!)!;
    return { ...r, ...l, source: "reconciled" as const, id: l.id, sessionYear: l.sessionYear ?? r.sessionYear, legacySourceId: r.legacySourceId, reconciledProposalId: l.id };
  });
  return [...reconciled, ...[...liveById.values()].filter((r) => !reconciledIds.has(r.id)), ...legacy.filter((r) => !r.reconciledProposalId)];
}

export interface LegislativeHubState {
  readonly leagueName: string;
  readonly meetingName: string;
  readonly sessionYear: number;
  readonly sessionPhase: LegislativeSessionPhase;
  readonly sessionSource: string;
  readonly meetingDate: string | null;
  readonly annualVotingOpensAt: string | null;
  readonly votingDeadline: string | null;
  readonly votingWindowDays: number;
  readonly ruleChangeThreshold: string;
  readonly isVotingOpen: boolean;
  readonly authenticatedOwner: boolean;
  readonly canVote: boolean;
  readonly eligibleVoteCount: number;
  readonly voteNow: readonly NormalizedLegislativeRecord[];
  readonly currentBusiness: readonly NormalizedLegislativeRecord[];
  readonly recentResults: readonly NormalizedLegislativeRecord[];
  readonly historicalRecords: readonly NormalizedLegislativeRecord[];
  readonly archiveYears: readonly number[];
}

export function buildHubState(snapshot: LegislativeSnapshot, policy: LegislativePolicy, archive: readonly LegislativeArchiveSession[], o: ReadModelOptions & { readonly authenticated: boolean }): LegislativeHubState {
  const records = buildLegislativeRecords(snapshot.proposals, archive, o);
  const year = snapshot.session.sessionYear;
  const current = records.filter((r) => r.sessionYear === year);
  const active = current.filter((r) => r.status === "active");
  const canVote = Boolean(o.viewerVoterId && o.directory.some((f) => f.voterIds.includes(o.viewerVoterId!)));
  const voteNow = active.filter((r) => snapshot.votingOpen && (!canVote || !r.viewerVoted));
  const historical = records.filter((r) => r.sessionYear !== year);
  return {
    leagueName: policy.leagueName, meetingName: policy.meetingName,
    sessionYear: year, sessionPhase: snapshot.phase, sessionSource: snapshot.session.source,
    meetingDate: snapshot.session.meetingDate || null, annualVotingOpensAt: snapshot.session.annualVotingOpensAt || null,
    votingDeadline: snapshot.session.annualVotingClosesAt || null, votingWindowDays: policy.votingWindowDays,
    ruleChangeThreshold: policy.ruleChangeThreshold, isVotingOpen: snapshot.votingOpen,
    authenticatedOwner: o.authenticated, canVote, eligibleVoteCount: o.directory.length,
    voteNow,
    currentBusiness: active.filter((r) => !voteNow.some((v) => v.id === r.id)),
    recentResults: current.filter((r) => r.status === "passed" || r.status === "failed" || r.status === "tied" || r.status === "closed"),
    historicalRecords: historical,
    archiveYears: [...new Set(historical.map((r) => r.sessionYear).filter((y): y is number => y !== null))].sort((a, b) => b - a),
  };
}

/**
 * Commissioner Hub "Needs attention" (2026-11-03): proposals that wait on the commissioner.
 * `readyToClose`: voting is finished (every team voted, or the window closed) but the proposal is still open.
 * `waitingForMeetingDate`: open proposals collected between meetings while no meeting date is set.
 */
export function commissionerProposalCounts(snapshot: LegislativeSnapshot, ctx: { readonly policy: LegislativePolicy; readonly directory: FranchiseDirectory; readonly now?: Date }): { readonly readyToClose: number; readonly waitingForMeetingDate: number } {
  const now = ctx.now ?? new Date();
  const open = snapshot.proposals.filter((p) => p.status === "active" && p.sessionYear === snapshot.session.sessionYear);
  const readyToClose = open.filter((p) => closeReason(p, { session: snapshot.session, policy: ctx.policy, directory: ctx.directory, now, commissionerOverride: snapshot.override }) !== null).length;
  const waitingForMeetingDate = !snapshot.votingOpen && !snapshot.session.meetingDate ? open.length - readyToClose : 0;
  return { readyToClose, waitingForMeetingDate };
}
