import type { CSSProperties } from "react";
import type { HistorySeasonResult } from "./league-history.ts";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";

export interface FranchisePageModel {
  readonly leagueName: string;
  readonly name: string;
  readonly image: string | null;
  readonly currentOwners: readonly { readonly name: string; readonly href: string | null }[];
  readonly since: number;
  /** Last season for a retired franchise (omit for an active one, shown as "present"). */
  readonly until?: number | null;
  /** `note`: e.g. a hand-off worked out from head counts rather than written records. */
  readonly eras: readonly { readonly years: string; readonly owners: readonly { readonly name: string; readonly href: string | null; readonly photo: string | null }[]; readonly note?: string | null }[];
  /** Coverage notes, e.g. seasons whose ownership wasn't recorded. */
  readonly notes?: readonly string[];
  readonly seasons: readonly HistorySeasonResult[];
  /** Overrides the W–L card label, e.g. "Regular-season record since 2018". */
  readonly recordLabel?: string | null;
  readonly ownerName: (id: string) => string;
  readonly backLink: { readonly label: string; readonly href: string };
}

const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`; };

export function FranchisePageView({ model, theme }: { readonly model: FranchisePageModel; readonly theme: LeagueTileTheme }) {
  const m = model;
  const withRecord = m.seasons.filter((s) => typeof s.wins === "number");
  const wins = withRecord.reduce((t, s) => t + (s.wins ?? 0), 0), losses = withRecord.reduce((t, s) => t + (s.losses ?? 0), 0), ties = withRecord.reduce((t, s) => t + (s.ties ?? 0), 0);
  const titles = m.seasons.filter((s) => s.champion ?? s.place === 1).length;
  const best = m.seasons.length ? Math.min(...m.seasons.map((s) => s.place)) : null;
  return (
    <section className="league-tiles hh op" style={themeCssVariables(theme) as CSSProperties}>
      <a className="hh-link" href={m.backLink.href}>← {m.backLink.label}</a>
      <header className="fr-hero">
        {m.image ? <img src={m.image} alt="" /> : null}
        <div className="fr-hero-body">
          <p className="hh-hero-eyebrow">{m.leagueName} franchise history · {m.until ? (m.until === m.since ? m.since : `${m.since}–${m.until}`) : `${m.since}–present`}</p>
          <h1>{m.name}</h1>
          <p className="fr-owners">{m.currentOwners.map((o, i) => <span key={o.name}>{i ? " + " : ""}{o.href ? <a href={o.href}>{o.name}</a> : o.name}</span>)}</p>
        </div>
      </header>
      <div className="op-grid op-grid-4">
        <div className="op-stat op-card"><p className="op-stat-value">{withRecord.length ? `${wins}–${losses}${ties ? `–${ties}` : ""}` : "—"}</p><p className="op-stat-label">{m.recordLabel ?? <>All-time W–L{withRecord.length && withRecord.length < m.seasons.length ? ` (${withRecord[0]!.season}+)` : ""}</>}</p></div>
        <div className="op-stat op-card"><p className="op-stat-value">{titles}</p><p className="op-stat-label">Championships</p></div>
        <div className="op-stat op-card"><p className="op-stat-value">{m.seasons.length}</p><p className="op-stat-label">Seasons completed</p></div>
        <div className="op-stat op-card"><p className="op-stat-value">{best ? ordinal(best) : "—"}</p><p className="op-stat-label">Best finish</p></div>
      </div>
      <section className="op-panel"><header className="op-panel-head"><span className="op-icon" aria-hidden="true">🔑</span><h2>Ownership history</h2></header>
        <ol className="op-timeline">{m.eras.map((e) => <li key={e.years}><span className="op-tl-season">{e.years}</span><div className="hh-flex">{e.owners.map((o) => <span key={o.name} className="hh-flex">{o.photo ? <img className="hh-portrait" src={o.photo} alt="" width={34} height={34} style={{ width: 34, height: 34 }} /> : null}{o.href ? <a className="op-tl-title" href={o.href}>{o.name}</a> : <span className="op-tl-title">{o.name}</span>}</span>)}{e.note ? <span className="op-fine">{e.note}</span> : null}</div></li>)}</ol>
        {m.notes?.map((n) => <p key={n} className="op-fine">{n}</p>)}
      </section>
      <section className="op-panel"><header className="op-panel-head"><span className="op-icon" aria-hidden="true">📅</span><h2>Season history</h2></header>
        <div className="hh-table-card"><table className="hh-table"><thead><tr><th>Season</th><th>Team</th><th>Owner</th><th className="c">Finish</th><th className="c">Record</th><th className="r">PF</th></tr></thead>
          <tbody>{[...m.seasons].reverse().map((s) => <tr key={s.season}><td className="op-strong">{s.season}</td><td>{s.teamName ?? "—"}</td><td>{s.ownerIds.map(m.ownerName).join(" / ")}</td><td className="c">{(s.champion ?? s.place === 1) ? "🏆 " : ""}{ordinal(s.place)} of {s.teamCount}</td><td className="c">{typeof s.wins === "number" ? `${s.wins}-${s.losses ?? 0}${s.ties ? `-${s.ties}` : ""}` : "—"}</td><td className="r">{typeof s.pointsFor === "number" ? s.pointsFor.toFixed(2) : "—"}</td></tr>)}</tbody></table></div>
      </section>
    </section>
  );
}
