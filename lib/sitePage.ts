import type { PlatformLeague } from "./platformLeagues.ts";
import { DEMO_SLUGS } from "./demo/demoLeagues.ts";
import { OWN_LEAGUE } from "./ownLeague.ts";
import { LCC_ENGINE, RIVER_CITY_ENGINE, RVA_ENGINE } from "./leagueFeatures.ts";

export async function sitePage<T>(league: PlatformLeague, view: string, params: Record<string, string | number> = {}): Promise<T | null> {
  if (OWN_LEAGUE && league.id === OWN_LEAGUE.slug) {
    if (view !== "season") return null;
    const [{ loadLeagueData }, { ownSeasonPage }] = await Promise.all([import("./leagueData.ts"), import("./ownLeagueData.ts")]);
    const d = await loadLeagueData(league.id, null);
    return d ? (ownSeasonPage(d, Number(params.season)) as T | null) : null;
  }
  if (DEMO_SLUGS.includes(league.id)) {
    const { demoSitePage } = await import("./demo/demoPages.ts");
    return demoSitePage<T>(league.id, view, params);
  }
  if (league.id === "long-country-club" && LCC_ENGINE.has("pages")) {
    try {
      const { lccSitePage } = await import("./lccPages.ts");
      return await lccSitePage<T>(view, params);
    } catch (error) {
      console.error("LCC_PAGE_MODEL_FAILED", view, error instanceof Error ? error.name : "unknown");
      return null;
    }
  }
  if (league.id === "rva-eskimo-brothers" && RVA_ENGINE.has("pages")) {
    try {
      const { rvaSitePage } = await import("./rvaPages.ts");
      return await rvaSitePage<T>(view, params);
    } catch (error) {
      console.error("RVA_PAGE_MODEL_FAILED", view, error instanceof Error ? error.name : "unknown");
      return null;
    }
  }
  if (league.id === "river-city-ffl" && RIVER_CITY_ENGINE.has("pages")) {
    try {
      const { riverCityCachedPage } = await import("./riverCityPages.ts");
      return await riverCityCachedPage<T>(view, params);
    } catch (error) {
      console.error("RC_PAGE_MODEL_FAILED", view, error instanceof Error ? error.name : "unknown");
      return null;
    }
  }
  if (!league.currentSiteUrl) return null;
  const q = new URLSearchParams({ view, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  try {
    const r = await fetch(`${league.currentSiteUrl}/api/platform/page?${q}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) } as RequestInit);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}
