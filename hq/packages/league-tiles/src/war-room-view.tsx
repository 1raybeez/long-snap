"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Need = "must" | "need" | "depth" | "surplus";
interface Player { id: string; name: string; pos: string; team: string | null; sheet: number }
interface Model {
  season: number; mode: "live" | "replay" | "waiting"; draftStatus: string | null; updatedAt: string;
  settings: { budget: number; rosterSize: number; starters: string[] };
  replay: { at: number; total: number } | null;
  room: { inflationPct: number; moneyLeft: number; talentLeft: number; tonight: Record<string, number | null>; history: { byPos: Record<string, { pct: number; n: number }>; byThird: { pct: number; n: number }[]; seasons: number[] } };
  teams: { id: string; name: string; left: number; open: number; legalMax: number; filled: number; needs: Record<string, Need>; buys: { name: string; pos: string; price: number; keeper: boolean }[] }[];
  recent: { name: string; pos: string; price: number; team: string; sheet: number | null }[];
  me: { id: string; name: string; left: number; open: number; legalMax: number; needs: Record<string, Need> } | null;
  block: { player: Player; currentBid: number | null; nominatedBy: string | null; result: { teamName: string; price: number } | null; max: { max: number; steps: { label: string; dollars: number }[] } | null; hints: string[] } | null;
  best: (Player & { max: number; need: Need })[];
  taste: { room: string[]; mine: string[]; locked: string; level?: "full" | "room" | "off" };

  edge: { label?: string; commish?: boolean; scouts: { owner: string; team: string; left: number; legalMax: number; traits: string[]; plays: string[]; earlyShare: number; biggest: { name: string; price: number; season: number } | null; longView?: string | null }[]; canPay: { name: string; legalMax: number; need: Need }[] } | null;
  sheetSeason: number;
  /** Your private rival goals applied to tonight (never another owner's). */
  rival?: { cues: { goalId: string; kind: "pay" | "block" | "drain"; line: string }[]; drain: { player: Player; rival: string; why: string }[] } | null;
}
interface Goal { id: string; rival: string; kind: "pay" | "block" | "drain"; positions: string[]; nflTeams: string[]; players: string[]; minSheet: number; note: string }
interface Plan { targets: Record<string, number>; fades: string[]; strategy: string; kTier: string; defTier: string; kdefCap?: number; rivals?: Goal[]; updatedAt?: string | null; updatedBy?: string | null }
interface Keeper { id: string; name: string; pos: string; cost: number | null; estPrice: number | null; eligible: boolean | null; surplus: number | null; call: string; pick: boolean }
interface Check { title: string; call: string; text: string }
interface Prep {
  plan: Plan; players: Player[]; checks: Check[]; coach: { checks: Check[]; summary: string; at: string } | null; teamName: string | null;

  carried?: { season: number; suggestedTargets: Record<string, number>; suggestedFades: string[] } | null;
  /** Rival choices (every other team) for the goal editor. */
  teams?: { id: string; name: string }[];
  /** Keep or cut, for your team only. */
  keepers?: { rule: string; rows: Keeper[]; note: string } | null;
}

