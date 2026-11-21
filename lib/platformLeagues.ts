import { HQ_LEAGUE_REGISTRY } from "../hq/config/leagues/registry.ts";
import { DEMO_LEAGUES } from "./demo/demoLeagues.ts";
import { LEAGUE_TILE_THEMES, type LeagueTileTheme } from "../hq/packages/league-tiles/src/themes.ts";

/**
 * Leagues on the one platform (One Platform Plan, 2026-11). Everything comes from the canonical league registry;
 * this file only adds what the platform needs on top: the league's theme, its logo, its current site address
 * (until that league moves over), and whether its pages are on the new site yet.
 */
export type PlatformLeague = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortName: string;
  readonly format: string;
  readonly season: number;
  readonly sleeperLeagueId: string | null;
  readonly fullSite: boolean;
  readonly theme: LeagueTileTheme | null;
  readonly logo: string | null;
  readonly currentSiteUrl: string | null;

  readonly onPlatform: boolean;
  /** Sleeper league id of the previous season, when known (e.g. last year's pick'em champion). */
  readonly previousSleeperLeagueId: string | null;
};

const CURRENT_SITES: Readonly<Record<string, string>> = {
};

const LOGOS: Readonly<Record<string, string>> = {


};

const ON_PLATFORM: ReadonlySet<string> = new Set([...Object.values(DEMO_LEAGUES).map((l) => l.slug), ]);

