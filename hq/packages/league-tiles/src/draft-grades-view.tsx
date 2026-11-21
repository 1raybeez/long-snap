import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { SectionTabs } from "./section-tabs.tsx";
import type { DraftGradeReport, GradedPick } from "./draft-grades.ts";
import type { AuctionRecord } from "./auction-records.ts";

const gradeClass = (g: string) => (g.startsWith("A") ? "dg-a" : g.startsWith("B") ? "dg-b" : g.startsWith("C") ? "dg-c" : "dg-d");

function PickLine({ pick, teamName }: { readonly pick: GradedPick; readonly teamName: string }) {
  return (
    <li className="dg-pick">
      <span className="dg-pick-label">{pick.label}</span>
      <span className="dg-pick-who"><b>{pick.playerName}</b>{pick.position ? ` · ${pick.position}` : ""}<span className="dg-pick-team">{teamName}</span></span>
      <span className={`dg-delta ${pick.delta > 0 ? "dg-up" : "dg-down"}`}>{pick.delta > 0 ? `+${pick.delta}` : pick.delta}</span>
    </li>
  );
}

/** Rookie draft grades, one season per tab (newest first). */
export function DraftGradesView({ reports, theme, note }: { readonly reports: readonly DraftGradeReport[]; readonly theme: LeagueTileTheme; readonly note?: string }) {
  const sorted = [...reports].sort((a, b) => b.season - a.season);
  if (!sorted.length) return <section className="league-tiles dg" style={themeCssVariables(theme) as CSSProperties}><p className="hh-note">Draft grades are unavailable right now. Check back in a few minutes.</p></section>;
  return (
    <section className="league-tiles dg" style={themeCssVariables(theme) as CSSProperties}>
      <p className="dg-intro">If each rookie draft happened today, how would it look? Every pick is compared with where that player ranks now among everyone taken in the same draft. <b>+5</b> means the player is worth five spots more than where he went; <b>−5</b> means five spots less. Grades blend the value each team came away with (Class Impact) and how often it beat its draft slots (Market Efficiency).</p>
      <SectionTabs label="Draft seasons" targetId="dg-panels" tabs={sorted.map((r) => ({ id: `dg-${r.season}`, label: String(r.season) }))} />
      <div id="dg-panels">
        {sorted.map((report, i) => {
          const teamName = (id: string) => report.teams.find((t) => t.id === id)?.name ?? "";
          return (
            <div key={report.season} data-tab={`dg-${report.season}`} hidden={i !== 0} className="dg-season">
              <h3 className="dg-title">{report.title}</h3>
              <div className="dg-table-wrap">
                <table className="dg-table">
                  <thead><tr><th>#</th><th>Team</th><th className="c">Grade</th><th className="c">Class Impact</th><th className="c">Market Efficiency</th><th>Best pick today</th></tr></thead>
                  <tbody>
                    {report.teams.map((t) => (
                      <tr key={t.id}>
                        <td className="dg-rank">{t.rank === 1 ? "🏆" : t.rank}</td>
                        <td><b>{t.name}</b>{t.owner && t.owner !== t.name ? <span className="dg-owner">{t.owner}</span> : null}</td>
                        <td className="c"><span className={`dg-grade ${gradeClass(t.grade)}`}>{t.grade}</span></td>
                        <td className="c">#{t.classImpactRank}</td>
                        <td className="c">#{t.efficiencyRank}</td>
                        <td>{t.best ? <>{t.best.playerName} <span className="dg-owner">{t.best.label}</span></> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dg-two">
                <div className="dg-box"><p className="dg-box-title dg-up">Biggest steals</p><ul className="dg-picks">{report.steals.map((p) => <PickLine key={p.overall} pick={p} teamName={teamName(p.teamId)} />)}</ul></div>
                <div className="dg-box"><p className="dg-box-title dg-down">Biggest reaches</p><ul className="dg-picks">{report.reaches.map((p) => <PickLine key={p.overall} pick={p} teamName={teamName(p.teamId)} />)}</ul></div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="dg-foot">{note ? `${note} ` : ""}Today&apos;s market, not a judgment of what owners knew on draft day. <a href={sorted[0].credit.href} target="_blank" rel="noopener noreferrer">{sorted[0].credit.label}</a></p>
    </section>
  );
}

export function AuctionRecordsView({ records, seasons, pointSeasons, theme }: { readonly records: readonly AuctionRecord[]; readonly seasons: readonly number[]; readonly pointSeasons: readonly number[]; readonly theme: LeagueTileTheme }) {
  const span = (xs: readonly number[]) => (xs.length ? (xs[0] === xs[xs.length - 1] ? `${xs[0]}` : `${xs[0]}–${xs[xs.length - 1]}`) : "none");
  return (
    <section className="league-tiles ar" style={themeCssVariables(theme) as CSSProperties}>
      {records.length ? (
        <div className="ar-grid">
          {records.map((r) => (
            <article key={r.id} className="ar-card">
              <p className="ar-title">{r.title}</p>
              <p className="ar-blurb">{r.blurb}</p>
              <div className="ar-leader"><p className="ar-value">{r.entries[0].value}</p><p className="ar-who">{r.entries[0].who}</p><p className="ar-detail">{r.entries[0].detail}</p></div>
              {r.entries.length > 1 ? <ol className="ar-list" start={2}>{r.entries.slice(1).map((e, i) => <li key={i}><span><b>{e.who}</b><span className="ar-detail">{e.detail}</span></span><span className="ar-list-value">{e.value}</span></li>)}</ol> : null}
            </article>
          ))}
        </div>
      ) : <p className="hh-note">Auction records are unavailable right now. Check back in a few minutes.</p>}
      <p className="ar-foot">Auctions {span(seasons)} from Sleeper. Keepers are left out of bidding records. Points (Dollar Store Hero, Bang for the Buck, Money Pit) count what a player scored while on the buyer's roster in completed seasons ({span(pointSeasons)}).</p>
    </section>
  );
}
