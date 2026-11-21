import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";

/**
 * Shared head-to-head page (one platform, 2026-11-02): the all-time series between two franchises from the league's
 * saved games. Same page for every league; each league brings its theme, games and franchise names/photos.
 */
export interface H2hSide { readonly id: string; readonly name: string; readonly photo: string | null; readonly href: string | null }
export interface H2hGame { readonly season: number; readonly week: number | null; readonly sideA: string; readonly sideB: string; readonly scoreA: number; readonly scoreB: number; readonly stage: string }

export interface H2hModel {
  readonly a: H2hSide;
  readonly b: H2hSide;
  readonly aWins: number;
  readonly bWins: number;
  readonly ties: number;
  readonly regular: number;
  readonly playoff: number;
  readonly championship: number;
  readonly aPoints: number;
  readonly bPoints: number;
  readonly avgMargin: number;
  readonly first: number | null;
  readonly last: number | null;
  readonly streak: string | null;
  readonly meetings: readonly { readonly season: number; readonly week: number | null; readonly a: number; readonly b: number; readonly stage: string; readonly winner: "a" | "b" | null }[];
}

/** Series from saved games. Consolation games ("other") are listed but don't count toward the record. */
export function buildH2h(games: readonly H2hGame[], a: H2hSide, b: H2hSide): H2hModel {
  const meetings = games
    .filter((g) => (g.sideA === a.id && g.sideB === b.id) || (g.sideA === b.id && g.sideB === a.id))
    .map((g) => {
      const [x, y] = g.sideA === a.id ? [g.scoreA, g.scoreB] : [g.scoreB, g.scoreA];
      return { season: g.season, week: g.week, a: x, b: y, stage: g.stage, winner: x > y ? ("a" as const) : y > x ? ("b" as const) : null };
    })
    .sort((p, q) => p.season - q.season || (p.week ?? 0) - (q.week ?? 0));
  const counted = meetings.filter((m) => m.stage !== "other");
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let streak: string | null = null;
  const lastWinner = [...counted].reverse().find((m) => m.winner)?.winner ?? null;
  if (lastWinner) {
    let n = 0;
    for (const m of [...counted].reverse()) { if (m.winner === lastWinner) n += 1; else break; }
    streak = `${lastWinner === "a" ? a.name : b.name} has won ${n} straight`;
  }
  return {
    a, b,
    aWins: counted.filter((m) => m.winner === "a").length,
    bWins: counted.filter((m) => m.winner === "b").length,
    ties: counted.filter((m) => !m.winner).length,
    regular: counted.filter((m) => m.stage === "regular").length,
    playoff: counted.filter((m) => m.stage === "playoff" || m.stage === "championship").length,
    championship: counted.filter((m) => m.stage === "championship").length,
    aPoints: r2(counted.reduce((s, m) => s + m.a, 0)),
    bPoints: r2(counted.reduce((s, m) => s + m.b, 0)),
    avgMargin: counted.length ? r2(counted.reduce((s, m) => s + Math.abs(m.a - m.b), 0) / counted.length) : 0,
    first: meetings[0]?.season ?? null,
    last: meetings[meetings.length - 1]?.season ?? null,
    streak,
    meetings,
  };
}

const STAGE: Record<string, string> = { regular: "Regular season", playoff: "Playoffs", championship: "Championship", other: "Consolation" };
const card: CSSProperties = { background: "var(--tile-card)", border: "1px solid var(--tile-border)", borderRadius: 14, padding: 16 };
const label: CSSProperties = { margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tile-muted)" };

function Side({ side, wins }: { side: H2hSide; wins: number }) {
  const name = <span style={{ fontFamily: "var(--tile-font-display)", fontStyle: "var(--tile-display-style)" as CSSProperties["fontStyle"], fontWeight: 900, fontSize: 22, textTransform: "uppercase", lineHeight: 1.1 }}>{side.name}</span>;
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      {side.photo ? <img src={side.photo} alt="" width={72} height={72} style={{ borderRadius: "50%", objectFit: "cover", border: "2px solid var(--tile-border)" }} /> : null}
      <div style={{ marginTop: 8 }}>{side.href ? <a href={side.href} style={{ color: "inherit", textDecoration: "none" }}>{name}</a> : name}</div>
      <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, color: "var(--tile-trophy)" }}>{wins}</div>
      <div style={label}>wins</div>
    </div>
  );
}

