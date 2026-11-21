"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import type { MyTeamReport, MyTeamPlayer } from "./gm.ts";
import type { WaiverReport, WaiverTarget } from "./waivers.ts";
import type { NewsItem } from "./player-news.ts";
import type { GmPrefs } from "./gm-prefs.ts";

export type GmSection = "my-team" | "waivers" | "trades" | "draft";
export const GM_SECTIONS: readonly { id: GmSection; label: string; href: string }[] = [
  { id: "my-team", label: "My Team", href: "/gm" },
  { id: "waivers", label: "Waivers", href: "/gm/waivers" },
  { id: "trades", label: "Trades", href: "/gm/trades" },
  { id: "draft", label: "Draft Room", href: "/gm/draft" },
];

export function GmFrame({ theme, active, children, basePath = "" }: { readonly theme: LeagueTileTheme; readonly active: GmSection; readonly children: ReactNode; /** Prefix for the GM tab links (the one platform puts each league under /<league>). */ readonly basePath?: string }) {
  return (
    <div className="league-tiles gm" style={themeCssVariables(theme) as CSSProperties}>
      <nav className="gm-nav" aria-label="GM">
        <span className="gm-nav-title">GM <span aria-hidden="true">🔒</span></span>
        {GM_SECTIONS.map((s) => <a key={s.id} href={`${basePath}${s.href}`} aria-current={s.id === active ? "page" : undefined} className={s.id === active ? "gm-on" : undefined}>{s.label}</a>)}
      </nav>
      {children}
    </div>
  );
}

const POS_COLOR: Record<string, string> = { QB: "#FF2A6D", RB: "#00CEB8", WR: "#58A7FF", TE: "#FFAE58", K: "#BD66FF", DEF: "#7988A1", FLEX: "#9aa5b8", SUPER_FLEX: "#9aa5b8" };
const FALLBACK = "https://sleepercdn.com/images/v2/icons/player_default.webp";
const photo = (p: MyTeamPlayer) => (p.pos === "DEF" ? `https://sleepercdn.com/images/team_logos/nfl/${String(p.nflTeam ?? p.id).toLowerCase()}.png` : `https://sleepercdn.com/content/nfl/players/thumb/${p.id}.jpg`);
const slotLabel = (s: string) => (s === "DEF" ? "DST" : s === "SUPER_FLEX" ? "SF" : s === "FLEX" ? "FLX" : s);

function Who({ p, sub }: { readonly p: MyTeamPlayer; readonly sub?: string }) {
  return (
    <span className="gm-who">
      <img src={photo(p)} alt="" loading="lazy" onError={(e) => { e.currentTarget.src = FALLBACK; }} />
      <span><b>{p.name}</b><em>{p.nflTeam ?? "FA"}{p.injury ? <strong className="ta-inj"> {p.injury}</strong> : null}{sub ? ` · ${sub}` : ""}</em></span>
    </span>
  );
}

interface Ctx { ok: true; leagueName: string; myTeamId: string | null; teams: { id: string; name: string; owner: string | null }[]; format?: string }

