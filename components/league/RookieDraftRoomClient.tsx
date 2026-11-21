"use client";

// own War Room look (lcc2 classes under the league's theme). Reads /api/<league>/rookie-draft-room (private, no-store):
// Scouting Reports and My Draft Report once, Draft Day every 45 seconds while that tab is open. Types only from lib.
import { useEffect, useState } from "react";
import type { CrossLeague, PickView, Suggestion, Tendencies } from "@/lib/rookieDraft/analysis";
import type { DraftDayView } from "@/lib/rookieDraft/live";

type Scout = { key: string; name: string; coOwners: string[]; isMe: boolean; tendencies: Tendencies; bothLeagues: CrossLeague | null };
type Reports = {
  league: string; generatedAt: string; hitRule: string; graded: string; scoring: string;
  drafts: { season: number; type: string; rounds: number }[];
  canScout?: boolean; scouting: Scout[]; bothLeagues: CrossLeague[];
  mine: { name: string; report: { tendencies: Tendencies; vsLeague: string[]; suggestions: Suggestion[] }; bothLeagues: CrossLeague | null } | null;
};
type Load<T> = { kind: "loading" } | { kind: "error"; status: number; message: string } | { kind: "ready"; data: T };
type Tab = "scouting" | "mine" | "live";

const getJson = async <T,>(url: string): Promise<Load<T>> => {
  try {
    const r = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    const body = (await r.json().catch(() => ({}))) as T & { error?: string };
    return r.ok ? { kind: "ready", data: body } : { kind: "error", status: r.status, message: body.error ?? "The Rookie Draft Room couldn't be loaded right now." };
  } catch { return { kind: "error", status: 503, message: "The Rookie Draft Room couldn't be loaded right now." }; }
};

export function RookieDraftRoomClient({ apiPath, leagueName, signInHref }: { apiPath: string; leagueName: string; signInHref: string }) {
  const [tab, setTab] = useState<Tab>("scouting");
  const [reports, setReports] = useState<Load<Reports>>({ kind: "loading" });
  const [live, setLive] = useState<Load<DraftDayView & { league: string }>>({ kind: "loading" });
  useEffect(() => { let on = true; getJson<Reports>(apiPath).then((r) => { if (!on) return; setReports(r); if (r.kind === "ready" && !r.data.canScout) setTab((t) => (t === "scouting" ? "mine" : t)); }); return () => { on = false; }; }, [apiPath]);
  const scoutTab = !(reports.kind === "ready" && !reports.data.canScout);
  useEffect(() => {
    if (tab !== "live") return;
    let on = true;
    const load = () => getJson<DraftDayView & { league: string }>(`${apiPath}?part=live`).then((r) => on && setLive(r));
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 45_000);
    return () => { on = false; clearInterval(timer); };
  }, [apiPath, tab]);

  return (
    <section className="hq-lcc" aria-labelledby="rookie-draft-room-heading" style={{ marginBottom: 24 }}>
      <div className="mb-4">
        <p className="lcc2-section-heading__eyebrow">Rookie Draft Room</p>
        <h3 id="rookie-draft-room-heading" className="lcc2-section-heading__title">Draft Strategy</h3>
        <p className="lcc2-section-heading__supporting">Every {leagueName} rookie draft on Sleeper: how each owner drafts, how your own picks have gone, and draft-day help.</p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Rookie Draft Room">
        {([["scouting", "Scouting Reports"], ["mine", "My Draft Report"], ["live", "Draft Day"]] as const).filter(([id]) => id !== "scouting" || scoutTab).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`lcc2-button ${tab === id ? "lcc2-button--primary" : ""}`}>{label}</button>
        ))}
      </div>
      {reports.kind === "loading" ? <p className="lcc2-body">Loading the Rookie Draft Room…</p> : null}
      {reports.kind === "error" ? (
        <div className="lcc2-card p-5"><p className="lcc2-body">{reports.message}</p>{reports.status === 401 ? <a href={signInHref} className="lcc2-button lcc2-button--primary mt-4">Sign in</a> : null}</div>
      ) : null}
      {reports.kind === "ready" && tab === "scouting" && reports.data.canScout ? <ScoutingTab data={reports.data} /> : null}
      {reports.kind === "ready" && tab === "mine" ? <MineTab data={reports.data} /> : null}
      {tab === "live" ? <LiveTab state={live} /> : null}
      {reports.kind === "ready" ? <p className="lcc2-body mt-4 text-xs">{reports.data.hitRule} {reports.data.graded} {reports.data.scoring} Source: Sleeper; built {new Date(reports.data.generatedAt).toLocaleDateString()}.</p> : null}
    </section>
  );
}

