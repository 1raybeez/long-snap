"use client";
/** All-time trade history page (HQ, 2026-10-30): every trade back to the league's first Sleeper season, graded. */
import { useMemo, useState, type CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import type { TradeHistoryItem, TradeHistoryModel, TradeHistorySide, TradeTreeNode } from "./trade-history.ts";

const VERDICTS = ["All", "Fleeced", "Clear win", "Edge", "Even"] as const;
const signed = (n: number, d = 0) => `${n > 0 ? "+" : ""}${n.toFixed(d)}`;

function TreeList({ nodes }: { readonly nodes: readonly TradeTreeNode[] }) {
  return (
    <ul className="th-tree">
      {nodes.map((n) => (
        <li key={n.id}>
          <p className="th-tree-when">{n.season} · Week {n.week} · with {n.partner}</p>
          <p className="th-tree-swap"><span>Sent</span> {n.sent.join(", ")}</p>
          <p className="th-tree-swap"><span>Got</span> {n.got.length ? n.got.join(", ") : "nothing listed"}</p>
          <p className="th-line">{n.line}</p>
          {n.children.length ? <TreeList nodes={n.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

function Tree({ s, kind }: { readonly s: TradeHistorySide; readonly kind: string }) {
  if (!s.tree) return null;
  const t = s.tree.total;
  return (
    <details className="th-tree-box">
      <summary>Trade tree · {s.tree.nodes.length === 1 ? "flipped once" : `flipped ${s.tree.nodes.length} ways`}</summary>
      <TreeList nodes={s.tree.nodes} />
      <p className="th-tree-total">Whole tree ({t.trades} trades): {signed(t.wins)} win{Math.abs(t.wins) === 1 ? "" : "s"}, {signed(t.points, 1)} lineup pts{kind === "dynasty" ? `, ${signed(t.later)} starter pts in later seasons` : ""}</p>
    </details>
  );
}

function TradeCard({ t, kind }: { readonly t: TradeHistoryItem; readonly kind: string }) {
  return (
    <article className="hh-card th-trade">
      <p className="hh-tiny th-when">{t.season} · Week {t.week} · {t.status}{t.weeks ? ` · ${t.weeks} week${t.weeks === 1 ? "" : "s"} counted` : ""}</p>
      <p className="th-verdict"><span className={`th-badge th-${t.label.toLowerCase().replace(/\s+/g, "-")}`}>{t.label}</span>{t.winner ? <b>{t.winner}</b> : null}</p>
      <div className="th-sides">
        {t.sides.map((s, i) => (
          <div key={`${s.name}-${i}`} className={`th-side${s.winner ? " th-side-win" : ""}`}>
            <p className="th-team">{s.name}{s.former ? <span className="th-former">Former owner</span> : null}</p>
            <p className="hh-tiny">Got</p>
            <ul className="th-got">
              {s.got.map((p, j) => <li key={`${p.name}-${j}`}>{p.pos ? <em>{p.pos === "DEF" ? "DST" : p.pos}</em> : null}{p.name}</li>)}
              {s.picks.map((p, j) => <li key={`pk-${p}-${j}`}><em>PICK</em>{p}</li>)}
              {s.faab ? <li><em>FAAB</em>${s.faab}</li> : null}
              {!s.got.length && !s.picks.length && !s.faab ? <li className="th-nothing">Nothing listed</li> : null}
            </ul>
            <p className="th-line">{s.line}</p>
            <Tree s={s} kind={kind} />
          </div>
        ))}
      </div>
    </article>
  );
}

export function TradeHistoryView({ leagueName, model, theme, backLink }: { readonly leagueName: string; readonly model: TradeHistoryModel; readonly theme: LeagueTileTheme; readonly backLink?: { readonly label: string; readonly href: string } | null }) {
  const [team, setTeam] = useState("");
  const [season, setSeason] = useState("");
  const [verdict, setVerdict] = useState<(typeof VERDICTS)[number]>("All");
  const list = useMemo(() => model.trades.filter((t) => (!team || t.sides.some((s) => s.teamId === team)) && (!season || String(t.season) === season) && (verdict === "All" || t.label === verdict)), [model.trades, team, season, verdict]);
  const counts = useMemo(() => { const c: Record<number, number> = {}; for (const t of list) c[t.season] = (c[t.season] ?? 0) + 1; return c; }, [list]);
  const bySeason = useMemo(() => {
    const out: { season: number; trades: TradeHistoryItem[] }[] = [];
    for (const t of list) { const last = out[out.length - 1]; if (last?.season === t.season) last.trades.push(t); else out.push({ season: t.season, trades: [t] }); }
    return out;
  }, [list]);
  const first = model.seasons[model.seasons.length - 1];
  const board = season ? model.boardBySeason?.[season] ?? [] : model.board;
  return (
    <section className="league-tiles hh th" style={themeCssVariables(theme) as CSSProperties}>
      <header className="hh-hero">
        <p className="hh-hero-eyebrow">{leagueName} · League Info</p>
        <h1>Trade History</h1>
        <p>Every trade since {first ?? "the start"}, and how it actually turned out: lineup points gained, games it swung and {model.kind === "dynasty" ? "what each side's haul is worth today" : model.kind === "keeper" ? "keeper value the next season" : "the final result"}.</p>
        {backLink ? <a className="hh-link" href={backLink.href}>{backLink.label}</a> : null}
      </header>

      {model.board.length ? (
        <section className="hh-section" aria-labelledby="th-board-h">
          <div><p className="hh-eyebrow">Leaderboard</p><h2 id="th-board-h" className="py-h2">Trade GMs{season ? ` · ${season} trades` : " · all time"}</h2><p className="hh-note">Current teams{season ? `, trades made in ${season}` : ", all their trades"} (trades under 3 weeks old aren't counted yet). Pick a season below to see one year. Former owners' trades stay in the list under that season's team name.</p></div>
          <div className="hh-card th-board-wrap">
            <table className="th-board">
              <thead><tr><th>#</th><th>Team</th><th>Trades</th><th>Won</th><th>Lost</th><th>Even</th><th title="Games flipped by trades">Wins +/−</th><th title="Lineup points gained the season of the trade">Lineup pts</th>{model.kind === "dynasty" ? <th title="Starter points the deals produced in later seasons">Later pts</th> : null}</tr></thead>
              <tbody>
                {board.map((r, i) => (
                  <tr key={r.teamId}>
                    <td>{i + 1}</td>
                    <td><button type="button" className="th-teamlink" onClick={() => { setTeam(r.teamId); document.getElementById("th-list")?.scrollIntoView({ behavior: "smooth" }); }}>{r.name}</button></td>
                    <td>{r.trades}</td><td>{r.won}</td><td>{r.lost}</td><td>{r.even}</td><td>{signed(r.wins)}</td><td>{signed(r.points, 1)}</td>{model.kind === "dynasty" ? <td>{signed(r.later)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="hh-section" id="th-list" aria-labelledby="th-list-h">
        <div><p className="hh-eyebrow">Every trade</p><h2 id="th-list-h" className="py-h2">{list.length} trade{list.length === 1 ? "" : "s"}</h2></div>
        <div className="th-filters">
          <label>Team <select value={team} onChange={(e) => { setTeam(e.target.value); }}><option value="">All teams</option>{model.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label>Season <select value={season} onChange={(e) => { setSeason(e.target.value); }}><option value="">All seasons</option>{model.seasons.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <div className="th-chips" role="group" aria-label="Verdict">{VERDICTS.map((v) => <button key={v} type="button" aria-pressed={verdict === v} className={verdict === v ? "th-on" : undefined} onClick={() => { setVerdict(v); }}>{v}</button>)}</div>
        </div>
        {bySeason.map((g, i) => (
          <details key={`${g.season}-${season}-${team}-${verdict}`} className="th-season" open={i === 0 || Boolean(season)}>
            <summary><span className="th-year">{g.season}</span><span className="th-count">{counts[g.season] ?? g.trades.length} trade{(counts[g.season] ?? g.trades.length) === 1 ? "" : "s"}</span></summary>
            <div className="th-grid">{g.trades.map((t) => <TradeCard key={t.id} t={t} kind={model.kind} />)}</div>
          </details>
        ))}
        {!list.length ? <p className="hh-note">No trades match.</p> : null}
      </section>

      <footer className="hh-section py-foot">
        <p className="hh-note">How trades are graded: each week for the rest of that season, both teams' lineups are picked the same way (season-to-date averages, no hindsight) with and without the trade, and scored with that week's real points. Lineup points = the difference; wins = games the trade flipped. {model.kind === "dynasty" ? "Later seasons = starter points the deal kept producing in the years after (players, and players drafted with traded picks, while on that roster), minus the same for what went the other way. Value compares what each side received vs. sent at today's dynasty market (picks already used count as the player drafted)." : model.kind === "keeper" ? "Keeper value = points the next season from traded-for players the team kept." : ""} Verdicts: Even, Edge, Clear win, Fleeced (won every category). Regular season only; two-team trades only.</p>
        <p className="hh-note">From Sleeper league history{first ? `, ${first} to now` : ""}. Updated {new Date(model.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}.</p>
      </footer>
    </section>
  );
}
