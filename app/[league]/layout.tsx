import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { leagueAppIcons } from "@/lib/appIcons";
import { FeedbackFooter } from "@/components/FeedbackFooter";
import { SITE_FEEDBACK_LEAGUES } from "@/lib/leagueFeatures";
import { platformLeague } from "@/lib/platformLeagues";
import "@/lib/demo/install";

/** Home-screen app for this league (2026-11-13): its own manifest, icon, name and color. */
export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const league = platformLeague((await params).league);
  if (!league) return {};
  const icons = leagueAppIcons(league.id);
  return {
    manifest: `/${league.slug}/app.webmanifest`,
    appleWebApp: { capable: true, title: league.shortName, statusBarStyle: "default" },
    icons: { icon: [{ url: icons.icon192, sizes: "192x192", type: "image/png" }], apple: icons.apple },
  };
}

export async function generateViewport({ params }: { params: Promise<{ league: string }> }): Promise<Viewport> {
  const league = platformLeague((await params).league);
  return { width: "device-width", initialScale: 1, themeColor: league?.theme?.colors.header ?? "#0f172a" };
}

export default async function LeagueLayout({ children, params }: { children: ReactNode; params: Promise<{ league: string }> }) {
  const league = platformLeague((await params).league);
  return (
    <>
      {children}
      {league && SITE_FEEDBACK_LEAGUES.has(league.id) ? <FeedbackFooter slug={league.slug} leagueName={league.name} /> : null}
    </>
  );
}
