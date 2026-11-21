import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { SectionTabs } from "./section-tabs.tsx";
import { VIEW_LABELS, type GradeView, type SeasonGrades } from "./draft-grade-views.ts";

const gradeClass = (g: string) => (g.startsWith("A") ? "dg-a" : g.startsWith("B") ? "dg-b" : g.startsWith("C") ? "dg-c" : g === "—" ? "dg-none" : "dg-d");

function Board({ view, accentLink }: { readonly view: GradeView; readonly accentLink: boolean }) {
  if (view.status !== "ready") return <p className="gt-locked">{view.note}</p>;
  return (
    <>
      <p className="gt-note">{view.note}</p>
      <div className="dg-table-wrap">
        <table className="dg-table">
          <thead><tr><th>#</th><th>Team</th><th className="c">Grade</th><th>{view.columns[0]}</th><th>{view.columns[1]}</th><th>{view.columns[2]}</th></tr></thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.teamId}>
                <td className="dg-rank">{r.rank}</td>
                <td>{r.href ? <a className={accentLink ? "gt-team" : "gt-team"} href={r.href}>{r.team}</a> : <b>{r.team}</b>}{r.owner && r.owner !== r.team ? <span className="dg-owner">{r.owner}</span> : null}</td>
                <td className="c"><span className={`dg-grade ${gradeClass(r.grade)}`}>{r.grade}</span></td>
                <td>{r.cols[0]}</td>
                <td>{r.cols[1]}</td>
                <td>{r.cols[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.steals.length || view.reaches.length ? (
        <div className="dg-two">
          <div className="dg-box"><p className="dg-box-title dg-up">{view.stealTitle}</p><ul className="dg-picks">{view.steals.map((p, i) => <li key={i} className="dg-pick"><span className="dg-pick-who"><b>{p.player}</b> · {p.detail}<span className="dg-pick-team">{p.team}</span></span><span className="dg-delta dg-up">{p.value}</span></li>)}</ul></div>
          <div className="dg-box"><p className="dg-box-title dg-down">{view.reachTitle}</p><ul className="dg-picks">{view.reaches.map((p, i) => <li key={i} className="dg-pick"><span className="dg-pick-who"><b>{p.player}</b> · {p.detail}<span className="dg-pick-team">{p.team}</span></span><span className="dg-delta dg-down">{p.value}</span></li>)}</ul></div>
        </div>
      ) : null}
      {view.method ? <p className="dg-foot">How it works: {view.method}</p> : null}
    </>
  );
}

export function DraftGradesTab({ seasons, theme, credit, featuredSeason }: { readonly seasons: readonly SeasonGrades[]; readonly theme: LeagueTileTheme; readonly credit?: { readonly label: string; readonly href: string } | null;  readonly featuredSeason?: number }) {
  const sorted = [...seasons].sort((a, b) => b.season - a.season);
  if (!sorted.length) return <section className="league-tiles dg" style={themeCssVariables(theme) as CSSProperties}><p className="hh-note">Draft grades are unavailable right now. Check back in a few minutes.</p></section>;
  return (
    <section className="league-tiles dg gt" style={themeCssVariables(theme) as CSSProperties}>
      <SectionTabs label="Draft seasons" targetId="gt-seasons" tabs={sorted.map((s) => ({ id: `grades-${s.season}`, label: String(s.season) }))} />
      <div id="gt-seasons">
        {sorted.map((s, i) => {
          const first = s.views.find((v) => v.status === "ready")?.id ?? s.views[0]?.id;
          return (
            <div key={s.season} data-tab={`grades-${s.season}`} hidden={i !== 0} className="gt-season">
              {s.recap && s.season !== featuredSeason ? (
                <a className="gt-recap" href={s.recap.href}>
                  <span className="gt-recap-text"><span className="gt-recap-kicker">Featured · Written by Claude</span><span className="gt-recap-title">{s.recap.title}</span><span className="gt-recap-line">{s.recap.line}</span></span>
                  <span className="gt-recap-cta">Read the recap →</span>
                </a>
              ) : null}
              <h3 className="dg-title">{s.title}</h3>
              <SectionTabs label={`${s.season} grade views`} targetId={`gt-views-${s.season}`} className="gt-views" tabs={s.views.map((v) => ({ id: `grades-${s.season}-${v.id}`, label: v.status === "locked" ? `${VIEW_LABELS[v.id]} · later` : VIEW_LABELS[v.id] }))} initial={`grades-${s.season}-${first}`} />
              <div id={`gt-views-${s.season}`}>
                {s.views.map((v) => (
                  <div key={v.id} data-tab={`grades-${s.season}-${v.id}`} hidden={v.id !== first} className="gt-view">
                    <Board view={v} accentLink />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {credit ? <p className="dg-foot"><a href={credit.href} target="_blank" rel="noopener noreferrer">{credit.label}</a> (Today view)</p> : null}
    </section>
  );
}
