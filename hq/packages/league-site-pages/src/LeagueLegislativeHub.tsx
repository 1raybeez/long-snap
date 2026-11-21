import Link from "next/link";
import { CommissionerTools } from "@/components/league/LegislativeHubControls";
import { BallotVote } from "./BallotVote";
import { RichLines } from "./LivingConstitution";
import { GoogleAuthButton } from "@/components/site/GoogleAuthButton";
import { thresholdLabel, type LegislativePolicy, type NormalizedLegislativeRecord, type RuleChangeView } from "@/lib/hq-governance";
import type { LegislativeHubPageData } from "@/lib/legislativeHub";

const PHASE_LABEL = { COLLECTING: "Collecting proposals", ANNUAL_VOTING: "Voting open", INTERIM: "Between meetings", CLOSED: "Session closed" } as const;
const SHORT_TYPE: Record<string, string> = { CHANGE: "Rule change", ADD: "New rule", DELETE: "Delete rule", OTHER: "League business" };
const BALLOT_WORD: Record<string, string> = { TRUE_FALSE: "True / False", MULTIPLE_CHOICE: "Multiple choice", FILL_IN: "Fill in" };

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" } : { dateStyle: "long", timeZone: "America/New_York" }).format(date);
}

/** `apiBase` / `newProposalHref` / `signInHref` let the one-platform site host this page for any league (defaults are the league site's own). */
export function LeagueLegislativeHub({ data, policy, constitutionHref, amendmentHistoryHref, apiBase = "/api/league-info/legislative/hub", newProposalHref = "/league-info/legislative/new", signInHref }: { data: LegislativeHubPageData; policy: LegislativePolicy; constitutionHref: string; amendmentHistoryHref: string; apiBase?: string; newProposalHref?: string; signInHref?: string }) {
  const { state, viewer, teamsVoted } = data;
  const canVote = Boolean(viewer.voterId) && Boolean(state?.isVotingOpen);
  const openCount = state ? state.voteNow.length + state.currentBusiness.length : 0;
  return (
    <main className="lcc2-page-shell">
      <div className="lcc2-page-container">
        <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <div>
            <p className="lcc2-label text-[var(--lcc-brand-primary)]">League governance</p>
            <h1 className="lcc2-home-identity__title mt-2">Legislative Hub</h1>
            <p className="lcc2-home-identity__supporting max-w-2xl">
              Submit proposals any time. The whole league votes at the {policy.meetingName} ({policy.meetingWindow}): voting opens at the meeting and closes {policy.votingWindowDays} days later, or as soon as every team has voted. Passed rule changes update the Constitution automatically.
            </p>
            {state ? <p className="mt-4 inline-flex items-center gap-2 font-ui text-xs font-black uppercase tracking-[0.08em] text-[var(--lcc-color-text-muted)]"><span className={`h-2 w-2 rounded-full ${state.isVotingOpen ? "bg-[var(--lcc-semantic-positive)]" : "bg-[var(--lcc-color-border)]"}`} aria-hidden="true" />{state.isVotingOpen ? "Voting is open" : "Voting is closed"}</p> : null}
          </div>
          {state ? (
            <dl className="grid grid-cols-2 gap-3">
              <Fact label="Season" value={String(state.sessionYear)} />
              <Fact label="Phase" value={PHASE_LABEL[state.sessionPhase]} />
              <Fact label={policy.meetingName} value={formatDate(state.meetingDate) ?? "Date not set yet"} />
              <Fact label="Voting closes" value={formatDate(state.votingDeadline, true) ?? `${policy.votingWindowDays} days after the meeting`} />
            </dl>
          ) : null}
        </header>

        {!data.available ? <Notice title="The Legislative Hub is temporarily unavailable" text="Proposals couldn't be loaded right now. Check back shortly." /> : null}

        <section className="lcc2-card lcc2-card--raised mt-8 flex flex-wrap items-center justify-between gap-4 p-5" aria-labelledby="submit-proposal-title">
          <div>
            <p className="lcc2-label text-[var(--lcc-brand-primary)]">Owner participation</p>
            <h2 id="submit-proposal-title" className="mt-1 font-ui text-2xl font-black">Have a rule idea?</h2>
            <p className="lcc2-body mt-1">Change, add or delete rules, or ask the league a question: Yes / No, True / False, multiple choice or fill in your answer. If it passes, the Constitution updates automatically.</p>
          </div>
          {viewer.voterId ? (
            <Link href={newProposalHref} className="lcc2-button lcc2-button--primary">Submit a proposal</Link>
          ) : viewer.signedIn ? (
            <p className="font-ui text-sm font-bold text-[var(--lcc-color-text-muted)]">Your account isn&apos;t linked to a current team. Ask the commissioner.</p>
          ) : (
            signInHref ? <a href={signInHref} className="lcc2-button lcc2-button--primary">Sign in</a> : <GoogleAuthButton mode="sign-in" returnTo="/league-info/legislative" className="lcc2-button lcc2-button--primary" />
          )}
        </section>

        {state ? (
          <>
            <Section id="vote-now" eyebrow="Owner action" title="Vote now" empty={state.isVotingOpen ? (viewer.voterId ? "You've voted on everything open. You can still change a vote below until voting closes." : "Sign in with your team account to vote.") : `Nothing to vote on yet. Voting opens at the ${policy.meetingName}.`}>
              {state.voteNow.map((record) => <ProposalCard key={record.id} record={record} teamsVoted={teamsVoted[record.id]} eligible={state.eligibleVoteCount} canVote={canVote} amendmentHistoryHref={amendmentHistoryHref} apiBase={apiBase} />)}
            </Section>
            <Section id="current-business" eyebrow="This session" title="Current business" empty="No other proposals on the docket yet.">
              {state.currentBusiness.map((record) => <ProposalCard key={record.id} record={record} teamsVoted={state.isVotingOpen ? teamsVoted[record.id] : undefined} eligible={state.eligibleVoteCount} canVote={canVote} amendmentHistoryHref={amendmentHistoryHref} votingOpen={state.isVotingOpen} meetingName={policy.meetingName} apiBase={apiBase} />)}
            </Section>
            <Section id="recent-results" eyebrow="Decided" title="Recent results" empty={`Results from the ${policy.meetingName} appear here.`}>
              {state.recentResults.map((record) => <ProposalCard key={record.id} record={record} eligible={state.eligibleVoteCount} canVote={false} amendmentHistoryHref={amendmentHistoryHref} apiBase={apiBase} />)}
            </Section>
            {state.historicalRecords.length ? (
              <Section id="history" eyebrow="Earlier sessions" title="Past proposals" empty="">
                {state.historicalRecords.map((record) => <ProposalCard key={`${record.source}-${record.id}`} record={record} eligible={state.eligibleVoteCount} canVote={false} amendmentHistoryHref={amendmentHistoryHref} apiBase={apiBase} />)}
              </Section>
            ) : null}
            {viewer.isCommissioner ? <CommissionerTools sessionYear={state.sessionYear} meetingDate={state.meetingDate} isVotingOpen={state.isVotingOpen} openCount={openCount} windowDays={policy.votingWindowDays} apiBase={apiBase} /> : null}
          </>
        ) : null}

        <details className="lcc2-card mt-8 p-5">
          <summary className="cursor-pointer font-ui text-sm font-black uppercase tracking-[0.06em]">How voting works</summary>
          <ul className="lcc2-body mt-3 grid gap-1.5">
            <li>• One vote per team. Co-owners share it, and either can change it while voting is open.</li>
            <li>• Voting opens when the {policy.meetingName} starts and closes {policy.votingWindowDays} days later, or as soon as every team has voted.</li>
            <li>• A rule change passes with {thresholdLabel(policy.ruleChangeThreshold)}{policy.quorum ? `, with at least ${policy.quorum} teams voting` : ""}. Other league business passes with {thresholdLabel(policy.ordinaryThreshold)}. A tie does not pass.</li>
            <li>• When a proposal passes, the Constitution updates itself: changed rules get the new wording, new rules are added, deleted rules are marked repealed, and the amendment history records it. One proposal can change several rules.</li>
            <li>• True / False is counted the same as Yes / No (True counts as yes).</li>
            <li>• Multiple choice: each team picks one option{policy.quorum ? `, with at least ${policy.quorum} teams voting` : ""}. The option with the most votes wins and its rule changes (if any) are made{policy.ruleChangeThreshold === "TWO_THIRDS" ? "; an option that changes the rules needs two-thirds of the votes cast" : ""}. If two or more options tie for the most votes, nothing changes.</li>
            <li>• Fill in your answer: each team types a short answer. Answers are shown with team names once voting closes. These never change the rules.</li>
          </ul>
        </details>

        <div className="mt-6 flex flex-wrap gap-4 font-ui text-xs font-black uppercase tracking-[0.08em]">
          <Link href={constitutionHref} className="text-[var(--lcc-interactive)] underline underline-offset-4">View Constitution</Link>
          <Link href={amendmentHistoryHref} className="text-[var(--lcc-interactive)] underline underline-offset-4">View amendment history</Link>
        </div>
      </div>
    </main>
  );
}

