import type { CSSProperties, ReactNode } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import type { DynastyDraftRecords, PositionBar } from "./dynasty-draft-records.ts";

const posLine = (bars: readonly PositionBar[]) => bars.map((b) => `${b.position} ${b.count}`).join(" · ");

function Bars({ title, bars }: { readonly title: string; readonly bars: readonly PositionBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="dg-box">
      <p className="dg-box-title">{title}</p>
      <ul className="ddr-bars">
        {bars.map((b) => (
          <li key={b.position}>
            <span className="ddr-bar-label"><b>{b.position}</b><span>{b.count}</span></span>
            <span className="ddr-bar-track"><span className="ddr-bar-fill" style={{ width: `${(b.count / max) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, note, children }: { readonly title: string; readonly note?: string; readonly children: ReactNode }) {
  return (
    <section className="ddr-section">
      <h3 className="ddr-h3">{title}</h3>
      {note ? <p className="ddr-note">{note}</p> : null}
      {children}
    </section>
  );
}

export function DynastyDraftRecordsView({ records, theme, leagueName }: { readonly records: DynastyDraftRecords; readonly theme: LeagueTileTheme; readonly leagueName: string }) {
  const r = records;
  return (
    <div className="league-tiles ddr" style={themeCssVariables(theme) as CSSProperties}>
      <article className="ddr-snap">
        <div><p className="ddr-kicker">Rookie drafts{r.rookie.firstSeason ? ` · ${r.rookie.firstSeason}–${r.rookie.lastSeason}` : ""}</p><p className="ddr-snap-line">{posLine(r.rookie.byPosition)}</p></div>
        <span className="ddr-pill">{r.rookie.picks} picks · {r.rookie.drafts} drafts</span>
      </article>

      <Section title="First Overall History" note={`The first pick in every ${leagueName} rookie draft.`}>
        <div className="ddr-grid ddr-grid-3">
          {r.firstOverall.map((p) => <article key={p.season} className="ddr-card"><p className="ddr-big">{p.player}</p><p className="ddr-sub">{p.season} · pick 1 · {p.position} · {p.team}</p>{p.owner && p.owner !== p.team ? <p className="ddr-sub">{p.owner}</p> : null}</article>)}
        </div>
      </Section>

      <Section title="Earliest by Position" note="The earliest each position has gone in a rookie draft.">
        <div className="ddr-grid ddr-grid-6">
          {r.earliestByPosition.map((p) => <article key={p.position} className="ddr-card"><p className="ddr-kicker">{p.position} · pick {p.overall}</p><p className="ddr-name">{p.player}</p><p className="ddr-sub">{p.season} · {p.team}</p></article>)}
        </div>
      </Section>

      <Section title="Franchise Draft Leaders" note="Rookie picks by franchise, counted across team-name and owner changes.">
        <div className="ddr-grid ddr-grid-3">
          {r.leaders.map((l) => <article key={l.label} className="ddr-card"><p className="ddr-kicker">{l.label}</p><p className="ddr-big">{l.count}</p><p className="ddr-sub">{l.teams.join(" · ")}</p></article>)}
        </div>
      </Section>

      <Section title="Position Records" note="How often each position has been drafted.">
        <div className="dg-two">
          <Bars title="Every draft" bars={r.positionChart.all} />
          <Bars title="Rookie drafts" bars={r.positionChart.rookie} />
        </div>
      </Section>

      <Section title="Franchise Draft Profiles" note="Every franchise's rookie picks by position (current team name).">
        <div className="ddr-grid ddr-grid-4">
          {r.profiles.map((t) => <article key={t.teamId} className="ddr-card"><p className="ddr-name">{t.team}</p>{t.owner && t.owner !== t.team ? <p className="ddr-sub">{t.owner}</p> : null}<p className="ddr-count"><b>{t.total}</b> rookie picks</p><p className="ddr-sub">{posLine(t.byPosition)}</p></article>)}
        </div>
      </Section>

      {r.otherDrafts.length ? (
        <Section title="Other Drafts" note="Startup and veterans drafts are counted here, not in the rookie totals.">
          <div className="ddr-grid ddr-grid-3">
            {r.otherDrafts.map((d) => <article key={`${d.season}-${d.label}`} className="ddr-card"><p className="ddr-name">{d.season} {d.label}</p><p className="ddr-count"><b>{d.picks}</b> picks</p><p className="ddr-sub">{posLine(d.byPosition)}</p></article>)}
          </div>
        </Section>
      ) : null}

      <Section title="Archive Totals">
        <article className="ddr-snap ddr-snap-light">
          <div><p className="ddr-kicker">Every {leagueName} draft</p><p className="ddr-snap-line">{posLine(r.archive.byPosition)}</p></div>
          <span className="ddr-pill">{r.archive.picks} picks · {r.archive.drafts} drafts</span>
        </article>
      </Section>
    </div>
  );
}
