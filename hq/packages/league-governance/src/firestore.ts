import { applyBallotResponse, readBallot, readBallotResponses, readRuleChanges, yesNoChoice } from "./ballots.ts";
import { applyRatifiedRules, ratifiedRuleDocId, type ConstitutionSection, type RatifiedRule, type RuleNumbering } from "./constitution.ts";
import type { LegislativePolicy } from "./policy.ts";
import { closeReason, finalizeProposal, LegislativeProposalError, prepareSubmission, type CloseReason, type LegislativeProposal, type ProposalSubmission } from "./proposals.ts";
import { isVotingOpen, proposalSessionType, resolveSessionPhase, type LegislativeSessionConfig, type LegislativeSessionPhase } from "./session.ts";
import { applyVote, readStoredVotes, type FranchiseDirectory } from "./votes.ts";

interface SnapshotLike { readonly exists: boolean; readonly id: string; data(): Record<string, unknown> | undefined }
interface DocRefLike { readonly id: string; get(): Promise<SnapshotLike> }
interface CollectionLike { doc(id?: string): DocRefLike; get(): Promise<{ readonly docs: readonly SnapshotLike[] }> }
interface TransactionLike {
  get(ref: DocRefLike): Promise<SnapshotLike>;
  set(ref: DocRefLike, data: Record<string, unknown>, options?: { merge: boolean }): unknown;
  create(ref: DocRefLike, data: Record<string, unknown>): unknown;
}
export interface FirestoreLike {
  collection(path: string): CollectionLike;
  doc(path: string): DocRefLike;
  runTransaction<T>(update: (transaction: TransactionLike) => Promise<T>): Promise<T>;
}

export const LEGISLATIVE_PATHS = {
  proposals: "proposals",
  ratifiedRules: "ratified_rules",
  versionHistory: "version_history_updates",
  session: "league_settings/legislative_session",
  votingState: "league_settings/voting_state",
} as const;

/** Firestore Timestamps → ISO strings, recursively. */
export function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  const ts = value as { toDate?: () => Date };
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeFirestoreValue(v)]));
}