export function GmMyTeamView({ apiBase, theme, loginHref, tradesHref = "/gm/trades" }: { readonly apiBase: string; readonly theme: LeagueTileTheme; readonly loginHref: string; readonly tradesHref?: string }) {
  const [state, setState] = useState<"loading" | "signin" | "error" | "pick" | "ready">("loading");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [teamId, setTeamId] = useState("");
  const [report, setReport] = useState<MyTeamReport | null>(null);

  useEffect(() => {
    fetch(apiBase, { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) { setState("signin"); return; }
      const j = (await r.json()) as Ctx;
      if (!r.ok || !j.ok) { setState("error"); return; }
      setCtx(j);
      if (j.myTeamId) setTeamId(j.myTeamId); else setState("pick");
    }).catch(() => setState("error"));
  }, [apiBase]);

  useEffect(() => {
    if (!teamId) return;
    fetch(apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "myteam", me: teamId }) })
      .then(async (r) => { const j = await r.json(); if (!r.ok || !j.ok) throw new Error(); setReport(j.report); setState("ready"); })
      .catch(() => setState("error"));
  }, [apiBase, teamId]);

  const wrap = (body: ReactNode) => <section className="ta gm-page">{body}</section>;
  if (state === "signin") return wrap(<article className="ta-card ta-center"><p className="ta-kicker">Members only</p><h2 className="ta-h2">Sign in to see your GM page</h2><p className="ta-note">Your team, your moves. Private to you.</p><a className="ta-btn" href={loginHref}>League member login</a></article>);
  if (state === "error") return wrap(<article className="ta-card"><p className="ta-note">Your team&apos;s data is unavailable right now. Try again in a few minutes.</p></article>);
  if (state === "pick" && ctx) return wrap(
    <article className="ta-card">
      <p className="ta-kicker">My Team</p>
      <label className="ta-label" htmlFor="gm-team">Which team is yours?</label>
      <select id="gm-team" className="ta-select" value={teamId} onChange={(e) => { setState("loading"); setTeamId(e.target.value); }}>
        <option value="">Choose your team…</option>
        {ctx.teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.owner ? ` · ${t.owner}` : ""}</option>)}
      </select>
    </article>,
  );
  if (state === "loading" || !report) return wrap(<p className="ta-note">Loading your team…</p>);

  const weak = report.weakSpots.filter((w) => w.level === "weak");
  const real = report.sleeper.moves.filter((m) => !m.tossUp);
  const tossUps = report.sleeper.moves.filter((m) => m.tossUp);
  return wrap(
    <>
      <header className="ta-hero">
        <div>
          <p className="ta-hero-kicker">{ctx?.leagueName} · GM</p>
          <h1 className="ta-hero-title">My Team</h1>
          <p className="ta-hero-sub">{report.team.name}{report.team.record ? ` · ${report.team.record}` : ""}. What to start, where you&apos;re thin, and who to cut.</p>
        </div>
        <div className="ta-hero-meta">{report.week ? <span>Week {report.week} projections · Sleeper</span> : <span>No games left this season</span>}<span>Rest of season: {report.weeksLabel}</span></div>
      </header>

      {teamId ? <GmTodoCard apiBase={apiBase} teamId={teamId} tradesHref={tradesHref} /> : null}

      {report.week ? (
        <article className={`ta-call ta-call-${report.sleeper.set && real.length ? "mid" : "go"}`}>
          <div>
            <p className="ta-kicker">Start / Sit · Week {report.week}</p>
            <p className="ta-call-v">{!report.sleeper.set ? "Set your lineup" : real.length ? `${real.length} change${real.length > 1 ? "s" : ""} to make` : "Your lineup is set"}</p>
            {real.length ? (
              <ul className="gm-moves">
                {real.map((m, i) => <li key={i}>Start <b>{m.start.name}</b>{m.sit ? <> over <b>{m.sit.name}</b></> : null} <span className="ta-good">+{m.gain.toFixed(1)}</span></li>)}
              </ul>
            ) : <p className="ta-call-h">{report.sleeper.set ? (tossUps.length ? "Nothing the projections clearly disagree with." : "Your Sleeper lineup already matches the best projected lineup.") : "We couldn't read your Sleeper lineup; here's the best one."}</p>}
            {tossUps.length ? <><p className="ta-kicker gm-toss-h">Toss-ups · your call</p><ul className="gm-moves gm-toss">{tossUps.map((m, i) => <li key={i}><b>{m.start.name}</b> vs. <b>{m.sit?.name}</b> <span className="ta-mid">{m.gain.toFixed(1)} pts apart</span></li>)}</ul><p className="ta-src">Under 1.5 projected points apart is too close for projections to call. Go with your read on news and matchups.</p></> : null}
            {report.alerts.map((a, i) => <p key={i} className="ta-warn">{a}</p>)}
          </div>
          <div className="ta-call-n"><b>{report.total.toFixed(1)}</b><span>best projected{report.sleeper.total !== null ? ` · yours ${report.sleeper.total.toFixed(1)}` : ""}</span></div>
        </article>
      ) : null}

      <div className="gm-grid">
        {report.week ? (
          <article className="ta-card">
            <p className="ta-kicker">Best lineup · Week {report.week}</p>
            <ul className="gm-lineup">
              {report.lineup.map((l, i) => {

                const toss = l.inSleeper === false && l.player ? tossUps.find((m) => m.start.id === l.player!.id) : undefined;
                return (
                <li key={i} className={l.inSleeper === false && !toss ? "gm-change" : undefined}>
                  <span className="ta-pos" style={{ background: POS_COLOR[l.slot] ?? "#9aa5b8" }}>{slotLabel(l.slot)}</span>
                  {l.player ? <Who p={l.player} /> : <span className="gm-empty">Empty</span>}
                  <span className="gm-pts">{l.pts.toFixed(1)}</span>
                  <span className="gm-alt">{l.alt ? <>{l.close ? <b className="ta-mid">Close: </b> : "Next: "}{l.alt.player.name} {l.alt.pts.toFixed(1)}</> : null}{toss ? <b className="gm-badge gm-badge--ok">You started {toss.sit?.name ?? "someone else"} · toss-up, your call</b> : l.inSleeper === false ? <b className="gm-badge">Not in your lineup</b> : null}</span>
                </li>
                );
              })}
            </ul>
            <p className="ta-src">Projections: Sleeper, re-scored for {ctx?.leagueName}. &ldquo;Close&rdquo; = your best bench option is within 1.5 points.</p>
          </article>
        ) : null}

        <div className="gm-stack">
        <article className="ta-card">
          <p className="ta-kicker">Where you stand · rest of season</p>
          <ul className="gm-spots">
            {report.weakSpots.map((w) => (
              <li key={w.group}>
                <span className="ta-pos" style={{ background: POS_COLOR[w.group] ?? "#9aa5b8" }}>{slotLabel(w.group)}</span>
                <span className="gm-rank"><b>{w.rank}</b> of {w.of}</span>
                <span className="gm-meter" aria-hidden="true"><span style={{ width: `${Math.round(((w.of - w.rank + 1) / w.of) * 100)}%` }} className={`gm-meter-${w.level}`} /></span>
                <span className="gm-spot-note">{w.avg.toFixed(1)} a week · league {w.leagueAvg.toFixed(1)}</span>
              </li>
            ))}
          </ul>
          {weak.length ? (
            <p className="ta-p">Weakest: <b>{weak.map((w) => slotLabel(w.group)).join(", ")}</b>. <a href={`${tradesHref}?tab=targets&pos=${weak.filter((w) => !["FLEX", "SUPER_FLEX"].includes(w.group)).map((w) => w.group).join(",") || "RB,WR,TE"}`}>Find a trade upgrade</a>.</p>
          ) : <p className="ta-p">No starting spot in the bottom third of the league.</p>}
        </article>

        <article className="ta-card">
          <p className="ta-kicker">Drop candidates</p>
          {report.drops.length ? (
            <ul className="gm-drops">{report.drops.map((d) => <li key={d.player.id}><Who p={d.player} /><span>{d.reason}</span></li>)}</ul>
          ) : <p className="ta-p">No obvious cuts.</p>}
          <p className="ta-src">{ctx?.format === "dynasty" ? "Taxi players and players 23 and younger are never suggested." : "Bench players ranked by rest-of-season points and trade value."} Starters and IR aren&apos;t included.</p>
        </article>
        </div>

        {report.news?.length ? (
          <article className="ta-card">
            <p className="ta-kicker">News on your team</p>
            <ul className="gm-drops">{report.news.map((n) => <li key={n.player.id}><Who p={n.player} /><span><NewsLines news={n.items} status={n.status} fresh={n.fresh} />{!n.items.length && !n.status ? "No recent news." : null}</span></li>)}</ul>
            <p className="ta-src">Sleeper injury and practice status, ESPN player news and Pro Football Rumors, last 3 days.</p>
          </article>
        ) : null}
      </div>
      <p className="ta-foot">Private to you. Nothing here changes your Sleeper lineup; make moves in Sleeper.</p>
    </>,
  );
}

