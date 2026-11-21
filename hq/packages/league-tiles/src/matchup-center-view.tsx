import type { CSSProperties } from "react";
import { SHOW_BANNER, hostAvatarsFor, showByline, showInline, showParagraphs } from "./show-text.tsx";
import type { TileLink } from "./contract.ts";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import type { MatchupCard, MatchupPlayer, MatchupSide, MatchupStatus, PreviewEpisode } from "./matchup-center.ts";
import { MatchupRefresh } from "./matchup-refresh.tsx";

export interface MatchupCenterViewModel {
  readonly leagueName: string;
  readonly season: number;
  readonly week: number;
  readonly seasons: readonly number[];
  readonly weeks: readonly number[];
  readonly defaultSeason: number;
  readonly defaultWeek: number;
  readonly basePath: string;
  readonly status: MatchupStatus | null;
  readonly cards: readonly MatchupCard[];
  readonly notes?: readonly string[];
  readonly emptyText?: string;
  readonly links?: readonly TileLink[];
  /** Story-style preview episode (title, intro, rankings, spotlight, signoff) around the game sections. */
  readonly episode?: PreviewEpisode | null;
}

const STATUS: Record<MatchupStatus, string> = { FINAL: "Final", LIVE: "Live", UPCOMING: "Upcoming" };
const CONFIDENCE: Record<string, string> = { lean: "Lean", solid: "Solid", lock: "Lock" };

function Avatar({ side }: { readonly side: MatchupSide }) {
  const initials = side.teamName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return side.avatar ? <img className="mc-avatar" src={side.avatar} alt="" width={48} height={48} loading="lazy" /> : <span className="mc-avatar mc-avatar-fallback" aria-hidden="true">{initials}</span>;
}

function Players({ players, scored }: { readonly players: readonly MatchupPlayer[]; readonly scored: boolean }) {
  return <ul className="mc-players">{players.map((p, i) => <li key={`${p.id}-${i}`}>
    {p.photo ? <img src={p.photo} alt="" width={34} height={34} loading="lazy" /> : <span className="mc-ph" aria-hidden="true" />}
    <span className="mc-pname"><b>{p.name}</b><small>{[p.position, p.team].filter(Boolean).join(" · ")}</small></span>
    <span className="mc-ppts">{scored && p.points !== null ? p.points.toFixed(2) : "—"}</span>
  </li>)}</ul>;
}

function Lineup({ side, scored }: { readonly side: MatchupSide; readonly scored: boolean }) {
  return <div className="mc-lineup">
    <p className="mc-lineup-title">{side.teamName}</p>
    <p className="hh-tiny">Starters</p>
    {side.starters.length ? <Players players={side.starters} scored={scored} /> : <p className="hh-note">Lineup not set yet.</p>}
    {side.bench.length ? <details className="mc-bench"><summary>Bench ({side.bench.length})</summary><Players players={side.bench} scored={scored} /></details> : null}
  </div>;
}

function Card({ card, week }: { readonly card: MatchupCard; readonly week: number }) {
  const scored = card.status !== "UPCOMING";
  const winner = card.status === "FINAL" && card.a.score !== null && card.b.score !== null && card.a.score !== card.b.score ? (card.a.score > card.b.score ? "a" : "b") : null;
  const pick = card.written?.pickRosterId === card.a.rosterId ? card.a : card.written?.pickRosterId === card.b.rosterId ? card.b : null;
  return (
    <article className={`mc-card mc-${card.status.toLowerCase()}`}>
      <header className="mc-top"><span className="mc-kicker">Week {week}{card.label ? ` · ${card.label}` : ""}</span><span className={`mc-pill mc-pill-${card.status.toLowerCase()}`}>{STATUS[card.status]}</span></header>
      <div className="mc-score">
        {(["a", "b"] as const).map((k) => { const s = card[k]; return <div key={k} className={`mc-side mc-side-${k}${winner === k ? " mc-win" : ""}`}>
          <Avatar side={s} />
          <div className="mc-team"><p className="mc-name">{s.teamName}</p><p className="mc-owners">{s.owners}{s.record ? ` · ${s.record}` : ""}</p></div>
          <p className="mc-points">{s.score === null ? "—" : s.score.toFixed(2)}</p>
        </div>; })}
        <span className="mc-vs" aria-hidden="true">vs</span>
      </div>
      {card.written ? <div className="mc-written">
        <p className="hh-eyebrow mc-written-by">{hostAvatarsFor(card.written.author).map((src) => <img key={src} className="show-avatar" src={src} alt="" width={28} height={28} />)}{showByline(card.written.author).isShow ? <>Unnecessary Roughness &middot; preview</> : <>{showByline(card.written.author).name}&apos;s preview</>}</p>
        <p className="mc-written-head">{card.written.headline}</p>
        {card.written.tags.length ? <p className="mc-tags">{card.written.tags.map((t) => <span key={t} className="mc-tag">{t}</span>)}</p> : null}
        {showParagraphs(card.written.preview)}
        {card.written.lineupWatch.length ? <div className="mc-watch"><p className="mc-watch-h">Lineup watch</p><ul>{card.written.lineupWatch.map((w) => <li key={w}>{showInline(w)}</li>)}</ul></div> : null}
        {card.written.predicted.length === 2 ? <p className="mc-predicted">Predicted score: {card.written.predicted.map((p) => `${p.rosterId === card.a.rosterId ? card.a.teamName : card.b.teamName} ${p.points}`).join(" — ")}</p> : null}
        {pick ? <p className="mc-pick">Pick: <b>{pick.teamName}</b>{card.written.confidence ? ` · ${CONFIDENCE[card.written.confidence] ?? card.written.confidence}` : ""}</p> : null}
      </div> : card.auto ? <p className="mc-summary">{card.auto.summary}</p> : null}
      <details className="mc-detail">
        <summary>Show matchup detail</summary>
        {card.auto ? <div className="mc-preview">
          <p className="hh-tiny">Preview (auto-generated from league data)</p>
          <div className="mc-odds" role="img" aria-label={`${card.a.teamName} ${card.auto.aWinPct}%, ${card.b.teamName} ${card.auto.bWinPct}%`}>
            <span style={{ width: `${card.auto.aWinPct}%` }}>{card.a.teamName} {card.auto.aWinPct}%</span>
            <span style={{ width: `${card.auto.bWinPct}%` }}>{card.auto.bWinPct}% {card.b.teamName}</span>
          </div>
          <p>{card.auto.text}</p>
        </div> : null}
        <div className="mc-lineups"><Lineup side={card.a} scored={scored} /><Lineup side={card.b} scored={scored} /></div>
        {card.h2hHref ? <a className="hh-link" href={card.h2hHref}>Head-to-head history →</a> : null}
      </details>
    </article>
  );
}

