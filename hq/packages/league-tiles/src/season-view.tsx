import type { CSSProperties } from "react";
import type { TileLink } from "./contract.ts";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";

export interface SeasonPerson { readonly name: string; readonly href?: string | null }
export interface SeasonPageModel {
  readonly leagueName: string;
  readonly season: number;
  /** e.g. "Dynasty era". */
  readonly eraLabel?: string | null;
  readonly backLink: TileLink;
  readonly podium: readonly { readonly label: string; readonly people: readonly SeasonPerson[] }[];
  readonly standings: readonly { readonly place: number | null; readonly people: readonly SeasonPerson[]; readonly detail?: string | null }[];
  readonly awards: readonly { readonly key: string; readonly type: string; readonly label: string; readonly people: readonly SeasonPerson[] }[];
  readonly finance: { readonly facts: readonly { readonly label: string; readonly value: string }[]; readonly managers: readonly { readonly person: SeasonPerson; readonly payouts: string; readonly net?: string | null }[] } | null;
  /** Coverage notes, e.g. "Payout records begin in 2016." */
  readonly notes?: readonly string[];
  readonly previousHref?: string | null;
  readonly nextHref?: string | null;
}

const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`; };

function People({ people }: { readonly people: readonly SeasonPerson[] }) {
  if (!people.length) return <>TBD</>;
  return <>{people.map((p, i) => <span key={p.name + i}>{i ? " / " : ""}{p.href ? <a className="hh-link" href={p.href}>{p.name}</a> : p.name}</span>)}</>;
}

export function SeasonView({ model, theme }: { readonly model: SeasonPageModel; readonly theme: LeagueTileTheme }) {
  const m = model;
  return (
    <section className="league-tiles hh sv" style={themeCssVariables(theme) as CSSProperties}>
      <div className="sv-nav">
        <a className="hh-link" href={m.backLink.href}>← {m.backLink.label}</a>
        <span className="sv-step">{m.previousHref ? <a className="hh-link" href={m.previousHref}>← {m.season - 1}</a> : null}{m.nextHref ? <a className="hh-link" href={m.nextHref}>{m.season + 1} →</a> : null}</span>
      </div>
      <header className="hh-hero">
        <p className="hh-hero-eyebrow">{m.leagueName} · {m.eraLabel ?? "Season"}</p>
        <h1>{m.season} Season</h1>
        <p>Final results, awards and payouts for the {m.season} season.</p>
      </header>

      <section className="hh-section" aria-labelledby="sv-podium">
        <h2 id="sv-podium" className="py-h2">Final podium</h2>
        <div className="hh-grid hh-grid-4">{m.podium.map((p, i) => <article key={p.label} className={`hh-card sv-podium sv-podium-${i}`}><p className="hh-label">{p.label}</p><p className="sv-name"><People people={p.people} /></p></article>)}</div>
      </section>

      <div className="sv-two">
        <section className="hh-section" aria-labelledby="sv-standings">
          <h2 id="sv-standings" className="py-h2">Final standings</h2>
          <div className="hh-table-card"><table className="hh-table">
            <thead><tr><th scope="col">Finish</th><th scope="col">Manager</th></tr></thead>
            <tbody>{m.standings.map((row, i) => <tr key={i} className={row.place === 1 ? "hh-top" : ""}><td className="sv-place">{row.place ? ordinal(row.place) : "—"}</td><th scope="row"><People people={row.people} />{row.detail ? <span className="hh-note hh-block">{row.detail}</span> : null}</th></tr>)}</tbody>
          </table></div>
        </section>

        {m.finance ? (() => { const showNet = m.finance.managers.some((row) => row.net != null); return <section className="hh-section" aria-labelledby="sv-money">
          <h2 id="sv-money" className="py-h2">Payouts</h2>
          <div className="hh-grid hh-grid-3">{m.finance.facts.map((f) => <div key={f.label} className="hh-card"><p className="hh-label">{f.label}</p><p className="hh-strong">{f.value}</p></div>)}</div>
          <div className="hh-table-card"><table className="hh-table">
            <thead><tr><th scope="col">Manager</th><th scope="col" className="r">Payouts</th>{showNet ? <th scope="col" className="r">Net</th> : null}</tr></thead>
            <tbody>{m.finance.managers.map((row, i) => <tr key={i}><th scope="row"><People people={[row.person]} /></th><td className="r">{row.payouts}</td>{showNet ? <td className="r">{row.net ?? "—"}</td> : null}</tr>)}</tbody>
          </table></div>
        </section>; })() : null}
      </div>

      {m.notes?.length ? <section className="hh-section sv-notes">{m.notes.map((n) => <p key={n} className="hh-note">{n}</p>)}</section> : null}

      {m.awards.length ? <section className="hh-section" aria-labelledby="sv-awards">
        <h2 id="sv-awards" className="py-h2">Awards</h2>
        <div className="hh-grid hh-grid-3">{m.awards.map((a) => <article key={a.key} className="hh-card"><p className="hh-eyebrow">{a.type}</p><p className="hh-strong">{a.label}</p><p className="hh-note"><People people={a.people} /></p></article>)}</div>
      </section> : null}
    </section>
  );
}
