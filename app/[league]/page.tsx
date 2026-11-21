import { notFound } from "next/navigation";
import { platformLeague, platformLeagues, type PlatformLeague } from "@/lib/platformLeagues";
import { COLUMN_LEAGUES, HOST_FLYER_LEAGUES } from "@/lib/leagueFeatures";
import { columnPosts } from "@/lib/hostColumn";
import { COLUMN_HOSTS } from "../../hq/packages/league-tiles/src/host-column.ts";
import { ColumnPostCard } from "../../hq/packages/league-tiles/src/host-column-view.tsx";
import { themeCssVariables } from "../../hq/packages/league-tiles/src/themes.ts";
import type { CSSProperties } from "react";
import { latestFlyer } from "@/lib/hostFlyers";
import { HOSTS, weekRecord } from "../../hq/packages/league-tiles/src/host-flyer.ts";
import { LeagueNav } from "@/app/league-nav";
import { loadStandings } from "@/lib/sleeperStandings";
import { HomeTiles } from "../../hq/packages/league-tiles/src/tiles.tsx";
import { BirthdayBanner } from "../../hq/packages/league-tiles/src/birthday-banner.tsx";
import "../../hq/packages/league-tiles/src/tiles.css";
import { loadLeagueData } from "@/lib/leagueData";
import { getHomeTiles } from "@/lib/leaguePages";
import { loadPickemBoard, type PickemBoard } from "@/lib/pickem";
import { loadGamePicks, type GamePick } from "@/lib/nflOdds";
import { sitePageHref } from "@/lib/links";
import { nflGameLive } from "@/lib/nflLive";
import { MatchupRefresh } from "../../hq/packages/league-tiles/src/matchup-refresh.tsx";

export const revalidate = 60;

