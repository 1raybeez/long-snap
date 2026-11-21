"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RuleOption } from "@/lib/hq-governance";

type BallotType = "YES_NO" | "TRUE_FALSE" | "MULTIPLE_CHOICE" | "FILL_IN";
type ChangeKind = "CHANGE" | "ADD" | "DELETE";
interface ChangeDraft { key: number; changeType: ChangeKind; targetRuleId: string; proposedText: string; newRuleTitle: string }
interface OptionDraft { key: number; label: string; changesRules: boolean; changes: ChangeDraft[] }

const BALLOTS: { value: BallotType; label: string; help: string }[] = [
  { value: "YES_NO", label: "Yes / No", help: "The usual vote. If Yes wins, any rule changes you add are made." },
  { value: "TRUE_FALSE", label: "True / False", help: "Counted the same as Yes / No (True counts as yes)." },
  { value: "MULTIPLE_CHOICE", label: "Multiple choice", help: "2 to 6 options (A, B, C…). Each team picks one; each option can change its own rules." },
  { value: "FILL_IN", label: "Fill in your answer", help: "Each team types a short answer. Shown with team names when voting closes. Doesn't change rules." },
];
const KINDS: { value: ChangeKind; label: string }[] = [
  { value: "CHANGE", label: "Change a rule" },
  { value: "ADD", label: "Add a new rule" },
  { value: "DELETE", label: "Delete a rule" },
];
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const MAX_CHANGES = 10;

let nextKey = 1;
const newChange = (): ChangeDraft => ({ key: nextKey++, changeType: "CHANGE", targetRuleId: "", proposedText: "", newRuleTitle: "" });
const newOption = (label = ""): OptionDraft => ({ key: nextKey++, label, changesRules: false, changes: [newChange()] });
const emptyForm = () => ({ ballotType: "YES_NO" as BallotType, title: "", description: "", targetRuleId: "", yesChangesRules: true, yesChanges: [newChange()], options: [newOption(), newOption()] });

const input = "mt-2 w-full rounded-lg border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface)] p-3 font-ui text-base font-normal normal-case tracking-normal text-[var(--lcc-color-text)] sm:text-sm";
const label = "font-ui text-xs font-black uppercase tracking-[0.08em] text-[var(--lcc-color-text)]";
const hint = "mt-1 block font-normal normal-case tracking-normal text-[var(--lcc-color-text-muted)]";
const smallButton = "inline-flex min-h-11 items-center rounded-lg border border-[var(--lcc-color-border)] bg-transparent px-3 font-ui text-xs font-black uppercase tracking-[0.06em] text-[var(--lcc-interactive)]";

const payloadChanges = (changes: ChangeDraft[]) => changes.map(({ changeType, targetRuleId, proposedText, newRuleTitle }) => ({ changeType, targetRuleId, proposedText, newRuleTitle }));

