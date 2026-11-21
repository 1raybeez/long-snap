import type { CSSProperties, ReactNode } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { SectionTabs } from "./section-tabs.tsx";
import type { RecordBoard, RecordEntry, RecordsModel } from "./records.ts";

/** Who a side id is (owner or franchise), for names, photos and links. */
export interface RecordSideInfo { readonly name: string; readonly href?: string | null; readonly photo?: string | null }

export interface RecordsViewProps {
  readonly leagueName: string;
  readonly model: RecordsModel;
  readonly sides: Readonly<Record<string, RecordSideInfo>>;
  readonly theme: LeagueTileTheme;
  /** Extra coverage lines (e.g. where the game history comes from). */
  readonly coverage?: readonly string[];
  readonly backLink?: { readonly label: string; readonly href: string } | null;
}

const STAGE: Record<string, string> = { playoff: "Playoffs", championship: "Title game", other: "Consolation" };

function Name({ id, sides }: { readonly id: string; readonly sides: RecordsViewProps["sides"] }) {
  const side = sides[id];
  const name = side?.name ?? id;
  return side?.href ? <a className="hh-link" href={side.href}>{name}</a> : <>{name}</>;
}

function context(entry: RecordEntry, board: RecordBoard, sides: RecordsViewProps["sides"]) {
  const parts: ReactNode[] = [];
  if (board.kind === "game" && entry.opponentId) {
    const won = entry.score ? entry.score.for > entry.score.against : null;
    parts.push(<span key="opp">{won === null ? "vs" : won ? "beat" : "lost to"} <Name id={entry.opponentId} sides={sides} /></span>);
    if (entry.score) parts.push(<span key="score">{entry.score.for.toFixed(2)}–{entry.score.against.toFixed(2)}</span>);
  }
  if (entry.season !== null && board.kind !== "streak") parts.push(<span key="when">{entry.season}{entry.week ? ` · Wk ${entry.week}` : ""}</span>);
  if (entry.stage && STAGE[entry.stage]) parts.push(<span key="stage">{STAGE[entry.stage]}</span>);
  if (entry.detail) parts.push(<span key="detail">{entry.detail}</span>);
  return parts.map((p, i) => <span key={i}>{i ? " · " : ""}{p}</span>);
}

function Board({ board, sides }: { readonly board: RecordBoard; readonly sides: RecordsViewProps["sides"] }) {
  const leader = board.entries[0];
  return (
    <article className="hh-card rb-board">
      <div className="rb-head">
        <h3 className="rb-title">{board.title}</h3>
        {board.note ? <p className="hh-tiny">{board.note}</p> : null}
      </div>
      {leader ? (
        <div className="rb-leader">
          <p className="rb-value">{leader.display}</p>
          <p className="rb-who">{leader.sideIds.map((id, i) => <span key={id}>{i ? " / " : ""}<Name id={id} sides={sides} /></span>)}{leader.active ? <span className="rb-active">Active</span> : null}</p>
          <p className="hh-note rb-context">{context(leader, board, sides)}</p>
        </div>
      ) : null}
      {board.entries.length > 1 ? (
        <ol className="rb-list" start={2}>
          {board.entries.slice(1).map((entry, i) => (
            <li key={`${entry.sideIds.join("+")}-${entry.season ?? ""}-${entry.week ?? ""}-${i}`}>
              <span className="rb-list-who">{entry.sideIds.map((id, j) => <span key={id}>{j ? " / " : ""}<Name id={id} sides={sides} /></span>)}{entry.active ? <span className="rb-active">Active</span> : null}<span className="hh-tiny rb-list-context">{context(entry, board, sides)}</span></span>
              <span className="rb-list-value">{entry.display}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

export function RecordsView({ leagueName, model, sides, theme, coverage = [], backLink }: RecordsViewProps) {
  const years = (r: readonly [number, number] | null) => (r ? (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`) : "none");
  return (
    <section className="league-tiles hh rb" style={themeCssVariables(theme) as CSSProperties}>
      <header className="hh-hero">
        <p className="hh-hero-eyebrow">{leagueName} · League Info</p>
        <h1>Record Book</h1>
        <p>The best, worst and luckiest in {leagueName} history: career leaders, single games, single seasons and streaks.</p>
        {backLink ? <a className="hh-link" href={backLink.href}>{backLink.label}</a> : null}
      </header>
      <SectionTabs label="Record book sections" targetId="rb-panels" tabs={model.sections.map((s) => ({ id: `rb-${s.id}`, label: s.title }))} />
      <div id="rb-panels">
      {model.sections.map((section, i) => (
        <section key={section.id} id={`rb-${section.id}`} data-tab={`rb-${section.id}`} hidden={i !== 0} className="hh-section" aria-labelledby={`rb-${section.id}-h`}>
          <div><p className="hh-eyebrow">{section.eyebrow}</p><h2 id={`rb-${section.id}-h`} className="py-h2">{section.title}</h2><p className="hh-note">{section.intro}</p></div>
          <div className="rb-grid">{section.boards.map((board) => <Board key={board.key} board={board} sides={sides} />)}</div>
        </section>
      ))}
      </div>
      <footer className="hh-section py-foot">
        <p className="hh-note">Game history: {years(model.gameSeasons)} ({model.gamesCounted.toLocaleString()} games). Season finishes: {years(model.resultSeasons)}.</p>
        {coverage.map((line) => <p key={line} className="hh-note">{line}</p>)}
      </footer>
    </section>
  );
}
