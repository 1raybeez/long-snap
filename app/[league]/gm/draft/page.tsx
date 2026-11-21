import type { CSSProperties } from "react";
import { GmDraftRoom } from "../../../../hq/packages/league-tiles/src/gm-view.tsx";
import { WarRoom2 } from "../../../../hq/packages/league-tiles/src/war-room-view.tsx";
import { themeCssVariables } from "../../../../hq/packages/league-tiles/src/themes.ts";
import "@/app/hq-pages.css";
import { gmPage } from "@/lib/gmPage";
import { DRAFT_INTELLIGENCE_LEAGUES, DYNASTY_WAR_ROOM_LEAGUES, ROOKIE_DRAFT_ROOM_LEAGUES, WAR_ROOM_LEAGUES } from "@/lib/leagueFeatures";
import { RookieDraftRoomClient } from "@/components/league/RookieDraftRoomClient";
import { LCC_MATH_SEASONS } from "@/lib/lccWarRoom";

import { isDemoMode } from "@/lib/demo/demoLeagues";
export const metadata = { title: "GM · Draft Room" };

export default function GmDraftPage({ params }: { params: Promise<{ league: string }> }) {
  return gmPage(params, "draft", ({ league, data, base, theme }) => WAR_ROOM_LEAGUES.has(league.id)
    ? (
      <>
        <WarRoom2 apiPath={`/api/${league.slug}/war-room`} nominationApi={`/api/${league.slug}/war-room/nomination`} loginHref="/" leagueName={league.shortName} />
        <GmDraftRoom links={[
          { label: "Draft board, grades and records", href: `${base}/league-info/drafts`, note: "Every auction, Draft Grades, Team Report Cards." },
          { label: "Your draft report card", href: `${base}/league-info/draft-report`, note: "Your team's private report card (sign in as the owner)." },
        ]} />
      </>
    )
    : (
      <GmDraftRoom links={data.sleeperOnly
        ? [{ label: "Draft in Sleeper", href: `https://sleeper.com/leagues/${league.sleeperLeagueId}`, note: `${league.shortName} drafts in Sleeper with Sleeper's settings.` }]
        : [
          data.copy.draftTabs === "auction"
            ? { label: "Draft board, grades and records", href: `${base}/league-info/drafts`, note: "Every auction, Draft Grades, Team Report Cards, auction records." }
            : { label: "Draft board, grades and records", href: `${base}/league-info/drafts`, note: "Rookie drafts, Draft Grades, Team Report Cards, future picks." },
          ...(league.currentSiteUrl ? [{ label: "War Room", href: `${league.currentSiteUrl}/war-room`, note: data.copy.draftTabs === "auction" ? "Auction prep and your private plan (on the current site for now)." : "Rookie draft prep (on the current site for now)." }] : []),
          ...(isDemoMode() ? [] : [{ label: "Draft in Sleeper", href: `https://sleeper.com/leagues/${league.sleeperLeagueId}`, note: `${league.shortName} drafts in Sleeper.` }]),
        ]} />
    ));
}
