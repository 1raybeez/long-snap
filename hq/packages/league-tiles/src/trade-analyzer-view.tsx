"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import type { TradeAnalysis, TradePlayer } from "./trade-engine.ts";
import { keeperOutlook, type KeeperOutlook } from "./trade-keepers.ts";

interface UiPlayer { id: string; name: string; pos: string; nflTeam: string | null; injury: string | null; keeperNext?: number | null; keeperValue?: number | null; rank?: number; age?: number | null; tag?: string | null; kind?: "player" | "pick" }
interface UiTeam { id: string; name: string; owner: string | null; record: string | null; players: UiPlayer[]; faab?: number | null }
interface UiTrade { id: string; label: string; date: string }
interface Context { ok: true; leagueName: string; notice?: string | null; format?: "auction-keeper" | "dynasty" | "redraft"; keeperRule?: { max: number; onePerPosition: boolean } | null; tradesClosed?: boolean; reopens?: string | null; teams: UiTeam[]; myTeamId: string | null; updatedAt: string; weeksLabel: string; sources: { market: string; marketHref: string; market2?: { name: string; href: string } | null; projections: string }; trades: UiTrade[] }
interface AnalyzeResponse { ok: true; analysis: TradeAnalysis; counter: { aSends: string[]; bSends: string[]; lineupA: number; lineupB: number; band: string; pct: number; keeperNote: string | null } | null; partnerNote?: PartnerNoteUi | null; coaching?: { tone: "warning" | "strength"; text: string }[]; outcome?: { label: string; status: string; weeks: number; winner: string | null; sides: { team: string; line: string }[] } | null }
interface PlanStepUi { partnerId: string; give: string[]; get: string[]; giveFaab?: number; getFaab?: number }
interface PlanResponse { ok: true; plan: { ok: boolean; issues: string[]; steps: { partner: string; owner: string | null; give: string[]; get: string[]; lineupYou: number; lineupThem: number; band: string; favors: "A" | "B" | null; pct: number; fly: string; call: string }[]; total: { lineup: number; weekly: { week: number; delta: number }[]; startersBefore: string[]; startersAfter: string[]; keeperGive: { name: string; cost: number | null }[]; keeperGet: { name: string; cost: number | null }[] } | null; verdict: string } }
interface MultiResponse { ok: true; result: { ok: boolean; issues: string[]; teams: { id: string; name: string; owner: string | null; gives: string[]; gets: string[]; lineup: number; band: string; netPct: number; direction: string; newStarters: string[]; keeperGive: { name: string; cost: number | null }[]; keeperGet: { name: string; cost: number | null }[] }[]; fly: { level: string; text: string; rule: string; history: string }; verdict: string } }
interface TargetUi { partnerId: string; partner: string; owner: string | null; give: { id: string; name: string; pos: string }[]; get: { id: string; name: string; pos: string }[]; lineupMe: number; lineupThem: number; band: string; pct: number; favors: "A" | "B" | null; newStarters: string[]; fly: string; keeperNote: string | null; partnerNote?: PartnerNoteUi | null }
interface PartnerNoteUi { summary: string; traits: string[]; likely: boolean; fit: string | null; record?: string | null }
interface TargetsResponse { ok: true; targets: TargetUi[]; searched: number }
interface HabitsResponse { ok: true; norms: { seasons: number[]; trades: number; perTeam: number; picksMoved: number; faabMoved: number }; owners: { id: string; name: string; owner: string | null; summary: string; traits: string[]; record?: string | null }[]; coach?: CoachUi | null }
interface CoachUi { record: { won: number; lost: number; even: number }; recent: { won: number; lost: number; even: number }; headline: string; best: string | null; patterns: { key: string; label: string; won: number; lost: number; even: number; points: number; tone: "warning" | "strength"; examples: string[] }[] }
interface PriceResponse { ok: true; player: string; rows: { team: string; owner: string | null; get: string[]; band: string }[] }

const POS_COLOR: Record<string, string> = { QB: "#FF2A6D", RB: "#00CEB8", WR: "#58A7FF", TE: "#FFAE58", K: "#BD66FF", DEF: "#7988A1", PICK: "#C9A227" };
const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "PICK"];
const POS_LABEL: Record<string, string> = { DEF: "DST", PICK: "Draft picks" };
const PICK_ICON = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="#F4E7B8"/><path d="M9 8h10v12H9z" fill="none" stroke="#8A6D12" stroke-width="1.6"/><path d="M11.5 12h5M11.5 15h5M11.5 18h3" stroke="#8A6D12" stroke-width="1.6"/></svg>');
const photo = (p: UiPlayer) => (p.kind === "pick" || p.pos === "PICK" ? PICK_ICON : p.pos === "DEF" ? `https://sleepercdn.com/images/team_logos/nfl/${String(p.nflTeam ?? p.id).toLowerCase()}.png` : `https://sleepercdn.com/content/nfl/players/thumb/${p.id}.jpg`);
const FALLBACK = "https://sleepercdn.com/images/v2/icons/player_default.webp";
/** Roster grouped QB, RB, WR, TE, K, DEF; best projected first inside each group. */
function grouped(players: readonly UiPlayer[]) {
  const rest = players.filter((p) => !POS_ORDER.includes(p.pos));
  return [...POS_ORDER.map((pos) => ({ pos, players: players.filter((p) => p.pos === pos) })), { pos: "Other", players: rest }]
    .filter((g) => g.players.length)
    .map((g) => ({ ...g, players: [...g.players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name)) }));
}

