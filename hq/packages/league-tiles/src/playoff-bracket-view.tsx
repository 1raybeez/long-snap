import type { CSSProperties } from "react";
import type { BracketGame, BracketRound, BracketSide, PlayoffBracketModel, ProjectedSeed } from "./playoff-bracket.ts";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";

const card: CSSProperties = { background: "var(--tile-card)", border: "1px solid var(--tile-border)", borderRadius: 14, padding: "14px 16px" };
const label: CSSProperties = { margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tile-accent)" };
const muted: CSSProperties = { color: "var(--tile-muted)" };

function Side({ side, other, final }: { readonly side: BracketSide; readonly other: BracketSide; readonly final: boolean }) {
  const higher = side.points !== null && other.points !== null && side.points > other.points;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      {side.team?.avatarUrl ? <img src={side.team.avatarUrl} alt="" width={28} height={28} style={{ borderRadius: 99, flex: "none" }} /> : <span style={{ width: 28, height: 28, borderRadius: 99, background: "var(--tile-border)", flex: "none" }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: side.advanced || (final && higher) ? 900 : 600, overflowWrap: "anywhere" }}>
          {side.seed ? <span style={{ ...muted, fontWeight: 700, marginRight: 6 }}>{side.seed}</span> : null}
          {side.team ? side.team.teamName : <span style={muted}>{side.placeholder}</span>}
        </div>
        {side.team ? <div style={{ ...muted, fontSize: 12 }}>{side.team.managerName}</div> : null}
      </div>
      <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: higher ? 900 : 600, minWidth: 54, textAlign: "right" }}>{side.points === null ? "" : side.points.toFixed(2)}</div>
      {side.advanced ? <span className="tile-badge" style={{ background: "color-mix(in srgb, var(--tile-positive) 16%, transparent)", color: "var(--tile-positive)" }}>Advances</span> : null}
    </div>
  );
}

function Game({ game }: { readonly game: BracketGame }) {
  const final = game.status === "FINAL";
  return (
    <article style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <p style={{ ...label, color: game.title === "Championship" ? "var(--tile-trophy)" : "var(--tile-accent)" }}>{game.title}</p>
        <span style={{ ...muted, fontSize: 12, fontWeight: 700 }}>Game {game.id}{game.status === "IN_PROGRESS" ? " · Live" : final ? " · Final" : ""}</span>
      </div>
      <Side side={game.sides[0]} other={game.sides[1]} final={final} />
      <div style={{ borderTop: "1px solid var(--tile-border)" }} />
      <Side side={game.sides[1]} other={game.sides[0]} final={final} />
    </article>
  );
}

function Rounds({ rounds, title }: { readonly rounds: readonly BracketRound[]; readonly title: string }) {
  if (!rounds.length) return null;
  return (
    <section style={{ marginTop: 22 }} aria-label={title}>
      <h2 style={{ margin: "0 0 10px", fontFamily: "var(--tile-font-display)", fontStyle: "var(--tile-display-style)" as CSSProperties["fontStyle"], fontSize: 24 }}>{title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`, gap: 14, alignItems: "start" }}>
        {rounds.map((r) => (
          <div key={r.round} style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontWeight: 800 }}>{r.label}{r.week ? <span style={{ ...muted, fontWeight: 600 }}> · Week {r.week}</span> : null}</p>
            {r.games.map((g) => <Game key={g.id} game={g} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

function SeedRow({ s }: { readonly s: ProjectedSeed }) {
  return (
    <tr style={{ borderTop: "1px solid var(--tile-border)" }}>
      <td style={{ padding: "8px 6px", fontWeight: 900, width: 32 }}>{s.seed}</td>
      <td style={{ padding: "8px 6px" }}><strong>{s.team.teamName}</strong><div style={{ ...muted, fontSize: 12 }}>{s.team.managerName}</div></td>
      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{s.record}</td>
      <td style={{ padding: "8px 6px", ...muted, fontSize: 13 }}>{[s.reason, s.bye ? "First-round bye" : null].filter(Boolean).join(" · ")}</td>
    </tr>
  );
}

export function PlayoffBracketView({ model, theme, leagueName, standingsHref, matchupsHref }: { readonly model: PlayoffBracketModel; readonly theme: LeagueTileTheme; readonly leagueName: string; readonly standingsHref: string; readonly matchupsHref: string }) {
  return (
    <div className="league-tiles" style={{ ...(themeCssVariables(theme) as CSSProperties), padding: 0 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <p style={{ margin: "0 0 10px" }}><a href={matchupsHref} style={{ color: "var(--tile-action)", fontWeight: 800 }}>← Back to matchups</a></p>
        <p style={label}>{leagueName} · {model.season}</p>
        <h1 style={{ margin: "4px 0 6px", fontFamily: "var(--tile-font-display)", fontStyle: "var(--tile-display-style)" as CSSProperties["fontStyle"], fontSize: "clamp(28px, 4vw, 40px)" }}>Playoff brackets</h1>
        {model.projected ? (
          <>
            <p style={{ ...muted, margin: "0 0 14px", maxWidth: 720 }}>
              The playoffs start in Week {model.playoffStartWeek ?? "?"}. Until then, this is the field if the season ended today, using the league&rsquo;s own seeding rules. The bracket and scores appear here once the playoffs begin.
            </p>
            <section style={card} aria-label="If the season ended today">
              <p style={label}>If the season ended today</p>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 14 }}>
                <tbody>{model.projected.map((s) => <SeedRow key={s.seed} s={s} />)}</tbody>
              </table>
              {model.projectedOut.length ? (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>Outside the field ({model.projectedOut.length})</summary>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 14 }}><tbody>{model.projectedOut.map((s) => <SeedRow key={s.seed} s={s} />)}</tbody></table>
                </details>
              ) : null}
              <p style={{ margin: "10px 0 0" }}><a href={standingsHref} style={{ color: "var(--tile-action)", fontWeight: 800 }}>Full standings →</a></p>
            </section>
          </>
        ) : (
          <>
            <p style={{ ...muted, margin: 0, maxWidth: 720 }}>Live from Sleeper. Sleeper decides who advances; scores update as games are played.</p>
            <Rounds rounds={model.championship} title="Championship bracket" />
            <Rounds rounds={model.losers} title={model.losersName} />
          </>
        )}
      </div>
    </div>
  );
}
