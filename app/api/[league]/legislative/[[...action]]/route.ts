import { NextResponse } from "next/server";
import { callLeagueLegislative, hasLegislativeHub } from "@/lib/legislativeHub";
import { platformLeague } from "@/lib/platformLeagues";
import { unsafePost } from "@/lib/siteForward";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["vote", "commissioner"]);
const PRIVATE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ league: string; action?: string[] }> }) {
  const p = await params;
  const league = platformLeague(p.league);
  const action = p.action?.[0];
  if (!league || !hasLegislativeHub(league.id) || (action && !ACTIONS.has(action)) || (p.action?.length ?? 0) > 1) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404, headers: PRIVATE });
  const unsafe = unsafePost(request);
  if (unsafe) return NextResponse.json({ ok: false, error: unsafe }, { status: unsafe.startsWith("Cross") ? 403 : 415, headers: PRIVATE });
  const body = await request.text();
  if (body.length > 100_000) return NextResponse.json({ ok: false, error: "That's too long." }, { status: 413, headers: PRIVATE });
  const r = await callLeagueLegislative(league, (action ?? "hub") as "hub" | "vote" | "commissioner", { method: "POST", body });
  return NextResponse.json(r.body, { status: r.status, headers: PRIVATE });
}
