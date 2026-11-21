import type { CSSProperties, ReactNode } from "react";
import type { TileLink } from "./contract.ts";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";

export interface LeagueOverviewModel {
  readonly title: string;
  readonly description: string;
  readonly snapshot: readonly { readonly label: string; readonly value: string }[];
  readonly currentSeason: {
    readonly paragraphs: readonly string[];
    readonly reigningChampion?: { readonly name: string; readonly season: number; readonly href?: string | null } | null;
    readonly links?: readonly TileLink[];
  };
  readonly format: { readonly title: string; readonly bullets: readonly string[]; readonly links: readonly TileLink[] };
  readonly history: { readonly paragraphs: readonly string[]; readonly link: TileLink };
  /** Opening of the league's story; `teaser` null shows `emptyText` instead (no story written yet). */
  readonly story: { readonly title: string; readonly teaser: string | null; readonly emptyText?: string | null; readonly link: TileLink | null };
}

function Box({ eyebrow, title, icon, children, muted = false }: { readonly eyebrow: string; readonly title: string; readonly icon: string; readonly children: ReactNode; readonly muted?: boolean }) {
  return (
    <article className={`hh-card ov-box${muted ? " ov-muted" : ""}`}>
      <div className="ov-box-head"><div><p className="hh-eyebrow">{eyebrow}</p><h3 className="ov-box-title">{title}</h3></div><span className="ov-icon" aria-hidden="true">{icon}</span></div>
      <div className="ov-body">{children}</div>
    </article>
  );
}

function Links({ links }: { readonly links: readonly TileLink[] }) {
  return links.length ? <div className="ov-links">{links.map((l) => <a key={l.href} className="ov-link" href={l.href}>{l.label} →</a>)}</div> : null;
}

export function LeagueOverview({ model, theme }: { readonly model: LeagueOverviewModel; readonly theme: LeagueTileTheme }) {
  const m = model;
  const champ = m.currentSeason.reigningChampion;
  return (
    <section className="league-tiles hh ov" style={themeCssVariables(theme) as CSSProperties}>
      <header className="ov-head">
        <p className="hh-eyebrow">Overview</p>
        <h2 className="ov-title">{m.title}</h2>
        <p className="ov-desc">{m.description}</p>
      </header>

      <section className="hh-section" aria-labelledby="ov-snapshot">
        <div><p className="hh-eyebrow">The essentials</p><h2 id="ov-snapshot">League Snapshot</h2></div>
        <dl className="ov-facts">{m.snapshot.map((f) => <div key={f.label} className="hh-card ov-fact"><dt className="hh-label">{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
      </section>

      <section className="ov-grid" aria-label="League reference">
        <Box eyebrow="Right now" title="Current Season" icon="📅">
          {m.currentSeason.paragraphs.map((p) => <p key={p}>{p}</p>)}
          {champ ? <p className="ov-fine">Reigning champion entering the season: <strong>{champ.href ? <a href={champ.href}>{champ.name}</a> : champ.name}</strong> ({champ.season}).</p> : null}
          <Links links={m.currentSeason.links ?? []} />
        </Box>
        <Box eyebrow="The game" title={m.format.title} icon="📘">
          <ul className="ov-bullets">{m.format.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
          <Links links={m.format.links} />
        </Box>
        <Box eyebrow="The legacy" title="League History" icon="🏛️">
          {m.history.paragraphs.map((p, i) => <p key={p} className={i ? "ov-fine" : undefined}>{p}</p>)}
          <Links links={[m.history.link]} />
        </Box>
        <Box eyebrow="The identity" title={m.story.title} icon="📜" muted={!m.story.teaser}>
          {m.story.teaser ? <p className="ov-story">{m.story.teaser}</p> : <p className="ov-fine">{m.story.emptyText ?? "The league's story hasn't been written yet."}</p>}
          {m.story.link ? <Links links={[m.story.link]} /> : null}
        </Box>
      </section>
    </section>
  );
}

/** First paragraph of a story with `**bold**` markers removed, for teasers. */
export function storyTeaser(paragraphs: readonly string[] | null | undefined): string | null {
  const first = paragraphs?.[0];
  return first ? first.replace(/\*\*/g, "") : null;
}
