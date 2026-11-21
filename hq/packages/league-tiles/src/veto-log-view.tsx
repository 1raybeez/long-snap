/** Veto Log views (HQ kit, 2026-10-31): the public log, and the commissioner's form. */
import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { OUTCOME_LABEL, type VetoLogModel } from "./veto-log.ts";

export function VetoLogView({ model, theme, leagueName, constitutionHref }: { readonly model: VetoLogModel; readonly theme: LeagueTileTheme; readonly leagueName: string; readonly constitutionHref?: string }) {
  const m = model;
  return (
    <section className="league-tiles vl" style={themeCssVariables(theme) as CSSProperties} aria-labelledby="vl-title">
      <header className="sa-hero">
        <div>
          <p className="sa-kicker">League Info · Trades</p>
          <h1 id="vl-title" className="sa-title">Veto Log</h1>
          <p className="sa-sub">Every veto flag thrown in {leagueName}: who threw it, the trade, why, and how the league poll went. {m.rule}{constitutionHref ? <> <a href={constitutionHref}>Read the rule</a>.</> : null}</p>
        </div>
        <dl className="vl-totals">
          <div><dt>Flags</dt><dd>{m.totals.flags}</dd></div>
          <div><dt>Overturned</dt><dd>{m.totals.overturned}</dd></div>
          <div><dt>Stood</dt><dd>{m.totals.upheld}</dd></div>
        </dl>
      </header>

      {m.flagsPerSeason !== null ? (
        <div className="sa-card">
          <div className="sa-card-head"><h2 className="vl-h">{m.currentSeason} veto flags left</h2><span>{m.flagsPerSeason} per owner per season</span></div>
          <ul className="vl-allow">
            {m.allowance.map((a) => (
              <li key={a.team.id} className={a.left === 0 ? "is-used" : ""}>
                <span>{a.team.name}</span>
                <b aria-label={a.left === 0 ? "Flag used" : `${a.left} flag left`}>{a.left === 0 ? "Used" : `${a.left} left`}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {m.seasons.length === 0 ? <p className="sa-sub">No veto flags on record yet.</p> : null}
      {m.seasons.map((s) => (
        <div key={s.season} className="vl-season">
          <h2 className="vl-h">{s.season}</h2>
          <div className="vl-list">
            {s.flags.map((f) => (
              <article key={f.id} className={`sa-card vl-flag is-${f.outcome}`}>
                <div className="vl-flag-top">
                  <span className="vl-when">{f.week ? `Week ${f.week}` : "Week not recorded"}{f.flaggedOn ? ` · ${new Date(`${f.flaggedOn}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
                  <span className={`vl-outcome is-${f.outcome}`}>{OUTCOME_LABEL[f.outcome]}{f.pollYes !== null && f.pollYes !== undefined && f.pollNo !== null && f.pollNo !== undefined ? ` · ${f.pollYes}–${f.pollNo}` : ""}</span>
                </div>
                <p className="vl-trade">{f.trade}</p>
                <dl className="vl-meta">
                  <div><dt>Flag thrown by</dt><dd>{f.flaggedByLabel}</dd></div>
                  <div><dt>Why</dt><dd>{f.reason}</dd></div>
                  {f.notes ? <div><dt>Notes</dt><dd>{f.notes}</dd></div> : null}
                </dl>
                {f.source === "history" ? <p className="vl-src">From league records before the Veto Log existed.</p> : null}
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