export function GmComingSoon({ title, lines }: { readonly title: string; readonly lines: readonly string[] }) {
  return (
    <section className="ta gm-page">
      <article className="ta-card">
        <p className="ta-kicker">Coming next</p>
        <h2 className="ta-h2">{title}</h2>
        {lines.map((l, i) => <p key={i} className="ta-p">{l}</p>)}
      </article>
    </section>
  );
}

export function GmDraftRoom({ links }: { readonly links: readonly { label: string; href: string; note: string }[] }) {
  return (
    <section className="ta gm-page">
      <article className="ta-card">
        <p className="ta-kicker">Draft Room</p>
        <h2 className="ta-h2">Everything for draft day</h2>
        <ul className="gm-links">{links.map((l) => <li key={l.href}><a href={l.href}><b>{l.label}</b><span>{l.note}</span></a></li>)}</ul>
      </article>
    </section>
  );
}

function useGmTeam(apiBase: string) {
  const [state, setState] = useState<"loading" | "signin" | "error" | "pick" | "ready">("loading");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [teamId, setTeamId] = useState("");
  useEffect(() => {
    fetch(apiBase, { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) { setState("signin"); return; }
      const j = (await r.json()) as Ctx;
      if (!r.ok || !j.ok) { setState("error"); return; }
      setCtx(j);
      if (j.myTeamId) setTeamId(j.myTeamId); else setState("pick");
    }).catch(() => setState("error"));
  }, [apiBase]);
  return { state, setState, ctx, teamId, setTeamId };
}

