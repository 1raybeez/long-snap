"use client";

import { useState, type CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";

export interface FuturePickLike {
  readonly id: string;
  readonly season: number;
  readonly round: number;
  readonly originalTeamId: string;
  readonly originalManager: string;
  readonly originalTeam: string;
  readonly currentTeamId: string;
  readonly currentManager: string;
  readonly currentTeam: string;
  /** Card order (e.g. Sleeper roster id). */
  readonly order: number;
}

export function FuturePicksView({ picks, rounds, theme, note }: { readonly picks: readonly FuturePickLike[]; readonly rounds: number; readonly theme: LeagueTileTheme; readonly note?: string }) {
  const years = [...new Set(picks.map((p) => p.season))].sort((a, b) => a - b);
  const [year, setYear] = useState(years[0] ?? 0);
  const [round, setRound] = useState<number | null>(null);
  const all = picks.filter((p) => p.season === year);
  const visible = round ? all.filter((p) => p.round === round) : all;
  const moved = all.filter((p) => p.currentTeamId !== p.originalTeamId).length;
  const teamIds = [...new Set(all.map((p) => p.currentTeamId).concat(all.map((p) => p.originalTeamId)))];
  const cards = teamIds.map((id) => {
    const any = all.find((p) => p.currentTeamId === id) ?? all.find((p) => p.originalTeamId === id)!;
    const isCurrent = any.currentTeamId === id;
    return {
      id,
      manager: isCurrent ? any.currentManager : any.originalManager,
      team: isCurrent ? any.currentTeam : any.originalTeam,
      order: any.order,
      held: visible.filter((p) => p.currentTeamId === id).sort((a, b) => a.round - b.round || Number(a.currentTeamId !== a.originalTeamId) - Number(b.currentTeamId !== b.originalTeamId)),
      heldTotal: all.filter((p) => p.currentTeamId === id).length,
      away: visible.filter((p) => p.originalTeamId === id && p.currentTeamId !== id).sort((a, b) => a.round - b.round),
    };
  }).sort((a, b) => a.order - b.order);

  return (
    <div className="league-tiles fp" style={themeCssVariables(theme) as CSSProperties}>
      <div className="fp-top">
        <div className="fp-years" role="tablist" aria-label="Future draft years">
          {years.map((y) => <button key={y} type="button" role="tab" aria-selected={y === year} className={y === year ? "fp-on" : undefined} onClick={() => { setYear(y); setRound(null); }}>{y}</button>)}
        </div>
        <p className="fp-summary"><b>{all.length}</b> picks · <b>{Math.round(all.length / Math.max(1, rounds))}</b> per round · <b>{moved}</b> traded · <b>{all.length - moved}</b> still with original team</p>
      </div>
      {note ? <p className="fp-note">{note}</p> : null}

      <div className="fp-filter" role="group" aria-label="Filter by round">
        <span>Show</span>
        <button type="button" aria-pressed={round === null} className={round === null ? "fp-on" : undefined} onClick={() => setRound(null)}>All</button>
        {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => <button key={r} type="button" aria-pressed={round === r} className={round === r ? "fp-on" : undefined} onClick={() => setRound(r)}>Round {r}</button>)}
      </div>

      <div className="fp-grid">
        {cards.map((c) => (
          <article key={c.id} className="fp-card">
            <header className="fp-card-head">
              <div><p className="fp-manager">{c.manager}</p><p className="fp-team">{c.team}</p></div>
              <div className="fp-count"><b>{c.heldTotal}</b><span>picks held</span></div>
            </header>
            {c.held.length ? (
              <div className="fp-chips">
                {c.held.map((p) => {
                  const acquired = p.originalTeamId !== p.currentTeamId;
                  return (
                    <div key={p.id} className={`fp-chip${acquired ? " fp-acq" : ""}`}>
                      <b>R{p.round}</b>
                      <span className="fp-chip-tag">{acquired ? "Acquired" : "Own"}</span>
                      {acquired ? <span className="fp-chip-from">From {p.originalManager}<br />{p.originalTeam}</span> : null}
                    </div>
                  );
                })}
              </div>
            ) : <p className="fp-empty">No picks in this round.</p>}
            {c.away.length ? (
              <div className="fp-away">
                <p className="fp-away-title">Traded away</p>
                {c.away.map((p) => <p key={p.id} className="fp-away-row">R{p.round} → <b>{p.currentManager}</b><span>{p.currentTeam}</span></p>)}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
