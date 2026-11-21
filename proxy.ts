import { NextResponse } from "next/server";

/** Nothing to redirect on a Long Snap site. */
export function proxy() {
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)"] };
