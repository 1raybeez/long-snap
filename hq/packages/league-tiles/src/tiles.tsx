import type { DraftOrderModel } from "./draft-order.ts";
import type { CSSProperties, ReactNode } from "react";
import {
  TILE_ROWS,
  TILE_TITLES,
  type LeagueFinancesData,
  type LeagueHomeTiles,
  type LeagueVoiceData,
  type NflGameCenterData,
  type PlayoffRaceData,
  type PowerRankingsData,
  type ReigningChampionData,
  type TeamRef,
  type TileKey,
  type TileLink,
  type TileState,
  type WeeklyHighScoreData,
  type WeeklyMatchupsData,
  type WeeklyRecapData,
} from "./contract.ts";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import type { WeeklyStory } from "./weekly-story.ts";

const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ET_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const formatKickoff = (iso: string) => `${ET.format(new Date(iso))} ET`;
const formatAsOf = (iso: string | null) => (iso ? `Updated ${ET_SHORT.format(new Date(iso))} ET` : null);
const money = (value: number) => `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pts = (value: number | null) => (value === null ? "—" : value.toFixed(2));

function Avatar({ team, size = 40 }: { readonly team: TeamRef; readonly size?: number }) {
  const initials = team.teamName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return team.avatarUrl
    ? <img className="tile-avatar" src={team.avatarUrl} alt="" width={size} height={size} loading="lazy" />
    : <span className="tile-avatar tile-avatar-fallback" style={{ width: size, height: size }} aria-hidden="true">{initials}</span>;
}

function TileAction({ link, secondary = false }: { readonly link: TileLink | null | undefined; readonly secondary?: boolean }) {
  return link ? <a className={secondary ? "tile-action tile-action-secondary" : "tile-action"} href={link.href}>{link.label} <span aria-hidden="true">→</span></a> : null;
}

function TileFrame<T>({ tileKey, state, children }: { readonly tileKey: TileKey; readonly state: TileState<T>; readonly children: (data: T) => ReactNode }) {
  const asOf = state.status === "READY" ? formatAsOf(state.asOf) : null;
  return (
    <article className={`tile tile-${tileKey.toLowerCase().replace(/_/g, "-")}`} aria-labelledby={`tile-${tileKey}`}>
      <header className="tile-header">
        <h2 id={`tile-${tileKey}`} className="tile-eyebrow">{TILE_TITLES[tileKey]}</h2>
        {state.status === "READY" && state.stale ? <span className="tile-badge tile-badge-stale" title="Sleeper could not be reached; showing the last saved data.">Saved data</span> : null}
      </header>
      {state.status === "READY"
        ? <div className="tile-body">{children(state.data)}</div>
        : <p className={`tile-message tile-message-${state.status.toLowerCase()}`}>{state.message}</p>}
      {asOf ? <p className="tile-asof">{asOf}</p> : null}
    </article>
  );
}

function NflGameCenter({ data }: { readonly data: NflGameCenterData }) {
  const game = data.featured;
  if (!game) return <p className="tile-message">No game to feature right now.</p>;
  const team = (side: typeof game.home) => (
    <div className="nfl-team">
      {side.logoUrl ? <img src={side.logoUrl} alt="" width={44} height={44} loading="lazy" /> : null}
      <strong>{side.abbr}</strong>
      <span className="nfl-score">{side.score ?? ""}</span>
    </div>
  );
  return <>
    <p className={`tile-kicker ${data.label === "LIVE NOW" ? "tile-kicker-live" : ""}`}>{data.label}{data.nflWeek ? ` · Week ${data.nflWeek}` : ""}</p>
    <div className="nfl-matchup">{team(game.away)}<span className="nfl-at">at</span>{team(game.home)}</div>
    <p className="tile-detail">{game.status === "SCHEDULED" ? formatKickoff(game.kickoff) : game.detail}{game.network ? ` · ${game.network}` : ""}</p>
    <TileAction link={data.scoresLink} />
  </>;
}

function ReigningChampion({ data }: { readonly data: ReigningChampionData }) {
  return <>
    <div className="tile-person">
      <Avatar team={data.team} size={64} />
      <div>
        <p className="tile-display">{data.team.managerName}</p>
        <p className="tile-sub">{data.team.teamName} · {data.season} champion</p>
      </div>
    </div>
    <dl className="tile-stats">
      {data.record ? <div><dt>Record</dt><dd>{data.record}</dd></div> : null}
      <div><dt>Season</dt><dd>{data.season}</dd></div>
    </dl>
    {data.note ? <p className="tile-detail">{data.note}</p> : null}
    <TileAction link={data.historyLink} />
  </>;
}

function WeeklyHighScore({ data }: { readonly data: WeeklyHighScoreData }) {
  return <>
    <p className="tile-kicker">Week {data.week} high score</p>
    <div className="tile-person">
      <Avatar team={data.team} size={56} />
      <div>
        <p className="tile-display">{data.team.teamName}</p>
        <p className="tile-sub">{data.team.managerName}</p>
      </div>
    </div>
    <p className="tile-big-number">{data.points.toFixed(2)} <span>pts</span></p>
    {data.runnerUp ? <p className="tile-detail">Runner-up: {data.runnerUp.team.teamName} ({data.runnerUp.points.toFixed(2)})</p> : null}
    {data.prize ? <p className="tile-prize">{data.prize}</p> : null}
    <TileAction link={data.resultsLink} />
  </>;
}

const SEED_LABEL = { DIVISION: "Div", RECORD: "Record", POINTS: "Points" } as const;

function describeFormat(format: PlayoffRaceData["format"]) {
  const parts = [
    format.divisionWinners ? `${format.divisionWinners} division winner${format.divisionWinners === 1 ? "" : "s"}` : null,
    format.recordSeeds ? `${format.divisionWinners ? "next " : "top "}${format.recordSeeds} by record` : null,
    format.pointsSeeds ? (format.restByPoints ? `everyone else by points` : `${format.pointsSeeds} by points`) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function PlayoffRace({ data }: { readonly data: PlayoffRaceData }) {
  const visible = data.rows.slice(0, Math.min(data.rows.length, data.playoffSpots + 2));
  return <>
    <p className="tile-kicker">Through Week {data.throughWeek}{data.playoffStartWeek ? ` · Playoffs Week ${data.playoffStartWeek}` : ""}</p>
    <p className="tile-detail">{describeFormat(data.format)}</p>
    <ol className="tile-table">
      {visible.map((row) => (
        <li key={row.team.rosterId} className={`race-${row.status.toLowerCase()} ${row.rank === data.playoffSpots ? "race-cutline" : ""}`}>
          <span className="rank">{row.rank}</span>
          <span className="name name-with-tag"><span className="name-text">{row.team.teamName}</span>{row.seedReason ? <span className={`seed-tag seed-${row.seedReason.toLowerCase()}`}>{SEED_LABEL[row.seedReason]}</span> : null}</span>
          <span className="value">{row.seedReason === "POINTS" ? `${row.pointsFor.toFixed(1)} PF` : `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`}</span>
        </li>
      ))}
    </ol>
    <TileAction link={data.standingsLink} />
  </>;
}

function WeeklyMatchups({ data }: { readonly data: WeeklyMatchupsData }) {
  const phase = { UPCOMING: "Upcoming", IN_PROGRESS: "In progress", FINAL: "Final" }[data.phase];
  return <>
    <p className="tile-kicker">Week {data.week} · {phase}</p>
    <ul className="tile-matchups">
      {data.matchups.map(({ id, a, b }) => {
        const leader = a.points !== null && b.points !== null && a.points !== b.points ? (a.points > b.points ? "a" : "b") : null;
        return <li key={id}>
          <span className={`side ${leader === "a" ? "leading" : ""}`}><span className="name">{a.team.teamName}</span><span className="score">{a.points === null ? (a.record ?? "") : pts(a.points)}</span></span>
          <span className={`side ${leader === "b" ? "leading" : ""}`}><span className="name">{b.team.teamName}</span><span className="score">{b.points === null ? (b.record ?? "") : pts(b.points)}</span></span>
        </li>;
      })}
    </ul>
    <TileAction link={data.matchupsLink} />
  </>;
}

function PowerRankings({ data }: { readonly data: PowerRankingsData }) {
  return <>
    <p className="tile-kicker">{data.throughWeek ? `After Week ${data.throughWeek}` : "Current"}</p>
    <ol className="tile-table">
      {data.rows.slice(0, 5).map((row) => (
        <li key={row.team.rosterId}>
          <span className="rank">{row.rank}</span>
          <span className="name">{row.team.teamName}</span>
          <span className={`move ${row.movement && row.movement > 0 ? "up" : row.movement && row.movement < 0 ? "down" : ""}`}>
            {row.movement === null || row.movement === 0 ? "—" : row.movement > 0 ? `▲${row.movement}` : `▼${Math.abs(row.movement)}`}
          </span>
          {row.label ? <span className="label">{row.label}</span> : null}
        </li>
      ))}
    </ol>
    {data.method ? <p className="tile-asof">{data.method}{data.rosterSource ? ` · ${data.rosterSource}` : ""}{data.credit ? <> · <a href={data.credit.href} target="_blank" rel="noopener noreferrer">{data.credit.label}</a></> : null}</p> : null}
    <TileAction link={data.rankingsLink} />
  </>;
}

function WeeklyRecap({ data }: { readonly data: WeeklyRecapData }) {
  return <>
    <p className="tile-kicker">Week {data.week} recap{data.author ? ` · ${data.author}` : ""}</p>
    <p className="tile-display tile-headline">{data.headline}</p>
    <p className="tile-detail tile-summary">{data.summary}</p>
    <TileAction link={data.recapLink} />
  </>;
}

function LeagueVoice({ data }: { readonly data: LeagueVoiceData }) {
  const meeting = data.meetingLabel ?? "the next owners meeting";
  return <>
    <p className="tile-display tile-headline">Got a rule change in mind?</p>
    <p className="tile-detail">{data.invite ?? `Submit a proposal now. Owners debate and vote at ${meeting}.`}</p>
    {data.openItems.length
      ? <ul className="tile-list">{data.openItems.slice(0, 3).map((item) => <li key={item.title}><span className="tile-pill">{item.kind.replace("_", " ").toLowerCase()}</span> {item.href ? <a href={item.href}>{item.title}</a> : item.title}</li>)}</ul>
      : null}
    {data.latestDecision ? <p className="tile-detail">Latest: <strong>{data.latestDecision.title}</strong> — {data.latestDecision.outcome}</p> : null}
    <div className="tile-actions">
      {data.submitLink ? <TileAction link={data.submitLink} /> : null}
      <TileAction link={data.hubLink} secondary={Boolean(data.submitLink)} />
    </div>
  </>;
}

function LeagueFinances({ data }: { readonly data: LeagueFinancesData }) {
  return <>
    {data.prizePool !== null ? <p className="tile-big-number">{money(data.prizePool)} <span>{data.season} prize pool</span></p> : null}
    <dl className="tile-payouts">
      {data.payouts.slice(0, 4).map((payout) => <div key={payout.label}><dt>{payout.label}</dt><dd>{money(payout.amount)}</dd></div>)}
      {data.weeklyPrize !== null ? <div><dt>Weekly high score</dt><dd>{money(data.weeklyPrize)}/wk</dd></div> : null}
    </dl>
    {data.duesStatus ? <p className="tile-detail">Dues paid: {data.duesStatus.paid} of {data.duesStatus.total}</p> : null}
    <TileAction link={data.financesLink} />
  </>;
}

/** Full weekly recap page: headline, honors, a story for every matchup, standings, week ahead. */
export function WeeklyStoryView({ story, theme, eyebrow, backLink, weekHref, finishedWeeks }: { readonly story: WeeklyStory | null; readonly theme: LeagueTileTheme; readonly eyebrow?: string; readonly backLink?: TileLink | null; readonly weekHref: (week: number) => string; readonly finishedWeeks: number }) {
  const pts = (value: number) => value.toFixed(2);
  return (
    <section className="league-tiles power-board recap" style={themeCssVariables(theme) as CSSProperties}>
      {backLink ? <a className="tile-action tile-action-secondary power-board-back" href={backLink.href}><span aria-hidden="true">←</span> {backLink.label}</a> : null}
      {finishedWeeks > 0 ? <nav className="recap-weeks" aria-label="Recap weeks">{Array.from({ length: finishedWeeks }, (_, i) => i + 1).map((week) => <a key={week} href={weekHref(week)} aria-current={story?.week === week ? "page" : undefined}>Wk {week}</a>)}</nav> : null}
      {!story ? <article className="tile power-board-card"><p className="tile-message">This week's recap appears once its games are final.</p></article> : <>
        <header className="league-tiles-heading">
          {eyebrow ? <p className="tile-eyebrow">{eyebrow} · {story.season ?? ""} Week {story.week}</p> : null}
          <h1>{story.title}</h1>
          <p className="tile-sub">{story.dek}</p>
        </header>
        <article className="tile power-board-card">
          <h2 className="recap-h2">Week {story.week} honors</h2>
          <dl className="recap-honors">
            <div><dt>High score</dt><dd>{story.honors.highScore.team.teamName} · {pts(story.honors.highScore.points)}</dd></div>
            <div><dt>Low score</dt><dd>{story.honors.lowScore.team.teamName} · {pts(story.honors.lowScore.points)}</dd></div>
            {story.honors.closest ? <div><dt>Closest game</dt><dd>{story.honors.closest.winner.team.teamName} over {story.honors.closest.loser.team.teamName} by {pts(story.honors.closest.margin)}</dd></div> : null}
            {story.honors.blowout ? <div><dt>Biggest blowout</dt><dd>{story.honors.blowout.winner.team.teamName} over {story.honors.blowout.loser.team.teamName} by {pts(story.honors.blowout.margin)}</dd></div> : null}
            {story.honors.topPlayer ? <div><dt>Top starter</dt><dd>{story.honors.topPlayer.name}{story.honors.topPlayer.position !== "DEF" ? ` (${story.honors.topPlayer.position})` : ""} · {pts(story.honors.topPlayer.points)} for {story.honors.topPlayer.team.teamName}</dd></div> : null}
          </dl>
          {story.toughLuck ? <p className="tile-detail recap-tough"><strong>Tough luck:</strong> {story.toughLuck}</p> : null}
        </article>
        <article className="tile power-board-card">
          <h2 className="recap-h2">Matchup by matchup</h2>
          <div className="recap-games">
            {story.games.map((game) => (
              <section key={game.matchupId} className="recap-game">
                <h3><span>{game.winner.team.teamName} <b>{pts(game.winner.points)}</b></span><span className="recap-vs">{game.tie ? "tied" : "def."}</span><span>{game.loser.team.teamName} <b>{pts(game.loser.points)}</b></span></h3>
                <p>{game.story}</p>
              </section>
            ))}
          </div>
        </article>
        <article className="tile power-board-card">
          <h2 className="recap-h2">Standings after Week {story.week}</h2>
          <ol className="power-board-rows">
            {story.standings.map((row) => <li key={row.team.rosterId}><span className="rank">{row.rank}</span><span className="who"><span className="name">{row.team.teamName}</span><span className="meta">{row.team.managerName}</span></span><span className="move">{row.record}</span><span className="score">{row.pointsFor.toFixed(1)}</span></li>)}
          </ol>
        </article>
        {story.weekAhead.length ? <article className="tile power-board-card">
          <h2 className="recap-h2">What to watch in Week {story.week + 1}</h2>
          <ul className="recap-ahead">{story.weekAhead.map((line) => <li key={line}>{line}</li>)}</ul>
        </article> : null}
      </>}
    </section>
  );
}

/** Full standings page: every team with record, points for, division and playoff seed. */
/** Tabs above the Standings page (Standings · Draft order) for dynasty leagues. */
export function StandingsTabs({ tabs }: { readonly tabs?: readonly { label: string; href: string; active: boolean }[] }) {
  if (!tabs?.length) return null;
  return <nav className="standings-tabs" aria-label="Standings views">{tabs.map((t) => <a key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={t.active ? "is-active" : undefined}>{t.label}</a>)}</nav>;
}

export interface StandingsDraftColumn { readonly label: string; readonly note: string; readonly byRoster: Readonly<Record<number, { readonly pick: string; readonly detail: string }>>; readonly link?: TileLink | null }

export function StandingsBoard({ state, theme, title = "Standings", eyebrow, backLink, tabs, draft }: { readonly state: TileState<PlayoffRaceData>; readonly theme: LeagueTileTheme; readonly title?: string; readonly eyebrow?: string; readonly backLink?: TileLink | null; readonly tabs?: readonly { label: string; href: string; active: boolean }[]; readonly draft?: StandingsDraftColumn | null }) {
  return (
    <section className="league-tiles power-board" style={themeCssVariables(theme) as CSSProperties}>
      {backLink ? <a className="tile-action tile-action-secondary power-board-back" href={backLink.href}><span aria-hidden="true">←</span> {backLink.label}</a> : null}
      <div className="league-tiles-heading">
        {eyebrow ? <p className="tile-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
      </div>
      <StandingsTabs tabs={tabs} />
      <article className="tile power-board-card" aria-labelledby="standings-week">
        {state.status !== "READY" ? <p className={`tile-message tile-message-${state.status.toLowerCase()}`}>{state.message}</p> : <>
          <p id="standings-week" className="tile-kicker">Through Week {state.data.throughWeek}{state.data.playoffStartWeek ? ` · Playoffs start Week ${state.data.playoffStartWeek}` : ""}</p>
          <p className="tile-detail">{describeFormat(state.data.format)}{state.data.format.chaseByPoints ? "; teams below the cut are listed by points for, the race for the last seeds" : ""}. The dashed line is the playoff cut.</p>
          {draft ? <p className="tile-detail">{draft.note}{draft.link ? <> <a href={draft.link.href}>{draft.link.label}</a></> : null}</p> : null}
          <div className="standings-scroll">
            <table className="standings-table">
              <thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">Record</th><th scope="col">PF</th><th scope="col">Seed</th>{draft ? <th scope="col">{draft.label}</th> : null}</tr></thead>
              <tbody>
                {state.data.rows.map((row) => (
                  <tr key={row.team.rosterId} className={`race-${row.status.toLowerCase()} ${row.rank === state.data.playoffSpots ? "race-cutline" : ""}`}>
                    <td className="rank">{row.rank}</td>
                    <td className="who"><span className="name">{row.team.teamName}</span><span className="meta">{row.team.managerName}{row.division ? ` · ${row.division}` : ""}</span></td>
                    <td className="num">{row.wins}-{row.losses}{row.ties ? `-${row.ties}` : ""}</td>
                    <td className="num">{row.pointsFor.toFixed(2)}</td>
                    <td>{row.seedReason ? <span className={`seed-tag seed-${row.seedReason.toLowerCase()}`}>{SEED_LABEL[row.seedReason]}</span> : <span className="meta">—</span>}</td>
                    {draft ? <td className="who">{draft.byRoster[row.team.rosterId] ? <><span className="name">{draft.byRoster[row.team.rosterId].pick}</span><span className="meta">{draft.byRoster[row.team.rosterId].detail}</span></> : <span className="meta">—</span>}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {formatAsOf(state.asOf) ? <p className="tile-asof">{formatAsOf(state.asOf)}</p> : null}
        </>}
      </article>
    </section>
  );
}

export function DraftOrderBoard({ model, theme, title = "Draft order", eyebrow, backLink, tabs, ruleText }: { readonly model: DraftOrderModel | null; readonly theme: LeagueTileTheme; readonly title?: string; readonly eyebrow?: string; readonly backLink?: TileLink | null; readonly tabs?: readonly { label: string; href: string; active: boolean }[]; readonly ruleText: string }) {
  return (
    <section className="league-tiles power-board" style={themeCssVariables(theme) as CSSProperties}>
      {backLink ? <a className="tile-action tile-action-secondary power-board-back" href={backLink.href}><span aria-hidden="true">←</span> {backLink.label}</a> : null}
      <div className="league-tiles-heading">
        {eyebrow ? <p className="tile-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
      </div>
      <StandingsTabs tabs={tabs} />
      <article className="tile power-board-card">
        {!model ? <p className="tile-message tile-message-unavailable">The draft order is unavailable right now. Check back in a few minutes.</p> : <>
          <p className="tile-kicker">{model.season} rookie draft · if the season ended after Week {model.throughWeek}</p>
          <p className="tile-detail">{ruleText}</p>
          <div className="standings-scroll">
            <table className="standings-table draft-order-table">
              <thead><tr><th scope="col">Pick</th><th scope="col">Team</th><th scope="col">Why</th>{Array.from({ length: model.rounds }, (_, i) => <th key={i} scope="col">Rd {i + 1}</th>)}</tr></thead>
              <tbody>
                {model.slots.map((s) => (
                  <tr key={s.team.rosterId}>
                    <td className="rank">{s.slot}</td>
                    <td className="who"><span className="name">{s.team.teamName}</span><span className="meta">{s.team.managerName} · {s.record}</span></td>
                    <td className="meta">{s.basis}</td>
                    {s.picks.map((p) => <td key={p.round} className={p.traded ? "draft-traded" : "meta"}>{p.label}{p.traded ? <span className="meta"> → {p.owner.teamName}</span> : null}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tile-asof">Linear draft: the same order every round. An arrow means that pick now belongs to another team.</p>
        </>}
      </article>
    </section>
  );
}

/**
 * Full Power Rankings page: every team, with manager, tier, movement and score.
 * Same data as the homepage tile (which shows the top five).
 */
export function PowerRankingsBoard({ state, theme, title = "Power Rankings", eyebrow, intro, backLink, predictorLink }: { readonly state: TileState<PowerRankingsData>; readonly theme: LeagueTileTheme; readonly title?: string; readonly eyebrow?: string; readonly intro?: string; readonly backLink?: TileLink | null; readonly predictorLink?: TileLink | null }) {
  return (
    <section className="league-tiles power-board" style={themeCssVariables(theme) as CSSProperties}>
      {backLink ? <a className="tile-action tile-action-secondary power-board-back" href={backLink.href}><span aria-hidden="true">←</span> {backLink.label}</a> : null}
      <div className="league-tiles-heading">
        {eyebrow ? <p className="tile-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {intro ? <p className="tile-sub">{intro}</p> : null}
        {predictorLink ? <a className="tile-action power-board-predictor" href={predictorLink.href}>{predictorLink.label} <span aria-hidden="true">→</span></a> : null}
      </div>
      <article className="tile power-board-card" aria-labelledby="power-board-week">
        {state.status !== "READY" ? <p className={`tile-message tile-message-${state.status.toLowerCase()}`}>{state.message}</p> : <>
          <p id="power-board-week" className="tile-kicker">{state.data.throughWeek ? `After Week ${state.data.throughWeek}` : "Current"}</p>
          <ol className="power-board-rows">
            {state.data.rows.map((row) => (
              <li key={row.team.rosterId}>
                <span className="rank">{row.rank}</span>
                <span className="who"><span className="name">{row.team.teamName}</span><span className="meta">{row.team.managerName}{row.label ? <> · <span className="label">{row.label}</span></> : null}</span></span>
                <span className={`move ${row.movement && row.movement > 0 ? "up" : row.movement && row.movement < 0 ? "down" : ""}`} aria-label={row.movement ? `${row.movement > 0 ? "up" : "down"} ${Math.abs(row.movement)}` : "no change"}>
                  {row.movement === null || row.movement === 0 ? "—" : row.movement > 0 ? `▲${row.movement}` : `▼${Math.abs(row.movement)}`}
                </span>
                <span className="score">{row.score === null ? "—" : row.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
          {state.data.method ? <p className="tile-asof">{state.data.method}{state.data.rosterSource ? ` · ${state.data.rosterSource}` : ""}{state.data.credit ? <> · <a href={state.data.credit.href} target="_blank" rel="noopener noreferrer">{state.data.credit.label}</a></> : null}</p> : null}
          {formatAsOf(state.asOf) ? <p className="tile-asof">{formatAsOf(state.asOf)}</p> : null}
        </>}
      </article>
    </section>
  );
}

/** The universal nine-tile homepage grid. Wrap with a themed container (HomeTiles does this). */
export function HomeTileGrid({ tiles, hide = [] }: { readonly tiles: LeagueHomeTiles; /** Tiles a league doesn't use (e.g. a Sleeper-only league has no dues or Legislative Hub). */ readonly hide?: readonly TileKey[] }) {
  const render: Record<TileKey, () => ReactNode> = {
    NFL_GAME_CENTER: () => <TileFrame tileKey="NFL_GAME_CENTER" state={tiles.NFL_GAME_CENTER}>{(d) => <NflGameCenter data={d} />}</TileFrame>,
    REIGNING_CHAMPION: () => <TileFrame tileKey="REIGNING_CHAMPION" state={tiles.REIGNING_CHAMPION}>{(d) => <ReigningChampion data={d} />}</TileFrame>,
    WEEKLY_HIGH_SCORE: () => <TileFrame tileKey="WEEKLY_HIGH_SCORE" state={tiles.WEEKLY_HIGH_SCORE}>{(d) => <WeeklyHighScore data={d} />}</TileFrame>,
    PLAYOFF_RACE: () => <TileFrame tileKey="PLAYOFF_RACE" state={tiles.PLAYOFF_RACE}>{(d) => <PlayoffRace data={d} />}</TileFrame>,
    WEEKLY_MATCHUPS: () => <TileFrame tileKey="WEEKLY_MATCHUPS" state={tiles.WEEKLY_MATCHUPS}>{(d) => <WeeklyMatchups data={d} />}</TileFrame>,
    POWER_RANKINGS: () => <TileFrame tileKey="POWER_RANKINGS" state={tiles.POWER_RANKINGS}>{(d) => <PowerRankings data={d} />}</TileFrame>,
    WEEKLY_RECAP: () => <TileFrame tileKey="WEEKLY_RECAP" state={tiles.WEEKLY_RECAP}>{(d) => <WeeklyRecap data={d} />}</TileFrame>,
    LEAGUE_VOICE: () => <TileFrame tileKey="LEAGUE_VOICE" state={tiles.LEAGUE_VOICE}>{(d) => <LeagueVoice data={d} />}</TileFrame>,
    LEAGUE_FINANCES: () => <TileFrame tileKey="LEAGUE_FINANCES" state={tiles.LEAGUE_FINANCES}>{(d) => <LeagueFinances data={d} />}</TileFrame>,
  };
  return <div className="tile-grid">{TILE_ROWS.flat().filter((key) => !hide.includes(key)).map((key) => <div key={key} className="tile-cell">{render[key]()}</div>)}</div>;
}

export function HomeTiles({ tiles, theme, title, eyebrow, top, hide }: { readonly tiles: LeagueHomeTiles; readonly theme: LeagueTileTheme; readonly title?: string; readonly eyebrow?: string; /** Shown above the heading (e.g. the birthday banner). */ readonly top?: ReactNode; readonly hide?: readonly TileKey[] }) {
  return (
    <section className="league-tiles" style={themeCssVariables(theme) as CSSProperties}>
      {top}
      {title ? <div className="league-tiles-heading">
        {eyebrow ? <p className="tile-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p className="tile-sub">{theme.tagline}</p>
      </div> : null}
      <HomeTileGrid tiles={tiles} hide={hide} />
    </section>
  );
}