function Episode({ episode }: { readonly episode: PreviewEpisode }) {
  return (
    <section className="hh-card ur-episode" aria-labelledby="ur-episode-h">
      <p className="hh-eyebrow mc-written-by">{hostAvatarsFor(episode.author).map((src) => <img key={src} className="show-avatar" src={src} alt="" width={28} height={28} />)}Unnecessary Roughness &middot; this week&apos;s episode</p>
      <h2 id="ur-episode-h" className="ur-title">{episode.title}</h2>
      {showParagraphs(episode.intro)}
      {episode.rankings.length ? <details className="ur-rankings" open>
        <summary>Power rankings</summary>
        <table><thead><tr><th>#</th><th>Team</th><th>Record</th><th>PF</th><th>Last 3 avg</th><th>Streak</th></tr></thead>
          <tbody>{episode.rankings.map((r) => <tr key={r.team}><td>{r.rank}</td><td>{r.team}</td><td>{r.record}</td><td>{r.pf.toFixed(2)}</td><td>{r.last3 === null ? "—" : r.last3.toFixed(1)}</td><td>{r.streak ?? "—"}</td></tr>)}</tbody>
        </table>
      </details> : null}
      {episode.spotlight.length ? <div className="ur-spotlight"><p className="mc-watch-h">Spotlight</p><ul>{episode.spotlight.map((x) => <li key={x.label}><b>{x.label}:</b> {showInline(x.text)}</li>)}</ul></div> : null}
    </section>
  );
}

export function MatchupCenter({ model, theme }: { readonly model: MatchupCenterViewModel; readonly theme: LeagueTileTheme }) {
  const q = (season: number, week: number) => `${model.basePath}?season=${season}&week=${week}`;
  const i = model.weeks.indexOf(model.week);
  const prev = i > 0 ? model.weeks[i - 1] : null, next = i >= 0 && i < model.weeks.length - 1 ? model.weeks[i + 1] : null;
  const isDefault = model.season === model.defaultSeason && model.week === model.defaultWeek;
  return (
    <section className="league-tiles hh mc" style={themeCssVariables(theme) as CSSProperties}>
      {model.status === "LIVE" ? <MatchupRefresh /> : null}
      {model.episode ? <img className="ur-banner" src={SHOW_BANNER} alt="Unnecessary Roughness: Four personalities. Zero filter." width={1400} height={788} /> : null}
      <header className="hh-hero">
        <p className="hh-hero-eyebrow">{model.leagueName} · Matchups</p>
        <h1>{model.season} Week {model.week}</h1>
        <p>{model.status ? `${STATUS[model.status]}${isDefault ? " · this week" : ""}` : "No games on record for this week."}</p>
      </header>
      <form className="mc-picker" method="get" action={model.basePath}>
        <label>Season<select name="season" defaultValue={String(model.season)}>{model.seasons.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label>Week<select name="week" defaultValue={String(model.week)}>{model.weeks.map((w) => <option key={w} value={w}>Week {w}</option>)}</select></label>
        <button type="submit" className="op-button">Show</button>
        <span className="mc-nav">
          {prev ? <a className="hh-link" href={q(model.season, prev)}>← Week {prev}</a> : null}
          {next ? <a className="hh-link" href={q(model.season, next)}>Week {next} →</a> : null}
          {!isDefault ? <a className="hh-link" href={model.basePath}>This week</a> : null}
        </span>
      </form>
      {model.links?.length ? <p className="mc-links">{model.links.map((l) => <a key={l.href} className="hh-link" href={l.href}>{l.label} →</a>)}</p> : null}
      {model.episode ? <Episode episode={model.episode} /> : null}
      <div className="mc-list">{model.cards.length ? model.cards.map((card) => <Card key={card.id} card={card} week={model.week} />) : <p className="hh-card hh-note">{model.emptyText ?? "Matchups for this week are not available yet."}</p>}</div>
      {model.episode?.signoff ? <div className="hh-card ur-signoff">{showParagraphs(model.episode.signoff)}</div> : null}
      {model.notes?.map((n) => <p key={n} className="hh-note">{n}</p>)}
    </section>
  );
}
