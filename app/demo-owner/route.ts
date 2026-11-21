import { NextResponse } from "next/server";
import { DEMO_OWNER_COOKIE } from "@/lib/demo/demoSession";
import { isDemoMode } from "@/lib/demo/demoLeagues";

/** Demo only: /demo-owner?team=3&next=/harbor-city-ffl/gm signs the visitor in as team 3's owner; team=out signs out. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.redirect(new URL(safe, url.origin));
  if (!isDemoMode()) return res;
  const team = url.searchParams.get("team") ?? "";
  if (/^(?:[1-9]|1[0-2])$/.test(team)) res.cookies.set(DEMO_OWNER_COOKIE, team, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 });
  else res.cookies.delete(DEMO_OWNER_COOKIE);
  return res;
}
