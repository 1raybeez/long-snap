/** Constitution appendices (HQ kit, 2026-10-31): Scoring & Roster from Sleeper, and archived rule sets. Server-safe. */
import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import type { ScoringAppendix } from "./scoring-appendix.ts";

const POS_COLOR: Record<string, string> = { QB: "#FF2A6D", RB: "#00CEB8", WR: "#58A7FF", TE: "#FFAE58", K: "#BD66FF", DEF: "#7988A1", FLEX: "#8E9AAF", SUPER_FLEX: "#E0607E", REC_FLEX: "#7FB2E5", WRRB_FLEX: "#5CC2B5", BN: "#5B6577", IR: "#C2410C", TAXI: "#A16207" };
const GROUP_COLOR: Record<string, string> = { passing: POS_COLOR.QB!, rushing: POS_COLOR.RB!, receiving: POS_COLOR.WR!, kicking: POS_COLOR.K!, defense: POS_COLOR.DEF!, special: "#C9A227", misc: "#8E9AAF" };

function Chip({ pos, sub }: { readonly pos: string; readonly sub?: string }) {
  const short = pos === "DEF" ? "D/ST" : pos === "SUPER_FLEX" ? "SF" : pos === "REC_FLEX" || pos === "WRRB_FLEX" ? "FLEX" : pos;
  return (
    <span className="sa-chip" style={{ "--sa-pos": POS_COLOR[pos] ?? "#8E9AAF" } as CSSProperties}>
      <b>{short}</b>
      {sub ? <small>{sub}</small> : null}
    </span>
  );
}

export function ScoringAppendixView({ appendix, theme, kicker = "Appendix B", sleeperUrl, updatedNote }: { readonly appendix: ScoringAppendix; readonly theme: LeagueTileTheme; readonly kicker?: string; readonly sleeperUrl?: string; readonly updatedNote?: string }) {
  const a = appendix;
  return (
    <section id="appendix-b" className="league-tiles sa" style={themeCssVariables(theme) as CSSProperties} aria-labelledby="sa-title">
      <header className="sa-hero">
        <div>
          <p className="sa-kicker">{kicker}</p>
          <h2 id="sa-title" className="sa-title">Scoring &amp; Roster</h2>
          <p className="sa-sub">
            Read straight from {a.leagueName}&rsquo;s Sleeper settings{a.season ? ` for ${a.season}` : ""}. Sleeper scores every game, so this is exactly how points count.
            {updatedNote ? ` ${updatedNote}` : ""}
          </p>
        </div>
        <span className="sa-format">{a.format}</span>
      </header>

      <div className="sa-card">
        <div className="sa-card-head"><h3>Starting lineup</h3><span>{a.totalRoster}-player roster{a.ir ? ` + ${a.ir} IR` : ""}{a.taxi ? ` + ${a.taxi} taxi` : ""}</span></div>
        <div className="sa-lineup" role="list" aria-label="Starting lineup">
          {a.lineup.flatMap((slot) => Array.from({ length: slot.count }, (_, i) => <span role="listitem" key={`${slot.pos}-${i}`}><Chip pos={slot.pos} /></span>))}
        </div>
        <ul className="sa-legend">
          {a.lineup.map((slot) => <li key={slot.pos}><Chip pos={slot.pos} /> {slot.count > 1 ? `${slot.count} × ` : ""}{slot.label}</li>)}
        </ul>
        <div className="sa-reserve" aria-label="Reserve spots">
          {a.bench ? <Chip pos="BN" sub={`× ${a.bench} bench`} /> : null}
          {a.ir ? <Chip pos="IR" sub={`× ${a.ir} injured reserve`} /> : null}
          {a.taxi ? <Chip pos="TAXI" sub={`× ${a.taxi} taxi squad`} /> : null}
        </div>
      </div>

      {a.facts.length ? (
        <dl className="sa-facts">
          {a.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>
      ) : null}

      <div className="sa-groups">
        {a.groups.map((g) => (
          <article key={g.id} className="sa-group" style={{ "--sa-group": GROUP_COLOR[g.id] ?? "#8E9AAF" } as CSSProperties} aria-labelledby={`sa-g-${g.id}`}>
            <h3 id={`sa-g-${g.id}`}>{g.title}</h3>
            <table>
              <tbody>
                {g.rules.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.label}{r.note ? <small>{r.note}</small> : null}</th>
                    <td><span className={`sa-pts ${r.points > 0 ? "is-pos" : "is-neg"}`}>{r.display}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>
      <p className="sa-foot">Anything not listed scores 0. If Sleeper&rsquo;s settings and this page ever disagree, Sleeper&rsquo;s settings decide{sleeperUrl ? <> · <a href={sleeperUrl} target="_blank" rel="noreferrer">Open the league in Sleeper</a></> : null}.</p>
    </section>
  );
}

export interface ArchivedRuleSection { readonly title: string; readonly items: readonly string[] }

/** A rule set kept on file but not in force (e.g. a league's pandemic / Adverse Event protocol). */
export function ArchivedRulesView({ id = "appendix-a", kicker, title, status, intro, sections, theme }: { readonly id?: string; readonly kicker: string; readonly title: string; readonly status: string; readonly intro: readonly string[]; readonly sections: readonly ArchivedRuleSection[]; readonly theme: LeagueTileTheme }) {
  return (
    <section id={id} className="league-tiles sa" style={themeCssVariables(theme) as CSSProperties} aria-labelledby={`${id}-title`}>
      <header className="sa-hero">
        <div>
          <p className="sa-kicker">{kicker}</p>
          <h2 id={`${id}-title`} className="sa-title">{title}</h2>
          {intro.map((p, i) => <p key={i} className="sa-sub">{p}</p>)}
        </div>
        <span className="sa-format is-archived">{status}</span>
      </header>
      <div className="sa-archive">
        {sections.map((s) => (
          <article key={s.title} className="sa-card">
            <h3>{s.title}</h3>
            <ul>{s.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
          </article>
        ))}
      </div>
    </section>
  );
}
