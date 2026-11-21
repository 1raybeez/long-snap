import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { RIVALRY_CATEGORIES, RIVALRY_MIN_MEETINGS, RIVALRY_MIN_SEASONS, RIVALRY_WEIGHTS, rivalriesForCategory, type Rivalry, type RivalryCategory, type RivalrySide } from "./rivalries.ts";

export interface RivalryHubProps {
  readonly leagueName: string;
  readonly rivalries: readonly Rivalry[];
  readonly sides: readonly RivalrySide[];
  readonly theme: LeagueTileTheme;
  readonly basePath: string;
  /** "owner" or "franchise" — wording only. */
  readonly sideLabel: "owner" | "franchise";
  readonly coverageNote: string;
  readonly headToHeadHref?: ((a: string, b: string) => string) | null;
  readonly params: { readonly side?: string | null; readonly scope?: string | null; readonly category?: string | null; readonly more?: string | null };
}

const TOP_COUNT = 6;

function Face({ side, size = 44 }: { readonly side: RivalrySide | undefined; readonly size?: number }) {
  const name = side?.name ?? "?";
  return side?.photo ? <img className="hh-portrait" src={side.photo} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" /> : <span className="hh-portrait hh-portrait-fallback" style={{ width: size, height: size }} aria-hidden="true">{name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2)}</span>;
}

function Card({ r, sides, h2h, featured = false }: { readonly r: Rivalry; readonly sides: ReadonlyMap<string, RivalrySide>; readonly h2h?: ((a: string, b: string) => string) | null; readonly featured?: boolean }) {
  const a = sides.get(r.sides[0]), b = sides.get(r.sides[1]);
  const leader = r.winsA === r.winsB ? "Series tied" : `${(r.winsA > r.winsB ? a : b)?.name ?? ""} leads ${Math.max(r.winsA, r.winsB)}–${Math.min(r.winsA, r.winsB)}${r.ties ? `–${r.ties}` : ""}`;
  const nameOf = (id: string) => sides.get(id)?.name ?? id;
  const dims = [["Competitiveness", r.dimensions.competitiveness, RIVALRY_WEIGHTS.competitiveness], ["Frequency", r.dimensions.frequency, RIVALRY_WEIGHTS.frequency], ["Postseason", r.dimensions.postseason, RIVALRY_WEIGHTS.postseason], ["Recency", r.dimensions.recency, RIVALRY_WEIGHTS.recency], ["Longevity", r.dimensions.longevity, RIVALRY_WEIGHTS.longevity]] as const;
  return (
    <article className={`rv-card${featured ? " rv-featured" : ""}`}>
      <header className="rv-card-head">
        <span className="rv-rank">{r.rank ? `#${r.rank}` : "Unranked"}</span>
        {r.recognized ? <span className="op-badge">{r.recognized.name ?? "Recognized rivalry"}</span> : null}
        <span className="rv-score">{r.score !== null ? <>{r.score.toFixed(1)}<small>/100</small></> : <small>Needs {RIVALRY_MIN_MEETINGS}+ games in {RIVALRY_MIN_SEASONS}+ seasons</small>}</span>
      </header>
      <div className="rv-vs">
        <div className="rv-side">{a?.href ? <a href={a.href}><Face side={a} size={featured ? 72 : 48} /></a> : <Face side={a} size={featured ? 72 : 48} />}<b>{a?.name ?? r.sides[0]}</b><span>{r.winsA}</span></div>
        <span className="rv-vs-label">vs</span>
        <div className="rv-side">{b?.href ? <a href={b.href}><Face side={b} size={featured ? 72 : 48} /></a> : <Face side={b} size={featured ? 72 : 48} />}<b>{b?.name ?? r.sides[1]}</b><span>{r.winsB}</span></div>
      </div>
      <p className="rv-leader">{leader}</p>
      <dl className="rv-facts">
        <div><dt>Meetings</dt><dd>{r.meetings}</dd></div>
        <div><dt>Playoff</dt><dd>{r.playoffMeetings}</dd></div>
        <div><dt>Title games</dt><dd>{r.championshipMeetings}</dd></div>
        <div><dt>Last met</dt><dd>{r.lastSeason ?? "—"}</dd></div>
      </dl>
      {r.biggestBlowout || r.closestGame ? <dl className="rv-games">
        {r.biggestBlowout ? <div><dt>Biggest blowout</dt><dd>{nameOf(r.biggestBlowout.winner)} by {r.biggestBlowout.margin.toFixed(2)} <small>({r.biggestBlowout.score}, {r.biggestBlowout.season}{r.biggestBlowout.week ? ` Wk ${r.biggestBlowout.week}` : ""})</small></dd></div> : null}
        {r.closestGame ? <div><dt>Closest game</dt><dd>{nameOf(r.closestGame.winner)} by {r.closestGame.margin.toFixed(2)} <small>({r.closestGame.score}, {r.closestGame.season}{r.closestGame.week ? ` Wk ${r.closestGame.week}` : ""})</small></dd></div> : null}
      </dl> : null}
      {r.recognized?.story ? <p className="hh-note">{r.recognized.story}</p> : null}
      {r.score !== null ? <details className="rv-why"><summary>Why this score</summary><ul>{dims.map(([label, value, weight]) => <li key={label}><span>{label} ({Math.round(weight * 100)}%)</span><span className="rv-bar"><span style={{ width: `${Math.round((value ?? 0) * 100)}%` }} /></span><b>{((value ?? 0) * weight * 100).toFixed(1)}</b></li>)}</ul></details> : null}
      {h2h ? <a className="op-button" href={h2h(r.sides[0], r.sides[1])}>Head-to-head →</a> : null}
    </article>
  );
}

