import { notFound, redirect } from "next/navigation";
import { buildWeeklyStory, lastScoredWeek, loadLeagueSeasonData } from "../../../../../hq/packages/league-tiles/src/index.ts";
import { WeeklyStoryView } from "../../../../../hq/packages/league-tiles/src/tiles.tsx";
import { WeeklyRoastView } from "../../../../../hq/packages/league-tiles/src/weekly-roast-view.tsx";
import { buildWeeklyRoast } from "../../../../../hq/packages/league-tiles/src/weekly-roast.ts";
import { pageStyle } from "../../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { writtenFor } from "@/lib/leagueData";
import { leagueOr404 } from "@/lib/leaguePage";
import { HQ_DATA_URL } from "@/lib/hqDataUrl";
import { columnRecapFor } from "@/lib/hostColumn";
import { COLUMN_LEAGUES } from "@/lib/leagueFeatures";
import { COLUMN_HOSTS } from "../../../../../hq/packages/league-tiles/src/host-column.ts";

export const revalidate = 900;

/** A week's recap: the written Weekly Roast when there is one, otherwise the automatic recap (same as the current site). */
export default async function WeeklyRecapPage({ params }: { params: Promise<{ league: string; week: string }> }) {
  const p = await params;
  const { league, data, theme } = await leagueOr404(Promise.resolve(p));
  const week = Number(p.week);
  if (!Number.isInteger(week) || week < 1 || week > 18 || !league.sleeperLeagueId) notFound();
  const { snapshot } = await loadLeagueSeasonData({ hqLeagueId: league.id, sleeperLeagueId: league.sleeperLeagueId, hqDataUrl: HQ_DATA_URL, managerNames: data.managerNames });
  const finishedWeeks = snapshot ? lastScoredWeek(snapshot.league) : 0;
  const story = snapshot ? buildWeeklyStory(snapshot, week) : null;
  if (!story && finishedWeeks && week > finishedWeeks) redirect(`/${league.slug}/recaps/week/${finishedWeeks}`);
  const written = snapshot ? await writtenFor(league.id, league.currentSiteUrl, data.season, week) : null;
  const file = written?.recap ?? null;
  const outside = written?.roast ?? null;
  const roast = snapshot && file ? buildWeeklyRoast(snapshot, file) : null;
  const weekHref = (w: number) => `/${league.slug}/recaps/week/${w}`;
  const back = { label: "Back to home", href: `/${league.slug}` };
  const columnHost = COLUMN_HOSTS[COLUMN_LEAGUES[league.id] ?? "beau"];
  const columnRecap = COLUMN_LEAGUES[league.id] ? columnRecapFor(league.id, data.season, week) : null;
  return (
    <>
      <LeagueNav league={league} active="recaps" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        {columnRecap && columnHost ? (

          <div className="p-wrap" style={{ marginBottom: 12 }}>
            <a className="sa-card" href={`/${league.slug}/column/${columnRecap.slug}`} style={{ display: "block", padding: 16, textDecoration: "none", color: "inherit" }}>
              <p className="p-kicker" style={{ margin: 0 }}>{columnHost.columnName} · Week {week} recap</p>
              <h2 className="p-h2" style={{ margin: "4px 0" }}>{columnRecap.title}</h2>
              <p className="p-note" style={{ margin: 0 }}>{columnRecap.dek}</p>
              <p style={{ margin: "8px 0 0", fontWeight: 700 }}>Read the recap →</p>
            </a>
          </div>
        ) : null}
        {outside && !roast ? (

          <div className="p-wrap" style={{ display: "grid", gap: 12 }}>
            <div className="sa-card" style={{ padding: 16 }}>
              <p className="p-kicker" style={{ margin: 0 }}>Weekly column · Week {outside.week}</p>
              <h2 className="p-h2" style={{ margin: "4px 0" }}>{outside.title}</h2>
              {outside.description ? <p className="p-note" style={{ margin: 0 }}>{outside.description}</p> : null}
              <p style={{ margin: "8px 0 0", display: "flex", gap: 16, flexWrap: "wrap", fontWeight: 700 }}>
                <a href={outside.url} target="_blank" rel="noopener noreferrer">Open full screen ↗</a>
                {week > 1 ? <a href={weekHref(week - 1)}>← Week {week - 1}</a> : null}
                {week < finishedWeeks ? <a href={weekHref(week + 1)}>Week {week + 1} →</a> : null}
              </p>
            </div>
            <iframe title={outside.title} src={outside.url} loading="lazy" style={{ width: "100%", height: "85vh", minHeight: 600, border: "1px solid rgba(0,0,0,.1)", borderRadius: 16, background: "#fff" }} />
          </div>
        ) : null}
        {outside && !roast ? null : roast ? <WeeklyRoastView model={roast} theme={theme} leagueName={league.name} finishedWeeks={finishedWeeks} weekHref={weekHref} backLink={back} /> : <WeeklyStoryView story={story} theme={theme} eyebrow={league.name} finishedWeeks={finishedWeeks} weekHref={weekHref} backLink={back} />}
      </main>
    </>
  );
}
