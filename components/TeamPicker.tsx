"use client";

import { useState } from "react";

type Team = { rosterId: string; name: string; owner: string | null };

export function TeamPicker({ apiPath, teams, current, leagueName, colors }: { apiPath: string; teams: Team[]; current: string | null; leagueName: string; colors: { card: string; cardBorder: string; text: string; muted: string; action: string; actionText: string } }) {
  const mine = teams.find((t) => t.rosterId === current) ?? null;
  const [open, setOpen] = useState(!mine);
  const [choice, setChoice] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(apiPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterId: choice }) });
      const out = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !out.ok) throw new Error(out.error ?? "Couldn't save your team.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your team.");
      setBusy(false);
    }
  }

  const box = { background: colors.card, border: `1px solid ${colors.cardBorder}`, color: colors.text, borderRadius: 12, padding: "12px 14px", margin: "0 0 16px", fontSize: 15 } as const;
  if (!open && mine) {
    return (
      <div style={box}>
        Your team: <strong>{mine.name}</strong>{mine.owner ? <span style={{ color: colors.muted }}> ({mine.owner})</span> : null}{" "}
        <button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: "none", color: colors.action, textDecoration: "underline", cursor: "pointer", fontSize: 14, padding: 0, marginLeft: 6 }}>Not your team? Change</button>
      </div>
    );
  }
  return (
    <div style={box}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{mine ? "Change your team" : `Which ${leagueName} team is yours?`}</div>
      <div style={{ color: colors.muted, fontSize: 13, marginBottom: 10 }}>Pick it once and the GM tools open on your team every time you sign in.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Your team" style={{ flex: "1 1 220px", minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1px solid ${colors.cardBorder}`, fontSize: 15 }}>
          <option value="">Choose your team…</option>
          {teams.map((t) => <option key={t.rosterId} value={t.rosterId}>{t.name}{t.owner && t.owner !== t.name ? ` (${t.owner})` : ""}</option>)}
        </select>
        <button type="button" onClick={save} disabled={!choice || busy} style={{ background: colors.action, color: colors.actionText, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: !choice || busy ? 0.6 : 1 }}>{busy ? "Saving…" : "This is my team"}</button>
        {mine ? <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", fontSize: 14 }}>Cancel</button> : null}
      </div>
      {error ? <div role="alert" style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}