export function HeadToHeadView({ model: m, theme, leagueName, backLink }: { readonly model: H2hModel; readonly theme: LeagueTileTheme; readonly leagueName: string; readonly backLink?: { readonly label: string; readonly href: string } | null }) {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const stats: [string, string][] = [["Regular season", String(m.regular)], ["Playoff games", String(m.playoff)], ["Championships", String(m.championship)], ["Avg margin", m.avgMargin.toFixed(2)]];
  return (
    <div className="league-tiles" style={{ ...(themeCssVariables(theme) as CSSProperties), padding: 0 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {backLink ? <p style={{ margin: "0 0 10px" }}><a href={backLink.href} style={{ color: "var(--tile-action)", fontWeight: 800 }}>← {backLink.label}</a></p> : null}
        <header className="hh-hero" style={{ marginTop: 0 }}>
          <p className="hh-hero-eyebrow">{leagueName} · Head to head</p>
          <h1 style={{ position: "absolute", left: -9999 }}>{m.a.name} versus {m.b.name}</h1>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, marginTop: 18 }}>
            <Side side={m.a} wins={m.aWins} />
            <div style={{ textAlign: "center", fontWeight: 900, opacity: 0.8 }}>VS{m.ties ? <div style={{ fontSize: 12 }}>{m.ties} tie{m.ties === 1 ? "" : "s"}</div> : null}</div>
            <Side side={m.b} wins={m.bWins} />
          </div>
          {m.streak ? <p style={{ textAlign: "center", margin: "16px auto 0" }}>{m.streak}.</p> : null}
        </header>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 16 }} aria-label="Series numbers">
          {stats.map(([k, v]) => <div key={k} style={card}><p style={label}>{k}</p><p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 900 }}>{v}</p></div>)}
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12, marginTop: 16, alignItems: "start" }}>
          <div style={card}>
            <p style={label}>Every meeting</p>
            {m.meetings.length === 0 ? <p>These two haven&rsquo;t played yet.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 14 }}>
                <thead><tr style={{ color: "var(--tile-muted)", textAlign: "left" }}><th style={{ padding: "6px 4px" }}>When</th><th style={{ padding: "6px 4px", textAlign: "right" }}>{m.a.name}</th><th style={{ padding: "6px 4px", textAlign: "right" }}>{m.b.name}</th><th style={{ padding: "6px 4px" }}></th></tr></thead>
                <tbody>
                  {[...m.meetings].reverse().map((g) => (
                    <tr key={`${g.season}-${g.week}-${g.stage}`} style={{ borderTop: "1px solid var(--tile-border)" }}>
                      <td style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>{g.season}{g.week ? ` · Wk ${g.week}` : ""}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: g.winner === "a" ? 900 : 500 }}>{g.a.toFixed(2)}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: g.winner === "b" ? 900 : 500 }}>{g.b.toFixed(2)}</td>
                      <td style={{ padding: "6px 4px", color: g.stage === "regular" ? "var(--tile-muted)" : "var(--tile-trophy)", fontSize: 12, fontWeight: 800 }}>{STAGE[g.stage] ?? g.stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <aside style={card}>
            <p style={label}>Series totals</p>
            <p style={{ margin: "10px 0 0" }}><strong>{m.a.name}</strong>: {fmt(m.aPoints)} points</p>
            <p style={{ margin: "6px 0 0" }}><strong>{m.b.name}</strong>: {fmt(m.bPoints)} points</p>
            {m.first ? <p style={{ margin: "6px 0 0" }}><strong>First / last:</strong> {m.first}–{m.last}</p> : null}
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--tile-muted)" }}>Consolation games are listed but don&rsquo;t count toward the record. Team names are current names.</p>
          </aside>
        </section>
      </div>
    </div>
  );
}