export function ProposalForm({ rules, apiBase = "/api/league-info/legislative/hub", afterSubmitHref }: { rules: readonly RuleOption[]; apiBase?: string; afterSubmitHref?: string }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const yesNo = form.ballotType === "YES_NO" || form.ballotType === "TRUE_FALSE";
  const yesWord = form.ballotType === "TRUE_FALSE" ? "True" : "Yes";
  // League business (nothing in the rule book changes) can still point at a related rule.
  const showRelated = form.ballotType === "FILL_IN" || (yesNo && !form.yesChangesRules) || (form.ballotType === "MULTIPLE_CHOICE" && !form.options.some((o) => o.changesRules));
  const setOption = (key: number, update: Partial<OptionDraft>) => setForm({ ...form, options: form.options.map((o) => (o.key === key ? { ...o, ...update } : o)) });

  return (
    <form
      className="lcc2-card mt-6 grid gap-6 p-4 sm:p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true); setStatus(null);
        const body = {
          ballotType: form.ballotType, title: form.title, description: form.description,
          targetRuleId: showRelated ? form.targetRuleId : "",
          ...(yesNo ? { yesChanges: form.yesChangesRules ? payloadChanges(form.yesChanges) : [] } : {}),
          ...(form.ballotType === "MULTIPLE_CHOICE" ? { options: form.options.map((o) => ({ label: o.label, changes: o.changesRules ? payloadChanges(o.changes) : [] })) } : {}),
        };
        try {
          const response = await fetch(apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
          const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!response.ok || !data.ok) throw new Error(data.error ?? "We couldn't submit your proposal. Your draft is still here.");
          setForm(emptyForm());
          setStatus({ ok: true, text: "Submitted. It's on the docket for the owners meeting." });
          if (afterSubmitHref) router.push(afterSubmitHref); else router.refresh();
        } catch (error) {
          setStatus({ ok: false, text: error instanceof Error ? error.message : "We couldn't submit your proposal. Your draft is still here." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className={label}>Short title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required maxLength={180} className={input} /></label>

      <fieldset>
        <legend className={label}>How should the league answer?</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {BALLOTS.map((ballot) => (
            <label key={ballot.value} className={`flex cursor-pointer gap-2 rounded-xl border p-3 ${form.ballotType === ballot.value ? "border-[var(--lcc-brand-primary)] bg-[var(--lcc-color-surface-raised)]" : "border-[var(--lcc-color-border)]"}`}>
              <input type="radio" name="ballotType" checked={form.ballotType === ballot.value} onChange={() => setForm({ ...form, ballotType: ballot.value })} className="mt-1 h-4 w-4 shrink-0" />
              <span className="min-w-0"><span className="block font-ui text-sm font-black">{ballot.label}</span><span className="mt-1 hidden font-ui text-xs text-[var(--lcc-color-text-muted)] sm:block">{ballot.help}</span></span>
            </label>
          ))}
        </div>
        <p className="mt-2 font-ui text-xs text-[var(--lcc-color-text-muted)] sm:hidden">{BALLOTS.find((b) => b.value === form.ballotType)?.help}</p>
      </fieldset>

      {yesNo ? (
        <section className="grid gap-3">
          <RulebookToggle checked={form.yesChangesRules} onChange={(on) => setForm({ ...form, yesChangesRules: on })} text={`If ${yesWord} wins, this changes the rule book`} />
          {form.yesChangesRules ? <ChangeList rules={rules} changes={form.yesChanges} onChange={(yesChanges) => setForm({ ...form, yesChanges })} /> : null}
        </section>
      ) : null}

      {form.ballotType === "MULTIPLE_CHOICE" ? (
        <section className="grid gap-3" aria-label="Options">
          <p className={label}>Options<span className={hint}>Each team picks one. The option with the most votes wins; a tie for most means nothing changes.</span></p>
          {form.options.map((option, index) => (
            <div key={option.key} className="grid gap-3 rounded-xl border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)] p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <span className="mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lcc-brand-primary)] font-ui text-sm font-black text-white" aria-hidden="true">{LETTERS[index]}</span>
                <label className="min-w-0 flex-1 font-ui text-xs font-black uppercase tracking-[0.08em]">
                  <span className="sr-only">Option {LETTERS[index]}</span>
                  <input value={option.label} onChange={(event) => setOption(option.key, { label: event.target.value })} required maxLength={120} placeholder={index === form.options.length - 1 && index >= 2 ? "e.g. Keep the current rules" : `What option ${LETTERS[index]} means`} className={`${input} mt-0`} />
                </label>
              </div>
              <RulebookToggle checked={option.changesRules} onChange={(on) => setOption(option.key, { changesRules: on })} text={`If option ${LETTERS[index]} wins, this changes the rule book`} />
              {option.changesRules ? <ChangeList rules={rules} changes={option.changes} onChange={(changes) => setOption(option.key, { changes })} /> : null}
              {form.options.length > 2 ? <button type="button" onClick={() => setForm({ ...form, options: form.options.filter((o) => o.key !== option.key) })} className={`${smallButton} justify-self-start text-[var(--lcc-semantic-negative)]`}>Remove option {LETTERS[index]}</button> : null}
            </div>
          ))}
          {form.options.length < LETTERS.length ? <button type="button" onClick={() => setForm({ ...form, options: [...form.options, newOption()] })} className={`${smallButton} justify-self-start`}>+ Add option {LETTERS[form.options.length]}</button> : null}
        </section>
      ) : null}

      {form.ballotType === "FILL_IN" ? (
        <p className="rounded-xl border border-dashed border-[var(--lcc-color-border)] p-3 font-ui text-sm text-[var(--lcc-color-text-muted)]">Each team types an answer of up to 280 characters. While voting is open the hub shows how many teams have answered; when it closes, every answer is listed with the team&apos;s name. A fill-in question never changes the rule book.</p>
      ) : null}

      {showRelated ? <RulePicker rules={rules} kind="RELATED" value={form.targetRuleId} onChange={(targetRuleId) => setForm({ ...form, targetRuleId })} /> : null}

      <label className={label}>
        {form.ballotType === "FILL_IN" ? "Your question, with any details" : "Why? (your case to the league)"}
        <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required rows={5} maxLength={5000} className={input} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="lcc2-button lcc2-button--primary">{busy ? "Submitting…" : "Submit proposal"}</button>
        {status ? <p role="status" className={`font-ui text-sm font-bold ${status.ok ? "text-[var(--lcc-semantic-positive)]" : "text-[var(--lcc-semantic-negative)]"}`}>{status.text}</p> : null}
      </div>
    </form>
  );
}

function RulebookToggle({ checked, onChange, text }: { checked: boolean; onChange: (on: boolean) => void; text: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 font-ui text-sm font-black">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0" />
      {text}
    </label>
  );
}

/** One or more rule changes, applied in this order if the answer they belong to wins. */
function ChangeList({ rules, changes, onChange }: { rules: readonly RuleOption[]; changes: ChangeDraft[]; onChange: (changes: ChangeDraft[]) => void }) {
  const update = (key: number, next: Partial<ChangeDraft>) => onChange(changes.map((c) => (c.key === key ? { ...c, ...next } : c)));
  return (
    <div className="grid gap-3">
      {changes.map((change, index) => (
        <div key={change.key} className="grid gap-3 rounded-xl border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="lcc2-label">Rule change {changes.length > 1 ? index + 1 : ""}</p>
            {changes.length > 1 ? <button type="button" onClick={() => onChange(changes.filter((c) => c.key !== change.key))} className="min-h-11 bg-transparent px-2 font-ui text-xs font-black uppercase text-[var(--lcc-semantic-negative)]">Remove</button> : null}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--lcc-color-border)] p-1" role="radiogroup" aria-label="What this change does">
            {KINDS.map((kind) => (
              <button key={kind.value} type="button" role="radio" aria-checked={change.changeType === kind.value} onClick={() => update(change.key, { changeType: kind.value, targetRuleId: "", proposedText: "" })} className={`min-h-11 rounded-md px-1 font-ui text-xs font-black leading-tight ${change.changeType === kind.value ? "bg-[var(--lcc-brand-primary)] text-white" : "bg-transparent text-[var(--lcc-color-text-muted)]"}`}>{kind.label}</button>
            ))}
          </div>
          <RulePicker rules={rules} kind={change.changeType} value={change.targetRuleId} onChange={(targetRuleId) => {
            const rule = rules.find((candidate) => candidate.id === targetRuleId);
            update(change.key, { targetRuleId, proposedText: change.changeType === "CHANGE" && rule && !change.proposedText ? rule.content.join("\n\n") : change.proposedText });
          }} />
          {change.changeType === "ADD" ? <label className={label}>New rule name<input value={change.newRuleTitle} onChange={(event) => update(change.key, { newRuleTitle: event.target.value })} maxLength={120} placeholder="e.g. Trade Review" className={input} /></label> : null}
          {change.changeType !== "DELETE" ? (
            <label className={label}>
              {change.changeType === "ADD" ? "Wording of the new rule" : "New wording of the rule"}
              <span className={hint}>This exact text goes into the Constitution. Separate paragraphs with a blank line. **Bold** works.</span>
              <textarea value={change.proposedText} onChange={(event) => update(change.key, { proposedText: event.target.value })} required rows={5} maxLength={5000} className={input} />
            </label>
          ) : null}
        </div>
      ))}
      {changes.length < MAX_CHANGES ? <button type="button" onClick={() => onChange([...changes, newChange()])} className={`${smallButton} justify-self-start`}>+ Add another rule</button> : null}
    </div>
  );
}

