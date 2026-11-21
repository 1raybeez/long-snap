import "server-only";

/** True while an NFL game is in progress (ESPN's public scoreboard, cached 30 s). Drives the pages' live refresh. */
export async function nflGameLive(): Promise<boolean> {
  try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", { cache: "no-store" } as RequestInit);
    if (!r.ok) return false;
    const j = (await r.json()) as { events?: { status?: { type?: { state?: string } } }[] };
    return (j.events ?? []).some((e) => e.status?.type?.state === "in");
  } catch {
    return false;
  }
}