function ProposalCard({ record, teamsVoted, eligible, canVote, amendmentHistoryHref, votingOpen = true, meetingName = "Owners Meeting", apiBase = "/api/league-info/legislative/hub" }: { record: NormalizedLegislativeRecord; teamsVoted?: number; eligible: number; canVote: boolean; amendmentHistoryHref: string; votingOpen?: boolean; meetingName?: string; apiBase?: string }) {
  const active = record.status === "active";
  const ballot = record.ballotType ?? "YES_NO";
  const choice = ballot === "MULTIPLE_CHOICE";
  const tone = record.status === "passed" ? "text-[var(--lcc-semantic-positive)]" : record.status === "failed" ? "text-[var(--lcc-semantic-negative)]" : "text-[var(--lcc-brand-primary)]";

  const statusText = active ? (votingOpen ? "Open for voting" : `Voting opens at the ${meetingName}`)
    : record.status === "closed" ? "Closed"
    : choice && record.status === "passed" ? `Option ${record.winningOptionId} won`
    : choice && record.status === "tied" ? "Tied — nothing changes"
    : choice && record.status === "failed" ? "No winner"
    : record.status === "tied" ? "Tied — did not pass" : record.status.charAt(0).toUpperCase() + record.status.slice(1);
  const [yesWord, noWord] = ballot === "TRUE_FALSE" ? ["True", "False"] : ["Yes", "No"];
  const changes = record.ruleChanges ?? [];
  const kindLabel = BALLOT_WORD[ballot] ?? (changes.length > 1 ? `${changes.length} rule changes` : record.changeType ? SHORT_TYPE[record.changeType] : "");
  const viewerLine = record.viewerChoice && ballot === "MULTIPLE_CHOICE" ? `Your team picked ${record.viewerChoice}` : record.viewerAnswer ? "Your team answered" : record.viewerVote ? `Your team voted ${(record.viewerVote === "yes" ? yesWord : noWord).toUpperCase()}` : null;
  return (
    <article id={record.id} className="lcc2-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="lcc2-label">{kindLabel ? `${kindLabel} · ` : ""}{record.sectionLabel ?? "General business"} · {record.sessionYear ?? ""}</p>
          <h3 className="mt-2 font-ui text-xl font-black text-[var(--lcc-color-text)]">{record.title}</h3>
          {record.proposer ? <p className="mt-1 font-ui text-xs font-bold text-[var(--lcc-color-text-muted)]">Proposed by {record.proposer}</p> : null}
        </div>
        <span className={`shrink-0 rounded-full border border-[var(--lcc-color-border)] px-3 py-1 font-ui text-[10px] font-black uppercase tracking-[0.1em] ${tone}`}>{statusText}</span>
      </div>
      {changes.length > 1 ? (
        <div className="mt-4 grid gap-2">
          <p className="lcc2-label">If {yesWord} wins, these {changes.length} rules change</p>
          {changes.map((change, index) => <ChangeBlock key={index} change={change} />)}
        </div>
      ) : (
        <>
          {record.proposedText?.length && !choice ? (
            <div className="mt-4 rounded-xl border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)] p-4">
              <p className="lcc2-label">{record.changeType === "ADD" ? "Proposed new rule" : "Proposed wording"}</p>
              <div className="font-ui text-sm leading-6"><RichLines lines={record.proposedText} /></div>
            </div>
          ) : null}
          {record.changeType === "DELETE" ? <p className="mt-4 font-ui text-sm font-bold text-[var(--lcc-semantic-negative)]">{record.status === "passed" ? `Rule ${record.sectionId} was deleted from the Constitution.` : active ? `Deletes rule ${record.sectionId} if passed.` : `Proposed deleting rule ${record.sectionId}.`}</p> : null}
        </>
      )}
      {choice && record.options ? <OptionList record={record} /> : null}
      {ballot === "FILL_IN" ? <Answers record={record} eligible={eligible} /> : null}
      {record.description ? (
        <details className="mt-4" open={ballot === "FILL_IN" && active}>
          <summary className="cursor-pointer font-ui text-sm font-bold text-[var(--lcc-interactive)]">{ballot === "FILL_IN" ? "The question" : "Why"}</summary>
          <p className="lcc2-body mt-2 whitespace-pre-wrap">{record.description}</p>
        </details>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--lcc-color-border)] pt-3 font-ui text-xs font-bold text-[var(--lcc-color-text-muted)]">
        {record.yesVotes !== null ? <span>{record.yesVotes} {yesWord} · {record.noVotes} {noWord}</span> : null}
        {active && typeof teamsVoted === "number" && ballot !== "FILL_IN" ? <span>{teamsVoted} of {eligible} teams have voted</span> : null}
        {viewerLine ? <span className="text-[var(--lcc-brand-primary)]">{viewerLine}</span> : null}
        {record.resultSourceLabel ? <span>Voted in a {record.resultSourceLabel}</span> : null}
        {record.closeReason === "ALL_VOTED" ? <span>Closed when every team had voted</span> : record.closeReason === "DEADLINE" ? <span>Closed at the end of the voting week</span> : null}
        {record.resultExplanation && !active ? <span>{record.resultExplanation}</span> : null}
      </div>
      {active && typeof teamsVoted === "number" && record.waitingOn.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-ui text-xs font-bold text-[var(--lcc-interactive)]">Still to {ballot === "FILL_IN" ? "answer" : "vote"} ({record.waitingOn.length})</summary>
          <p className="mt-1 font-ui text-xs text-[var(--lcc-color-text-muted)]">{record.waitingOn.join(" · ")}</p>
        </details>
      ) : null}
      {record.rulebookChanged ?? (record.status === "passed" && record.changeType !== "OTHER") ? (
        <div className="mt-3 flex flex-wrap gap-4 font-ui text-xs font-black uppercase tracking-[0.08em]">
          <span className="text-[var(--lcc-semantic-positive)]">Constitution updated</span>
          {record.currentRuleHref ? <Link href={record.currentRuleHref} className="text-[var(--lcc-interactive)] underline">View current rule</Link> : null}
          <Link href={amendmentHistoryHref} className="text-[var(--lcc-interactive)] underline">Amendment history</Link>
        </div>
      ) : null}
      {active && canVote ? <BallotVote proposalId={record.id} ballotType={ballot} options={record.options} currentChoice={record.viewerChoice ?? record.viewerVote} currentAnswer={record.viewerAnswer ?? null} apiBase={apiBase} /> : null}
    </article>
  );
}