/** Pick a rule (change/delete), a section (add), or an optional related rule (league business). Shows the current wording. */
function RulePicker({ rules, kind, value, onChange }: { rules: readonly RuleOption[]; kind: ChangeKind | "RELATED"; value: string; onChange: (id: string) => void }) {
  const choices = rules.filter((rule) => (kind === "ADD" ? rule.isSection : kind === "RELATED" ? true : !rule.isSection));
  const target = rules.find((rule) => rule.id === value) ?? null;
  return (
    <>
      <label className={label}>
        {kind === "ADD" ? "Section the new rule goes in" : kind === "RELATED" ? "Related rule (optional)" : "Rule"}
        <select value={value} required={kind !== "RELATED"} onChange={(event) => onChange(event.target.value)} className={input}>
          <option value="">{kind === "RELATED" ? "None" : "Pick one…"}</option>
          {choices.map((rule) => <option key={rule.id} value={rule.id}>{rule.isSection ? rule.title : ` ${rule.title}`}</option>)}
        </select>
      </label>
      {target && !target.isSection && kind !== "RELATED" ? (
        <div className="rounded-xl border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)] p-3">
          <p className="lcc2-label">Current wording</p>
          {target.content.map((line, index) => <p key={index} className="mt-1 font-ui text-sm">{line}</p>)}
        </div>
      ) : null}
    </>
  );
}