export function RivalryHub({ leagueName, rivalries, sides, theme, basePath, sideLabel, coverageNote, headToHeadHref, params }: RivalryHubProps) {
  const sideMap = new Map(sides.map((s) => [s.id, s]));
  const scope = params.scope === "all" ? "all" : "active";
  const focus = params.side && sideMap.has(params.side) ? params.side : null;
  const category = (RIVALRY_CATEGORIES.some((c) => c.id === params.category) ? params.category : "most-competitive") as RivalryCategory;
  const inScope = rivalries.filter((r) => (scope === "all" || r.sides.every((id) => sideMap.get(id)?.active)) && (!focus || r.sides.includes(focus)));
  const ranked = inScope.filter((r) => r.rank !== null);
  const top = ranked[0] ?? null;
  const explorer = rivalriesForCategory(inScope, category);
  const showAll = params.more === "1";
  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { side: focus, scope: scope === "all" ? "all" : null, category: category === "most-competitive" ? null : category, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const people = [...sides].filter((s) => scope === "all" || s.active).sort((a, b) => a.name.localeCompare(b.name));
  const Label = sideLabel === "owner" ? "Owner" : "Franchise";

  return (
    <section className="league-tiles hh rv" style={themeCssVariables(theme) as CSSProperties}>
      <header className="hh-hero">
        <p className="hh-hero-eyebrow">{leagueName} · League Info</p>
        <h1>Rivalry Hub</h1>
        <p>Every head-to-head series, scored on how close, how often, how much was at stake, how recent and how long it has lasted.</p>
      </header>

      {top ? <section className="hh-section" aria-labelledby="rv-top"><div><p className="hh-eyebrow">Top calculated rivalry</p><h2 id="rv-top">{focus ? `${sideMap.get(focus)?.name}'s biggest rivalry` : "The league's biggest rivalry"}</h2></div><Card r={top} sides={sideMap} h2h={headToHeadHref} featured /></section> : null}

      <form className="rv-filters" method="get" action={basePath} aria-labelledby="rv-filters-title">
        <p id="rv-filters-title" className="hh-label">Filters</p>
        <label>{Label}<select name="side" defaultValue={focus ?? ""}><option value="">All {sideLabel}s</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Scope<select name="scope" defaultValue={scope}><option value="active">Active {sideLabel}s</option><option value="all">All-time</option></select></label>
        {category !== "most-competitive" ? <input type="hidden" name="category" value={category} /> : null}
        <button type="submit" className="op-button">Apply</button>
        {focus || scope === "all" ? <a className="hh-link" href={basePath}>Reset</a> : null}
      </form>

      <section className="hh-section" aria-labelledby="rv-ranked">
        <div className="hh-row"><div><p className="hh-eyebrow">Calculated ranking</p><h2 id="rv-ranked">Top Rivalries</h2></div><p className="hh-note">{ranked.length} ranked series</p></div>
        {ranked.length ? <div className="hh-grid hh-grid-3">{ranked.slice(top ? 1 : 0, TOP_COUNT + 1).map((r) => <Card key={r.key} r={r} sides={sideMap} h2h={headToHeadHref} />)}</div> : <p className="hh-note">No series meet the ranking minimum yet.</p>}
      </section>

      <section className="hh-section" aria-labelledby="rv-explorer">
        <div><p className="hh-eyebrow">Rivalry explorer</p><h2 id="rv-explorer">Category focus</h2></div>
        <nav className="hh-pills hh-pills-square" aria-label="Rivalry explorer categories">{RIVALRY_CATEGORIES.map((c) => <a key={c.id} href={qs({ category: c.id === "most-competitive" ? null : c.id, more: null })} aria-current={category === c.id ? "page" : undefined}>{c.label}</a>)}</nav>
        <p className="hh-note">{RIVALRY_CATEGORIES.find((c) => c.id === category)!.description}</p>
        {explorer.length ? <div className="hh-grid hh-grid-3">{(showAll ? explorer : explorer.slice(0, TOP_COUNT)).map((r) => <Card key={r.key} r={r} sides={sideMap} h2h={headToHeadHref} />)}</div> : <p className="hh-note">{category === "recognized" ? "No league-recognized rivalries have been named yet." : "Nothing in this category yet."}</p>}
        {explorer.length > TOP_COUNT ? <a className="hh-link" href={qs({ more: showAll ? null : "1" })}>{showAll ? "Show less" : `Show all ${explorer.length}`}</a> : null}
      </section>

      <details className="hh-card hh-muted"><summary>How rivalry scores work</summary>
        <p className="hh-note">Each series is scored 0–100: competitiveness 30% (how close the win-loss record is to even), frequency 25%, postseason significance 20% (playoff meetings, with title games counting double), recency 15% and longevity 10% (seasons with a meeting). Frequency, postseason, recency and longevity are ranked against the other eligible series, so scores move as history grows. A series needs at least {RIVALRY_MIN_MEETINGS} regular-season or playoff meetings across {RIVALRY_MIN_SEASONS}+ seasons to be ranked; consolation games are shown but not scored.</p>
        <p className="hh-note">{coverageNote}</p>
      </details>
    </section>
  );
}