function clean(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function toProposal(id: string, data: Record<string, unknown> | undefined): LegislativeProposal {
  const d = (serializeFirestoreValue(data ?? {}) ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    ...(d as object),
    id,
    sessionYear: typeof d.sessionYear === "number" ? d.sessionYear : 0,
    section: text(d.section),
    title: text(d.title),
    description: text(d.description),
    submittedBy: text(d.submittedBy),
    status: (["active", "passed", "failed", "tied", "closed"].includes(text(d.status).toLowerCase()) ? text(d.status).toLowerCase() : "active") as LegislativeProposal["status"],
    votes: readStoredVotes(d.votes),
    createdAt: typeof d.createdAt === "string" ? d.createdAt : null,
    // Ballot fields (2026-11-03) are read only when present, so older documents come back exactly as stored.
    ...(d.ballot !== undefined ? { ballot: readBallot(d.ballot) } : {}),
    ...(d.yesChanges !== undefined ? { yesChanges: readRuleChanges(d.yesChanges) } : {}),
    ...(d.ballotResponses !== undefined ? { ballotResponses: readBallotResponses(d.ballotResponses) } : {}),
  } as LegislativeProposal;
}

function readString(v: unknown): string | null {
  const s = serializeFirestoreValue(v);
  return typeof s === "string" && s.trim() ? s : null;
}

export function readSessionDocument(data: Record<string, unknown> | undefined): LegislativeSessionConfig | null {
  if (!data) return null;
  const sessionYear = typeof data.sessionYear === "number" ? data.sessionYear : null;
  const meetingDate = readString(data.meetingDate), opens = readString(data.annualVotingOpensAt), closes = readString(data.annualVotingClosesAt);
  if (!sessionYear || !meetingDate || !opens || !closes) return null;
  const phase = ["COLLECTING", "ANNUAL_VOTING", "INTERIM", "CLOSED"].includes(String(data.phase)) ? (data.phase as LegislativeSessionPhase) : null;
  return { sessionYear, phase, meetingDate, annualVotingOpensAt: opens, annualVotingClosesAt: closes, interimVotingOpensAt: readString(data.interimVotingOpensAt), interimVotingClosesAt: readString(data.interimVotingClosesAt), cycleBoundaryDate: readString(data.cycleBoundaryDate), updatedAt: readString(data.updatedAt), updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null, source: "persisted" };
}

export interface LegislativeContext {
  readonly policy: LegislativePolicy;
  readonly directory: FranchiseDirectory;
  readonly constitution: readonly ConstitutionSection[];
  /** Set when the league renumbered its constitution: old-numbered records are translated on read. */
  readonly numbering?: RuleNumbering | null;
  /** Used when league_settings/legislative_session is missing or incomplete. */
  readonly fallbackSession: LegislativeSessionConfig;
}

export interface LegislativeSnapshot {
  readonly session: LegislativeSessionConfig;
  readonly phase: LegislativeSessionPhase;
  readonly votingOpen: boolean;
  readonly override: boolean;
  readonly proposals: readonly LegislativeProposal[];
  readonly ratifiedRules: readonly RatifiedRule[];
}

export interface ClosedProposal { readonly id: string; readonly outcome: "passed" | "failed" | "tied" | "closed"; readonly reason: CloseReason; readonly ratified: boolean }

export class LegislativeStore {
  private readonly db: FirestoreLike;
  private readonly ctx: LegislativeContext;
  constructor(db: FirestoreLike, ctx: LegislativeContext) { this.db = db; this.ctx = ctx; }

  async read(now = new Date()): Promise<LegislativeSnapshot> {
    const [proposals, rules, sessionDoc, votingDoc] = await Promise.all([
      this.db.collection(LEGISLATIVE_PATHS.proposals).get(),
      this.db.collection(LEGISLATIVE_PATHS.ratifiedRules).get(),
      this.db.doc(LEGISLATIVE_PATHS.session).get(),
      this.db.doc(LEGISLATIVE_PATHS.votingState).get(),
    ]);
    const session = readSessionDocument(sessionDoc.exists ? sessionDoc.data() : undefined) ?? this.ctx.fallbackSession;
    const override = votingDoc.exists && votingDoc.data()?.isOverrideOpen === true;
    return {
      session, override,
      phase: resolveSessionPhase(session, now),
      votingOpen: isVotingOpen(session, now, override),
      proposals: proposals.docs.map((doc) => toProposal(doc.id, doc.data())),
      ratifiedRules: rules.docs.map((doc) => serializeFirestoreValue(doc.data()) as RatifiedRule),
    };
  }

  async submit(input: ProposalSubmission, author: { readonly voterId: string; readonly name: string; readonly image?: string | null; readonly email: string }, now = new Date()): Promise<string> {
    const snapshot = await this.read(now);
    if (snapshot.phase === "CLOSED") throw new LegislativeProposalError("SESSION_CLOSED");
    // Validate against the constitution as it stands now (rules added by earlier votes count).
    const fields = prepareSubmission(applyRatifiedRules(this.ctx.constitution, snapshot.ratifiedRules, this.ctx.numbering), input);
    const ref = this.db.collection(LEGISLATIVE_PATHS.proposals).doc();
    await this.db.runTransaction(async (tx) => {
      tx.create(ref, clean({
        ...fields, managerId: author.voterId, sleeperId: author.voterId, submittedBy: author.name, managerImage: author.image ?? null,
        sessionYear: snapshot.session.sessionYear, sessionType: proposalSessionType(snapshot.session, now),
        status: "active", votes: { yes: [], no: [] }, createdAt: now.toISOString(), createdBy: author.email,
        ...(fields.ballot && fields.ballot.type !== "TRUE_FALSE" ? { ballotResponses: [] } : {}),
        ...(this.ctx.numbering ? { ruleNumbering: this.ctx.numbering.version } : {}),
      }));
      return undefined;
    });
    return ref.id;
  }

  /** Records a team's vote ("yes"/"no", "true"/"false", or an option id); closes the proposal right away if every team has now voted. */
  async vote(proposalId: string, voterId: string, choice: string, now = new Date()): Promise<{ closed: boolean }> {
    return this.castBallot(proposalId, voterId, { choice }, now);
  }

  /**
   * Records a team's response on any ballot type: `choice` for Yes / No, True / False and multiple choice,
   * `answer` for fill-in. Checked against this proposal's ballot; a co-owner's response replaces their partner's.
   */
  async castBallot(proposalId: string, voterId: string, input: { readonly choice?: unknown; readonly answer?: unknown }, now = new Date()): Promise<{ closed: boolean }> {
    const snapshot = await this.read(now);
    if (!snapshot.votingOpen) throw new Error("Voting is not open.");
    const ref = this.db.collection(LEGISLATIVE_PATHS.proposals).doc(proposalId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new Error("Proposal was not found.");
      const proposal = toProposal(doc.id, doc.data());
      if (proposal.status !== "active" || proposal.sessionYear !== snapshot.session.sessionYear) throw new LegislativeProposalError("NOT_ACTIVE");
      const type = readBallot(proposal.ballot).type;
      const voted: LegislativeProposal = type === "YES_NO" || type === "TRUE_FALSE"
        ? { ...proposal, votes: applyVote(proposal.votes, this.ctx.directory, voterId, yesNoChoice(type, input.choice)) }
        : { ...proposal, ballotResponses: applyBallotResponse(proposal, this.ctx.directory, voterId, input, now) };
      const reason = closeReason(voted, { session: snapshot.session, policy: this.ctx.policy, directory: this.ctx.directory, now, commissionerOverride: snapshot.override });
      if (reason === "ALL_VOTED") { this.writeFinal(tx, voted, snapshot, now, reason, "automatic: every team voted"); return { closed: true }; }
      const change = type === "YES_NO" || type === "TRUE_FALSE" ? { votes: clean(voted.votes) } : { ballotResponses: JSON.parse(JSON.stringify(voted.ballotResponses ?? [])) as unknown[] };
      tx.set(ref, { ...change, updatedAt: now.toISOString() }, { merge: true });
      return { closed: false };
    });
  }

  /** Closes every proposal whose week is up or that every team has voted on. Safe to call repeatedly. */
  async closeDue(now = new Date()): Promise<readonly ClosedProposal[]> {
    const snapshot = await this.read(now);
    const due = snapshot.proposals.filter((p) => closeReason(p, { session: snapshot.session, policy: this.ctx.policy, directory: this.ctx.directory, now, commissionerOverride: snapshot.override }));
    const closed: ClosedProposal[] = [];
    for (const p of due) { const outcome = await this.finalizeOne(p.id, snapshot, now, null, "automatic"); if (outcome) closed.push(outcome); }
    return closed;
  }

  /** Commissioner: close all open proposals in the current session now. */
  async finalizeAll(actor: string, now = new Date()): Promise<readonly ClosedProposal[]> {
    const snapshot = await this.read(now);
    const open = snapshot.proposals.filter((p) => p.status === "active" && p.sessionYear === snapshot.session.sessionYear);
    const closed: ClosedProposal[] = [];
    for (const p of open) { const outcome = await this.finalizeOne(p.id, snapshot, now, "COMMISSIONER", actor); if (outcome) closed.push(outcome); }
    return closed;
  }

  private async finalizeOne(id: string, snapshot: LegislativeSnapshot, now: Date, forced: CloseReason | null, actor: string): Promise<ClosedProposal | null> {
    const ref = this.db.collection(LEGISLATIVE_PATHS.proposals).doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return null;
      const proposal = toProposal(doc.id, doc.data());
      const reason = forced ?? closeReason(proposal, { session: snapshot.session, policy: this.ctx.policy, directory: this.ctx.directory, now, commissionerOverride: snapshot.override });
      if (!reason || proposal.status !== "active") return null;
      const final = this.writeFinal(tx, proposal, snapshot, now, reason, actor);
      return { id, outcome: final.proposal.status as ClosedProposal["outcome"], reason, ratified: final.ratifiedRules.length > 0 };
    });
  }

  private writeFinal(tx: TransactionLike, proposal: LegislativeProposal, snapshot: LegislativeSnapshot, now: Date, reason: CloseReason, actor: string) {
    const current = applyRatifiedRules(this.ctx.constitution, snapshot.ratifiedRules, this.ctx.numbering);
    const final = finalizeProposal(proposal, { policy: this.ctx.policy, directory: this.ctx.directory, base: this.ctx.constitution, currentSections: current, now, reason, actor, numbering: this.ctx.numbering });
    const { id: _id, ...rest } = final.proposal;
    void _id;
    tx.set(this.db.collection(LEGISLATIVE_PATHS.proposals).doc(proposal.id), clean({ ...rest, updatedAt: now.toISOString() }), { merge: true });
    for (const rule of final.ratifiedRules) tx.set(this.db.collection(LEGISLATIVE_PATHS.ratifiedRules).doc(ratifiedRuleDocId(rule)), clean(rule), { merge: true });
    if (final.versionHistory) tx.set(this.db.collection(LEGISLATIVE_PATHS.versionHistory).doc(proposal.id), clean(final.versionHistory), { merge: true });
    return final;
  }

  /** Commissioner: set the meeting date; voting opens then and runs the league's window. */
  async scheduleMeeting(sessionYear: number, meetingDate: string, actor: string, now = new Date()): Promise<LegislativeSessionConfig> {
    const opens = Date.parse(meetingDate);
    if (Number.isNaN(opens)) throw new Error("A valid meeting date is required.");
    const config: LegislativeSessionConfig = {
      sessionYear, phase: null, meetingDate: new Date(opens).toISOString(), annualVotingOpensAt: new Date(opens).toISOString(),
      annualVotingClosesAt: new Date(opens + this.ctx.policy.votingWindowDays * 86_400_000).toISOString(),
      interimVotingOpensAt: null, interimVotingClosesAt: null, cycleBoundaryDate: null, updatedAt: now.toISOString(), updatedBy: actor, source: "persisted",
    };
    const { source: _s, ...stored } = config;
    void _s;
    await this.db.runTransaction(async (tx) => { tx.set(this.db.doc(LEGISLATIVE_PATHS.session), clean(stored), { merge: true }); return undefined; });
    return config;
  }
}
