import type { CSSProperties } from "react";
/**
 * League themes for the shared tiles. Structure and behavior are universal;
 * only these tokens (plus logo and copy) differ per league.
 */
export interface LeagueTileTheme {
  readonly leagueId: string;
  readonly name: string;
  readonly tagline: string;
  readonly colors: {
    readonly page: string;
    readonly header: string;
    readonly headerText: string;
    readonly card: string;
    readonly cardBorder: string;
    readonly text: string;
    readonly muted: string;
    readonly accent: string; // eyebrows, highlights
    readonly action: string; // buttons
    readonly actionText: string;
    readonly positive: string;
    readonly negative: string;
    readonly trophy: string;
  };

  readonly dark?: LeagueTileTheme["colors"];
  readonly fonts: { readonly display: string; readonly ui: string };
  readonly displayStyle: "italic-condensed" | "classic" | "modern";
}

export const LEAGUE_TILE_THEMES: Readonly<Record<string, LeagueTileTheme>> = {


};

/**
 * CSS custom properties consumed by tiles.css. Light values go in --tile-*, dark ones in --tile-*-dark;
 * tiles.css swaps them in when the device is in dark mode (prefers-color-scheme).
 */
export function themeCssVariables(theme: LeagueTileTheme): Record<string, string> {
  const c = theme.colors;
  const d = theme.dark;
  const dark: Record<string, string> = d ? {
    "--tile-page-dark": d.page, "--tile-header-dark": d.header, "--tile-header-text-dark": d.headerText,
    "--tile-card-dark": d.card, "--tile-border-dark": d.cardBorder, "--tile-text-dark": d.text, "--tile-muted-dark": d.muted,
    "--tile-accent-dark": d.accent, "--tile-action-dark": d.action, "--tile-action-text-dark": d.actionText,
    "--tile-positive-dark": d.positive, "--tile-negative-dark": d.negative, "--tile-trophy-dark": d.trophy,
  } : {};
  return {
    ...dark,
    "--tile-page": c.page, "--tile-header": c.header, "--tile-header-text": c.headerText,
    "--tile-card": c.card, "--tile-border": c.cardBorder, "--tile-text": c.text, "--tile-muted": c.muted,
    "--tile-accent": c.accent, "--tile-action": c.action, "--tile-action-text": c.actionText,
    "--tile-positive": c.positive, "--tile-negative": c.negative, "--tile-trophy": c.trophy,
    "--tile-font-display": theme.fonts.display, "--tile-font-ui": theme.fonts.ui,
    "--tile-display-style": theme.displayStyle === "italic-condensed" ? "italic" : "normal",
  };
}

/** Page background for a site's <main> around the tiles: follows the device's light/dark setting (see tiles.css .hq-page). */
export function pageStyle(theme: LeagueTileTheme): CSSProperties {
  return { "--hq-page-light": theme.colors.page, "--hq-page-dark": (theme.dark ?? theme.colors).page, background: "var(--hq-page)" } as CSSProperties;
}
