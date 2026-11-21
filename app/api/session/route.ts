import { NextResponse } from "next/server";

/** Sign-in comes with the Full edition; the Basic edition has no accounts. */
export async function GET() {
  return NextResponse.json({ signedIn: false, leagues: null }, { headers: { "Cache-Control": "private, no-store" } });
}
