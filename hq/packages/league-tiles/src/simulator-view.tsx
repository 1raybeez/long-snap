import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import type { SimulatorResult } from "./season-simulator.ts";

/** Predictor page: playoff, bye, division and title odds from the season simulator. */
export interface SimulatorViewProps {
  readonly leagueName: string;
  readonly result: SimulatorResult | null;
  readonly theme: LeagueTileTheme;
  readonly backLink?: { readonly label: string; readonly href: string } | null;
}

const odds = (pct: number) => (pct === 0 ? "—" : pct < 0.5 ? "<1%" : pct >= 99.5 ? ">99%" : `${Math.round(pct)}%`);

export function SimulatorView({ leagueName, result, theme, backLink }: SimulatorViewProps) {
  return (
    <section className="league-tiles hh sim" style={themeCssVariables(theme) as CSSProperties}>
      <header className="hh-hero">
        <p className="hh-hero-eyebrow">{leagueName} · Predictor</p>
        <h1>Playoff odds</h1>
        <p>{result ? `After week ${result.throughWeek}: the rest of the regular season (${result.remainingGames} games) and the playoffs played ${result.simulations.toLocaleString()} times.` : "Odds appear once Sleeper has scored the first week."}</p>
        {backLink ? <a className="hh-link sim-back" href={backLink.href}>{backLink.label}</a> : null}
      </header>
      {result ? <>
        <div className="hh-table-card hh-section"><table className="hh-table sim-table">
          <thead><tr><th scope="col">Team</th><th scope="col" className="py-num">Record</th><th scope="col" className="py-num">Proj. W-L</th><th scope="col" className="py-num">Playoffs</th><th scope="col" className="py-num">Bye</th>{result.hasDivisions ? <th scope="col" className="py-num">Division</th> : null}<th scope="col" className="py-num">Title</th></tr></thead>
          <tbody>{result.rows.map((row) => <tr key={row.rosterId} className={row.playoffPct === 0 ? "py-zero" : ""}>
            <td><b>{row.teamName}</b><span className="hh-block">{row.managerName}{row.division ? ` · ${row.division}` : ""}</span></td>
            <td className="py-num">{row.record}</td>
            <td className="py-num">{row.projectedWins.toFixed(1)}-{row.projectedLosses.toFixed(1)}</td>
            <td className="py-num"><b>{odds(row.playoffPct)}</b><span className="sim-bar"><span style={{ width: `${Math.min(100, row.playoffPct)}%` }} /></span></td>
            <td className="py-num">{odds(row.byePct)}</td>
            {result.hasDivisions ? <td className="py-num">{row.divisionPct === null ? "—" : odds(row.divisionPct)}</td> : null}
            <td className="py-num">{odds(row.titlePct)}</td>
          </tr>)}</tbody>
        </table></div>
        <details className="hh-card hh-muted hh-section"><summary>How the odds work</summary>
          <p className="hh-note">Each team&apos;s weekly score is drawn from how it has scored so far, pulled toward the league average early in the season so one big week doesn&apos;t swing everything. The real remaining schedule from Sleeper is played out, playoff seeds follow {leagueName}&apos;s own rules ({result.playoffSpots} teams), and the bracket is played with seeds 1–2 on a bye. Repeated {result.simulations.toLocaleString()} times; the numbers are how often each outcome happened. Rosters, injuries and trades aren&apos;t modeled, so treat it as a guide, not a promise. Updates as weeks are scored.</p>
        </details>
      </> : null}
    </section>
  );
}
