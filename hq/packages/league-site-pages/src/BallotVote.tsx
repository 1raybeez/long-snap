"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BallotType = "YES_NO" | "TRUE_FALSE" | "MULTIPLE_CHOICE" | "FILL_IN";

async function send(apiBase: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${apiBase}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ok: response.ok && data.ok !== false, error: data.error };
  } catch {
    return { ok: false, error: "Couldn't reach the site. Check your connection and try again." };
  }
}

export function BallotVote({ proposalId, ballotType, options, currentChoice, currentAnswer, apiBase = "/api/league-info/legislative/hub" }: { proposalId: string; ballotType: BallotType; options?: readonly { readonly id: string; readonly label: string }[] | null; currentChoice: string | null; currentAnswer: string | null; apiBase?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState(currentAnswer ?? "");
  const submit = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    const result = await send(apiBase, { proposalId, ...body });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Your vote didn't save.");
    router.refresh();
  };
  const errorLine = error ? <p role="alert" className="mt-2 font-ui text-sm font-bold text-[var(--lcc-semantic-negative)]">{error}</p> : null;

  if (ballotType === "FILL_IN") {
    return (
      <form className="mt-4" onSubmit={(event) => { event.preventDefault(); if (answer.trim()) void submit({ answer }); }}>
        <label className="font-ui text-xs font-black uppercase tracking-[0.08em]">
          {currentAnswer ? "Your team's answer (you can change it until voting closes)" : "Your team's answer"}
          <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={280} rows={3} required className="mt-2 w-full rounded-lg border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface)] p-3 font-ui text-base font-normal normal-case tracking-normal text-[var(--lcc-color-text)] sm:text-sm" />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !answer.trim() || answer.trim() === currentAnswer} className="lcc2-button lcc2-button--primary">{currentAnswer ? "Update answer" : "Send answer"}</button>
          <span className="font-ui text-xs text-[var(--lcc-color-text-muted)]">{answer.length}/280</span>
        </div>
        {errorLine}
      </form>
    );
  }

  if (ballotType === "MULTIPLE_CHOICE") {
    return (
      <div className="mt-4">
        <div className="grid gap-2" role="group" aria-label="Pick one option">
          {(options ?? []).map((option) => {
            const mine = currentChoice === option.id;
            return (
              <button key={option.id} type="button" disabled={busy} aria-pressed={mine} onClick={() => submit({ vote: option.id })} className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left font-ui text-sm font-bold ${mine ? "border-[var(--lcc-brand-primary)] bg-[var(--lcc-brand-primary)] text-white" : "border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface)] text-[var(--lcc-color-text)]"}`}>
                <span className="shrink-0 font-black">{mine ? "✓" : option.id}</span>
                <span className="min-w-0">{mine ? `Voted ${option.id}: ` : currentChoice ? `Change to ${option.id}: ` : `Vote ${option.id}: `}{option.label}</span>
              </button>
            );
          })}
        </div>
        {errorLine}
      </div>
    );
  }

  // Yes / No and True / False (True is stored as yes).
  const [yes, no] = ballotType === "TRUE_FALSE" ? ["True", "False"] : ["Yes", "No"];
  const value = (side: "yes" | "no") => (ballotType === "TRUE_FALSE" ? (side === "yes" ? "true" : "false") : side);
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} aria-pressed={currentChoice === "yes"} onClick={() => submit({ vote: value("yes") })} className="lcc2-button lcc2-button--primary">{currentChoice === "yes" ? `✓ Voted ${yes}` : currentChoice ? `Change to ${yes}` : `Vote ${yes}`}</button>
        <button type="button" disabled={busy} aria-pressed={currentChoice === "no"} onClick={() => submit({ vote: value("no") })} className="lcc2-button lcc2-button--secondary">{currentChoice === "no" ? `✓ Voted ${no}` : currentChoice ? `Change to ${no}` : `Vote ${no}`}</button>
      </div>
      {errorLine}
    </div>
  );
}
