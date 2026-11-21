import { notFound } from "next/navigation";
import { nflGameLive } from "@/lib/nflLive";
import { MatchupRefresh } from "../../../../../hq/packages/league-tiles/src/matchup-refresh.tsx";
import { normalizeEspnGames, type EspnScoreboardLike } from "../../../../../hq/packages/league-tiles/src/nfl-adapter.ts";
import type { NflGame } from "../../../../../hq/packages/league-tiles/src/contract.ts";
import { pageStyle, themeCssVariables } from "../../../../../hq/packages/league-tiles/src/themes.ts";
import type { CSSProperties } from "react";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ week: string }> }) {
  return { title: `NFL week ${(await params).week} scores` };
}

const kickoff = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

/** Every NFL game of a week, live from ESPN (the Game Center tile's "scores" link). Same for every league. */
export default async function NflWeekPage({ params }: { params: Promise<{ league: string; week: string }> }) {
  const { league, theme } = await leagueOr404(params);
  const week = Number((await params).week);
  if (!Number.isInteger(week) || week < 1 || week > 18) notFound();
  let games: readonly NflGame[] = [];
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${league.season}`, { next: { revalidate: 60 } } as RequestInit);
    if (r.ok) games = normalizeEspnGames((await r.json()) as EspnScoreboardLike);
  } catch { /* shown as unavailable below */ }
  const card = { background: "var(--tile-card)", border: "1px solid var(--tile-border)", borderRadius: 14, padding: 16, color: "var(--tile-text)" } as const;
  const team = (t: NflGame["away"]) => (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      {t.logoUrl ? <img src={t.logoUrl} alt="" width={48} height={48} style={{ objectFit: "contain" }} /> : <div style={{ height: 48 }} />}
      <div style={{ fontWeight: 800 }}>{t.abbr}</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{t.score ?? "—"}</div>
    </div>
  );
  return (
    <>
      <LeagueNav league={league} active="home" />
      {(await nflGameLive()) ? <MatchupRefresh seconds={45} /> : null}
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        <div className="league-tiles" style={{ ...(themeCssVariables(theme) as CSSProperties), maxWidth: 960, margin: "0 auto", padding: 0 }}>
          <p style={{ color: "var(--tile-muted)", fontWeight: 700, textTransform: "uppercase", fontSize: 12, letterSpacing: 1 }}>NFL Game Center</p>
          <h1 style={{ color: "var(--tile-text)", margin: "4px 0 6px" }}>Week {week} NFL scores</h1>
          <p style={{ color: "var(--tile-muted)", margin: "0 0 16px" }}>
            {week > 1 ? <a href={`/${league.slug}/nfl/week/${week - 1}`} style={{ color: "var(--tile-action)" }}>← Week {week - 1}</a> : null}
            {week > 1 && week < 18 ? " · " : null}
            {week < 18 ? <a href={`/${league.slug}/nfl/week/${week + 1}`} style={{ color: "var(--tile-action)" }}>Week {week + 1} →</a> : null}
            {" · Live from ESPN"}
          </p>
          {games.length === 0 ? <p style={{ color: "var(--tile-text)" }}>The NFL schedule is unavailable right now. Check back shortly.</p> : (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {games.map((g) => (
                <article key={g.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: g.status === "LIVE" ? "var(--tile-negative)" : "var(--tile-muted)" }}>
                    <span>{g.status === "LIVE" ? "LIVE" : g.status === "FINAL" ? "FINAL" : "UPCOMING"}</span>
                    <span style={{ color: "var(--tile-muted)" }}>{g.network ?? ""}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, marginTop: 10 }}>
                    {team(g.away)}<span style={{ color: "var(--tile-muted)", fontWeight: 800 }}>@</span>{team(g.home)}
                  </div>
                  <p style={{ textAlign: "center", color: "var(--tile-muted)", fontSize: 13, margin: "10px 0 0" }}>{g.status === "SCHEDULED" ? kickoff(g.kickoff) : g.detail}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