/** Leagues with no league site of their own get a simple platform theme. */
export const PLATFORM_THEMES: Readonly<Record<string, LeagueTileTheme>> = {
  [DEMO_LEAGUES.redraft.slug]: {
    leagueId: DEMO_LEAGUES.redraft.slug,
    name: DEMO_LEAGUES.redraft.name,
    tagline: DEMO_LEAGUES.redraft.tagline,
    colors: { page: "#f4f6f9", header: "#111827", headerText: "#ffffff", card: "#ffffff", cardBorder: "#dfe4ec", text: "#0f172a", muted: "#5b6578", accent: "#c8102e", action: "#1d4ed8", actionText: "#ffffff", positive: "#15803d", negative: "#dc2626", trophy: "#c99a2e" },
    dark: { page: "#070d1c", header: "#111827", headerText: "#ffffff", card: "#0f1a33", cardBorder: "#24345a", text: "#e6ebf5", muted: "#9aa6c0", accent: "#c8102e", action: "#3b6fd6", actionText: "#ffffff", positive: "#3ccb84", negative: "#f26b6b", trophy: "#e8b923" },
    fonts: { display: "'Inter', 'Helvetica Neue', Arial, sans-serif", ui: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    displayStyle: "italic-condensed",
  } as LeagueTileTheme,
  [DEMO_LEAGUES.keeper.slug]: {
    leagueId: DEMO_LEAGUES.keeper.slug,
    name: DEMO_LEAGUES.keeper.name,
    tagline: DEMO_LEAGUES.keeper.tagline,
    colors: { page: "#f4f6f9", header: "#14301f", headerText: "#ffffff", card: "#ffffff", cardBorder: "#dfe4ec", text: "#0f172a", muted: "#5b6578", accent: "#ca8a04", action: "#15803d", actionText: "#ffffff", positive: "#15803d", negative: "#dc2626", trophy: "#c99a2e" },
    dark: { page: "#070d1c", header: "#14301f", headerText: "#ffffff", card: "#0f1a33", cardBorder: "#24345a", text: "#e6ebf5", muted: "#9aa6c0", accent: "#ca8a04", action: "#3b6fd6", actionText: "#ffffff", positive: "#3ccb84", negative: "#f26b6b", trophy: "#e8b923" },
    fonts: { display: "'Inter', 'Helvetica Neue', Arial, sans-serif", ui: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    displayStyle: "italic-condensed",
  } as LeagueTileTheme,
  [DEMO_LEAGUES.auction.slug]: {
    leagueId: DEMO_LEAGUES.auction.slug,
    name: DEMO_LEAGUES.auction.name,
    tagline: DEMO_LEAGUES.auction.tagline,
    colors: { page: "#f4f6f9", header: "#071a33", headerText: "#ffffff", card: "#ffffff", cardBorder: "#dfe4ec", text: "#0f172a", muted: "#5b6578", accent: "#ea580c", action: "#1d4ed8", actionText: "#ffffff", positive: "#15803d", negative: "#dc2626", trophy: "#c99a2e" },
    dark: { page: "#070d1c", header: "#071a33", headerText: "#ffffff", card: "#0f1a33", cardBorder: "#24345a", text: "#e6ebf5", muted: "#9aa6c0", accent: "#ea580c", action: "#3b6fd6", actionText: "#ffffff", positive: "#3ccb84", negative: "#f26b6b", trophy: "#e8b923" },
    fonts: { display: "'Inter', 'Helvetica Neue', Arial, sans-serif", ui: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    displayStyle: "italic-condensed",
  } as LeagueTileTheme,
  [DEMO_LEAGUES.dynasty.slug]: {
    leagueId: DEMO_LEAGUES.dynasty.slug,
    name: DEMO_LEAGUES.dynasty.name,
    tagline: DEMO_LEAGUES.dynasty.tagline,
    colors: { page: "#f4f6f9", header: "#1E2A32", headerText: "#ffffff", card: "#ffffff", cardBorder: "#dfe4ec", text: "#0f172a", muted: "#5b6578", accent: "#F15B24", action: "#1F6F8F", actionText: "#ffffff", positive: "#15803d", negative: "#dc2626", trophy: "#c99a2e" },
    dark: { page: "#070d1c", header: "#1E2A32", headerText: "#ffffff", card: "#0f1a33", cardBorder: "#24345a", text: "#e6ebf5", muted: "#9aa6c0", accent: "#F15B24", action: "#3b6fd6", actionText: "#ffffff", positive: "#3ccb84", negative: "#f26b6b", trophy: "#e8b923" },
    fonts: { display: "'Inter', 'Helvetica Neue', Arial, sans-serif", ui: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    displayStyle: "italic-condensed",
  } as LeagueTileTheme,
};

const FORMAT_LABEL: Readonly<Record<string, string>> = {
  AUCTION_KEEPER: "Auction keeper",
  DYNASTY: "Dynasty",
  REDRAFT: "Redraft",
  KEEPER: "Keeper",
  PICKEM: "Pick'em",
};

export function platformLeagues(): PlatformLeague[] {
  return HQ_LEAGUE_REGISTRY.leagues
    .filter((l) => l.lifecycle === "ACTIVE")
    .map((l) => {
      const season = l.seasons.find((s) => s.season === l.currentSeason);
      const sleeper = season?.providerBindings.find((b) => b.provider === "SLEEPER")?.externalLeagueId ?? null;
      const prev = l.seasons.find((s) => s.season === l.currentSeason - 1)?.providerBindings.find((b) => b.provider === "SLEEPER")?.externalLeagueId ?? null;
      return {
        id: l.id,
        slug: l.slug,
        name: l.displayName,
        shortName: l.shortName,
        format: FORMAT_LABEL[l.format] ?? l.format,
        season: l.currentSeason,
        sleeperLeagueId: sleeper,
        fullSite: l.dedicatedWebsite,
        theme: LEAGUE_TILE_THEMES[l.id] ?? PLATFORM_THEMES[l.id] ?? null,
        logo: LOGOS[l.id] ?? null,
        currentSiteUrl: CURRENT_SITES[l.id] ?? null,
        onPlatform: ON_PLATFORM.has(l.id),
        previousSleeperLeagueId: prev,
      };
    })
    // Full-site leagues first, then tool-only leagues; alphabetical within each.
    .sort((a, b) => Number(b.fullSite) - Number(a.fullSite) || a.name.localeCompare(b.name));
}

export function platformLeague(slug: string): PlatformLeague | null {
  return platformLeagues().find((l) => l.slug === slug) ?? null;
}
