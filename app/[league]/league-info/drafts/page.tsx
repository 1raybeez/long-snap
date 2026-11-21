import { DraftGradesTab } from "../../../../hq/packages/league-tiles/src/draft-grades-tab.tsx";
import type { SeasonGrades } from "../../../../hq/packages/league-tiles/src/draft-grade-views.ts";
import { AuctionRecordsView } from "../../../../hq/packages/league-tiles/src/draft-grades-view.tsx";
import { DraftPageFrame, DraftPanel } from "../../../../hq/packages/league-tiles/src/draft-page.tsx";
import { FuturePicksView } from "../../../../hq/packages/league-tiles/src/future-picks-view.tsx";
import { DynastyDraftRecordsView } from "../../../../hq/packages/league-tiles/src/dynasty-draft-records-view.tsx";
import type { DynastyDraftRecords } from "../../../../hq/packages/league-tiles/src/dynasty-draft-records.ts";
import { ResourcesView, type ResourceGroup } from "../../../../hq/packages/league-tiles/src/resources-view.tsx";
import { FANTASYCALC_CREDIT } from "../../../../hq/packages/league-tiles/src/roster-strength.ts";
import { pageStyle } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { DraftBoardPicker, type SavedDraftBoard } from "@/components/DraftBoardPicker";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";
import { sitePage } from "@/lib/sitePage";
import { PUBLISHED_POST_DRAFT_LEAGUES } from "@/lib/leagueFeatures";
import { riverCityLeagueRecap } from "@/lib/riverCityPublished";

export const revalidate = 3600;
export const metadata = { title: "Draft" };

type FuturePick = Parameters<typeof FuturePicksView>[0]["picks"][number];
type AuctionRecords = Parameters<typeof AuctionRecordsView>[0];
type Resources = { groups: ResourceGroup[]; playlists?: Parameters<typeof ResourcesView>[0]["playlists"]; leagueLinks: { name: string; description: string; url: string }[] };
type Model = {
  grades: SeasonGrades[];
  featured: { season: number; title: string; line: string } | null;
  boards: SavedDraftBoard[];
  boardMode?: "auction" | "rookie";
  resources: Resources;
  /** Dynasty leagues */
  future?: { rounds: number; picks: FuturePick[] };
  records?: DynastyDraftRecords | Pick<AuctionRecords, "records" | "seasons" | "pointSeasons">;

  privateReportHref?: string | null;
};

export default async function DraftPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, data, theme } = await leagueOr404(params);
  const raw = await sitePage<Model>(league, "drafts");
  const m = raw ? rewriteLinks(league, raw) : null;
  const base = `/${league.slug}/league-info/drafts`;
  const auction = data.copy.draftTabs === "auction" || m?.boardMode === "auction";
  const kind = auction ? "auction" : "rookie draft";
  const tabs = [
    { id: "board", label: "Draft Board" },
    { id: "grades", label: "Draft Grades" },
    ...(auction ? [] : [{ id: "future", label: "Future Picks" }]),
    { id: "records", label: "Draft Records" },
    { id: "resources", label: "Resources" },
  ];

  const privateLink = auction && m?.privateReportHref ? <a href={m.privateReportHref} className="dp-action">My private report card →</a> : undefined;

  const leagueRecap = PUBLISHED_POST_DRAFT_LEAGUES.has(league.id) ? await riverCityLeagueRecap() : null;
  const recapLink = leagueRecap?.ok && leagueRecap.recap ? <a href={`${base}/league-recap`} className="dp-action">{leagueRecap.recap.season} League Recap →</a> : undefined;
  const gradesAction = privateLink && recapLink ? <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{recapLink}{privateLink}</span> : privateLink ?? recapLink;
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        {m ? (
          <DraftPageFrame
            theme={theme}
            leagueName={league.name}
            line={data.copy.draftLine}
            feature={m.featured ? { kicker: "Featured · written by Claude", title: m.featured.title, line: m.featured.line, href: `${base}/recap/${m.featured.season}`, cta: "Read the recap" } : null}
            tabs={tabs}
            backHref={`/${league.slug}/league-info`}
          >
            <DraftPanel id="board" first intro={`Every ${league.shortName} ${kind}, pick by pick. Pick a season or search a player or owner.`}>
              <DraftBoardPicker boards={m.boards} accent={theme.colors.accent} mode={auction ? "auction" : "rookie"} />
            </DraftPanel>
            <DraftPanel id="grades" intro={`Every ${league.shortName} ${kind} graded three ways: on draft day, after the season, and today. Click any team for its report card.`} action={gradesAction}>
              <DraftGradesTab seasons={m.grades} theme={theme} credit={FANTASYCALC_CREDIT} featuredSeason={m.featured?.season} />
            </DraftPanel>
            {!auction && m.future ? (
              <DraftPanel id="future" intro="Who owns every future rookie pick, year by year.">
                <FuturePicksView picks={m.future.picks} rounds={m.future.rounds} theme={theme} />
              </DraftPanel>
            ) : null}
            <DraftPanel id="records" intro={auction ? `The best, worst and weirdest money ever spent at a ${league.shortName} auction.` : `First overall picks, earliest by position, franchise leaders and position records from every ${league.shortName} draft.`}>
              {!m.records ? <p className="dt-panel-intro">Draft records are unavailable right now. Check back in a few minutes.</p>
                : auction ? <AuctionRecordsView {...(m.records as Pick<AuctionRecords, "records" | "seasons" | "pointSeasons">)} theme={theme} />
                : <DynastyDraftRecordsView records={m.records as DynastyDraftRecords} theme={theme} leagueName={league.shortName} />}
            </DraftPanel>
            <DraftPanel id="resources" intro={auction ? "Draft rules, research and tools, plus the draft-night playlists." : "Draft rules, research and tools."}>
              <ResourcesView embedded leagueName={league.name} theme={theme} groups={m.resources.groups} playlists={m.resources.playlists} leagueLinks={m.resources.leagueLinks} />
            </DraftPanel>
          </DraftPageFrame>
        ) : <p style={{ color: theme.colors.text }}>The Draft page is unavailable right now. Please try again in a few minutes.</p>}
      </main>
    </>
  );
}
