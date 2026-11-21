"use client";
/** Ask the Constitution box (HQ kit, 2026-10-30): members type a rules question, get a short answer with rule numbers. */
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";

interface Answer { ok: boolean; answer?: string; cites?: { id: string; title: string }[]; error?: string; paused?: boolean; limited?: boolean }

const EXAMPLES = ["Can I trade a player I just picked up on waivers?", "What happens if two teams tie for the last playoff spot?", "When are dues due?"];

export function AskConstitutionBox({ apiPath, theme, signInHref, leagueName }: { readonly apiPath: string; readonly theme: LeagueTileTheme; readonly signInHref: string; readonly leagueName: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Answer | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { fetch(apiPath).then((r) => r.json()).then((j: { enabled?: boolean }) => setEnabled(Boolean(j.enabled))).catch(() => setEnabled(false)); }, [apiPath]);
  const ask = async (e?: FormEvent, text?: string) => {
    e?.preventDefault();
    const question = (text ?? q).trim();
    if (!question || busy) return;
    if (text) setQ(text);
    setBusy(true); setRes(null);
    try {
      const r = await fetch(apiPath, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      if (r.status === 401) { setNeedsSignIn(true); return; }
      setRes((await r.json()) as Answer);
    } catch { setRes({ ok: false, error: "Couldn't reach the site. Try again in a moment." }); }
    finally { setBusy(false); }
  };
  const parts = (res?.answer ?? "").split(/(\[[A-Za-z0-9._-]+\])/g);
  if (!enabled) return null; // hidden until the site has its AI key
  return (
    <section className="league-tiles ac" style={themeCssVariables(theme) as CSSProperties} aria-labelledby="ac-h">
      <div className="ac-card">
        <p className="ac-kicker">New · members only</p>
        <h2 id="ac-h" className="ac-title">Ask the Constitution</h2>
        <p className="ac-sub">Ask a rules question in plain English. The answer comes only from the {leagueName} constitution, with the rule numbers so you can check it.</p>
        <form className="ac-form" onSubmit={(e) => ask(e)}>
          <label htmlFor="ac-q" className="ac-sr">Your rules question</label>
          <input id="ac-q" className="ac-input" value={q} maxLength={400} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Can I keep a player I traded for?" />
          <button type="submit" className="ac-btn" disabled={busy || q.trim().length < 4}>{busy ? "Checking…" : "Ask"}</button>
        </form>
        {!res && !busy && !needsSignIn ? <div className="ac-examples">{EXAMPLES.map((x) => <button key={x} type="button" className="ac-chip" onClick={() => ask(undefined, x)}>{x}</button>)}</div> : null}
        {needsSignIn ? <p className="ac-note">Sign in as a league member to ask. <a href={signInHref}>Sign in</a></p> : null}
        {res?.ok ? (
          <div className="ac-answer" aria-live="polite">
            <p>{parts.map((p, i) => (/^\[[A-Za-z0-9._-]+\]$/.test(p) ? <b key={i} className="ac-rule">{p.slice(1, -1)}</b> : <span key={i}>{p}</span>))}</p>
            {res.cites?.length ? <ul className="ac-cites">{res.cites.map((c) => <li key={c.id}><b>{c.id}</b> {c.title.startsWith(c.id) ? c.title.slice(c.id.length).trim() : c.title}</li>)}</ul> : null}
            <p className="ac-fine">AI answer from the constitution text. If it matters, read the rule itself; the commissioner has the final word.</p>
          </div>
        ) : res ? <p className="ac-note" aria-live="polite">{res.error}</p> : null}
      </div>
    </section>
  );
}