const CHANGE_WORD = { CHANGE: "Change", ADD: "Add under", DELETE: "Delete" } as const;

function ChangeBlock({ change }: { change: RuleChangeView }) {
  return (
    <div className="rounded-xl border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)] p-3">
      <p className="lcc2-label">
        {CHANGE_WORD[change.changeType]} {change.label}{change.changeType === "ADD" && change.newRuleTitle ? ` — new rule: ${change.newRuleTitle}` : ""}
        {change.href ? <> · <Link href={change.href} className="text-[var(--lcc-interactive)] underline">current rule</Link></> : null}
      </p>
      {change.proposedText?.length ? <div className="mt-1 font-ui text-sm leading-6"><RichLines lines={change.proposedText} /></div> : null}
      {change.changeType === "DELETE" ? <p className="mt-1 font-ui text-sm font-bold text-[var(--lcc-semantic-negative)]">Rule {change.ruleId} is deleted.</p> : null}
    </div>
  );
}

/** Multiple choice: each option with its running (or final) count and what it changes. */
function OptionList({ record }: { record: NormalizedLegislativeRecord }) {
  const options = record.options ?? [];
  const total = options.reduce((n, o) => n + o.votes, 0);
  return (
    <ol className="mt-4 grid gap-2">
      {options.map((option) => (
        <li key={option.id} className={`rounded-xl border p-3 ${option.won ? "border-[var(--lcc-semantic-positive)]" : "border-[var(--lcc-color-border)]"} bg-[var(--lcc-color-surface-raised)]`}>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-ui text-sm font-bold"><span className="mr-2 font-black text-[var(--lcc-brand-primary)]">{option.id}</span>{option.label}{record.viewerChoice === option.id ? <span className="ml-2 text-xs font-black uppercase text-[var(--lcc-brand-primary)]">Your pick</span> : null}{option.won ? <span className="ml-2 text-xs font-black uppercase text-[var(--lcc-semantic-positive)]">Won</span> : null}</p>
            <span className="shrink-0 font-ui text-sm font-black">{option.votes}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--lcc-color-border)]" aria-hidden="true"><div className="h-full rounded-full bg-[var(--lcc-brand-primary)]" style={{ width: `${total ? Math.round((option.votes / total) * 100) : 0}%` }} /></div>
          {option.changes.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-ui text-xs font-bold text-[var(--lcc-interactive)]">{option.won ? "Rule changes made" : "What changes if it wins"} ({option.changes.length})</summary>
              <div className="mt-2 grid gap-2">{option.changes.map((change, index) => <ChangeBlock key={index} change={change} />)}</div>
            </details>
          ) : <p className="mt-2 font-ui text-xs text-[var(--lcc-color-text-muted)]">No rule changes.</p>}
        </li>
      ))}
    </ol>
  );
}