export function generateStaticParams() {
  return platformLeagues().map((l) => ({ league: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }) {
  const l = platformLeague((await params).league);
  return { title: l?.name ?? "League" };
}

function ColumnBanner({ league }: { league: PlatformLeague }) {
  const hostId = COLUMN_LEAGUES[league.id];
  const host = hostId ? COLUMN_HOSTS[hostId] : undefined;
  const post = host ? columnPosts(league.id)[0] : undefined;
  if (!host || !post || !league.theme) return null;
  return (
    <div style={{ ...(themeCssVariables(league.theme) as CSSProperties), margin: "0 0 14px" }}>
      <ColumnPostCard post={post} host={host} href={`/${league.slug}/column/${post.slug}`} featured />
    </div>
  );
}

/** This week's host flyer (picks before kickoff, then the receipts), linking to the league's Picks tab. */
function FlyerBanner({ league }: { league: PlatformLeague }) {
  const hostId = HOST_FLYER_LEAGUES[league.id];
  const f = hostId ? latestFlyer(league.id) : null;
  if (!hostId || !f) return null;
  const host = HOSTS[hostId];
  const rec = weekRecord(f.games);
  const c = league.theme?.dark ?? league.theme?.colors;
  return (
    <a href={`/${league.slug}/picks/${f.season}/${f.week}/${f.kind}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", margin: "0 0 14px", borderRadius: 14, textDecoration: "none", background: c?.page ?? "#111", color: c?.text ?? "#fff", border: `2px solid ${c?.trophy ?? "#e2b84a"}` }}>
      <img src={host.hero} alt="" width={56} height={56} style={{ borderRadius: 999, objectFit: "cover", objectPosition: "top", flex: "none" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: c?.trophy }}>{f.kind === "receipts" ? `${host.shortName}'s Week ${f.week} receipts${rec ? ` · went ${rec}` : ""}` : `${host.shortName}'s Week ${f.week} picks are in`}</span>
        <span style={{ display: "block", fontWeight: 800 }}>{f.kind === "receipts" ? `Hits, misses, the playoff hunt and the Toilet Bowl Team of the Week →` : `Every game picked, the Lock and the upsets →`}</span>
      </span>
    </a>
  );
}

export default async function LeagueHome({ params }: { params: Promise<{ league: string }> }) {
  const league = platformLeague((await params).league);
  if (!league) notFound();
  const isPickem = league.format === "Pick'em";
  const data = await loadLeagueData(league.id, league.currentSiteUrl);
  const tiles = !isPickem && data ? await getHomeTiles(league).catch(() => null) : null;
  const standings = !isPickem && !tiles && league.onPlatform && league.sleeperLeagueId ? await loadStandings(league.sleeperLeagueId) : null;
  const [board, lastSeason, picks] = isPickem && league.sleeperLeagueId
    ? await Promise.all([loadPickemBoard(league.sleeperLeagueId), league.previousSleeperLeagueId ? loadPickemBoard(league.previousSleeperLeagueId) : Promise.resolve(null), loadGamePicks(league.season)])
    : [null, null, null];
  const live = tiles ? await nflGameLive() : false;
  if (tiles && league.theme) {
    return (
      <>
        <LeagueNav league={league} active="home" />
        {live ? <MatchupRefresh seconds={45} /> : null}
        <HomeTiles tiles={tiles} theme={league.theme} hide={data?.sleeperOnly ? ["REIGNING_CHAMPION", "LEAGUE_VOICE", "LEAGUE_FINANCES"] : undefined} eyebrow={league.name} title={`${league.season} League Dashboard`} top={<>{data?.birthdays ? <BirthdayBanner leagueName={league.name} apiPath={`/api/birthdays?league=${data.birthdays}`} /> : null}<ColumnBanner league={league} /><FlyerBanner league={league} /></>} />
      </>
    );
  }
  return (
    <>
      <LeagueNav league={league} active="home" />
      <main className="p-wrap">
        {isPickem ? (
          <PickemSection board={board} lastSeason={lastSeason} season={league.season} picks={picks} />
        ) : league.onPlatform ? (
          <section>
            <h2 className="p-h2">Standings</h2>
            {standings ? (
              <div className="p-panel">
                <table className="p-table">
                  <thead><tr><th>#</th><th>Team</th><th className="num">W-L</th><th className="num">PF</th><th className="num">PA</th></tr></thead>
                  <tbody>
                    {standings.map((r, i) => (
                      <tr key={r.rosterId}>
                        <td>{i + 1}</td>
                        <td><strong>{r.team}</strong><br /><span className="p-note">{r.owner}</span></td>
                        <td className="num">{r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ""}</td>
                        <td className="num">{r.pointsFor.toFixed(2)}</td>
                        <td className="num">{r.pointsAgainst.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p-note">Sleeper&rsquo;s standings couldn&rsquo;t be loaded right now. Try again in a few minutes.</p>}
          </section>
        ) : (
          <section className="p-panel">
            <h2 className="p-h2">Coming to the new site</h2>
            <p style={{ margin: 0 }}>{league.name} isn't set up here yet.{league.currentSiteUrl ? <> For now, use the <a href={sitePageHref(league, "/")}>current site</a>.</> : null}</p>
          </section>
        )}
      </main>
    </>
  );
}

function PickemSection({ board, lastSeason, season, picks }: { board: PickemBoard | null; lastSeason: PickemBoard | null; season: number; picks: { week: number; games: GamePick[] }[] | null }) {
  if (!board) return <p className="p-note">Sleeper&rsquo;s pick&rsquo;em results couldn&rsquo;t be loaded right now. Try again in a few minutes.</p>;
  const last = board.lastWeek;
  const lastLeaders = board.weekLeaders.find((w) => w.week === last);
  const champ = lastSeason?.rows[0];
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="p-grid">
        {lastLeaders && lastLeaders.names.length ? (
          <div className="p-panel"><p className="p-kicker">Week {last} winner</p><p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 900 }}>{lastLeaders.names.join(" & ")}</p><p className="p-note">{lastLeaders.points} correct picks</p></div>
        ) : null}
        {board.rows[0] ? (
          <div className="p-panel"><p className="p-kicker">{season} leader</p><p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 900 }}>{board.rows[0].name}</p><p className="p-note">{board.rows[0].total} correct picks through Week {last}</p></div>
        ) : null}
        {champ ? (
          <div className="p-panel"><p className="p-kicker">{season - 1} champion</p><p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 900 }}>{champ.name}</p><p className="p-note">{champ.total} correct picks</p></div>
        ) : null}
      </div>
      <SitePicks picks={picks} board={board} />
      <div>
        <h2 className="p-h2">Standings</h2>
        <div className="p-panel">
          <table className="p-table">
            <thead><tr><th>#</th><th>Player</th><th className="num">Total</th>{last ? <th className="num">Wk {last}</th> : null}<th className="num">Best week</th></tr></thead>
            <tbody>
              {board.rows.map((r, i) => {
                const rank = i > 0 && board.rows[i - 1]!.total === r.total ? "" : String(i + 1);
                return (
                  <tr key={r.rosterId}>
                    <td>{rank}</td>
                    <td><strong>{r.name}</strong></td>
                    <td className="num"><strong>{r.total}</strong></td>
                    {last ? <td className="num">{r.byWeek[last] ?? 0}</td> : null}
                    <td className="num">{r.best}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="p-note" style={{ marginTop: 10 }}>Correct picks from Sleeper, updated every few minutes. Make your picks in the Sleeper app.</p>
      </div>
    </section>
  );
}

const KICKOFF = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });
const LEVEL_COLOR: Record<GamePick["level"], string> = { Lock: "#15803d", Lean: "#b7791f", "Toss-up": "#6b7280" };

function SitePicks({ picks, board }: { picks: { week: number; games: GamePick[] }[] | null; board: PickemBoard }) {
  if (!picks) return <p className="p-note">This week&rsquo;s lines couldn&rsquo;t be loaded right now, so there are no recommendations. Try again later.</p>;
  if (!picks.length) return null;
  const leader = board.rows[0]?.total ?? 0;
  const left = board.lastWeek ? Math.max(0, 18 - board.lastWeek) : null;
  const tossUps = picks.flatMap((w) => w.games).filter((g) => g.level === "Toss-up");
  return (
    <div>
      <h2 className="p-h2">The site&rsquo;s picks</h2>
      <div className="p-panel" style={{ display: "grid", gap: 14 }}>
        {picks.map((w) => (
          <div key={w.week}>
            <p className="p-kicker">Week {w.week} · games not started yet</p>
            <table className="p-table">
              <thead><tr><th>Game</th><th>Kickoff (ET)</th><th>Pick</th><th className="num">Win chance</th></tr></thead>
              <tbody>
                {w.games.map((g) => (
                  <tr key={g.id}>
                    <td>{g.away.abbr} @ {g.home.abbr}{g.line ? <><br /><span className="p-note">{g.line}</span></> : null}</td>
                    <td>{KICKOFF.format(new Date(g.kickoff))}</td>
                    <td><strong>{g.pickAbbr}</strong> <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: LEVEL_COLOR[g.level] }}>{g.level.toUpperCase()}</span></td>
                    <td className="num">{g.winChance}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="p-note" style={{ margin: 0 }}>
          Picks are the betting favorite (DraftKings odds via ESPN), with the bookmaker&rsquo;s cut removed. Lock = 75%+, Lean = 60–74%, Toss-up = under 60%.
          {left !== null && left > 0 ? <> <strong>Chasing the leader?</strong> Taking every favorite keeps pace but won&rsquo;t gain much on {leader} with {left} weeks left. Most of the pool will take the favorites, so taking the underdog in one or two toss-ups{tossUps.length ? ` (this week: ${tossUps.map((g) => `${g.away.abbr} @ ${g.home.abbr}`).join(", ")})` : ""} is how you gain ground. Leading? Stick with the favorites.</> : null}
        </p>
      </div>
    </div>
  );
}