const POS_COLOR: Record<string, string> = { QB: "#FF2A6D", RB: "#00CEB8", WR: "#58A7FF", TE: "#FFAE58", K: "#BD66FF", DEF: "#7988A1" };
const NEED_LABEL: Record<Need, string> = { must: "Must fill", need: "Need", depth: "Depth", surplus: "Set" };
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}%`;
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const Pos = ({ pos }: { pos: string }) => <span className="wr2-pos" style={{ background: POS_COLOR[pos] ?? "#8E9AAF" }}>{pos}</span>;

export function WarRoom2({ apiPath, loginHref, leagueName, nominationApi }: { readonly apiPath: string; readonly loginHref: string; readonly leagueName: string; /** Commissioner nomination endpoint (POST set, PATCH bid, DELETE clear). */ readonly nominationApi?: string }) {
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [tab, setTab] = useState<"draft" | "prep" | "edge">("draft");
  const [at, setAt] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const [bid, setBid] = useState("");
  const [why, setWhy] = useState(false);

  const load = useCallback(async (pick: number | null) => {
    try {
      const r = await fetch(`${apiPath}${pick !== null ? `?at=${pick}` : ""}`, { cache: "no-store" });
      if (r.status === 401) { setSignedOut(true); return; }
      const j = (await r.json()) as Model & { error?: string };
      if (!r.ok) { setError(j.error ?? "The War Room is unavailable right now."); return; }
      setModel(j); setError(null);
    } catch { setError("Couldn't reach the site. Retrying…"); }
  }, [apiPath]);

  useEffect(() => { void load(at); }, [load, at]);
  // Live: everyone's board refreshes every 10 seconds (Sleeper picks are cached 10 s on the server).
  useEffect(() => {
    if (model?.mode !== "live") return;
    const t = window.setInterval(() => { void load(null); }, 10_000);
    return () => window.clearInterval(t);
  }, [model?.mode, load]);
  useEffect(() => { setReveal(false); setBid(""); setWhy(false); }, [model?.block?.player.id]);

  if (signedOut) return <div className="wr2"><div className="wr2-card wr2-center"><p className="wr2-kicker">War Room</p><h1 className="wr2-h1">Members only</h1><p className="wr2-muted">Sign in with your League Member Login to open your War Room.</p><a className="wr2-btn" href={loginHref}>Sign in</a></div></div>;
  if (!model) return <div className="wr2"><div className="wr2-card wr2-center"><p className="wr2-muted">{error ?? "Opening the War Room…"}</p></div></div>;

  const m = model;
  const replay = m.replay;
  const isCommish = Boolean(m.edge && m.edge.commish !== false);
  const verdict = (() => {
    const max = m.block?.max?.max; const b = Number(bid);
    if (!max) return null;
    if (!bid || !Number.isFinite(b)) return { word: "Bid", tone: "go", text: `up to $${max}` };
    return b < max ? { word: "Bid", tone: "go", text: `up to $${max}` } : b === max ? { word: "Last bid", tone: "warn", text: `$${max} is your max` } : { word: "Pass", tone: "stop", text: `over your $${max} max` };
  })();
  const myTeam = m.me ? m.teams.find((t) => t.id === m.me!.id) : null;
  const step = (d: number) => { if (!replay) return; setAt(Math.max(0, Math.min(replay.total, replay.at + d))); };

  return (
    <div className="wr2">
      <header className="wr2-top">
        <div>
          <p className="wr2-title">War Room <span className="wr2-beta">2.0 beta</span></p>
          <p className="wr2-sub">{leagueName} · {m.season} auction · {m.mode === "live" ? <b className="wr2-live">● Live</b> : m.mode === "replay" ? "Practice replay" : "Waiting for the draft"}</p>
        </div>
        <nav className="wr2-tabs" aria-label="War Room">
          {(["draft", "prep", ...(m.edge ? ["edge"] : [])] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t as typeof tab)}>{t === "draft" ? "Draft" : t === "prep" ? "Prep" : "Edge"}</button>
          ))}
        </nav>
      </header>

      {tab === "draft" ? (
        <>
          {replay ? (
            <section className="wr2-card wr2-replay" aria-label="Replay controls">
              <div className="wr2-row"><p className="wr2-kicker">Practice with the {m.season} auction</p><span className="wr2-muted">Sale {replay.at} of {replay.total}</span></div>
              <input type="range" min={0} max={replay.total} value={replay.at} onChange={(e) => setAt(Number(e.target.value))} aria-label="Auction progress" />
              <div className="wr2-row">
                <button type="button" className="wr2-ghost" onClick={() => step(-1)} disabled={replay.at === 0}>◀ Back</button>
                <button type="button" className="wr2-ghost" onClick={() => step(-10)} disabled={replay.at === 0}>−10</button>
                <button type="button" className="wr2-ghost" onClick={() => step(10)} disabled={replay.at >= replay.total}>+10</button>
                <button type="button" className="wr2-btn" onClick={() => step(1)} disabled={replay.at >= replay.total}>Next sale ▶</button>
              </div>
              <p className="wr2-muted wr2-small">The board, budgets and your max are rebuilt as of each sale. On draft night this page runs live from Sleeper.</p>
            </section>
          ) : null}

          {m.me ? (
            <section className="wr2-stats" aria-label="Your team">
              <div><span>Your money</span><b>${m.me.left}</b></div>
              <div><span>Spots left</span><b>{m.me.open}</b></div>
              <div><span>Can bid up to</span><b>${m.me.legalMax}</b></div>
            </section>
          ) : <p className="wr2-note">Your login isn&rsquo;t linked to a team, so you&rsquo;re seeing the room without a &ldquo;your max.&rdquo;</p>}

          <div className="wr2-grid">
            <div className="wr2-col">
              <section className="wr2-card wr2-block" aria-labelledby="wr2-block">
                <div className="wr2-row"><p id="wr2-block" className="wr2-kicker">On the block{m.mode === "live" ? " · live" : ""}</p>{m.block?.nominatedBy ? <span className="wr2-muted">Called by {m.block.nominatedBy}</span> : null}</div>
                {m.block ? (
                  <>
                    <div className="wr2-player">
                      <div className="wr2-avatar" aria-hidden="true">{initials(m.block.player.name)}</div>
                      <div><p className="wr2-name">{m.block.player.name}</p><p className="wr2-muted"><Pos pos={m.block.player.pos} /> {m.block.player.team ?? "FA"} · sheet ${Math.round(m.block.player.sheet)}</p></div>
                    </div>
                    {verdict ? (
                      <div className={`wr2-verdict is-${verdict.tone}`}>
                        <div className="wr2-row"><p className="wr2-word">{verdict.word}</p><p className="wr2-muted">{verdict.text.startsWith("up to") ? <>up to <b className="wr2-big">${m.block.max!.max}</b></> : verdict.text}</p></div>
                        <label className="wr2-bid">Bid in the room now <input inputMode="numeric" value={bid} onChange={(e) => setBid(e.target.value.replace(/[^0-9]/g, ""))} placeholder={m.block.currentBid ? String(m.block.currentBid) : "$"} /></label>
                        <button type="button" className="wr2-link" aria-expanded={why} onClick={() => setWhy(!why)}>{why ? "Hide the math" : "Why this number?"}</button>
                        {why ? <ul className="wr2-steps">{m.block.max!.steps.map((s, i) => <li key={i}><span>{s.label}</span><b>{i === 0 || i === m.block!.max!.steps.length - 1 ? `$${Math.round(s.dollars)}` : s.dollars === 0 ? "" : `${s.dollars > 0 ? "+" : "−"}$${Math.abs(s.dollars)}`}</b></li>)}</ul> : null}
                      </div>
                    ) : <p className="wr2-muted">Sign in as an owner to see your max.</p>}
                    {m.block.hints.length ? <ul className="wr2-hints">{m.block.hints.map((h) => <li key={h}>{h}</li>)}</ul> : null}
                    {m.rival?.cues.length ? <ul className="wr2-goalcues" aria-label="Your rival goals">{m.rival.cues.map((c) => <li key={c.goalId} className={`is-${c.kind}`}><b>{c.kind === "block" ? "🛡️" : c.kind === "pay" ? "💸" : "🪣"}</b> {c.line}</li>)}</ul> : null}
                    {m.block.result ? (reveal ? <p className="wr2-result">Sold to <b>{m.block.result.teamName}</b> for <b>${m.block.result.price}</b>{m.block.max ? ` · your max was $${m.block.max.max}` : ""}</p> : <button type="button" className="wr2-ghost" onClick={() => setReveal(true)}>Reveal what it went for</button>) : null}
                  </>
                ) : <p className="wr2-muted">{m.mode === "live" ? "Waiting for the next nomination." : m.mode === "replay" ? "That was the last sale." : "The auction hasn't started."}</p>}
              </section>

              {m.best.length ? (
                <section className="wr2-section" aria-labelledby="wr2-best">
                  <p id="wr2-best" className="wr2-kicker">Best left for you</p>
                  <ul className="wr2-list">{m.best.map((p) => <li key={p.id}><span><b>{p.name}</b> <Pos pos={p.pos} /> <small className="wr2-muted">{NEED_LABEL[p.need]} · sheet ${Math.round(p.sheet)}</small></span><span className="wr2-mono">max ${p.max}</span></li>)}</ul>
                </section>
              ) : null}

              {m.rival?.drain.length ? (
                <section className="wr2-section" aria-labelledby="wr2-drain">
                  <p id="wr2-drain" className="wr2-kicker">Nominate to drain · your goals</p>
                  <ul className="wr2-list">{m.rival.drain.map((d) => <li key={d.player.id}><span><b>{d.player.name}</b> <Pos pos={d.player.pos} /> <small className="wr2-muted">{d.why}</small></span><span className="wr2-mono">sheet ${Math.round(d.player.sheet)}</span></li>)}</ul>
                  <p className="wr2-muted wr2-small">Players your rivals want, so they spend before the ones you want come up. Only you see this.</p>
                </section>
              ) : null}

              {myTeam ? (
                <section className="wr2-section" aria-labelledby="wr2-roster">
                  <p id="wr2-roster" className="wr2-kicker">Your roster · {myTeam.filled} of {m.settings.rosterSize}</p>
                  <div className="wr2-chips">{(["QB", "RB", "WR", "TE", "K", "DEF"] as const).map((pos) => { const n = myTeam.buys.filter((b) => b.pos === pos).length; const need = m.me!.needs[pos]; return <span key={pos} className={`wr2-chip${need === "must" || need === "need" ? " is-need" : ""}`}>{pos} {"✓".repeat(Math.min(n, 4))}{need === "must" || need === "need" ? ` · ${NEED_LABEL[need].toLowerCase()}` : ""}</span>; })}</div>
                  {myTeam.buys.length ? <ul className="wr2-mini">{myTeam.buys.map((b, i) => <li key={i}><Pos pos={b.pos} /> {b.name} <span className="wr2-mono">${b.price}{b.keeper ? " K" : ""}</span></li>)}</ul> : null}
                </section>
              ) : null}
            </div>

            <div className="wr2-col">
              <section className="wr2-card" aria-labelledby="wr2-room">
                <p id="wr2-room" className="wr2-kicker">The room</p>
                <div className="wr2-stats wr2-stats--flat">
                  <div><span>Prices vs. sheet</span><b>{signed(m.room.inflationPct)}</b></div>
                  <div><span>Money left</span><b>${m.room.moneyLeft}</b></div>
                </div>
                <p className="wr2-muted wr2-small">Money left in the room vs. the sheet value of the players needed to fill every roster (keepers counted). Above 0 means prices should run high.</p>
                <div className="wr2-chips">{(["QB", "RB", "WR", "TE"] as const).map((pos) => <span key={pos} className="wr2-chip"><Pos pos={pos} /> {m.room.tonight[pos] !== null && m.room.tonight[pos] !== undefined ? `tonight ${signed(m.room.tonight[pos]!)}` : `usually ${signed(m.room.history.byPos[pos]?.pct ?? 0)}`}</span>)}</div>
              </section>

              <section className="wr2-card" aria-labelledby="wr2-intel">
                <p id="wr2-intel" className="wr2-kicker">Room intel</p>
                <ul className="wr2-hints">{m.taste.room.map((l) => <li key={l}>{l}</li>)}</ul>
                {m.taste.mine.length ? <><p className="wr2-kicker wr2-mt">Your habits</p><ul className="wr2-hints">{m.taste.mine.map((l) => <li key={l}>{l}</li>)}</ul></> : null}
                {!isCommish ? <div className="wr2-locked"><b>🔒 Locked</b><span>{m.taste.locked}</span></div> : null}
              </section>

              <section className="wr2-section" aria-labelledby="wr2-teams">
                <p id="wr2-teams" className="wr2-kicker">Every team</p>
                <div className="wr2-table" role="table" aria-label="Team budgets">
                  <div role="row" className="wr2-tr wr2-th"><span role="columnheader">Team</span><span role="columnheader">Left</span><span role="columnheader">Max bid</span><span role="columnheader">Spots</span></div>
                  {[...m.teams].sort((a, b) => b.legalMax - a.legalMax).map((t) => <div role="row" key={t.id} className={`wr2-tr${t.id === m.me?.id ? " is-me" : ""}`}><span role="cell">{t.name}</span><span role="cell" className="wr2-mono">${t.left}</span><span role="cell" className="wr2-mono">${t.legalMax}</span><span role="cell" className="wr2-mono">{t.open}</span></div>)}
                </div>
              </section>

              {m.recent.length ? (
                <section className="wr2-section" aria-labelledby="wr2-recent">
                  <p id="wr2-recent" className="wr2-kicker">Just sold</p>
                  <ul className="wr2-list">{m.recent.map((r, i) => <li key={i}><span><b>{r.name}</b> <Pos pos={r.pos} /> <small className="wr2-muted">{r.team}</small></span><span className="wr2-mono">${r.price}{r.sheet ? <small className={r.price > r.sheet ? "wr2-up" : "wr2-down"}> {r.price > r.sheet ? "+" : "−"}${Math.abs(Math.round(r.price - r.sheet))}</small> : null}</span></li>)}</ul>
                </section>
              ) : null}
            </div>
          </div>
          <p className="wr2-muted wr2-small wr2-center">Values: {m.sheetSeason} sheet. Updated {new Date(m.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.</p>
        </>
      ) : tab === "prep" ? <PrepPanel apiPath={apiPath} budget={m.settings.budget} rosterSize={m.settings.rosterSize} /> : <EdgePanel model={m} apiPath={apiPath} nominationApi={nominationApi} onChange={() => void load(null)} />}
    </div>
  );
}

function RunTheRoom({ model, apiPath, nominationApi, onChange }: { readonly model: Model; readonly apiPath: string; readonly nominationApi: string; readonly onChange: () => void }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState("1");
  const [bid, setBid] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { fetch(`${apiPath}?prep=1`, { cache: "no-store" }).then((r) => r.json()).then((j: { players?: Player[] }) => setPlayers(j.players ?? [])).catch(() => undefined); }, [apiPath]);
  const taken = useMemo(() => new Set(model.teams.flatMap((t) => t.buys.map((b) => b.name))), [model.teams]);
  const hits = q.trim().length < 2 ? [] : players.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) && !taken.has(p.name)).slice(0, 6);
  const send = async (method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>) => {
    setMsg(null);
    try {
      const r = await fetch(nominationApi, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setMsg(j.error ?? "Couldn't update the room."); return; }
      setMsg(method === "DELETE" ? "Cleared." : "Everyone's War Room updates within 10 seconds."); setQ(""); onChange();
    } catch { setMsg("Couldn't reach the site. Try again."); }
  };
  return (
    <section className="wr2-card wr2-edge-banner" aria-labelledby="wr2-run">
      <p id="wr2-run" className="wr2-kicker">Run the room · draft night</p>
      {model.mode !== "live" ? <p className="wr2-muted wr2-small">These controls go live when the Sleeper auction starts. Until then, use the replay to practice.</p> : null}
      <label className="wr2-field">Put a player on the block<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" disabled={model.mode !== "live"} /></label>
      {hits.length ? <ul className="wr2-list wr2-pick">{hits.map((p) => <li key={p.id}><button type="button" onClick={() => void send("POST", { playerId: p.id, playerName: p.name, position: p.pos, nflTeam: p.team, openingBid: Number(open) || 1 })}><span><b>{p.name}</b> <Pos pos={p.pos} /></span><span className="wr2-mono">open ${open || 1}</span></button></li>)}</ul> : null}
      <div className="wr2-two">
        <label className="wr2-field">Opening bid<input inputMode="numeric" value={open} onChange={(e) => setOpen(e.target.value.replace(/[^0-9]/g, ""))} /></label>
        <label className="wr2-field">Current bid<input inputMode="numeric" value={bid} onChange={(e) => setBid(e.target.value.replace(/[^0-9]/g, ""))} placeholder={model.block?.currentBid ? String(model.block.currentBid) : "$"} /></label>
      </div>
      <div className="wr2-actions">
        <button type="button" className="wr2-btn" disabled={model.mode !== "live" || !bid} onClick={() => void send("PATCH", { currentBid: Number(bid) })}>Update bid</button>
        <button type="button" className="wr2-ghost" disabled={model.mode !== "live"} onClick={() => void send("DELETE")}>Clear the block</button>
      </div>
      <p className="wr2-muted wr2-small">Sales come straight from Sleeper, so nothing you enter here can be lost on a reload.</p>
      {msg ? <p className="wr2-note" role="status">{msg}</p> : null}
    </section>
  );
}

const TASTE: { id: "full" | "room" | "off"; label: string; note: string }[] = [
  { id: "full", label: "Full taste", note: "Room intel, each owner's own habits, and hints on the player on the block." },
  { id: "room", label: "Room only", note: "Room intel only: no personal habits, no hints on the block." },
  { id: "off", label: "Off", note: "No intel for owners; they see the board and their max." },
];
function TasteDial({ level, apiPath, onChange }: { readonly level: "full" | "room" | "off"; readonly apiPath: string; readonly onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const pick = async (id: string) => { setBusy(true); try { await fetch(apiPath, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setTaste", level: id }) }); onChange(); } finally { setBusy(false); } };
  return (
    <section className="wr2-card" aria-labelledby="wr2-dial">
      <p id="wr2-dial" className="wr2-kicker">How much intel owners get</p>
      <div className="wr2-tabs wr2-tabs--wide" role="group" aria-label="Owner intel level">{TASTE.map((t) => <button key={t.id} type="button" aria-pressed={level === t.id} disabled={busy} onClick={() => void pick(t.id)}>{t.label}</button>)}</div>
      <p className="wr2-muted wr2-small">{TASTE.find((t) => t.id === level)?.note} You always see everything.</p>
    </section>
  );
}

function EdgePanel({ model, apiPath, nominationApi, onChange }: { readonly model: Model; readonly apiPath: string; readonly nominationApi?: string; readonly onChange: () => void }) {
  const e = model.edge;
  if (!e) return null;
  return (
    <div className="wr2-col">
      {nominationApi && e.commish !== false ? <RunTheRoom model={model} apiPath={apiPath} nominationApi={nominationApi} onChange={onChange} /> : null}
      {e.commish !== false ? <TasteDial level={model.taste.level ?? "full"} apiPath={apiPath} onChange={onChange} /> : null}
      <section className="wr2-card wr2-edge-banner"><p className="wr2-kicker">{e.label ?? "Commish Edge"} · only you see this</p><p className="wr2-muted">Names on every habit, from the league's auctions {model.room.history.seasons.join(", ")}. Small samples: treat these as leans, not laws.</p></section>
      {model.block && e.canPay.length ? (
        <section className="wr2-card"><p className="wr2-kicker">Who can still outbid your ${model.block.max?.max} on {model.block.player.name}</p>
          <ul className="wr2-list">{e.canPay.map((t) => <li key={t.name}><span><b>{t.name}</b> <small className="wr2-muted">{NEED_LABEL[t.need]}</small></span><span className="wr2-mono">max ${t.legalMax}</span></li>)}</ul>
        </section>
      ) : null}
      <div className="wr2-scouts">
        {[...e.scouts].sort((a, b) => b.left - a.left).map((s) => (
          <article key={s.owner} className="wr2-card wr2-scout">
            <div className="wr2-row"><div><p className="wr2-name wr2-name--sm">{s.owner}</p><p className="wr2-muted wr2-small">{s.team}</p></div><span className="wr2-mono">${s.left} · max ${s.legalMax}</span></div>
            {s.traits.length ? <div className="wr2-chips">{s.traits.map((t) => <span key={t} className="wr2-chip">{t}</span>)}</div> : null}
            {s.plays.length ? <ul className="wr2-plays">{s.plays.map((p) => <li key={p}><b>Play:</b> {p}</li>)}</ul> : <p className="wr2-muted wr2-small">No strong habits on record.</p>}
            {s.biggest ? <p className="wr2-muted wr2-small">Biggest buy: {s.biggest.name}, ${s.biggest.price} ({s.biggest.season}) · {s.earlyShare}% of budget in the first third</p> : null}
            {s.longView ? <p className="wr2-muted wr2-small">{s.longView}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

const CALL_TONE: Record<string, string> = { "Good call": "go", Rethink: "stop", "Don't overdo it": "warn", Lean: "warn" };

function PrepPanel({ apiPath, budget, rosterSize }: { readonly apiPath: string; readonly budget: number; readonly rosterSize: number }) {
  const [prep, setPrep] = useState<Prep | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coach, setCoach] = useState<Prep["coach"]>(null);
  const [coachMsg, setCoachMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiPath}?prep=1`, { cache: "no-store" }).then(async (r) => {
      const j = (await r.json()) as Prep & { error?: string };
      if (!r.ok) { setMsg(j.error ?? "Prep is unavailable."); return; }
      setPrep(j); setPlan(j.plan); setCoach(j.coach);
    }).catch(() => setMsg("Couldn't reach the site."));
  }, [apiPath]);

  const byId = useMemo(() => new Map((prep?.players ?? []).map((p) => [p.id, p])), [prep]);
  const matches = useMemo(() => { const s = q.trim().toLowerCase(); return s.length < 2 || !prep ? [] : prep.players.filter((p) => p.name.toLowerCase().includes(s) && !(plan?.targets[p.id] !== undefined)).slice(0, 8); }, [q, prep, plan]);
  if (!prep || !plan) return <div className="wr2-card wr2-center"><p className="wr2-muted">{msg ?? "Loading your plan…"}</p></div>;

  const targets = Object.entries(plan.targets).map(([id, dollars]) => ({ p: byId.get(id), id, dollars })).filter((t) => t.p).sort((a, b) => b.dollars - a.dollars);
  const planned = targets.reduce((a, t) => a + t.dollars, 0);
  const leftAfter = budget - planned - Math.max(0, rosterSize - targets.length);
  const set = (patch: Partial<Plan>) => setPlan({ ...plan, ...patch });

  const save = async (e?: FormEvent) => {
    e?.preventDefault(); setBusy(true); setMsg(null);
    try {
      const r = await fetch(apiPath, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "savePlan", plan }) });
      const j = (await r.json()) as { ok?: boolean; error?: string; checks?: Check[]; plan?: Plan };
      if (!r.ok || !j.ok) { setMsg(j.error ?? "Couldn't save."); return; }
      if (j.plan) setPlan(j.plan);
      setPrep({ ...prep, checks: j.checks ?? [] }); setCoach(null); setCoachMsg(null); setMsg("Saved. Your co-owner sees the same plan.");
    } catch { setMsg("Couldn't reach the site."); } finally { setBusy(false); }
  };
  const askCoach = async () => {
    setBusy(true); setCoachMsg(null);
    try {
      await save();
      const r = await fetch(apiPath, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "checkStrategy" }) });
      const j = (await r.json()) as { ok?: boolean; error?: string; checks?: Check[]; summary?: string };
      if (!j.ok) { setCoachMsg(j.error ?? "The coach is unavailable right now."); return; }
      setCoach({ checks: j.checks ?? [], summary: j.summary ?? "", at: new Date().toISOString() });
    } catch { setCoachMsg("Couldn't reach the site."); } finally { setBusy(false); }
  };

  const sugg = prep.carried ? Object.entries(prep.carried.suggestedTargets).filter(([id]) => plan.targets[id] === undefined && byId.has(id)) : [];
  return (
    <form className="wr2-grid" onSubmit={save}>
      <div className="wr2-col">
        {prep.carried ? (
          <section className="wr2-card wr2-carried" aria-label="Carried over from last season">
            <p className="wr2-kicker">Started from your {prep.carried.season} plan</p>
            <p className="wr2-muted wr2-small">Your strategy, kicker/defense budgets and rival goals carried over. Change anything for this year, then save. Last year&rsquo;s targets are suggestions: tap to add them back.</p>
            {sugg.length ? <div className="wr2-chips">{sugg.map(([id, d]) => <button key={id} type="button" className="wr2-chip" onClick={() => set({ targets: { ...plan.targets, [id]: d } })}>+ {byId.get(id)!.name} ${d}</button>)}</div> : null}
          </section>
        ) : null}
        <section className="wr2-card">
          <div className="wr2-row"><p className="wr2-kicker">{prep.teamName ? `${prep.teamName} · shared plan` : "Your plan"}</p>{plan.updatedAt ? <span className="wr2-muted wr2-small">Saved {new Date(plan.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : null}</div>
          <label className="wr2-field">Your strategy, in your words
            <textarea rows={4} value={plan.strategy} maxLength={1500} onChange={(e) => set({ strategy: e.target.value })} placeholder="e.g. Pay $5–6 for the best defense early. Stud RB, two solid WRs, wait on QB, $1 kicker." />
          </label>
          <div className="wr2-two">
            <label className="wr2-field">Defense budget<select value={plan.defTier} onChange={(e) => set({ defTier: e.target.value })}><option value="">No plan</option><option value="$1">$1</option><option value="$2–3">$2–3</option><option value="$4+">$4 or more</option></select></label>
            <label className="wr2-field">Kicker budget<select value={plan.kTier} onChange={(e) => set({ kTier: e.target.value })}><option value="">No plan</option><option value="$1">$1</option><option value="$2–3">$2–3</option><option value="$4+">$4 or more</option></select></label>
          </div>
        </section>
        <section className="wr2-card">
          <p className="wr2-kicker">Targets &amp; dollars</p>
          <label className="wr2-field">Add a player<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the value sheet" /></label>
          {matches.length ? <ul className="wr2-list wr2-pick">{matches.map((p) => <li key={p.id}><button type="button" onClick={() => { set({ targets: { ...plan.targets, [p.id]: Math.max(1, Math.round(p.sheet)) } }); setQ(""); }}><span><b>{p.name}</b> <Pos pos={p.pos} /> <small className="wr2-muted">{p.team ?? "FA"}</small></span><span className="wr2-mono">sheet ${Math.round(p.sheet)}</span></button></li>)}</ul> : null}
          {targets.length ? (
            <ul className="wr2-list">
              {targets.map(({ p, id, dollars }) => (
                <li key={id}>
                  <span><b>{p!.name}</b> <Pos pos={p!.pos} /> <small className="wr2-muted">sheet ${Math.round(p!.sheet)}</small></span>
                  <span className="wr2-target">
                    <label className="wr2-sr" htmlFor={`t-${id}`}>Dollars for {p!.name}</label>
                    $<input id={`t-${id}`} inputMode="numeric" value={dollars} onChange={(e) => set({ targets: { ...plan.targets, [id]: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 } })} />
                    <button type="button" className="wr2-x" aria-label={`Remove ${p!.name}`} onClick={() => { const t = { ...plan.targets }; delete t[id]; set({ targets: t }); }}>×</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="wr2-muted wr2-small">No targets yet. Add the players you want and what you&rsquo;d pay.</p>}
          <p className={`wr2-small ${leftAfter < 0 ? "wr2-down" : "wr2-muted"}`}>Planned ${planned} on {targets.length} players. {leftAfter >= 0 ? `$${leftAfter} to spare after $1 for every other spot.` : `That's $${-leftAfter} more than you can spend and still fill ${rosterSize} spots.`}</p>
        </section>
        <RivalGoals plan={plan} set={set} teams={prep.teams ?? []} players={prep.players} />
        <div className="wr2-actions"><button type="submit" className="wr2-btn" disabled={busy}>{busy ? "Saving…" : "Save plan"}</button>{msg ? <span className="wr2-muted wr2-small" role="status">{msg}</span> : null}</div>
      </div>
      <div className="wr2-col">
        {prep.keepers ? <KeepOrCut k={prep.keepers} /> : null}
        <MockAuction apiPath={apiPath} />
        <section className="wr2-card">
          <p className="wr2-kicker">Strategy check · league history</p>
          {prep.checks.length ? prep.checks.map((c) => <CheckCard key={c.title} c={c} />) : <p className="wr2-muted wr2-small">Pick a defense and kicker budget to check them against what&rsquo;s worked in this league.</p>}
        </section>
        <section className="wr2-card">
          <div className="wr2-row"><p className="wr2-kicker">AI coach</p><button type="button" className="wr2-btn" onClick={() => void askCoach()} disabled={busy}>Check my plan</button></div>
          <p className="wr2-muted wr2-small">Reads your strategy and targets and checks each idea against the league&rsquo;s own auctions. Private to your team.</p>
          {coachMsg ? <p className="wr2-note" role="status">{coachMsg}</p> : null}
          {coach ? <>{coach.at ? <p className="wr2-muted wr2-small">{coachMsg ? "Your last check" : "Checked"} {new Date(coach.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p> : null}{coach.summary ? <p className="wr2-summary">{coach.summary}</p> : null}{coach.checks.map((c) => <CheckCard key={c.title} c={c} />)}</> : null}
        </section>
      </div>
    </form>
  );
}

function CheckCard({ c }: { readonly c: Check }) {
  return (
    <article className={`wr2-check is-${CALL_TONE[c.call] ?? "warn"}`}>
      <div className="wr2-row"><b>{c.title}</b><span className="wr2-call">{c.call}</span></div>
      <p>{c.text}</p>
    </article>
  );
}

const GOAL_KIND: { id: Goal["kind"]; label: string; help: string }[] = [
  { id: "pay", label: "Make him pay", help: "When one of these players is up, push the price toward your max." },
  { id: "block", label: "Keep him away", help: "Know what it takes to beat him, or make him overpay." },
  { id: "drain", label: "Nominate to drain", help: "Put these players up early so he spends before your players come up." },
];
const NFL = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];

function RivalGoals({ plan, set, teams, players }: { readonly plan: Plan; readonly set: (p: Partial<Plan>) => void; readonly teams: readonly { id: string; name: string }[]; readonly players: readonly Player[] }) {
  const goals = plan.rivals ?? [];
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const [q, setQ] = useState<Record<string, string>>({});
  const update = (id: string, patch: Partial<Goal>) => set({ rivals: goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  const add = () => { if (!teams.length || goals.length >= 6) return; set({ rivals: [...goals, { id: `g${Date.now().toString(36)}`, rival: teams[0].id, kind: "pay", positions: [], nflTeams: [], players: [], minSheet: 0, note: "" }] }); };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <section className="wr2-card" aria-labelledby="wr2-goals">
      <div className="wr2-row"><p id="wr2-goals" className="wr2-kicker">Rival goals · only you see these</p><button type="button" className="wr2-ghost" onClick={add} disabled={!teams.length || goals.length >= 6}>+ Add a goal</button></div>
      {goals.length ? null : <p className="wr2-muted wr2-small">e.g. &ldquo;Make Tommy waste money on RBs&rdquo; or &ldquo;Don&rsquo;t let Aaron get the big-time 49ers starters.&rdquo; On draft night your War Room flags those players and tells you how high to push. Nobody else sees your goals, commissioners included.</p>}
      {goals.map((g) => {
        const hits = (q[g.id] ?? "").trim().length < 2 ? [] : players.filter((p) => p.name.toLowerCase().includes(q[g.id]!.trim().toLowerCase()) && !g.players.includes(p.id)).slice(0, 5);
        return (
          <article key={g.id} className="wr2-goal">
            <div className="wr2-two">
              <label className="wr2-field">Rival<select value={g.rival} onChange={(e) => update(g.id, { rival: e.target.value })}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="wr2-field">Goal<select value={g.kind} onChange={(e) => update(g.id, { kind: e.target.value as Goal["kind"] })}>{GOAL_KIND.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
            </div>
            <p className="wr2-muted wr2-small">{GOAL_KIND.find((k) => k.id === g.kind)?.help}</p>
            <div className="wr2-chips" role="group" aria-label="Positions">{["QB", "RB", "WR", "TE", "K", "DEF"].map((pos) => <button key={pos} type="button" className={`wr2-chip${g.positions.includes(pos) ? " is-need" : ""}`} aria-pressed={g.positions.includes(pos)} onClick={() => update(g.id, { positions: toggle(g.positions, pos) })}>{pos}</button>)}</div>
            <div className="wr2-two">
              <label className="wr2-field">NFL team (optional)<select value={g.nflTeams[0] ?? ""} onChange={(e) => update(g.id, { nflTeams: e.target.value ? [e.target.value] : [] })}><option value="">Any team</option>{NFL.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              <label className="wr2-field">Only players worth<select value={String(g.minSheet)} onChange={(e) => update(g.id, { minSheet: Number(e.target.value) })}><option value="0">Any price</option><option value="5">$5+</option><option value="15">$15+ (starters)</option><option value="30">$30+ (big-time)</option></select></label>
            </div>
            <label className="wr2-field">Or pick players<input value={q[g.id] ?? ""} onChange={(e) => setQ({ ...q, [g.id]: e.target.value })} placeholder="Search the value sheet" /></label>
            {hits.length ? <ul className="wr2-list wr2-pick">{hits.map((p) => <li key={p.id}><button type="button" onClick={() => { update(g.id, { players: [...g.players, p.id] }); setQ({ ...q, [g.id]: "" }); }}><span><b>{p.name}</b> <Pos pos={p.pos} /> <small className="wr2-muted">{p.team ?? "FA"}</small></span></button></li>)}</ul> : null}
            {g.players.length ? <div className="wr2-chips">{g.players.map((id) => <button key={id} type="button" className="wr2-chip" onClick={() => update(g.id, { players: g.players.filter((x) => x !== id) })}>{byId.get(id)?.name ?? id} ×</button>)}</div> : null}
            {g.players.length ? <p className="wr2-muted wr2-small">Picked players override the position, team and price filters.</p> : null}
            <div className="wr2-row"><input className="wr2-note-input" aria-label="Note" value={g.note} maxLength={140} onChange={(e) => update(g.id, { note: e.target.value })} placeholder="Note to self (optional)" /><button type="button" className="wr2-x" aria-label="Remove goal" onClick={() => set({ rivals: goals.filter((x) => x.id !== g.id) })}>×</button></div>
          </article>
        );
      })}
    </section>
  );
}

const KEEP_TONE: Record<string, string> = { Keep: "go", Maybe: "warn", Cut: "stop", "Not eligible": "stop", Unknown: "warn" };
function KeepOrCut({ k }: { readonly k: NonNullable<Prep["keepers"]> }) {
  const [all, setAll] = useState(false);
  const rows = all ? k.rows : k.rows.slice(0, 8);
  return (
    <section className="wr2-card" aria-labelledby="wr2-keep">
      <p id="wr2-keep" className="wr2-kicker">Keep or cut · your team</p>
      <p className="wr2-muted wr2-small">{k.rule}</p>
      <div className="wr2-table" role="table" aria-label="Keeper value">
        <div role="row" className="wr2-tr wr2-th wr2-tr--keep"><span role="columnheader">Player</span><span role="columnheader">Cost</span><span role="columnheader">Likely price</span><span role="columnheader">Call</span></div>
        {rows.map((r) => (
          <div role="row" key={r.id} className={`wr2-tr wr2-tr--keep${r.pick ? " is-me" : ""}`}>
            <span role="cell"><Pos pos={r.pos} /> {r.name}</span>
            <span role="cell" className="wr2-mono">{r.cost !== null ? `$${r.cost}` : "?"}</span>
            <span role="cell" className="wr2-mono">{r.estPrice !== null ? `$${r.estPrice}` : "?"}{r.surplus !== null ? <small className={r.surplus > 0 ? "wr2-down" : "wr2-up"}> {r.surplus > 0 ? "+" : "−"}${Math.abs(r.surplus)}</small> : null}</span>
            <span role="cell"><span className={`wr2-call is-${KEEP_TONE[r.call] ?? "warn"}`}>{r.call}</span></span>
          </div>
        ))}
      </div>
      {k.rows.length > 8 ? <button type="button" className="wr2-link" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${k.rows.length}`}</button> : null}
      <p className="wr2-muted wr2-small">{k.note}</p>
    </section>
  );
}

interface Mock {
  seed: number;
  me: { spent: number; left: number; roster: { name: string; pos: string; price: number; sheet: number }[]; targetsWon: { name: string; price: number; planned: number }[]; targetsLost: { name: string; price: number; planned: number; to: string }[] } | null;
  biggest: { name: string; pos: string; price: number; sheet: number; team: string; mine: boolean }[];
  teams: { name: string; spent: number; top: { name: string; pos: string; price: number } | null }[];
}
function MockAuction({ apiPath }: { readonly apiPath: string }) {
  const [mock, setMock] = useState<Mock | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`${apiPath}?mock=${Math.floor(Math.random() * 999_999) + 1}`, { cache: "no-store" });
      const j = (await r.json()) as Mock & { error?: string };
      if (!r.ok) { setMsg(j.error ?? "The mock auction is unavailable right now."); return; }
      setMock(j);
    } catch { setMsg("Couldn't reach the site."); } finally { setBusy(false); }
  };
  const roster = mock?.me ? [...mock.me.roster].sort((a, b) => b.price - a.price) : [];
  return (
    <section className="wr2-card" aria-labelledby="wr2-mock">
      <div className="wr2-row"><p id="wr2-mock" className="wr2-kicker">Mock auction</p><button type="button" className="wr2-btn" onClick={() => void run()} disabled={busy}>{busy ? "Running…" : mock ? "Run another" : "Run a mock"}</button></div>
      <p className="wr2-muted wr2-small">The other eleven teams bid the way they have in past auctions. You bid your <b>saved</b> plan: your targets at your dollars, never your fades. Every run is a different auction.</p>
      {msg ? <p className="wr2-note" role="status">{msg}</p> : null}
      {mock?.me ? (
        <>
          <div className="wr2-stats wr2-stats--flat"><div><span>You spent</span><b>${mock.me.spent}</b></div><div><span>Left over</span><b>${mock.me.left}</b></div></div>
          {mock.me.targetsWon.length || mock.me.targetsLost.length ? (
            <ul className="wr2-hints">
              {mock.me.targetsWon.map((t) => <li key={t.name}>✅ Got <b>{t.name}</b> for ${t.price} (you planned ${t.planned}).</li>)}
              {mock.me.targetsLost.map((t) => <li key={t.name}>❌ Lost <b>{t.name}</b>: {t.to} paid ${t.price} (you planned ${t.planned}).</li>)}
            </ul>
          ) : <p className="wr2-muted wr2-small">Add targets in your plan and save to see which ones you&rsquo;d land.</p>}
          <p className="wr2-kicker wr2-mt">Your team</p>
          <ul className="wr2-mini">{roster.map((r, i) => <li key={i}><Pos pos={r.pos} /> {r.name} <span className="wr2-mono">${r.price}</span></li>)}</ul>
          <p className="wr2-kicker wr2-mt">Biggest buys</p>
          <ul className="wr2-list">{mock.biggest.map((b, i) => <li key={i} className={b.mine ? "is-me" : undefined}><span><b>{b.name}</b> <Pos pos={b.pos} /> <small className="wr2-muted">{b.mine ? "You" : b.team}</small></span><span className="wr2-mono">${b.price}<small className={b.price > b.sheet ? "wr2-up" : "wr2-down"}> sheet ${b.sheet}</small></span></li>)}</ul>
        </>
      ) : null}
    </section>
  );
}