const usageLine = (t: WaiverTarget) => {
  const u = t.usage;
  if (!u.games) return "No snaps in the last three weeks.";
  const bits = [u.snapPct !== null && t.player.pos !== "K" && t.player.pos !== "DEF" ? `${u.snapPct}% of snaps` : null, u.touches !== null ? `${u.touches} touches a game` : null, u.targets !== null ? `${u.targets} targets a game` : null, u.ptsAvg !== null ? `${u.ptsAvg.toFixed(1)} pts a game` : null].filter(Boolean);
  return `Last ${u.games} game${u.games > 1 ? "s" : ""}: ${bits.join(" · ")}`;
};
const adds = (n: number) => (n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

const ago = (at: number) => { const h = Math.max(0, Math.round((Date.now() - at) / 3600000)); return h < 1 ? "just now" : h < 24 ? `${h} hr${h > 1 ? "s" : ""} ago` : `${Math.round(h / 24)} day${h >= 36 ? "s" : ""} ago`; };

function NewsLines({ news, status, fresh }: { readonly news: readonly NewsItem[]; readonly status: string | null; readonly fresh?: boolean }) {
  if (!news.length && !status) return null;
  return (
    <div className="gm-news">
      {status ? <p className="gm-news-status">{fresh ? <b className="gm-news-new">🔔 News</b> : null} {status}</p> : fresh ? <p className="gm-news-status"><b className="gm-news-new">🔔 News</b></p> : null}
      {news.map((n, i) => <p key={i} className="gm-news-item">{n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.headline}</a> : n.headline} <em>{n.source} · {ago(n.at)}</em></p>)}
    </div>
  );
}