const pctText = (r: { hits: number; of: number }) => (r.of ? `${Math.round((r.hits / r.of) * 100)}%` : "—");
const r12Style = (t: Tendencies) => {
  const m = { QB: t.mixByGroup.R1.QB + t.mixByGroup.R2.QB, RB: t.mixByGroup.R1.RB + t.mixByGroup.R2.RB, WR: t.mixByGroup.R1.WR + t.mixByGroup.R2.WR, TE: t.mixByGroup.R1.TE + t.mixByGroup.R2.TE };
  const of = m.QB + m.RB + m.WR + m.TE;
  return of ? (Object.entries(m) as [string, number][]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(" · ") : "—";
};

function ScoutingTab({ data }: { data: Reports }) {
  const [open, setOpen] = useState<string>(data.scouting.find((s) => !s.isMe)?.key ?? data.scouting[0]?.key ?? "");
  const current = data.scouting.find((s) => s.key === open);
  return (
    <>
      <div className="lcc2-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th className="p-3 lcc2-label">Owner</th><th className="p-3 lcc2-label">Picks</th><th className="p-3 lcc2-label">Rounds 1–2</th><th className="p-3 lcc2-label">Hit rate</th><th className="p-3 lcc2-label">Last 3 drafts</th></tr></thead>
          <tbody>
            {data.scouting.map((s) => (
              <tr key={s.key} className="border-t border-[var(--lcc-color-border)] cursor-pointer" onClick={() => setOpen(s.key)} aria-selected={s.key === open} style={s.key === open ? { background: "var(--lcc-color-surface-muted)" } : undefined}>
                <td className="p-3 font-ui font-bold text-[var(--lcc-color-text)]"><button type="button" className="text-left" onClick={() => setOpen(s.key)}>{s.name}{s.isMe ? " (you)" : ""}</button>{s.coOwners.length ? <span className="block text-xs text-[var(--lcc-color-text-muted)]">with {s.coOwners.join(", ")}</span> : null}{s.bothLeagues ? <span className="lcc2-badge lcc2-badge--info ml-0 mt-1 inline-block">Both leagues</span> : null}</td>
                <td className="p-3">{s.tendencies.picks}</td>
                <td className="p-3">{r12Style(s.tendencies)}</td>
                <td className="p-3">{pctText(s.tendencies.rate)} <span className="text-xs text-[var(--lcc-color-text-muted)]">({s.tendencies.rate.hits}/{s.tendencies.rate.of})</span></td>
                <td className="p-3 text-xs">{s.tendencies.recent.earlyHits.hits} of {s.tendencies.recent.earlyHits.of} hitting so far</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {current ? <OwnerCard scout={current} /> : null}
      {data.bothLeagues.length ? (
        <div className="lcc2-card mt-4 p-5">
          <p className="lcc2-label">Same person, both leagues</p>
          <ul className="mt-2 space-y-2">{data.bothLeagues.map((c) => <li key={c.hqOwnerId} className="lcc2-body text-sm"><strong>{c.name}:</strong> {c.line}</li>)}</ul>
        </div>
      ) : null}
    </>
  );
}

function OwnerCard({ scout }: { scout: Scout }) {
  const t = scout.tendencies;
  return (
    <article className="lcc2-card lcc2-card--raised mt-4 p-5" aria-label={`${scout.name} scouting report`}>
      <p className="lcc2-label">Scouting report</p>
      <h4 className="mt-1 font-ui text-2xl font-black text-[var(--lcc-color-text)]">{scout.name}</h4>
      <ul className="mt-3 list-disc space-y-1 pl-5">{t.sentences.map((s) => <li key={s} className="lcc2-body text-sm">{s}</li>)}</ul>
      {scout.bothLeagues ? <p className="lcc2-body mt-3 text-sm"><span className="lcc2-badge lcc2-badge--info">Both leagues</span> {scout.bothLeagues.line}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PickList title="First pick each year" picks={t.firstPicks} />
        <PickList title="Notable hits" picks={t.hits} empty="No hit seasons yet." />
        <PickList title="Round 1–2 misses (graded)" picks={t.misses} empty="No graded early misses." />
        <PickList title={`Last ${t.recent.seasons.length} drafts`} picks={t.recent.picks} empty="No picks in the last three drafts." />
      </div>
    </article>
  );
}

function PickList({ title, picks, empty }: { title: string; picks: PickView[]; empty?: string }) {
  return (
    <div>
      <p className="lcc2-label text-xs">{title}</p>
      {picks.length ? (
        <ul className="mt-2 space-y-2">{picks.map((p) => (
          <li key={`${p.season}-${p.slot}-${p.player}`} className="rounded-lg border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-muted)] p-2 text-sm">
            <span className="font-ui font-bold text-[var(--lcc-color-text)]">{p.season} {p.slot} · {p.position} {p.player}</span>
            {p.hit ? <span className="lcc2-badge lcc2-badge--positive ml-2">Hit</span> : p.hitSoFar ? <span className="lcc2-badge lcc2-badge--info ml-2">Hitting so far</span> : null}
            {p.acquired ? <span className="lcc2-badge lcc2-badge--neutral ml-2">Traded-for pick</span> : null}
            {p.formerFranchise ? <span className="lcc2-badge lcc2-badge--neutral ml-2">Former franchise</span> : null}
            <span className="block text-xs text-[var(--lcc-color-text-muted)]">{p.finishes}</span>
          </li>
        ))}</ul>
      ) : <p className="lcc2-body mt-2 text-sm">{empty ?? "None."}</p>}
    </div>
  );
}

function MineTab({ data }: { data: Reports }) {
  if (!data.mine) return <div className="lcc2-card p-5"><p className="lcc2-body">Your owner account has no {data.league} rookie draft history on Sleeper yet.</p></div>;
  const { report, name, bothLeagues } = data.mine;
  const t = report.tendencies;
  return (
    <article className="lcc2-card lcc2-card--raised p-5" aria-label="My Draft Report">
      <p className="lcc2-label">My Draft Report · private to you</p>
      <h4 className="mt-1 font-ui text-2xl font-black text-[var(--lcc-color-text)]">{name}</h4>
      <ul className="mt-3 list-disc space-y-1 pl-5">{t.sentences.map((s) => <li key={s} className="lcc2-body text-sm">{s}</li>)}</ul>
      <p className="lcc2-label mt-5 text-xs">You vs the league</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">{report.vsLeague.map((s) => <li key={s} className="lcc2-body text-sm">{s}</li>)}</ul>
      {bothLeagues ? <p className="lcc2-body mt-3 text-sm"><span className="lcc2-badge lcc2-badge--info">Both leagues</span> {bothLeagues.line}</p> : null}
      <p className="lcc2-label mt-5 text-xs">Switch it up</p>
      {report.suggestions.length ? (
        <div className="mt-2 grid gap-3 md:grid-cols-2">{report.suggestions.map((s) => (
          <div key={s.title} className="rounded-lg border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-muted)] p-3"><p className="font-ui text-base font-black text-[var(--lcc-color-text)]">{s.title}</p><p className="lcc2-body mt-1 text-sm">{s.detail}</p></div>
        ))}</div>
      ) : <p className="lcc2-body mt-2 text-sm">Not enough graded picks yet to point at a change.</p>}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <PickList title="Hits" picks={t.hits} empty="No hit seasons yet." />
        <PickList title="Round 1–2 misses (graded)" picks={t.misses} empty="No graded early misses." />
        <PickList title={`Your last ${t.recent.seasons.length} drafts`} picks={t.recent.picks} />
        <PickList title="First pick each year" picks={t.firstPicks} />
      </div>
    </article>
  );
}

function LiveTab({ state }: { state: Load<DraftDayView & { league: string }> }) {
  if (state.kind === "loading") return <p className="lcc2-body">Checking Sleeper for a rookie draft…</p>;
  if (state.kind === "error") return <div className="lcc2-card p-5"><p className="lcc2-body">{state.message}</p></div>;
  const v = state.data;
  if (v.state === "none") return <div className="lcc2-card p-5"><p className="font-ui text-lg font-black text-[var(--lcc-color-text)]">{v.message}</p><p className="lcc2-body mt-2 text-sm">Until then, the Scouting Reports tab shows how every owner drafts.</p></div>;
  if (v.state === "error") return <div className="lcc2-card p-5"><p className="lcc2-body">{v.message}</p></div>;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <div className="lcc2-card lcc2-card--raised p-5">
          <p className="lcc2-label">{v.draft.season} rookie draft · {v.draft.status === "pre_draft" ? "not started" : v.draft.status} · {v.draft.rounds} rounds, {v.draft.type}</p>
          {v.onClock ? <p className="mt-2 font-ui text-2xl font-black text-[var(--lcc-color-text)]">On the clock: {v.onClock.mine ? "You" : v.onClock.label} <span className="text-base">(pick {v.onClock.pick})</span></p> : <p className="lcc2-body mt-2">{v.orderSet ? "The draft hasn't started." : "Sleeper hasn't set the draft order yet."}{v.draft.startTime ? ` Starts ${new Date(v.draft.startTime).toLocaleString()}.` : ""}</p>}
          <p className="lcc2-body mt-2 text-sm">Your picks: {v.myPicks.length ? v.myPicks.map((p) => `${p.slot} (#${p.pick})`).join(", ") : "none left"}</p>
        </div>
        {v.suggestion ? (
          <div className="lcc2-card p-5">
            <p className="lcc2-label">Suggested for your next pick</p>
            <p className="mt-1 font-ui text-xl font-black text-[var(--lcc-color-text)]">{v.suggestion.pick.position} {v.suggestion.pick.name}{v.suggestion.pick.team ? ` · ${v.suggestion.pick.team}` : ""}</p>
            <ul className="mt-2 list-disc pl-5">{v.suggestion.pick.reasons.map((r) => <li key={r} className="lcc2-body text-sm">{r}</li>)}</ul>
            {v.suggestion.alternatives.length ? <p className="lcc2-body mt-2 text-sm">Also: {v.suggestion.alternatives.map((a) => `${a.position} ${a.name} (${a.reasons[0]})`).join("; ")}</p> : null}
          </div>
        ) : null}
        <div className="lcc2-card p-5">
          <p className="lcc2-label">Next picks and what each manager is likely to take</p>
          <ul className="mt-2 space-y-2">{v.upcoming.map((u) => (
            <li key={u.pick} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--lcc-color-border)] pb-2 text-sm">
              <span className="font-ui font-bold text-[var(--lcc-color-text)]">#{u.pick} {u.mine ? "You" : u.label}</span>
              <span className="text-right">{u.mine ? "Your pick" : u.position ? <><strong>{u.position}</strong> <span className="text-xs text-[var(--lcc-color-text-muted)]">{u.reason}</span></> : u.reason}</span>
            </li>
          ))}</ul>
        </div>
        {v.recent.length ? <div className="lcc2-card p-5"><p className="lcc2-label">Latest picks</p><ul className="mt-2 space-y-1">{v.recent.map((p) => <li key={p.pick} className="lcc2-body text-sm">#{p.pick} {p.label}: {p.position} {p.player}</li>)}</ul></div> : null}
      </div>
      <aside className="lcc2-card p-4" aria-label="Available rookies">
        <p className="lcc2-label">Available rookies</p>
        {v.available.length ? <ol className="mt-2 space-y-1">{v.available.map((r) => <li key={r.rank} className="text-sm"><span className="font-bold">{r.rank}.</span> {r.name} <span className="text-xs text-[var(--lcc-color-text-muted)]">{r.position}{r.posRank} {r.team ?? ""}</span></li>)}</ol> : null}
        <p className="lcc2-body mt-3 text-xs">{v.values.note} {v.values.href ? <a href={v.values.href} target="_blank" rel="noreferrer" style={{ color: "var(--lcc-interactive)" }}>Values: {v.values.source}</a> : null}</p>
      </aside>
    </div>
  );
}
