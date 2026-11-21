import type { CSSProperties } from "react";
import type { TileLink } from "./contract.ts";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import type { RoastSide, WeeklyRoastModel } from "./weekly-roast.ts";
import { SHOW_BANNER, showParagraphs } from "./show-text.tsx";

const pts = (value: number) => value.toFixed(2);

function SideRow({ side, winner }: { readonly side: RoastSide; readonly winner: boolean }) {
  return (
    <div className={`wr-side${winner ? " wr-side-win" : ""}`}>
      <div className="wr-side-name">
        <p className="wr-team">{side.team.teamName}{winner ? <span className="wr-crown" aria-label="Winner">W</span> : null}</p>
        <p className="wr-owner">{side.team.managerName}{side.record ? ` · ${side.record}` : ""}</p>
      </div>
      <p className="wr-score">{pts(side.points)}</p>
    </div>
  );
}

export function WeeklyRoastView({ model, theme, leagueName, backLink, weekHref, finishedWeeks }: {
  readonly model: WeeklyRoastModel;
  readonly theme: LeagueTileTheme;
  readonly leagueName: string;
  readonly backLink?: TileLink | null;
  readonly weekHref?: ((week: number) => string) | null;
  readonly finishedWeeks?: number;
}) {
  const survivors = model.survivorsLine ?? `${model.games.length} games · ${model.games.length * 2} teams`;
  return (
    <section className="league-tiles wr" style={themeCssVariables(theme) as CSSProperties}>
      {backLink ? <a className="hh-link wr-back" href={backLink.href}>← {backLink.label}</a> : null}
      {weekHref && finishedWeeks ? <nav className="wr-weeks" aria-label="Recap weeks">{Array.from({ length: finishedWeeks }, (_, i) => i + 1).map((week) => <a key={week} href={weekHref(week)} aria-current={model.week === week ? "page" : undefined}>Wk {week}</a>)}</nav> : null}
      {/leroy|vince/i.test(model.author) ? <img className="ur-banner" src={SHOW_BANNER} alt="Unnecessary Roughness: Four personalities. Zero filter." width={1400} height={788} /> : null}
      <header className="wr-hero">
        <p className="wr-eyebrow">{leagueName} · Week {model.week} · {/leroy|vince/i.test(model.author) ? "Unnecessary Roughness" : "The Roast"}</p>
        <h1>{model.title}</h1>
        {showParagraphs(model.intro, "wr-intro")}
        <p className="wr-mono">{survivors}</p>
      </header>

      <div className="wr-games">
        {model.games.map((game) => (
          <article key={game.number} className="wr-game">
            <div className="wr-board">
              <div className="wr-board-head"><span>Game {game.number}</span><span>Margin {pts(game.margin)}</span></div>
              <SideRow side={game.winner} winner />
              <SideRow side={game.loser} winner={false} />
            </div>
            {game.headline ? <h2 className="wr-game-head">{game.headline}</h2> : null}
            <p className="wr-verdict"><span className="wr-tag">{game.verdict.tag}</span>{game.verdict.note ? <span className="wr-mono">{game.verdict.note}</span> : null}</p>
            {showParagraphs(game.roast, "wr-roast")}
          </article>
        ))}
      </div>

      {model.awards.length ? (
        <section className="wr-awards" aria-labelledby="wr-awards-h">
          <h2 id="wr-awards-h">Week {model.week} Awards</h2>
          <dl>{model.awards.map((award) => <div key={award.title}><dt>{award.title}</dt><dd>{award.text}</dd></div>)}</dl>
        </section>
      ) : null}

      {model.signoff ? showParagraphs(model.signoff, "wr-signoff") : null}
      <p className="wr-foot wr-mono">{leagueName} · Sleeper · Week {model.week} final · Written by {model.author}</p>
    </section>
  );
}
