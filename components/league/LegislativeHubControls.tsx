"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; closed?: unknown }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; closed?: unknown };
    return { ok: response.ok && data.ok !== false, error: data.error, closed: data.closed };
  } catch {
    return { ok: false, error: "Couldn't reach the site. Check your connection and try again." };
  }
}

/** Yes/No buttons. A team can change its vote while voting is open. */
export function VoteButtons({ proposalId, current }: { proposalId: string; current: "yes" | "no" | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vote = async (choice: "yes" | "no") => {
    setBusy(true); setError(null);
    const result = await post("/api/league-info/legislative/hub/vote", { proposalId, vote: choice });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Your vote didn't save.");
    router.refresh();
  };
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} aria-pressed={current === "yes"} onClick={() => vote("yes")} className="lcc2-button lcc2-button--primary">{current === "yes" ? "✓ Voted Yes" : current ? "Change to Yes" : "Vote Yes"}</button>
        <button type="button" disabled={busy} aria-pressed={current === "no"} onClick={() => vote("no")} className="lcc2-button lcc2-button--secondary">{current === "no" ? "✓ Voted No" : current ? "Change to No" : "Vote No"}</button>
      </div>
      {error ? <p role="alert" className="mt-2 font-ui text-sm font-bold text-[var(--lcc-semantic-negative)]">{error}</p> : null}
    </div>
  );
}

/** Commissioner: set the meeting (voting opens then and runs a week) or close voting early. */
export function CommissionerTools({ sessionYear, meetingDate, isVotingOpen, openCount, windowDays, apiBase = "/api/league-info/legislative/hub" }: { sessionYear: number; meetingDate: string | null; isVotingOpen: boolean; openCount: number; windowDays: number; apiBase?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const local = meetingDate ? new Date(new Date(meetingDate).getTime() - new Date(meetingDate).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
  return (
    <section className="lcc2-card mt-8 border-dashed p-5" aria-labelledby="commissioner-tools-title">
      <p className="lcc2-label text-[var(--lcc-brand-primary)]">Commissioner</p>
      <h2 id="commissioner-tools-title" className="mt-1 font-ui text-xl font-black">Meeting & voting</h2>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const when = String(data.get("meetingDate") ?? "");
          if (!when) return;
          setBusy(true);
          const result = await post(`${apiBase}/commissioner`, { action: "scheduleMeeting", sessionYear: Number(data.get("sessionYear")), meetingDate: new Date(when).toISOString() });
          setBusy(false);
          setMessage(result.ok ? { ok: true, text: `Saved. Voting opens at the meeting and closes ${windowDays} days later (or when every team has voted).` } : { ok: false, text: result.error ?? "Didn't save." });
          router.refresh();
        }}
      >
        <label className="grid gap-1 font-ui text-xs font-bold uppercase">Rules for season<input key={sessionYear} name="sessionYear" type="number" autoComplete="off" defaultValue={sessionYear} min={2024} max={2100} className="w-24 rounded-lg border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface)] p-2 text-sm" /></label>
        <label className="grid gap-1 font-ui text-xs font-bold uppercase">Meeting starts (your time)<input name="meetingDate" type="datetime-local" defaultValue={local} required className="rounded-lg border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface)] p-2 text-sm" /></label>
        <button type="submit" disabled={busy} className="lcc2-button lcc2-button--primary">Save meeting</button>
      </form>
      {openCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            className="lcc2-button lcc2-button--secondary"
            onClick={async () => {
              if (!isVotingOpen && !window.confirm("Voting isn't open yet. Close all open proposals now anyway?")) return;
              setBusy(true);
              const result = await post(`${apiBase}/commissioner`, { action: "closeVoting" });
              setBusy(false);
              setMessage(result.ok ? { ok: true, text: "Voting closed. Results and Constitution updates are posted." } : { ok: false, text: result.error ?? "Didn't close." });
              router.refresh();
            }}
          >
            Close voting now ({openCount} open)
          </button>
          <p className="font-ui text-xs text-[var(--lcc-color-text-muted)]">Normally not needed: voting closes on its own after {windowDays} days or once every team has voted.</p>
        </div>
      ) : null}
      {message ? <p role="status" className={`mt-3 font-ui text-sm font-bold ${message.ok ? "text-[var(--lcc-semantic-positive)]" : "text-[var(--lcc-semantic-negative)]"}`}>{message.text}</p> : null}
    </section>
  );
}