/** Fill in: answers with team names once voting closes; just the count while it's open. */
function Answers({ record, eligible }: { record: NormalizedLegislativeRecord; eligible: number }) {
  if (!record.answers) {
    return <p className="mt-4 rounded-xl border border-dashed border-[var(--lcc-color-border)] p-3 font-ui text-sm text-[var(--lcc-color-text-muted)]">{record.votedCount} of {eligible} teams have answered so far. Answers are shown with team names when voting closes.{record.viewerAnswer ? <span className="mt-2 block text-[var(--lcc-color-text)]">Your team&apos;s answer: “{record.viewerAnswer}”</span> : null}</p>;
  }
  return (
    <div className="mt-4">
      <p className="lcc2-label">Answers ({record.answers.length})</p>
      {record.answers.length ? (
        <ul className="mt-2 grid gap-2">
          {record.answers.map((a, index) => <li key={index} className="rounded-xl border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)] p-3 font-ui text-sm"><span className="block text-xs font-black uppercase tracking-[0.06em] text-[var(--lcc-color-text-muted)]">{a.team}</span><span className="mt-1 block whitespace-pre-wrap">{a.answer}</span></li>)}
        </ul>
      ) : <p className="lcc2-body mt-2">No team answered.</p>}
    </div>
  );
}

function Section({ id, eyebrow, title, empty, children }: { id: string; eyebrow: string; title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="mt-10" aria-labelledby={`${id}-title`}>
      <p className="lcc2-label text-[var(--lcc-brand-primary)]">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mt-1 font-ui text-2xl font-black">{title}</h2>
      {children.length ? <div className="mt-4 grid gap-4 lg:grid-cols-2">{children}</div> : <Notice title="" text={empty} />}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="lcc2-card p-3"><dt className="lcc2-label">{label}</dt><dd className="mt-1 font-ui text-sm font-black">{value}</dd></div>;
}

function Notice({ title, text }: { title: string; text: string }) {
  return <div className="lcc2-card mt-4 border-dashed p-5">{title ? <h3 className="font-ui text-lg font-black">{title}</h3> : null}<p className="lcc2-body">{text}</p></div>;
}