function TargetCard({ t, week, onHide }: { readonly t: WaiverTarget; readonly week: number | null; readonly onHide?: (id: string) => void }) {
  const p: MyTeamPlayer = { id: t.player.id, name: t.player.name, pos: t.player.pos, nflTeam: t.player.nflTeam, injury: t.player.injury, tag: null };
  return (
    <article className="ta-card gm-wv">
      <div className="gm-wv-top">
        <span className="ta-pos" style={{ background: POS_COLOR[t.player.pos] ?? "#9aa5b8" }}>{slotLabel(t.player.pos)}</span>
        <Who p={p} sub={t.player.age ? `${Math.floor(t.player.age)} yrs` : undefined} />
        {t.bid ? <span className={`gm-wv-tier gm-wv-t-${t.bid.tier.split(" ")[0].toLowerCase()}`}>{t.bid.tier}</span> : null}
      </div>
      <div className="gm-wv-grid">
        <div><b>{t.thisWeek.toFixed(1)}</b><span>Week {week ?? "–"} projection</span></div>
        <div><b>{t.restAvg.toFixed(1)}</b><span>a week, rest of season</span></div>
        <div><b className={t.gainNow > 0 ? "ta-good" : undefined}>{t.gainNow > 0 ? `+${t.gainNow.toFixed(1)}` : "0"}</b><span>your lineup this week{t.fills ? ` (starts at ${slotLabel(t.fills)})` : ""}</span></div>
        <div><b className={t.gainRest > 0 ? "ta-good" : undefined}>{t.gainRest > 0 ? `+${t.gainRest.toFixed(1)}` : "0"}</b><span>rest of season</span></div>
      </div>
      <p className="ta-src">{usageLine(t)}{t.trendingAdds ? ` · 🔥 ${adds(t.trendingAdds)} Sleeper adds in 48 hrs` : ""}</p>
      <NewsLines news={t.news} status={t.status} fresh={t.freshNews} />
      {t.bid ? (
        <div className="gm-wv-bid">
          <div className="gm-wv-amt"><span>Suggested bid</span><b>${t.bid.amount}</b><em>range ${t.bid.low}–${t.bid.high}</em></div>
          <ul>{t.bid.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      ) : null}
      <p className="ta-p">{t.drop ? <>Drop: <b>{t.drop.name}</b> ({t.drop.pos})</> : "No drop needed if you have an open roster spot."}{t.keeperNote ? <> · {t.keeperNote}</> : null}</p>
      {onHide ? <button type="button" className="gm-notforme" onClick={() => onHide(t.player.id)}>Not for me</button> : null}
    </article>
  );
}

export function GmWaiversView({ apiBase, loginHref }: { readonly apiBase: string; readonly theme?: LeagueTileTheme; readonly loginHref: string }) {
  const { state, setState, ctx, teamId, setTeamId } = useGmTeam(apiBase);
  const [report, setReport] = useState<WaiverReport | null>(null);
  const [reload, setReload] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!teamId) return;
    fetch(apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "waivers", me: teamId }) })
      .then(async (r) => { const j = await r.json(); if (!r.ok || !j.ok) throw new Error(); setReport(j.report); setState("ready"); })
      .catch(() => setState("error"));
  }, [apiBase, teamId, setState, reload]);
  const mineTeam = Boolean(ctx?.myTeamId && ctx.myTeamId === teamId);
  const post = (body: Record<string, unknown>) => fetch(apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error ?? "Couldn't save."); return j; });
  const hide = (id: string) => { setReport((r) => (r ? { ...r, targets: r.targets.filter((t) => t.player.id !== id), hot: r.hot.filter((t) => t.player.id !== id) } : r)); post({ mode: "notforme", playerId: id }).then(() => setNote("Got it. That player won't be suggested again (undo in My GM style).")).catch((e: Error) => setNote(e.message)); };
  const saveStyle = (prefs: Partial<GmPrefs>) => post({ mode: "gmprefs", prefs }).then(() => { setNote("Saved. Suggestions updated."); setReload((n) => n + 1); }).catch((e: Error) => setNote(e.message));

  const wrap = (body: ReactNode) => <section className="ta gm-page">{body}</section>;
  if (state === "signin") return wrap(<article className="ta-card ta-center"><p className="ta-kicker">Members only</p><h2 className="ta-h2">Sign in to see your waiver plan</h2><p className="ta-note">Your targets and bids. Private to you.</p><a className="ta-btn" href={loginHref}>League member login</a></article>);
  if (state === "error") return wrap(<article className="ta-card"><p className="ta-note">Waiver data is unavailable right now. Try again in a few minutes.</p></article>);
  if (state === "pick" && ctx) return wrap(
    <article className="ta-card">
      <p className="ta-kicker">Waivers</p>
      <label className="ta-label" htmlFor="gm-wv-team">Which team is yours?</label>
      <select id="gm-wv-team" className="ta-select" value={teamId} onChange={(e) => { setState("loading"); setTeamId(e.target.value); }}>
        <option value="">Choose your team…</option>
        {ctx.teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.owner ? ` · ${t.owner}` : ""}</option>)}
      </select>
    </article>,
  );
  if (state === "loading" || !report) return wrap(<p className="ta-note">Scanning the waiver wire…</p>);
  const r = report;
  return wrap(
    <>
      <header className="ta-hero">
        <div>
          <p className="ta-hero-kicker">{ctx?.leagueName} · GM</p>
          <h1 className="ta-hero-title">Waivers</h1>
          <p className="ta-hero-sub">{r.team.name}. Who to claim before waivers run, who to drop, and what to bid.</p>
        </div>
        <div className="ta-hero-meta">
          {r.faabWaivers && r.team.faab !== null ? <span>Your FAAB: <b>${r.team.faab}</b> of ${r.budget}</span> : <span>Rolling waivers (no FAAB)</span>}
          {r.processes ? <span>Claims usually process {r.processes}</span> : null}
          <span>{r.weeksLeft} regular-season week{r.weeksLeft === 1 ? "" : "s"} left</span>
        </div>
      </header>

      <StylePanel style={r.style} editable={mineTeam} format={ctx?.format} onSave={saveStyle} />
      {note ? <p className="ta-note gm-saved">{note}</p> : null}
      {r.needs.length ? <article className="ta-call ta-call-mid"><div><p className="ta-kicker">Holes this week</p>{r.needs.map((n, i) => <p key={i} className="ta-warn">{n}</p>)}</div></article> : null}

      <h2 className="gm-h2">Best pickups for you</h2>
      {r.targets.length ? <div className="gm-wv-list">{r.targets.map((t) => <TargetCard key={t.player.id} t={t} week={r.week} onHide={mineTeam ? hide : undefined} />)}</div>
        : <p className="ta-card ta-note">Nobody on the wire would start for you right now. Your starters beat every free agent&apos;s projection; check the hot list below for news-driven adds.</p>}

      {r.hot.length ? <>
        <h2 className="gm-h2">Hot right now 🔥 · would help you</h2>
        <p className="ta-note">Free agents Sleeper users are adding fastest that would also start for you. Fast adds usually mean injury or role news the projections haven&apos;t caught up to; check the headline.</p>
        <div className="gm-wv-list">{r.hot.map((t) => <TargetCard key={t.player.id} t={t} week={r.week} onHide={mineTeam ? hide : undefined} />)}</div>
      </> : null}

      <h2 className="gm-h2">Better than your bench</h2>
      {r.benchUpgrades.length ? <div className="ta-card"><ul className="gm-drops gm-bench">{r.benchUpgrades.map((u) => (
        <li key={u.add.id}>
          <span className="gm-swap"><Who p={{ ...u.add, tag: null }} sub={`${u.addAvg.toFixed(1)} a week`} /><span className="gm-swap-arrow">for</span><Who p={{ ...u.cut, tag: null }} sub={`${u.cutAvg.toFixed(1)} a week`} /></span>
          <span>{u.why}{u.bid !== null ? ` Bid about $${u.bid}.` : ""}<NewsLines news={u.news} status={u.status} /></span>
        </li>))}</ul></div>
        : <p className="ta-card ta-note">No free agent is clearly better (1+ point a week) than anyone on your bench at the same position.</p>}

      {r.cuts.length ? <>
        <h2 className="gm-h2">Players you could let go</h2>
        <div className="ta-card"><ul className="gm-drops">{r.cuts.map((c) => <li key={c.player.id}><Who p={{ ...c.player, tag: null }} /><span>{c.reason}</span></li>)}</ul>
        <p className="ta-src">{ctx?.format === "dynasty" ? "Taxi players and players 23 and younger are never listed." : "Starters and IR aren't listed."} Players you mark &ldquo;never drop&rdquo; are skipped.</p></div>
      </> : null}

      {r.buzz.length ? <>
        <h2 className="gm-h2">League buzz · not for you</h2>
        <div className="ta-card"><ul className="gm-drops">{r.buzz.map((b) => <li key={b.player.id}><Who p={{ ...b.player, tag: null }} sub={`🔥 ${adds(b.adds)} adds`} /><span>{b.why} {b.restAvg.toFixed(1)} projected a week.<NewsLines news={b.news} status={null} /></span></li>)}</ul></div>
      </> : null}

      {r.stashes.length ? <>
        <h2 className="gm-h2">Dynasty stashes</h2>
        <div className="ta-card"><ul className="gm-drops">{r.stashes.map((s) => <li key={s.player.id}><Who p={{ ...s.player, tag: null }} /><span>{s.note} {s.restAvg.toFixed(1)} projected a week now.{r.faabWaivers ? ` Bid $${s.bid}.` : ""}</span></li>)}</ul></div>
      </> : null}

      <div className="gm-grid">
        {r.faabWaivers ? (
          <article className="ta-card">
            <p className="ta-kicker">This league&apos;s FAAB market</p>
            <p className="ta-p">{r.market.claims} winning bids this season. Median <b>${r.market.median ?? 0}</b>, top quarter <b>${r.market.p75 ?? 0}</b> and up.{r.market.max ? <> Biggest: <b>${r.market.max.amount}</b> for {r.market.max.player} ({r.market.max.team}).</> : null}</p>
            {r.market.byPos.length ? <ul className="gm-wv-pos">{r.market.byPos.map((x) => <li key={x.pos}><span className="ta-pos" style={{ background: POS_COLOR[x.pos] ?? "#9aa5b8" }}>{slotLabel(x.pos)}</span> median ${x.median} <em>({x.n})</em></li>)}</ul> : null}
          </article>
        ) : null}
        {r.faabWaivers ? (
          <article className="ta-card">
            <p className="ta-kicker">FAAB left, every team</p>
            <table className="gm-wv-table"><tbody>{r.faabTable.map((x) => <tr key={x.team} className={x.mine ? "gm-wv-me" : undefined}><td>{x.team}</td><td>${x.left ?? "–"}</td></tr>)}</tbody></table>
          </article>
        ) : null}
      </div>
      <p className="ta-foot">Private to you. Projections: Sleeper, re-scored for {ctx?.leagueName}. Workload: Sleeper weekly stats. News: Sleeper player status, ESPN player news and Pro Football Rumors (headlines link to the source). Hot list: Sleeper trending adds. Bids are suggestions from this league&apos;s own winning bids; make your claims in Sleeper.</p>
    </>,
  );
}