function RosterPicker({ players, picks, onToggle, locked, onLock }: { readonly players: readonly UiPlayer[]; readonly picks: readonly string[]; readonly onToggle: (id: string) => void; readonly locked?: readonly string[] | null; readonly onLock?: (id: string) => void }) {
  return (
    <div className="ta-roster">
      {grouped(players).map((g) => (
        <div key={g.pos} className="ta-group">
          <p className="ta-group-h"><span className="ta-group-dot" style={{ background: POS_COLOR[g.pos] ?? "#9ca3af" }} aria-hidden="true" />{POS_LABEL[g.pos] ?? g.pos}</p>
          <ul>
            {g.players.map((p) => {
              const on = picks.includes(p.id);
              return (
                <li key={p.id} className={`ta-row${on ? " ta-row-on" : ""}`} style={on ? { borderColor: POS_COLOR[p.pos] ?? undefined, background: `${POS_COLOR[p.pos] ?? "#9ca3af"}1f` } : undefined}>
                  <label className="ta-pick">
                    <input type="checkbox" checked={on} onChange={() => onToggle(p.id)} />
                    <span className="ta-pos" style={{ background: POS_COLOR[p.pos] ?? "#9ca3af" }}>{p.pos === "DEF" ? "DST" : p.pos === "PICK" ? "PK" : p.pos}</span>
                    <img className="ta-photo" src={photo(p)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK; }} />
                    <span className="ta-who"><b>{p.name}</b><span>{p.kind === "pick" || p.pos === "PICK" ? (p.tag === "Acquired" ? "Acquired in a trade" : "Own pick") : <>{p.nflTeam ?? "FA"}{typeof p.age === "number" ? ` · ${p.age}` : ""}{p.tag ? <em className="ta-tag"> {p.tag}</em> : null}{p.injury ? <em className="ta-inj"> {p.injury}</em> : null}</>}</span></span>
                  </label>
                  {p.keeperNext !== undefined ? <span className="ta-cost">{p.keeperNext === null ? "$?" : `$${p.keeperNext}`}</span> : null}
                  {locked && onLock && !on ? <button type="button" className={`ta-keep${locked.includes(p.id) ? " ta-keep-on" : ""}`} aria-pressed={locked.includes(p.id)} aria-label={`Don't trade ${p.name}`} onClick={() => onLock(p.id)}>{locked.includes(p.id) ? "Won't trade" : "Don't trade"}</button> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Multi-Trade Planner: up to four trades in a row, each against the roster left by the ones before. */
function PlannerPanel({ ctx, meId, steps, setSteps, plan, busy, onRun, error }: { readonly ctx: Context; readonly meId: string; readonly steps: PlanStepUi[]; readonly setSteps: (v: PlanStepUi[]) => void; readonly plan: PlanResponse["plan"] | null; readonly busy: boolean; readonly onRun: () => void; readonly error: string | null }) {
  const me = ctx.teams.find((t) => t.id === meId);
  if (!me) return <p className="ta-note">Pick your team on the Trade Analyzer tab first.</p>;
  // Rosters as they stand before each step (players move with every earlier trade).
  const rosters: { mine: UiPlayer[]; teams: Map<string, UiPlayer[]> }[] = [];
  let mine = [...me.players];
  const teams = new Map(ctx.teams.filter((t) => t.id !== meId).map((t) => [t.id, [...t.players]]));
  for (const st of steps) {
    rosters.push({ mine: [...mine], teams: new Map(teams) });
    const partner = teams.get(st.partnerId);
    if (!partner) continue;
    const gave = mine.filter((p) => st.give.includes(p.id));
    const got = partner.filter((p) => st.get.includes(p.id));
    mine = [...mine.filter((p) => !st.give.includes(p.id)), ...got];
    teams.set(st.partnerId, [...partner.filter((p) => !st.get.includes(p.id)), ...gave]);
  }
  const update = (i: number, patch: Partial<PlanStepUi>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const t = plan?.total;
  const maxD = t ? Math.max(1, ...t.weekly.map((w) => Math.abs(w.delta))) : 1;
  return (
    <>
      <article className="ta-card">
        <p className="ta-kicker">Multi-Trade Planner</p>
        <h2 className="ta-h2">Plan up to four trades with different owners</h2>
        <p className="ta-p">Each trade is checked against your roster after the trades before it, so you can’t trade the same player twice, and a player you get in one trade can go out in the next. The planner shows each trade alone and all of them together.</p>
      </article>
      {steps.map((st, i) => {
        const r = rosters[i];
        const partnerPlayers = st.partnerId ? r?.teams.get(st.partnerId) ?? [] : [];
        return (
          <article key={i} className="ta-card">
            <div className="ta-step-h">
              <p className="ta-kicker">Trade {i + 1}</p>
              {steps.length > 1 ? <button type="button" className="ta-keep" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>Remove</button> : null}
            </div>
            <label className="ta-label" htmlFor={`ta-step-${i}`}>Trade partner</label>
            <select id={`ta-step-${i}`} className="ta-select" value={st.partnerId} onChange={(e) => update(i, { partnerId: e.target.value, get: [] })}>
              <option value="">Choose a team…</option>
              {ctx.teams.filter((x) => x.id !== meId).map((x) => <option key={x.id} value={x.id}>{x.name}{x.owner ? ` · ${x.owner}` : ""}{x.record ? ` (${x.record})` : ""}</option>)}
            </select>
            {st.partnerId ? (
              <div className="ta-build">
                <div><p className="ta-kicker">You send</p><RosterPicker players={r?.mine ?? []} picks={st.give} onToggle={(id) => update(i, { give: flip(st.give, id) })} />{me.faab !== undefined && me.faab !== null ? <FaabInput id={`ta-pf-${i}-give`} value={st.giveFaab ?? 0} max={me.faab} onChange={(v) => update(i, { giveFaab: v })} /> : null}</div>
                <div><p className="ta-kicker">You get</p><RosterPicker players={partnerPlayers} picks={st.get} onToggle={(id) => update(i, { get: flip(st.get, id) })} />{(() => { const pt = ctx.teams.find((x) => x.id === st.partnerId); return pt?.faab !== undefined && pt?.faab !== null ? <FaabInput id={`ta-pf-${i}-get`} value={st.getFaab ?? 0} max={pt.faab} onChange={(v) => update(i, { getFaab: v })} /> : null; })()}</div>
              </div>
            ) : null}
          </article>
        );
      })}
      <div className="ta-actions">
        {steps.length < 4 ? <button type="button" className="ta-btn ta-btn-ghost" onClick={() => setSteps([...steps, { partnerId: "", give: [], get: [] }])}>+ Add another trade</button> : null}
        <button type="button" className="ta-btn" disabled={busy || !steps.some((s) => s.partnerId && (s.give.length || s.giveFaab) && (s.get.length || s.getFaab))} onClick={onRun}>{busy ? "Checking…" : "Check the plan"}</button>
      </div>
      {error ? <p className="ta-error" role="alert">{error}</p> : null}
      {plan ? (
        <>
          {plan.issues.length ? <article className="ta-card">{plan.issues.map((x, i) => <p key={i} className="ta-warn">{x}</p>)}</article> : null}
          {t ? (
            <article className={`ta-call ta-call-${t.lineup >= 4 ? "go" : t.lineup <= -4 ? "stop" : "mid"}`}>
              <div><p className="ta-kicker">All trades together</p><p className="ta-call-h">{plan.verdict}</p></div>
              <div className="ta-call-n"><b>{fmt(t.lineup)}</b><span>projected pts, {ctx.weeksLabel}</span></div>
            </article>
          ) : null}
          <div className="ta-grid">
            {plan.steps.map((x, i) => (
              <article key={i} className="ta-card">
                <p className="ta-kicker">Trade {i + 1} · {x.owner ?? x.partner}</p>
                <p className="ta-p"><b>{x.give.join(" + ")}</b> ⇄ <b>{x.get.join(" + ")}</b></p>
                <p className="ta-p">At that point: <b className={x.lineupYou < 0 ? "ta-bad" : "ta-good"}>{fmt(x.lineupYou)}</b> for you, <b className={x.lineupThem < 0 ? "ta-bad" : "ta-good"}>{fmt(x.lineupThem)}</b> for them.</p>
                <p className="ta-p">Market: {x.band}{x.band !== "Even" ? ` to ${x.favors === "A" ? "you" : "them"} (${x.pct}%)` : ""} · {x.fly}</p>
              </article>
            ))}
            {t ? (
              <article className="ta-card">
                <p className="ta-kicker">Your lineup, week by week</p>
                <div className="ta-bars" role="img" aria-label={`Weekly change: ${t.weekly.map((w) => `Week ${w.week} ${fmt(w.delta)}`).join(", ")}`}>
                  {t.weekly.map((w) => <div key={w.week} className="ta-bar"><span className={w.delta < 0 ? "ta-bar-neg" : "ta-bar-pos"} style={{ height: `${Math.round((Math.abs(w.delta) / maxD) * 56) + 3}px` }} /><span className="ta-bar-v">{fmt(w.delta)}</span><span className="ta-bar-w">Wk {w.week}</span></div>)}
                </div>
              </article>
            ) : null}
            {t ? (
              <article className="ta-card">
                <p className="ta-kicker">Starting lineup next week</p>
                <div className="ta-two"><div><b>Now</b>{t.startersBefore.map((n) => <span key={n}>{n}</span>)}</div><div><b>After the plan</b>{t.startersAfter.map((n) => <span key={n} className={t.startersBefore.includes(n) ? undefined : "ta-good"}>{n}</span>)}</div></div>
              </article>
            ) : null}
            {t && (t.keeperGive.length || t.keeperGet.length) ? (
              <article className="ta-card">
                <p className="ta-kicker">Next year’s keeper costs</p>
                <div className="ta-two"><div><b>You give up</b>{t.keeperGive.map((k) => <span key={k.name}>{k.name} · {k.cost === null ? "?" : `$${k.cost}`}</span>)}</div><div><b>You end up with</b>{t.keeperGet.map((k) => <span key={k.name}>{k.name} · {k.cost === null ? "?" : `$${k.cost}`}</span>)}</div></div>
              </article>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}

function FaabInput({ id, value, max, onChange }: { readonly id: string; readonly value: number; readonly max: number; readonly onChange: (v: number) => void }) {
  return (
    <div className="ta-faab">
      <label htmlFor={id}>Add FAAB <span>(${max} left)</span></label>
      <span className="ta-faab-box">$<input id={id} type="number" min={0} max={max} step={1} value={value || ""} placeholder="0" onChange={(e) => onChange(Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0))))} /></span>
    </div>
  );
}

/** 3–4 team trade: each team picks what it sends and where each piece goes. */
function MultiTeamPanel({ ctx, meId, result, clear, busy, onRun, error, neutral = false }: { readonly ctx: Context; readonly meId: string; readonly neutral?: boolean; readonly result: MultiResponse["result"] | null; readonly clear: () => void; readonly busy: boolean; readonly onRun: (moves: { playerId?: string; faab?: number; from: string; to: string }[]) => void; readonly error: string | null }) {
  const [teamIds, setTeamIds] = useState<string[]>(neutral ? ["", ""] : [meId, "", ""]);
  const minTeams = neutral ? 2 : 3;
  const letter = (i: number) => (neutral ? String.fromCharCode(65 + i) : String(i + 1));
  const [dest, setDest] = useState<Record<string, string>>({});
  const [faab, setFaab] = useState<Record<string, { amount: number; to: string }>>({});
  const chosen = teamIds.filter(Boolean);
  const teamOf = (id: string) => ctx.teams.find((t) => t.id === id);
  const setTeam = (i: number, id: string) => { const next = [...teamIds]; next[i] = id; setTeamIds(next); setDest({}); setFaab({}); clear(); };
  const others = (id: string) => chosen.filter((x) => x !== id);
  const moves = [
    ...Object.entries(dest).flatMap(([pid, to]) => { const from = chosen.find((tid) => teamOf(tid)?.players.some((p) => p.id === pid)); return from && to ? [{ playerId: pid, from, to }] : []; }),
    ...Object.entries(faab).flatMap(([from, f]) => (f.amount > 0 && f.to && chosen.includes(from) ? [{ faab: f.amount, from, to: f.to }] : [])),
  ];
  return (
    <>
      <article className="ta-card">
        <p className="ta-kicker">{neutral ? "Value & Veto Check" : "3–4 Team Trade"}</p>
        <h2 className="ta-h2">{neutral ? "Is this trade fair? Any teams, any players." : "One trade, three or four teams"}</h2>
        <p className="ta-p">{neutral ? `Pick any two to four teams (yours doesn’t have to be one), tap the players${ctx.format === "dynasty" ? ", picks" : ""} or FAAB each one would send, and choose where each piece goes. Use it to see what a player should fetch, or to check a flagged trade before the veto poll. Every team gets the same read: value in vs. out, lineup change${ctx.format === "auction-keeper" ? ", keeper costs" : ""}.` : `Pick the teams, tap what each one sends, and choose where each piece goes. Every team gets its own answer: lineup change, value in vs. out${ctx.format === "auction-keeper" ? ", and keeper costs" : ""}.`}</p>
        <div className="ta-teams4">
          {teamIds.map((id, i) => (
            <div key={i}>
              <label className="ta-label" htmlFor={`ta-mt-${neutral ? "n" : ""}${i}`}>Team {letter(i)}{i >= minTeams ? " (optional)" : ""}</label>
              <select id={`ta-mt-${neutral ? "n" : ""}${i}`} className="ta-select" value={id} onChange={(e) => setTeam(i, e.target.value)}>
                <option value="">{i >= minTeams ? "No team" : "Choose a team…"}</option>
                {ctx.teams.map((t) => <option key={t.id} value={t.id} disabled={teamIds.includes(t.id) && t.id !== id}>{t.name}{t.owner ? ` · ${t.owner}` : ""}</option>)}
              </select>
            </div>
          ))}
          {teamIds.length < 4 ? <button type="button" className="ta-btn ta-btn-ghost" onClick={() => setTeamIds([...teamIds, ""])}>{neutral ? `+ Team ${letter(teamIds.length)}` : "+ Fourth team"}</button> : null}
        </div>
      </article>
      <div className="ta-build">
        {chosen.map((tid) => {
          const t = teamOf(tid);
          if (!t) return null;
          const picks = Object.keys(dest).filter((pid) => t.players.some((p) => p.id === pid));
          return (
            <article key={tid} className="ta-card">
              <p className="ta-kicker">{t.name} sends</p>
              <RosterPicker players={t.players} picks={picks} onToggle={(pid) => { const next = { ...dest }; if (pid in next) delete next[pid]; else next[pid] = others(tid).length === 1 ? others(tid)[0] : ""; setDest(next); clear(); }} />
              {picks.length && others(tid).length > 1 ? (
                <div className="ta-dest">
                  {picks.map((pid) => (
                    <label key={pid} className="ta-dest-row"><span>{t.players.find((p) => p.id === pid)?.name} goes to</span>
                      <select className="ta-select" value={dest[pid]} onChange={(e) => { setDest({ ...dest, [pid]: e.target.value }); clear(); }}>
                        <option value="">Choose…</option>
                        {others(tid).map((o) => <option key={o} value={o}>{teamOf(o)?.name}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}
              {t.faab !== undefined && t.faab !== null ? (
                <div className="ta-dest-row">
                  <FaabInput id={`ta-mtf-${neutral ? "n" : ""}${tid}`} value={faab[tid]?.amount ?? 0} max={t.faab} onChange={(v) => { setFaab({ ...faab, [tid]: { amount: v, to: faab[tid]?.to || (others(tid).length === 1 ? others(tid)[0] : "") } }); clear(); }} />
                  {(faab[tid]?.amount ?? 0) > 0 && others(tid).length > 1 ? <select className="ta-select" aria-label="FAAB goes to" value={faab[tid]?.to ?? ""} onChange={(e) => { setFaab({ ...faab, [tid]: { amount: faab[tid]?.amount ?? 0, to: e.target.value } }); clear(); }}><option value="">FAAB goes to…</option>{others(tid).map((o) => <option key={o} value={o}>{teamOf(o)?.name}</option>)}</select> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className="ta-actions">
        <button type="button" className="ta-btn" disabled={busy || chosen.length < minTeams || !moves.length || Object.values(dest).some((v) => !v)} onClick={() => onRun(moves)}>{busy ? "Checking…" : "Check this trade"}</button>
        <span className="ta-note">Every team must send something and get something.{neutral ? " Nothing here is sent to Sleeper or to the owners." : ""}</span>
      </div>
      {error ? <p className="ta-error" role="alert">{error}</p> : null}
      {result ? (
        <>
          {result.issues.length ? <article className="ta-card">{result.issues.map((x, i) => <p key={i} className="ta-warn">{x}</p>)}</article> : null}
          {result.ok ? (
            <>
              <article className={`ta-call ta-call-${result.fly.level === "Should stand" ? "go" : result.fly.level === "Might draw a flag" ? "mid" : "stop"}`}>
                <div><p className="ta-kicker">Will it fly?</p><p className="ta-call-v">{result.fly.level}</p><p className="ta-call-h">{result.fly.text} {result.verdict}</p><p className="ta-src">{result.fly.rule} {result.fly.history}</p></div>
              </article>
              <div className="ta-grid">
                {[...result.teams].sort((x, y) => chosen.indexOf(x.id) - chosen.indexOf(y.id)).map((r) => (
                  <article key={r.id} className="ta-card">
                    <p className="ta-kicker">{r.name}{r.owner ? ` · ${r.owner}` : ""}</p>
                    <p className="ta-p">Sends <b>{r.gives.join(" + ") || "nothing"}</b></p>
                    <p className="ta-p">Gets <b>{r.gets.join(" + ") || "nothing"}</b></p>
                    <p className={`ta-h3 ${r.lineup < 0 ? "ta-bad" : "ta-good"}`}>{fmt(r.lineup)} projected pts</p>
                    <p className="ta-p">Value: {r.direction === "even" ? "even" : `${r.direction} (${r.netPct}%, ${r.band.toLowerCase()})`}{r.newStarters.length ? ` · ${r.newStarters.join(", ")} would start` : ""}</p>
                    {r.keeperGet.length || r.keeperGive.length ? <p className="ta-src">Keepers next year: gives {r.keeperGive.map((k) => `${k.name} ${k.cost === null ? "$?" : `$${k.cost}`}`).join(", ") || "none"}; gets {r.keeperGet.map((k) => `${k.name} ${k.cost === null ? "$?" : `$${k.cost}`}`).join(", ") || "none"}</p> : null}
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** Trade Targets: fair trades around the league that make my lineup better and don't hurt theirs. */
function TargetsPanel({ initialPositions, ctx, meId, locked, setLocked, result, clear, busy, onRun, onOpen, error, habits }: { readonly habits?: HabitsResponse | null; readonly initialPositions?: string[] | null; readonly ctx: Context; readonly meId: string; readonly locked: string[]; readonly setLocked: (v: string[]) => void; readonly result: TargetsResponse | null; readonly clear: () => void; readonly busy: boolean; readonly onRun: (positions: string[], goal: "now" | "later" | "keepers") => void; readonly onOpen: (t: TargetUi) => void; readonly error: string | null }) {
  const [positions, setPositions] = useState<string[]>(initialPositions?.length ? initialPositions : ["RB", "WR", "TE"]);
  const dynasty = ctx.format === "dynasty";
  const [goal, setGoal] = useState<"now" | "later" | "keepers">("now");
  const later = dynasty && goal === "later";

  const keeperRule = ctx.keeperRule ?? null;
  const keeperMode = Boolean(keeperRule) && !dynasty && ctx.teams.some((t) => t.players.some((p) => typeof p.keeperValue === "number"));
  const keepersGoal = keeperMode && goal === "keepers";
  const me = ctx.teams.find((t) => t.id === meId);
  const flip = (list: string[], set: (v: string[]) => void, v: string) => { set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]); clear(); };
  const mine = me ? grouped(me.players.filter((p) => !["K", "DEF"].includes(p.pos))) : [];
  const chip = (p: { id: string; name: string; pos: string }) => <span key={p.id} className="ta-tp"><img src={photo({ ...p, nflTeam: null, injury: null, kind: p.pos === "PICK" ? "pick" : "player" })} alt="" loading="lazy" onError={(e) => { e.currentTarget.src = FALLBACK; }} /><span className="ta-pos" style={{ background: POS_COLOR[p.pos] ?? "#7988A1" }}>{p.pos === "PICK" ? "PK" : p.pos === "DEF" ? "DST" : p.pos}</span>{p.name}</span>;
  return (
    <>
      <article className="ta-card">
        <p className="ta-kicker">Trade Targets</p>
        <h2 className="ta-h2">Who should I call?</h2>
        {dynasty ? (
          <div className="ta-chips" role="group" aria-label="Goal">
            <button type="button" aria-pressed={goal === "now"} className={`ta-chip${goal === "now" ? " ta-chip-lock" : ""}`} onClick={() => { setGoal("now"); clear(); }}>Win now</button>
            <button type="button" aria-pressed={goal === "later"} className={`ta-chip${goal === "later" ? " ta-chip-lock" : ""}`} onClick={() => { setGoal("later"); clear(); }}>Build for later</button>
          </div>
        ) : keeperMode ? (
          <div className="ta-chips" role="group" aria-label="Goal">
            <button type="button" aria-pressed={goal === "now"} className={`ta-chip${goal === "now" ? " ta-chip-lock" : ""}`} onClick={() => { setGoal("now"); clear(); }}>Win now</button>
            <button type="button" aria-pressed={goal === "keepers"} className={`ta-chip${goal === "keepers" ? " ta-chip-lock" : ""}`} onClick={() => { setGoal("keepers"); clear(); }}>Keepers for next year</button>
          </div>
        ) : null}
        {keepersGoal && me && keeperRule ? <KeeperOutlookCard title="Your keeper outlook" outlook={keeperOutlook(asTradePlayers(me.players), keeperRule)} /> : null}
        <p className="ta-p">{keepersGoal
          ? `Add next year’s keeper value. We look for bargain keepers other teams can’t keep anyway (their spares) first, teams out of the race first, and fair prices: no asking for a team’s only bargain on the cheap, no two-for-one lowballs. Your own best keepers stay out of the offers.`
          : later
          ? `Sell this season’s production for younger players or picks. We look for teams whose lineup gets better with your veterans and who can pay a fair dynasty price.`
          : `Pick the spots you want to upgrade and the players${dynasty ? " and picks" : ""} you won’t trade. We check every roster in ${ctx.leagueName} for fair trades (one or two pieces each way) that make your weekly lineup better without making theirs worse.`}</p>
        <p className="ta-label">{later ? "Young players at" : keepersGoal ? "Keepers at" : "Upgrade at"}</p>
        <div className="ta-chips">
          {["QB", "RB", "WR", "TE"].map((pos) => <button key={pos} type="button" aria-pressed={positions.includes(pos)} className={`ta-chip${positions.includes(pos) ? " ta-chip-on" : ""}`} style={positions.includes(pos) ? { background: POS_COLOR[pos], borderColor: POS_COLOR[pos] } : undefined} onClick={() => flip(positions, setPositions, pos)}>{pos}</button>)}
        </div>
        <p className="ta-label">{dynasty ? "Players and picks" : "Players"} you won’t trade{me ? ` (${me.name})` : ""}</p>
        <div className="ta-chips">
          {mine.flatMap((g) => g.players).map((p) => <button key={p.id} type="button" aria-pressed={locked.includes(p.id)} className={`ta-chip${locked.includes(p.id) ? " ta-chip-lock" : ""}`} onClick={() => flip(locked, setLocked, p.id)}><span className="ta-chip-dot" style={{ background: POS_COLOR[p.pos] ?? "#7988A1" }} />{p.name}{locked.includes(p.id) ? " · won't trade" : ""}</button>)}
        </div>
        <div className="ta-actions">
          <button type="button" className="ta-btn" disabled={busy || !positions.length || !me} onClick={() => onRun(positions, later ? "later" : keepersGoal ? "keepers" : "now")}>{busy ? "Searching every roster…" : "Find trades"}</button>
          <span className="ta-note">This is &ldquo;won&rsquo;t trade,&rdquo; not your keepers. Every player you mark here is left out of the search, so mark only true untouchables; marking most of your roster leaves almost nothing to offer.</span>
        </div>
      </article>
      {error ? <p className="ta-error" role="alert">{error}</p> : null}
      {result ? (
        result.targets.length ? (
          <>
            <p className="ta-note">Checked {result.searched.toLocaleString()} fair trades. Best {result.targets.length}, at most two per owner:</p>
            <div className="ta-targets">
              {result.targets.map((t, i) => (
                <article key={i} className="ta-card ta-target">
                  <p className="ta-kicker">{t.owner ?? t.partner} · {t.partner}</p>
                  <div className="ta-tswap">
                    <div><b>You get</b>{t.get.map(chip)}</div>
                    <div><b>You give</b>{t.give.map(chip)}</div>
                  </div>
                  <div className="ta-tnums">
                    <span className={t.lineupMe > 0 ? "ta-good" : t.lineupMe < 0 ? "ta-bad" : undefined}><b>{fmt(t.lineupMe)}</b> for you</span>
                    <span className={t.lineupThem > 0 ? "ta-good" : undefined}><b>{fmt(t.lineupThem)}</b> for {t.owner?.split(/[ /+]/)[0] ?? "them"}</span>
                    <span>{t.band === "Even" ? "Even value" : `${t.band} to ${t.favors === "A" ? "you" : "them"}`}</span>
                  </div>
                  <p className="ta-src">{t.newStarters.length ? `${t.newStarters.join(", ")} would start. ` : ""}{t.fly === "Should stand" ? "Should stand if flagged." : t.fly + "."}{t.keeperNote ? ` ${t.keeperNote}` : ""}</p>
                  {t.partnerNote ? <p className="ta-habit">{t.partnerNote.likely ? <b className="ta-habit-badge">Likely to deal</b> : null} {t.partnerNote.summary}{t.partnerNote.record ? ` · ${t.partnerNote.record}` : ""}{t.partnerNote.fit ? <> · <em>{t.partnerNote.fit}</em></> : null}</p> : null}
                  <button type="button" className="ta-btn ta-btn-ghost" onClick={() => onOpen(t)}>Open in Trade Analyzer</button>
                </article>
              ))}
            </div>
          </>
        ) : <article className="ta-card"><p className="ta-p">{keepersGoal ? "No fair trade found that adds keeper value at those spots. Try more positions or unmark a player." : later ? "No fair trade found that sells your veterans for younger players or picks. Try more positions or unlock a player." : `No fair trade found that helps your lineup at those spots without hurting theirs.${locked.length > 3 ? ` You marked ${locked.length} players “won’t trade”; unmark a few to open up more deals.` : " Try another position or unmark a player."}`}</p></article>
      ) : null}
      {habits?.coach ? <CoachCard coach={habits.coach} /> : null}
      {habits ? <LeagueHabits habits={habits} meId={meId} /> : null}
    </>
  );
}

/** Trade coach (private): your own trade record, the kinds of deals that keep going wrong or right, your best deal. */
function CoachCard({ coach }: { readonly coach: CoachUi }) {
  const r = (x: { won: number; lost: number; even: number }) => `${x.won}-${x.lost}${x.even ? `-${x.even}` : ""}`;
  return (
    <details className="ta-card ta-coach">
      <summary><span className="ta-kicker">Your trade coach · private to you</span> <span className="ta-note">{coach.headline}</span></summary>
      {coach.best ? <p className="ta-coach-best">🏆 {coach.best} Keep doing that.</p> : null}
      <p className="ta-p">All-time {r(coach.record)} · last 5 trades {r(coach.recent)}</p>
      {coach.patterns.length ? (
        <ul className="ta-coach-list">
          {coach.patterns.map((p) => (
            <li key={p.key} className={p.tone === "warning" ? "ta-coach-warn" : "ta-coach-good"}>
              <b>{p.tone === "warning" ? "Watch out:" : "Strength:"} {p.label}</b> <span>{r(p)} ({p.points > 0 ? "+" : ""}{p.points} starter pts)</span>
              {p.examples.length ? <em>{p.examples.join(" · ")}</em> : null}
            </li>
          ))}
        </ul>
      ) : <p className="ta-p">No clear patterns yet. Patterns show after three or more similar trades.</p>}
      <p className="ta-src">From your graded trades (see League Info → Trades). Only you see this.</p>
    </details>
  );
}

function LeagueHabits({ habits, meId }: { readonly habits: HabitsResponse; readonly meId: string }) {
  const n = habits.norms;
  return (
    <details className="ta-card ta-habits">
      <summary><span className="ta-kicker">How {n.seasons.length > 1 ? `this league has traded since ${n.seasons[n.seasons.length - 1]}` : "this league trades"}</span> <span className="ta-note">{n.trades} trades, about {n.perTeam} per team{n.picksMoved ? ` · ${n.picksMoved} picks moved` : ""}{n.faabMoved ? ` · $${n.faabMoved} FAAB in trades` : ""}</span></summary>
      <ul className="ta-habit-list">{[...habits.owners].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0)).map((o) => <li key={o.id}><b>{o.name}</b>{o.owner ? <em> {o.owner}</em> : null}<span>{o.summary}{o.record ? ` · ${o.record}` : ""}{o.traits.some((t) => /often|Rarely|Hasn't/.test(t)) ? ` · ${o.traits.filter((t) => /often|Rarely|Hasn't/.test(t)).join(" · ")}` : ""}</span></li>)}</ul>
      <p className="ta-src">From each team&apos;s Sleeper trades{n.seasons.length > 1 ? ` (${n.seasons[n.seasons.length - 1]}–${n.seasons[0]})` : ""}, refreshed every few hours. A team&apos;s history follows its roster, so it includes previous owners of that team.</p>
    </details>
  );
}

const fmt = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n < 0 ? `−${Math.abs(n).toFixed(1)}` : "0.0");
const BANDS = ["Even", "Slight edge", "Clear edge", "Lopsided"];

export function TradeAnalyzerView({ apiBase, theme, loginHref }: { readonly apiBase: string; readonly theme: LeagueTileTheme; readonly loginHref: string }) {
  const [ctx, setCtx] = useState<Context | null>(null);
  const [state, setState] = useState<"loading" | "signin" | "error" | "ready">("loading");
  const [tab, setTab] = useState<"analyze" | "targets" | "multi" | "plan" | "sandbox">("analyze");
  const [targets, setTargets] = useState<TargetsResponse | null>(null);
  const [initialPositions, setInitialPositions] = useState<string[] | null>(null);
  // Deep link from the GM tab: ?tab=targets&pos=TE,RB
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const t = q.get("tab");
      if (t === "targets" || t === "multi" || t === "plan" || t === "sandbox") setTab(t);
      const pos = (q.get("pos") ?? "").split(",").filter((p) => ["QB", "RB", "WR", "TE"].includes(p));
      if (pos.length) setInitialPositions(pos);
    } catch { /* no deep link */ }
  }, []);
  const [multi, setMulti] = useState<MultiResponse["result"] | null>(null);
  const [check, setCheck] = useState<MultiResponse["result"] | null>(null);
  const [steps, setSteps] = useState<PlanStepUi[]>([{ partnerId: "", give: [], get: [] }]);
  const [plan, setPlan] = useState<PlanResponse["plan"] | null>(null);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [aSends, setASends] = useState<string[]>([]);
  const [bSends, setBSends] = useState<string[]>([]);
  const [locked, setLocked] = useState<string[]>([]);
  const [aFaab, setAFaab] = useState(0);
  const [bFaab, setBFaab] = useState(0);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricePick, setPricePick] = useState("");
  const [price, setPrice] = useState<PriceResponse | null>(null);

  useEffect(() => {
    fetch(apiBase, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) { setState("signin"); return; }
        const j = await r.json();
        if (!r.ok || !j.ok) { setState("error"); return; }
        setCtx(j);
        if (j.tradesClosed && !initialPositions) setTab("sandbox");
        const mine = j.myTeamId ?? j.teams[0]?.id ?? "";
        setAId(mine);
        setBId(j.teams.find((t: UiTeam) => t.id !== mine)?.id ?? "");
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [apiBase]);

  const teamA = ctx?.teams.find((t) => t.id === aId) ?? null;
  const teamB = ctx?.teams.find((t) => t.id === bId) ?? null;
  const allPlayers = useMemo(() => (ctx?.teams ?? []).flatMap((t) => t.players.filter((p) => !["K", "DEF"].includes(p.pos)).map((p) => ({ ...p, team: t }))), [ctx]);

  async function post(body: unknown) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Something went wrong.");
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return null;
    } finally { setBusy(false); }
  }
  const analyze = async () => { const j = await post({ mode: "analyze", teamA: aId, teamB: bId, aSends, bSends, locked, aFaab, bFaab }); if (j) setResult(j); };
  const [habits, setHabits] = useState<HabitsResponse | null>(null);
  useEffect(() => {
    fetch(apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "profiles" }) }).then(async (r) => { if (!r.ok) return; const j = (await r.json()) as HabitsResponse; if (j.ok) setHabits(j); }).catch(() => undefined);
  }, [apiBase]);
  const runTargets = async (positions: string[], goal: "now" | "later" | "keepers") => { const j = await post({ mode: "targets", me: aId, locked, positions, goal }); if (j) setTargets(j); };
  const openTarget = async (t: TargetUi) => {
    const give = t.give.map((p) => p.id), get = t.get.map((p) => p.id);
    setBId(t.partnerId); setASends(give); setBSends(get); setAFaab(0); setBFaab(0); setResult(null); setTab("analyze");
    const j = await post({ mode: "analyze", teamA: aId, teamB: t.partnerId, aSends: give, bSends: get, locked, aFaab: 0, bFaab: 0 });
    if (j) setResult(j);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const runHistory = async (tradeId: string) => { const j = await post({ mode: "history", tradeId }); if (j) { setResult(j); setTab("analyze"); setAId(j.analysis.teamA.id); setBId(j.analysis.teamB.id); setASends([]); setBSends([]); } };
  const runPlan = async () => { const j = await post({ mode: "plan", me: aId, steps }); if (j) setPlan(j.plan); };
  const runMulti = async (moves: { playerId?: string; faab?: number; from: string; to: string }[]) => { const j = await post({ mode: "multi", me: aId, moves }); if (j) setMulti(j.result); };
  const [reversed, setReversed] = useState<string | null>(null);
  const runCheck = async (moves: { playerId?: string; faab?: number; from: string; to: string }[]) => { const j = await post({ mode: "multi", neutral: true, moves }); if (j) { setCheck(j.result); setReversed(typeof j.reversedTradeId === "string" ? j.reversedTradeId : null); } };
  const runPrice = async () => { const j = await post({ mode: "price", playerId: pricePick }); if (j) setPrice(j); };
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  if (state === "loading") return <section className="league-tiles ta" style={themeCssVariables(theme) as CSSProperties}><p className="ta-note">Loading rosters…</p></section>;
  if (state === "signin") return (
    <section className="league-tiles ta" style={themeCssVariables(theme) as CSSProperties}>
      <article className="ta-card ta-center"><p className="ta-kicker">Members only</p><h2 className="ta-h2">Sign in to use the Trade Analyzer</h2><p className="ta-note">Your trade checks are private to you.</p><a className="ta-btn" href={loginHref}>League member login</a></article>
    </section>
  );
  if (state === "error" || !ctx) return <section className="league-tiles ta" style={themeCssVariables(theme) as CSSProperties}><article className="ta-card"><p className="ta-note">Roster data is unavailable right now. Try again in a few minutes.</p></article></section>;

  const a = result?.analysis ?? null;
  const updated = new Date(ctx.updatedAt);
  const maxDelta = a ? Math.max(1, ...a.lineupA.weekly.map((w) => Math.abs(w.delta))) : 1;

  return (
    <section className="league-tiles ta" style={themeCssVariables(theme) as CSSProperties}>
      <header className="ta-hero">
        <div>
          <p className="ta-hero-kicker">{ctx.leagueName}</p>
          <h1 className="ta-hero-title">Trade Analyzer</h1>
          <p className="ta-hero-sub">Build a trade, get six straight answers. Private to you.</p>
        </div>
        <div className="ta-hero-meta"><span><span className="ta-dot" aria-hidden="true" />Rosters from Sleeper · updated {updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><span>Projections: {ctx.weeksLabel}</span>{ctx.notice ? <span>{ctx.notice}</span> : null}</div>
      </header>

      {ctx.tradesClosed ? (
        <article className="ta-card ta-closed">
          <p className="ta-kicker">Trade deadline has passed</p>
          <p className="ta-p"><b>Trades are closed for the season{ctx.reopens ? ` and reopen ${ctx.reopens}` : ""}.</b> The Value &amp; Veto Check, Price a player{ctx.format === "auction-keeper" && ctx.keeperRule ? " and the keeper outlook (Trade Targets → Keepers for next year)" : ""} still work. The other tools are here for planning {ctx.reopens ? "offseason" : "next season’s"} deals.</p>
        </article>
      ) : null}

      <nav className="ta-tabs" aria-label="Trade tools">
        <button type="button" className={tab === "analyze" ? "ta-on" : undefined} onClick={() => setTab("analyze")}>Trade Analyzer</button>
        <button type="button" className={tab === "targets" ? "ta-on" : undefined} onClick={() => setTab("targets")}>Trade Targets</button>
        <button type="button" className={tab === "multi" ? "ta-on" : undefined} onClick={() => setTab("multi")}>3–4 Team Trade</button>
        <button type="button" className={tab === "plan" ? "ta-on" : undefined} onClick={() => setTab("plan")}>Multi-Trade Planner</button>
        <button type="button" className={tab === "sandbox" ? "ta-on" : undefined} onClick={() => setTab("sandbox")}>Value &amp; Veto Check</button>
      </nav>

      {tab === "analyze" && habits?.coach ? <CoachCard coach={habits.coach} /> : null}
      {tab === "analyze" ? (
        <>
          <div className="ta-build">
            {[{ label: "You send", team: teamA, set: setAId, id: aId, picks: aSends, setPicks: setASends, mine: true, faab: aFaab, setFaab: setAFaab }, { label: "You get", team: teamB, set: setBId, id: bId, picks: bSends, setPicks: setBSends, mine: false, faab: bFaab, setFaab: setBFaab }].map((side) => (
              <article key={side.label} className="ta-card">
                <p className="ta-kicker">{side.label}</p>
                <label className="ta-label" htmlFor={`ta-team-${side.label}`}>Team</label>
                <select id={`ta-team-${side.label}`} className="ta-select" value={side.id} onChange={(e) => { side.set(e.target.value); side.setPicks([]); side.setFaab(0); setResult(null); }}>
                  {ctx.teams.map((t) => <option key={t.id} value={t.id} disabled={t.id === (side.mine ? bId : aId)}>{t.name}{t.owner ? ` · ${t.owner}` : ""}{t.record ? ` (${t.record})` : ""}</option>)}
                </select>
                <RosterPicker players={side.team?.players ?? []} picks={side.picks} onToggle={(id) => { toggle(side.picks, side.setPicks, id); setResult(null); }} locked={side.mine ? locked : null} onLock={(id) => toggle(locked, setLocked, id)} />
                {side.team?.faab !== undefined && side.team?.faab !== null ? <FaabInput id={`ta-faab-${side.label}`} value={side.faab} max={side.team.faab} onChange={(v) => { side.setFaab(v); setResult(null); }} /> : null}
                {ctx.format === "auction-keeper" || !ctx.format ? <p className="ta-src">$ = next year’s keeper cost.</p> : <p className="ta-src">Number after the team = age. Next year’s picks show Early / Mid / Late from today’s standings.</p>}
              </article>
            ))}
          </div>
          <div className="ta-actions">
            <button type="button" className="ta-btn" disabled={busy || (!aSends.length && !aFaab) || (!bSends.length && !bFaab)} onClick={analyze}>{busy ? "Checking…" : "Check this trade"}</button>
            <span className="ta-note">Tap players on both sides. “Don’t trade” marks players you won’t include in a suggested counter (it isn’t about keepers).</span>
          </div>
          {error ? <p className="ta-error" role="alert">{error}</p> : null}

          {a ? (
            <>
              <article className={`ta-call ta-call-${a.call.verdict === "Accept" ? "go" : a.call.verdict === "Close call" ? "mid" : "stop"}`}>
                <div>
                  <p className="ta-kicker">The call</p>
                  <p className="ta-call-v">{a.call.verdict}</p>
                  <p className="ta-call-h">{a.call.headline} {a.call.reason}</p>
                  <p className="ta-note">{[...a.aSends, ...(a.faab?.aSends ? [`$${a.faab.aSends} FAAB`] : [])].join(" + ")} ⇄ {[...a.bSends, ...(a.faab?.bSends ? [`$${a.faab.bSends} FAAB`] : [])].join(" + ")}</p>
                </div>
                <div className="ta-call-n"><b>{fmt(a.lineupA.total)}</b><span>projected pts, {ctx.weeksLabel}</span></div>
              </article>

              {result?.outcome ? (
                <article className="ta-card ta-outcome">
                  <p className="ta-kicker">How it turned out · {result.outcome.status}{result.outcome.weeks ? ` · ${result.outcome.weeks} week${result.outcome.weeks === 1 ? "" : "s"} counted` : ""}</p>
                  <p className="ta-h3">{result.outcome.winner ? `${result.outcome.label}: ${result.outcome.winner}` : result.outcome.label}</p>
                  <ul className="ta-swaps">{result.outcome.sides.map((x) => <li key={x.team}><b>{x.team}</b>: {x.line}</li>)}</ul>
                  <p className="ta-src">Each week since the trade, both lineups are re-picked with and without it (by season-to-date averages, no hindsight) and scored with real points. Wins = games the trade flipped. The cards below are today&apos;s projections, for comparison.</p>
                </article>
              ) : null}

              <div className="ta-grid">
                <article className="ta-card">
                  <p className="ta-kicker">1 · Is it fair?</p>
                  <p className="ta-h3">{a.market.band === "Even" ? "Even" : `${a.market.band} to ${a.market.favors === "A" ? "you" : a.teamB.owner?.split(/[ /+]/)[0] ?? a.teamB.name}`}</p>
                  <div className="ta-meter" aria-hidden="true">{BANDS.map((b) => <span key={b} className={b === a.market.band ? "ta-meter-on" : undefined} />)}</div>
                  <div className="ta-meter-l"><span>Even</span><span>Slight</span><span>Clear</span><span>Lopsided</span></div>
                  <p className="ta-p">{a.market.band === "Even" ? "Within 5% on the market." : `${a.market.favors === "A" ? "You get" : "They get"} about ${a.market.pct}% more market value.`} Lesser pieces count a little less than a star.</p>
                  {a.market.coverage === "partial" ? <p className="ta-warn">No market value yet for {a.market.missing.join(", ")}.</p> : null}
                  <p className="ta-src">Values: <MarketCredit sources={ctx.sources} /></p>
                </article>

                <article className="ta-card">
                  <p className="ta-kicker">2 · Does it fit {ctx.leagueName}?</p>
                  {a.fit.length ? a.fit.map((f, i) => <p key={i} className="ta-p">{f}</p>) : <p className="ta-p">No roster-shape issues.</p>}
                </article>

                <article className="ta-card">
                  <p className="ta-kicker">3 · Does my lineup get better?</p>
                  <p className={`ta-h3 ${a.lineupA.total < 0 ? "ta-bad" : "ta-good"}`}>{fmt(a.lineupA.total)} projected points</p>
                  <div className="ta-bars" role="img" aria-label={`Weekly change: ${a.lineupA.weekly.map((w) => `Week ${w.week} ${fmt(w.delta)}`).join(", ")}`}>
                    {a.lineupA.weekly.map((w) => (
                      <div key={w.week} className="ta-bar">
                        <span className={w.delta < 0 ? "ta-bar-neg" : "ta-bar-pos"} style={{ height: `${Math.round((Math.abs(w.delta) / maxDelta) * 56) + 3}px` }} />
                        <span className="ta-bar-v">{fmt(w.delta)}</span>
                        <span className="ta-bar-w">Wk {w.week}</span>
                      </div>
                    ))}
                  </div>
                  {a.lineupA.swaps?.length ? <ul className="ta-swaps">{a.lineupA.swaps.map((sw, i) => <li key={i}>Week {sw.week}: {sw.in ? <><b>{sw.in}</b> ({sw.inPts.toFixed(1)})</> : "nobody"} {sw.out ? <>starts instead of <b>{sw.out}</b> ({sw.outPts.toFixed(1)})</> : "joins the lineup"}</li>)}</ul> : <p className="ta-p">Nobody in your starting lineup changes in Week {a.lineupA.weekly[0]?.week ?? ""}.</p>}
                  {Math.abs(a.lineupA.total) < 1.5 * Math.max(1, a.lineupA.weekly.length) ? <p className="ta-note">That&apos;s under 1.5 points a week: about even, a toss-up.</p> : null}
                  <p className="ta-src">Projections: {ctx.sources.projections}</p>
                </article>

                {a.future ? (
                  <article className="ta-card">
                    <p className="ta-kicker">4 · Now or later?</p>
                    <p className="ta-h3">{a.future.lean === "win now" ? "A win-now trade" : a.future.lean === "build for later" ? "A build-for-later trade" : a.future.lean === "both" ? "Better now and later" : a.future.lean === "neither" ? "Worse now and later" : "Balanced"}</p>
                    {a.future.lines.map((l, i) => <p key={i} className="ta-p">{l}</p>)}
                    {a.future.picksGive.length || a.future.picksGet.length ? <p className="ta-src">Next year’s picks are valued Early, Mid or Late from the draft order today’s standings point to; later years use the round’s average.</p> : null}
                    <p className="ta-src">Long term: <MarketCredit sources={ctx.sources} />. This season: FantasyCalc redraft values.</p>
                  </article>
                ) : null}

                {a.keepers ? (
                  <article className="ta-card">
                    <p className="ta-kicker">4 · What about next year? (keepers)</p>
                    <div className="ta-two">
                      <div><b>You give up</b>{a.keepers.aGives.map((k) => <span key={k.name}>{k.name} · {k.cost === null ? "cost unknown" : `$${k.cost}`}{typeof k.value === "number" ? ` · worth ~$${k.value}` : ""}</span>)}</div>
                      <div><b>You get</b>{a.keepers.aGets.map((k) => <span key={k.name}>{k.name} · {k.cost === null ? "cost unknown" : `$${k.cost}`}{typeof k.value === "number" ? ` · worth ~$${k.value}` : ""}</span>)}</div>
                    </div>
                    {a.keepers.check ? (
                      <>
                        <div className="ta-two">
                          <KeeperSide label="Your keepers" before={a.keepers.check.a.before} after={a.keepers.check.a.after} change={a.keepers.check.a.change} />
                          <KeeperSide label={`${a.teamB.owner?.split(/[ /+]/)[0] ?? a.teamB.name}’s keepers`} before={a.keepers.check.b.before} after={a.keepers.check.b.after} change={a.keepers.check.b.change} />
                        </div>
                        {a.keepers.check.notes.map((n) => <p key={n} className={`ta-p${/only bargain|lowball|Two good|best player in the deal/.test(n) ? " ta-bad" : ""}`}>{n}</p>)}
                        <p className="ta-src">“Worth” is an estimate of next year’s auction price: the league’s 2026 auction prices by position, players ranked with <a href={ctx.sources.marketHref} target="_blank" rel="noreferrer">FantasyCalc</a> dynasty and redraft values. Savings = auction estimate − keeper cost (the keeper cost already includes the league’s keeper raise).</p>
                      </>
                    ) : null}
                    {a.keepers.rule ? <p className="ta-src">{a.keepers.rule}</p> : null}
                  </article>
                ) : null}

                <article className="ta-card">
                  <p className="ta-kicker">5 · Why would {a.teamB.owner?.split(/[ /+]/)[0] ?? "they"} say yes?</p>
                  <p className={`ta-h3 ${a.lineupB.total < 0 ? "ta-bad" : "ta-good"}`}>{fmt(a.lineupB.total)} for them</p>
                  <p className="ta-p">{a.theirSide}</p>
                  {result?.partnerNote ? <p className="ta-habit">Their trade history: {result.partnerNote.summary}{result.partnerNote.record ? `. ${result.partnerNote.record}` : ""}.{result.partnerNote.fit ? <> {result.partnerNote.fit}</> : null}</p> : null}
                  <p className="ta-src">Facts only. We don’t guess acceptance odds.</p>
                </article>

                <article className="ta-card">
                  <p className="ta-kicker">6 · Will it fly?</p>
                  <p className={`ta-h3 ${a.fly.level === "Should stand" ? "ta-good" : "ta-mid"}`}>{a.fly.level}</p>
                  <p className="ta-p">{a.fly.text} {a.fly.rule}</p>
                  <p className="ta-src">{a.fly.history}</p>
                </article>
              </div>

              {result?.coaching?.length ? (
                <article className="ta-card ta-coach-now">
                  <p className="ta-kicker">Your trade coach</p>
                  {result.coaching.map((c, i) => <p key={i} className={`ta-p ${c.tone === "warning" ? "ta-coach-warn" : "ta-coach-good"}`}>{c.text}</p>)}
                  {result.coaching.some((c) => c.tone === "warning") ? <p className="ta-p"><b>{result.counter ? "Consider countering with the deal below instead." : "Consider asking for more, or keeping your picks out of it."}</b></p> : null}
                </article>
              ) : null}

              {result?.counter ? (
                <article className="ta-counter">
                  <p className="ta-kicker">A fair counter</p>
                  <p className="ta-counter-t">{result.counter.aSends.join(" + ")} <span aria-hidden="true">⇄</span> {result.counter.bSends.join(" + ")}</p>
                  <div className="ta-grid">
                    <div className="ta-mini"><b>{result.counter.band}</b> on the market{result.counter.pct ? ` (${result.counter.pct}%)` : ""}</div>
                    <div className="ta-mini"><b>{fmt(result.counter.lineupA)} for you, {fmt(result.counter.lineupB)} for them</b></div>
                    {result.counter.keeperNote ? <div className="ta-mini">{result.counter.keeperNote}</div> : null}
                  </div>
                </article>
              ) : a.call.verdict !== "Accept" ? <p className="ta-note">No fair counter found from your unlocked players for this ask.</p> : null}
            </>
          ) : null}
        </>
      ) : tab === "targets" ? (
        <TargetsPanel key={(initialPositions ?? []).join(",")} initialPositions={initialPositions} ctx={ctx} meId={aId} locked={locked} setLocked={setLocked} result={targets} clear={() => setTargets(null)} busy={busy} onRun={runTargets} onOpen={openTarget} error={error} habits={habits} />
      ) : tab === "multi" ? (
        <MultiTeamPanel ctx={ctx} meId={aId} result={multi} clear={() => setMulti(null)} busy={busy} onRun={runMulti} error={error} />
      ) : tab === "plan" ? (
        <PlannerPanel ctx={ctx} meId={aId} steps={steps} setSteps={(v) => { setSteps(v); setPlan(null); }} plan={plan} busy={busy} onRun={runPlan} error={error} />
      ) : (
        <>
          {/* A completed trade goes through this list, not the builder below: the builder starts from today's rosters, where the
              players have already moved (Ray 2026-11-16: a finished trade entered in the builder was checked backwards). */}
          <article className="ta-card">
            <p className="ta-kicker">Veto check · for a flagged trade</p>
            <h2 className="ta-h2">A trade that already went through</h2>
            <p className="ta-p">Checking a trade that’s already done? Pick it here. Rosters are rebuilt as they were just before the trade, then it’s checked the same way as any trade (both lineups, market, keepers, veto rule) so every voter sees the same facts. Values and projections are today’s.</p>
            <ul className="ta-history">
              {ctx.trades.length ? ctx.trades.map((t) => <li key={t.id}><button type="button" onClick={() => runHistory(t.id)} disabled={busy}><span>{t.label}</span><em>{t.date}</em></button></li>) : <li className="ta-note">No trades yet this season.</li>}
            </ul>
          </article>
          {reversed && check ? (
            <article className="ta-card ta-coach-now">
              <p className="ta-kicker">Backwards?</p>
              <p className="ta-p ta-coach-warn">These players already changed teams in a completed trade, so the check below runs that trade in reverse. Check the trade as it was made instead:</p>
              <div className="ta-actions"><button type="button" className="ta-btn" disabled={busy} onClick={() => { setReversed(null); runHistory(reversed); }}>Check the completed trade</button></div>
            </article>
          ) : null}
          <MultiTeamPanel ctx={ctx} meId={aId} neutral result={check} clear={() => { setCheck(null); setReversed(null); }} busy={busy} onRun={runCheck} error={error} />
          <article className="ta-card">
            <p className="ta-kicker">Price a player</p>
            <h2 className="ta-h2">What’s he worth?</h2>
            <p className="ta-p">Pick anyone in the league. See a fair return from every other team, from what’s on their roster today.</p>
            <div className="ta-actions">
              <label className="ta-label" htmlFor="ta-price">Player</label>
              <select id="ta-price" className="ta-select" value={pricePick} onChange={(e) => { setPricePick(e.target.value); setPrice(null); }}>
                <option value="">Choose a player…</option>
                {ctx.teams.map((t) => <optgroup key={t.id} label={t.name}>{t.players.filter((p) => !["K", "DEF"].includes(p.pos)).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.pos}</option>)}</optgroup>)}
              </select>
              <button type="button" className="ta-btn" disabled={!pricePick || busy} onClick={runPrice}>{busy ? "Pricing…" : "Price him"}</button>
            </div>
            {price ? (
              <ul className="ta-price">
                {price.rows.length ? price.rows.map((r) => <li key={r.team}><span><b>{r.get.join(" + ")}</b><em>{r.team}{r.owner ? ` · ${r.owner}` : ""}</em></span><span className={r.band === "Even" ? "ta-good" : "ta-mid"}>{r.band}</span></li>) : <li>No close matches on other rosters.</li>}
              </ul>
            ) : null}
            <p className="ta-src">Values: <MarketCredit sources={ctx.sources} /> · {allPlayers.length} players</p>
          </article>

        </>
      )}
      <p className="ta-foot">Rosters: Sleeper · Projections: {ctx.sources.projections} · Values: <MarketCredit sources={ctx.sources} /> · Private to you; nothing is sent to Sleeper.</p>
    </section>
  );
}

/** UI players → the shape the shared keeper math reads (it only needs id, name, position, cost and value). */
function asTradePlayers(players: readonly UiPlayer[]): TradePlayer[] {
  return players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, nflTeam: p.nflTeam, injury: p.injury, proj: {}, market: null, keeperNext: p.keeperNext ?? null, keeperValue: p.keeperValue ?? null, kind: p.kind }));
}

function KeeperOutlookCard({ title, outlook }: { readonly title: string; readonly outlook: KeeperOutlook }) {
  return (
    <div className="ta-mini">
      <b>{title}</b>
      {outlook.keepers.length ? outlook.keepers.map((k) => <div key={k.id}>{k.pos} {k.name}: keeping him costs ${k.cost}; he’d go for ~${k.value} at auction <b className="ta-good">(saves ~${k.surplus})</b></div>) : <div>No bargain keepers yet: nobody on your roster is worth more than his keeper cost.</div>}
      {outlook.closeCalls.length ? <div className="ta-src">Close calls (near break-even): {outlook.closeCalls.map((k) => `${k.name} (costs $${k.cost}, worth ~$${k.value}, ${k.surplus >= 0 ? `saves ~$${k.surplus}` : `$${-k.surplus} over`})`).join("; ")}.</div> : null}
      {outlook.spares.length ? <div className="ta-src">Spare bargains you can’t keep anyway (good trade chips): {outlook.spares.map((k) => `${k.name} (saves ~$${k.surplus})`).join(", ")}.</div> : null}
    </div>
  );
}

function KeeperSide({ label, before, after, change }: { readonly label: string; readonly before: KeeperOutlook; readonly after: KeeperOutlook; readonly change: number }) {
  const line = (o: KeeperOutlook) => (o.keepers.length ? o.keepers.map((k) => `${k.name} (saves ~$${k.surplus})`).join(", ") : "none");
  return (
    <div>
      <b>{label}</b>
      <span>Now: {line(before)}</span>
      <span>After: {line(after)}</span>
      <span className={change > 0 ? "ta-good" : change < 0 ? "ta-bad" : undefined}>{change > 0 ? `Keeper savings up $${change}` : change < 0 ? `Keeper savings down $${-change}` : "Keeper savings unchanged"}</span>
    </div>
  );
}

/** The value sources, each with its link (Dynasty Dealer asks for a visible link wherever its values show). */
function MarketCredit({ sources }: { readonly sources: Context["sources"] }) {
  return (
    <>
      <a href={sources.marketHref} target="_blank" rel="noopener noreferrer">{sources.market}</a>
      {sources.market2 ? <> + values by <a href={sources.market2.href} target="_blank" rel="noopener noreferrer">{sources.market2.name}</a></> : null}
    </>
  );
}
