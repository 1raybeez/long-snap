import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { SectionTabs } from "./section-tabs.tsx";

/**
 * Shared League Info → Resources page (2026-10-28).
 *
 * One layout for every league. The outside links come from the shared HQ
 * catalog (packages/league-resources → each site's data/resources/league-resources.json);
 * each site adds its own "Our league" links (Sleeper, recaps, etc.).
 * Server-rendered, no client code: sections with a jump bar, like the Record Book.
 */

export type ResourceCost = "Free" | "Freemium" | "Premium";

export interface ResourceItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly spotifyUrl?: string;
  readonly type?: ResourceCost;
  readonly attribution?: string;
}

export interface ResourceGroup { readonly id: string; readonly label: string; readonly resources: readonly ResourceItem[] }

export interface ResourcePlaylist { readonly year: number; readonly label: string; readonly title?: string; readonly appleMusicUrl: string; readonly spotifyUrl?: string }

/** A league's own link: the league on Sleeper, a recap site, an on-site page. */
export interface LeagueLink { readonly name: string; readonly description: string; readonly url: string; readonly external?: boolean; readonly badge?: string }

export interface ResourcesViewProps {
  readonly leagueName: string;
  readonly theme: LeagueTileTheme;
  readonly groups: readonly ResourceGroup[];
  readonly playlists?: readonly ResourcePlaylist[];
  readonly leagueLinks?: readonly LeagueLink[];
  /** Short line under the title. */
  readonly intro?: string;
  /** Inside another page (e.g. the Draft tab): no page title, no tab bar, every section shown. */
  readonly embedded?: boolean;
}

const SECTION: Record<string, { title: string; note: string }> = {
  podcasts: { title: "Podcasts", note: "Shows to listen to on the drive in. Apple Podcasts or Spotify." },
  websites: { title: "Research & Rankings", note: "Rankings, projections, news and waiver help." },
  analyzers: { title: "Trade Tools", note: "Calculators and analyzers for sanity-checking a deal before you send it." },
};

const ORDER = ["podcasts", "websites", "analyzers"];

function Cost({ type }: { readonly type?: ResourceCost }) {
  if (!type) return null;
  return <span className={`rs-cost rs-cost--${type.toLowerCase()}`}>{type}</span>;
}

function ext(url: string) {
  return /^https?:\/\//.test(url);
}

function ResourceCard({ item, podcast }: { readonly item: ResourceItem; readonly podcast: boolean }) {
  if (podcast) {
    return (
      <article className="hh-card rs-card">
        <div className="rs-card-top"><h3 className="rs-name">{item.name}</h3><Cost type={item.type} /></div>
        <p className="hh-note rs-desc">{item.description}</p>
        <div className="rs-buttons">
          <a className="rs-btn" href={item.url} target="_blank" rel="noopener noreferrer">Apple Podcasts</a>
          {item.spotifyUrl ? <a className="rs-btn rs-btn--spotify" href={item.spotifyUrl} target="_blank" rel="noopener noreferrer">Spotify</a> : null}
        </div>
      </article>
    );
  }
  return (
    <a className="hh-card rs-card rs-card--link" href={item.url} target="_blank" rel="noopener noreferrer">
      <div className="rs-card-top"><h3 className="rs-name">{item.name}</h3><Cost type={item.type} /></div>
      <p className="hh-note rs-desc">{item.description}</p>
      {item.attribution ? <p className="hh-tiny rs-credit">{item.attribution}</p> : null}
      <span className="rs-open">Open ↗</span>
    </a>
  );
}

