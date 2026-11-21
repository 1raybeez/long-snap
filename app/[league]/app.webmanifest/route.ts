import { NextResponse } from "next/server";
import { platformLeague } from "@/lib/platformLeagues";
import { leagueAppIcons } from "@/lib/appIcons";

export const dynamic = "force-static";

/** A league's own home-screen app (2026-11-13): adding from a league page opens that league, with its logo. */
export async function GET(_request: Request, { params }: { params: Promise<{ league: string }> }) {
  const league = platformLeague((await params).league);
  if (!league) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const icons = leagueAppIcons(league.id);
  const color = league.theme?.colors.header ?? "#0f172a";
  return new NextResponse(JSON.stringify({
    id: `/${league.slug}`,
    name: league.name,
    short_name: league.shortName,
    start_url: `/${league.slug}`,
    scope: "/",
    display: "standalone",
    background_color: color,
    theme_color: color,
    icons: [
      { src: icons.icon192, sizes: "192x192", type: "image/png" },
      { src: icons.icon512, sizes: "512x512", type: "image/png" },
    ],
  }), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