function StylePanel({ style, editable, format, onSave }: { readonly style: WaiverReport["style"]; readonly editable: boolean; readonly format?: string; readonly onSave: (p: Partial<GmPrefs>) => void }) {
  const [open, setOpen] = useState(false);
  const p = style.prefs;
  const pick = <K extends keyof GmPrefs>(k: K, v: GmPrefs[K]) => onSave({ [k]: v } as Partial<GmPrefs>);
  return (
    <details className="ta-card gm-style" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><span className="ta-kicker">My GM style</span> <span className="gm-style-sum">{style.notes[0]}</span></summary>
      <ul className="gm-style-notes">{style.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      {editable ? (
        <div className="gm-style-form">
          {format === "dynasty" ? <label>Team plan<select value={p.strategy} onChange={(e) => pick("strategy", e.target.value as GmPrefs["strategy"])}><option value="now">Win now</option><option value="balanced">Balanced</option><option value="later">Build for later</option></select></label> : null}
          <label>Kickers &amp; defenses<select value={p.streamKD} onChange={(e) => pick("streamKD", e.target.value as GmPrefs["streamKD"])}><option value="auto">Learn from my moves{style.streamsSource === "your Sleeper moves" ? ` (${style.streamsKD ? "streamer" : "holder"})` : ""}</option><option value="yes">I stream them weekly</option><option value="no">I hold mine</option></select></label>
          <label>Bidding<select value={p.bidStyle} onChange={(e) => pick("bidStyle", e.target.value as GmPrefs["bidStyle"])}><option value="light">Light</option><option value="normal">Normal</option><option value="aggressive">Aggressive</option></select></label>
          {p.hidden.length ? <p className="ta-src">{p.hidden.length} hidden player{p.hidden.length > 1 ? "s" : ""}. <button type="button" className="gm-notforme" onClick={() => onSave({ hidden: [] })}>Show them again</button></p> : null}
        </div>
      ) : <p className="ta-src">Only the team&apos;s owner can change these.</p>}
    </details>
  );
}

interface GmTodoUi { kind: string; urgent: boolean; title: string; detail: string; page: "my-team" | "waivers" | "trades" }

function GmTodoCard({ apiBase, teamId, tradesHref }: { readonly apiBase: string; readonly teamId: string; readonly tradesHref: string }) {
  const [todo, setTodo] = useState<GmTodoUi[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "brief", me: teamId }) })
      .then(async (r) => { const j = await r.json(); if (live && r.ok && j.ok) setTodo(j.brief.todo as GmTodoUi[]); })
      .catch(() => { /* the card just stays hidden */ });
    return () => { live = false; };
  }, [apiBase, teamId]);
  if (!todo || !todo.length) return null;
  const href = (page: GmTodoUi["page"]) => (page === "trades" ? tradesHref : page === "waivers" ? tradesHref.replace(/\/trades$/, "/waivers") : null);
  return (
    <article className="ta-card gm-todo">
      <p className="ta-kicker">My GM · this week&apos;s to-do</p>
      <ul className="gm-todo-list">
        {todo.map((t, i) => {
          const link = href(t.page);
          return (
            <li key={i} className={t.urgent ? "gm-todo-urgent" : undefined}>
              <b>{t.title}</b>
              <span>{t.detail}</span>
              {link ? <a href={link}>{t.page === "waivers" ? "Open Waivers" : "Open Trades"} →</a> : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