export function ResourcesView({ leagueName, theme, groups, playlists = [], leagueLinks = [], intro, embedded = false }: ResourcesViewProps) {
  // The league's own Sleeper link (catalog group "league-platform") leads "Our League".
  const platform = groups.find((g) => g.id === "league-platform")?.resources ?? [];
  const links: LeagueLink[] = [
    ...platform.map((r) => ({ name: r.name, description: r.description, url: r.url, external: true, badge: "Sleeper" })),
    ...leagueLinks.filter((l) => !platform.some((r) => r.url === l.url)),
  ];
  const shared = ORDER.map((id) => groups.find((g) => g.id === id)).filter((g): g is ResourceGroup => Boolean(g && g.resources.length));
  const total = shared.reduce((n, g) => n + g.resources.length, 0);
  const jump = [
    ...(links.length ? [{ id: "league", title: "Our League" }] : []),
    ...(playlists.length ? [{ id: "playlists", title: "Draft Day Playlists" }] : []),
    ...shared.map((g) => ({ id: g.id, title: SECTION[g.id]?.title ?? g.label })),
  ];
  const first = jump[0]?.id;
  return (
    <section className="league-tiles hh rs" style={themeCssVariables(theme) as CSSProperties}>
      {embedded ? null : <header className="hh-hero">
        <p className="hh-hero-eyebrow">{leagueName} · League Info</p>
        <h1>Resources</h1>
        <p>{intro ?? `Everything useful around ${leagueName}: our league links, plus ${total} podcasts, research sites and trade tools worth bookmarking.`}</p>
      </header>}

      {embedded ? null : <SectionTabs label="Resource sections" targetId="rs-panels" tabs={jump.map((s) => ({ id: `rs-${s.id}`, label: s.title }))} />}
      <div id="rs-panels">

      {links.length ? (
        <section id="rs-league" data-tab="rs-league" hidden={!embedded && first !== "league"} className="rs-section" aria-labelledby="rs-league-title">
          <h2 id="rs-league-title" className="rs-h2">Our League</h2>
          <div className="rs-grid rs-grid--league">
            {links.map((link) => {
              const outside = link.external ?? ext(link.url);
              return (
                <a key={link.url} className="hh-card rs-card rs-card--link rs-card--league" href={link.url} {...(outside ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  <div className="rs-card-top"><h3 className="rs-name">{link.name}</h3>{link.badge ? <span className="rs-cost rs-cost--league">{link.badge}</span> : null}</div>
                  <p className="hh-note rs-desc">{link.description}</p>
                  <span className="rs-open">{outside ? "Open ↗" : "Go →"}</span>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      {playlists.length ? (
        <section id="rs-playlists" data-tab="rs-playlists" hidden={!embedded && first !== "playlists"} className="rs-section" aria-labelledby="rs-playlists-title">
          <h2 id="rs-playlists-title" className="rs-h2">Draft Day Playlists</h2>
          <p className="hh-note">The soundtrack of the in-person draft, one playlist per year.</p>
          {(() => {
            const sorted = [...playlists].sort((x, y) => y.year - x.year);
            const [current, ...past] = sorted;
            const card = (p: ResourcePlaylist, isCurrent: boolean) => (
              <article key={p.year} className={`hh-card rs-card rs-playlist${isCurrent ? " rs-playlist--current" : ""}`}>
                <p className="rs-year">{p.year}</p>
                <p className="rs-playlist-label">Draft Playlist{isCurrent ? <span className="rs-cost rs-cost--league rs-now">This year</span> : null}</p>
                <div className="rs-buttons">
                  <a className="rs-btn" href={p.appleMusicUrl} target="_blank" rel="noopener noreferrer">Apple Music</a>
                  {p.spotifyUrl ? <a className="rs-btn rs-btn--spotify" href={p.spotifyUrl} target="_blank" rel="noopener noreferrer">Spotify</a> : null}
                </div>
              </article>
            );
            return (
              <>
                <div className="rs-grid">{card(current, true)}</div>
                {past.length ? (
                  <>
                    <h3 className="rs-sub">Past drafts</h3>
                    <div className="rs-grid">{past.map((p) => card(p, false))}</div>
                  </>
                ) : null}
              </>
            );
          })()}
        </section>
      ) : null}

      {shared.map((g) => (
        <section key={g.id} id={`rs-${g.id}`} data-tab={`rs-${g.id}`} hidden={!embedded && first !== g.id} className="rs-section" aria-labelledby={`rs-${g.id}-title`}>
          <h2 id={`rs-${g.id}-title`} className="rs-h2">{SECTION[g.id]?.title ?? g.label} <span className="rs-count">{g.resources.length}</span></h2>
          {SECTION[g.id] ? <p className="hh-note">{SECTION[g.id].note}</p> : null}
          <div className="rs-grid">
            {g.resources.map((item) => <ResourceCard key={item.id} item={item} podcast={g.id === "podcasts"} />)}
          </div>
        </section>
      ))}

      </div>

      <p className="hh-tiny rs-legend">
        <span className="rs-cost rs-cost--free">Free</span> no account needed · <span className="rs-cost rs-cost--freemium">Freemium</span> free with paid extras · <span className="rs-cost rs-cost--premium">Premium</span> mostly paid. Outside sites open in a new tab; the league isn't affiliated with any of them.
      </p>
    </section>
  );
}
