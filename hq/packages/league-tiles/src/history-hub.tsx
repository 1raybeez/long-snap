import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { TileLink } from "./contract.ts";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import {
  activeFranchiseResumes, championOwnerIds, championshipResults, completedSeasons, hallOfFameResumes, mergeActiveFranchises, mergeConstantCoOwners,
  trophyChampions, trophyPodiums, trophyShame,
  type HistoryActiveFranchise, type HistoryOwner, type HistorySeasonResult,
} from "./league-history.ts";

export type HistoryView = "overview" | "story" | "lore" | "champions" | "hall-of-fame" | "trophy-room";
export type HallScope = "active" | "retired" | "all";
export type TrophyTab = "champions" | "podiums" | "shame";

export interface HistoryHubConfig {
  readonly leagueName: string;
  readonly currentSeason: number;
  /** e.g. "12-team" and "Dynasty league" for the "League format" card. */
  readonly formatValue: string;
  readonly formatNote: string;
  readonly eras: readonly { readonly years: string; readonly text: string }[];
  readonly coverageNote?: string | null;
  /**
   * The league's own story (e.g. how it started). `**bold**` in a paragraph is shown in bold; `callout` is a
   * highlighted pull quote after the first paragraph; `memoriam` closes the story.
   */
  readonly annals?: { readonly eyebrow: string; readonly title: string; readonly paragraphs: readonly string[]; readonly callout?: { readonly title: string; readonly text: string } | null; readonly memoriam?: string | null } | null;
  /** League lore: the stories, rulings and legends behind the league (shown as its own History tab). */
  readonly lore?: { readonly intro?: string | null; readonly entries: readonly { readonly year?: string | null; readonly title: string; readonly text: string; readonly note?: string | null }[] } | null;
  readonly exploreLinks: readonly TileLink[];
  readonly activeFranchises: readonly HistoryActiveFranchise[];
  readonly methodologyNotes?: readonly string[];
  readonly backLink?: TileLink | null;
  /** Shown on Trophy Room cards as the league label. */
  readonly trophyLeagueLabel?: string;
  /** Optional per-season page (e.g. /history/2019); adds an "Every season" list to Overview. */
  readonly seasonHref?: ((season: number) => string) | null;
  /** Co-owners who always played together count as one shared entry (see mergeConstantCoOwners). */
  readonly mergeConstantCoOwners?: boolean;
}

export interface HistoryHubProps {
  readonly results: readonly HistorySeasonResult[];
  readonly owners: readonly HistoryOwner[];
  readonly config: HistoryHubConfig;
  readonly theme: LeagueTileTheme;
  readonly basePath: string;
  readonly view?: string | null;
  readonly scope?: string | null;
  readonly tab?: string | null;
}

const VIEWS: readonly { readonly id: HistoryView; readonly label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "story", label: "Our Story" }, { id: "lore", label: "League Lore" }, { id: "champions", label: "Champions" },
  { id: "hall-of-fame", label: "Hall of Fame" }, { id: "trophy-room", label: "Trophy Room" },
];
const pick = <T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(value ?? "") ? value as T : fallback;

/** "**word**" → bold, everything else as plain text. */
function bolded(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}

function Portrait({ name, photo, size = 44, grayscale = false }: { readonly name: string; readonly photo: string | null; readonly size?: number; readonly grayscale?: boolean }) {
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return photo
    ? <img className={`hh-portrait${grayscale ? " hh-gray" : ""}`} src={photo} alt="" width={size} height={size} loading="lazy" style={{ width: size, height: size }} />
    : <span className={`hh-portrait hh-portrait-fallback${grayscale ? " hh-gray" : ""}`} style={{ width: size, height: size }} aria-hidden="true">{initials}</span>;
}

export function HistoryHub({ results: rawResults, owners: rawOwners, config: rawConfig, theme, basePath, view, scope, tab }: HistoryHubProps) {
  const merged = rawConfig.mergeConstantCoOwners ? mergeConstantCoOwners(rawResults, rawOwners) : null;
  const results = merged?.results ?? rawResults;
  const owners = merged?.owners ?? rawOwners;
  const config: HistoryHubConfig = merged?.groups.length ? { ...rawConfig, activeFranchises: mergeActiveFranchises(rawConfig.activeFranchises, merged.groupOf) } : rawConfig;
  const sharedNote = merged?.groups.length ? `Co-owners who have always shared a team count as one entry: ${merged.groups.map((g) => g.name).join("; ")}.` : null;

  const views = VIEWS.filter((v) => (v.id !== "story" || Boolean(config.annals)) && (v.id !== "lore" || Boolean(config.lore?.entries.length)));
  const activeView = pick(view, views.map((v) => v.id), "overview");
  const hallScope = pick<HallScope>(scope, ["active", "retired", "all"], "active");
  const trophyTab = pick<TrophyTab>(tab, ["champions", "podiums", "shame"], "champions");
  const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
  const seasons = completedSeasons(results);
  const first = seasons.at(-1) ?? null, last = seasons[0] ?? null;
  const resumes = hallOfFameResumes(results, ownerMap);
  const championCount = championOwnerIds(results).length;
  const href = (params: Record<string, string>) => `${basePath}?${new URLSearchParams(params).toString()}`;

  return (
    <section className="league-tiles hh" style={themeCssVariables(theme) as CSSProperties}>
      {config.backLink ? <a className="hh-link" href={config.backLink.href}>← {config.backLink.label}</a> : null}
      <header className="hh-hero">
        <p className="hh-hero-eyebrow">{config.leagueName} History</p>
        <h1>A league built over time</h1>
        {first && last ? <p>The completed {config.leagueName} record runs from {first} through {last}. The {config.currentSeason} season is active and left out of completed-history honors.</p> : null}
      </header>
      <nav className="hh-pills" aria-label="History sections">
        {views.map((v) => <a key={v.id} href={v.id === "overview" ? basePath : href({ view: v.id })} aria-current={activeView === v.id ? "page" : undefined}>{v.label}</a>)}
      </nav>

      {activeView === "overview" ? <>
        <section className="hh-section" aria-labelledby="hh-glance"><h2 id="hh-glance">League at a glance</h2>
          <div className="hh-grid hh-grid-4">
            <div className="hh-card"><p className="hh-label">Seasons completed</p><p className="hh-big">{seasons.length}</p><p className="hh-note">{first}–{last}</p></div>
            <div className="hh-card"><p className="hh-label">Unique champions</p><p className="hh-big">{championCount}</p><p className="hh-note">Official championship credits{sharedNote ? " · shared teams count once" : ""}</p></div>
            <div className="hh-card"><p className="hh-label">History since</p><p className="hh-big">{first}</p><p className="hh-note">Reviewed final standings</p></div>
            <div className="hh-card"><p className="hh-label">League format</p><p className="hh-big">{config.formatValue}</p><p className="hh-note">{config.formatNote}</p></div>
          </div>
        </section>
        <section className="hh-section" aria-labelledby="hh-recent">
          <div className="hh-row"><div><p className="hh-eyebrow">The record</p><h2 id="hh-recent">Recent champions</h2></div><p className="hh-note">Completed seasons only</p></div>
          <div className="hh-grid hh-grid-5">{seasons.slice(0, 5).map((season) => {
            const champs = championshipResults(results).filter((r) => r.season === season);
            const names = champs.flatMap((r) => r.ownerIds.map((id) => ownerMap.get(id)?.name ?? id));
            const teams = champs.map((r) => r.teamName).filter(Boolean);
            return <article key={season} className="hh-card"><p className="hh-season">{season}</p><h3>{champs.length > 1 ? "Co-champions" : "Champion"}</h3><p className="hh-strong">{names.join(" · ")}</p>{teams.length ? <p className="hh-note">{teams.join(" · ")}</p> : null}</article>;
          })}</div>
        </section>
        {config.eras.length ? <section className="hh-section" aria-labelledby="hh-eras"><h2 id="hh-eras">League eras</h2>
          <div className="hh-grid hh-grid-2">{config.eras.map((era) => <div key={era.years} className="hh-card"><h3>{era.years}</h3><p className="hh-note">{era.text}</p></div>)}</div>
          {config.coverageNote ? <div className="hh-card hh-muted"><p className="hh-label">Historical data coverage</p><p className="hh-note">{config.coverageNote}</p></div> : null}
        </section> : null}
        {config.seasonHref ? <section className="hh-section" aria-labelledby="hh-seasons"><h2 id="hh-seasons">Every season</h2>
          <div className="hh-season-links">{seasons.map((season) => <a key={season} href={config.seasonHref!(season)}>{season}</a>)}</div>
        </section> : null}
        {config.annals ? <p className="hh-note hh-story-teaser"><b>{config.annals.title}:</b> how the league began. <a className="hh-link" href={href({ view: "story" })}>Read our story →</a>{config.lore?.entries.length ? <> · <a className="hh-link" href={href({ view: "lore" })}>League lore →</a></> : null}</p> : null}
        {config.exploreLinks.length ? <section className="hh-section" aria-labelledby="hh-explore"><h2 id="hh-explore">Explore more history</h2>
          <div className="hh-grid hh-grid-5">{config.exploreLinks.map((link) => <a key={link.href} className="hh-card hh-link" href={link.href}>{link.label} →</a>)}</div>
        </section> : null}
      </> : null}

      {activeView === "story" && config.annals ? <>
        {config.annals ? <section className="hh-annals" aria-labelledby="hh-annals"><p className="hh-eyebrow">{config.annals.eyebrow}</p><h2 id="hh-annals">{config.annals.title}</h2>{config.annals.paragraphs.map((p, i) => <Fragment key={p.slice(0, 40)}><p>{bolded(p)}</p>{i === 0 && config.annals?.callout ? <blockquote className="hh-callout"><p className="hh-callout-title">{config.annals.callout.title}</p><p>{config.annals.callout.text}</p></blockquote> : null}</Fragment>)}{config.annals.memoriam ? <div className="hh-memoriam"><p className="hh-eyebrow">In memoriam</p><p>{config.annals.memoriam}</p></div> : null}</section> : null}
      </> : null}

      {activeView === "lore" && config.lore ? <section className="hh-section hh-lore" aria-labelledby="hh-lore">
        <div><p className="hh-eyebrow">The legends</p><h2 id="hh-lore">League Lore</h2>{config.lore.intro ? <p className="hh-note">{config.lore.intro}</p> : null}</div>
        <ol className="hh-lore-list">{config.lore.entries.map((e) => <li key={e.title} className="hh-card">{e.year ? <p className="hh-eyebrow">{e.year}</p> : null}<h3>{e.title}</h3><p>{bolded(e.text)}</p>{e.note ? <p className="hh-note">{e.note}</p> : null}</li>)}</ol>
      </section> : null}

      {activeView === "champions" ? <section className="hh-section" aria-labelledby="hh-club">
        <div className="hh-row"><div><p className="hh-eyebrow">The honor roll</p><h2 id="hh-club">Champions Club</h2></div><p className="hh-note">{championCount} {sharedNote ? "champions (owners or shared teams)" : "managers"} with official titles</p></div>
        {sharedNote ? <p className="hh-note">{sharedNote}</p> : null}
        <div className="hh-grid hh-grid-3">{resumes.filter((r) => r.championships > 0).map((r) => <article key={r.ownerId} className="hh-card hh-flex"><Portrait name={r.manager} photo={r.photo} size={48} /><div><h3>{r.manager}</h3><p className="hh-eyebrow">{r.championships} {r.championships === 1 ? "title" : "titles"}</p><p className="hh-note">{r.championshipYears.join(" · ")}</p></div></article>)}</div>
      </section> : null}

      {activeView === "hall-of-fame" ? (() => {
        const activeRows = activeFranchiseResumes(resumes, config.activeFranchises, ownerMap);
        const rows = hallScope === "active" ? activeRows : hallScope === "retired" ? resumes.filter((r) => r.status === "FORMER") : resumes;
        const summary = hallScope === "all" ? `${resumes.length} managers · ${championCount} champions · ${seasons.length} completed seasons` : hallScope === "active" ? `${config.activeFranchises.length} active franchises` : `${rows.length} retired owners`;
        return <section className="hh-section" aria-labelledby="hh-hall">
          <div className="hh-row"><div><p className="hh-eyebrow">Hall of Fame</p><h2 id="hh-hall">All-Time Résumés</h2><p className="hh-note">Career rankings across {config.leagueName} history.</p></div><p className="hh-label">{summary}</p></div>
          <div className="hh-pills hh-pills-square" role="group" aria-label="Hall of Fame views">
            {([["active", "Active franchises"], ["retired", "Retired owners"], ["all", "All-time owners"]] as const).map(([id, label]) => <a key={id} href={href({ view: "hall-of-fame", scope: id })} aria-current={hallScope === id ? "page" : undefined}>{label}</a>)}
          </div>
          <div className="hh-table-card">
            <table className="hh-table"><caption className="hh-sr">{config.leagueName} Hall of Fame</caption>
              <thead><tr><th scope="col">Rank</th><th scope="col">Manager</th><th scope="col" className="c">Titles</th><th scope="col" className="c">Podiums</th><th scope="col" className="c">Avg finish</th><th scope="col" className="c">Seasons</th><th scope="col" className="r">Status</th></tr></thead>
              {}
              <tbody>{rows.map((r, i) => <tr key={r.ownerId} className={i < 3 ? "hh-top" : ""}>
                <td><span className={`hh-rank${i < 3 ? " hh-rank-top" : ""}`}>{i + 1}</span></td>
                <th scope="row"><div className="hh-flex"><Portrait name={r.manager} photo={r.photo} size={40} /><div><span>{r.manager}</span>{r.coOwnerLabel ? <span className="hh-note hh-block">with {r.coOwnerLabel}</span> : null}</div></div></th>
                <td className="c hh-accent">{r.championships}</td><td className="c">{r.podiumFinishes}</td><td className="c">{r.averageFinish.toFixed(2)}</td><td className="c">{r.seasonsPlayed}</td><td className="r hh-label">{r.status}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <details className="hh-card hh-muted"><summary>Hall of Fame methodology</summary>
            <p className="hh-note">Rankings use completed {config.leagueName} seasons{first && last ? ` from ${first}–${last}` : ""}, ordered by championships, then average finish, then podiums, then name. Co-owners receive the shared season placement. The active {config.currentSeason} season is excluded.</p>
            {(config.methodologyNotes ?? []).map((note) => <p key={note} className="hh-note">{note}</p>)}
            {sharedNote ? <p className="hh-note">{sharedNote}</p> : null}
          </details>
        </section>;
      })() : null}

      {activeView === "trophy-room" ? <section className="hh-section" aria-labelledby="hh-trophy">
        <div className="hh-card"><p className="hh-eyebrow">League Info</p><h2 id="hh-trophy" className="hh-display">{config.leagueName} Trophy Room</h2><p className="hh-note">Champions, podium finishes and league honors from {config.leagueName} history.</p></div>
        <div className="hh-tabs" role="tablist" aria-label="Trophy Room categories">
          {([["champions", "Champions"], ["podiums", "Podiums"], ["shame", "Shame"]] as const).map(([id, label]) => <a key={id} role="tab" aria-selected={trophyTab === id} className={`hh-tab hh-tab-${id}`} href={href({ view: "trophy-room", tab: id })}>{label}</a>)}
        </div>
        {trophyTab === "champions" ? <div className="hh-grid hh-grid-3">{trophyChampions(results, ownerMap).map((c) => <article key={`${c.season}-${c.ownerId}`} className="hh-champ">
          <div className="hh-champ-band"><span>{c.season}</span><b aria-hidden="true">🏆</b></div>
          <div className="hh-champ-body"><Portrait name={c.name} photo={c.photo} size={92} /><h3>{c.season}</h3><p className="hh-eyebrow">{c.name}</p>{c.teamName ? <p className="hh-chip">{c.teamName}</p> : null}{config.trophyLeagueLabel ? <p className="hh-tiny">{config.trophyLeagueLabel}</p> : null}</div>
        </article>)}</div> : null}
        {trophyTab === "podiums" ? <div className="hh-table-card"><table className="hh-table"><thead><tr><th>Rank</th><th>Manager</th><th className="c">Gold</th><th className="c">Silver</th><th className="c">Bronze</th><th className="r">Total</th></tr></thead>
          <tbody>{trophyPodiums(resumes).map((p) => <tr key={p.ownerId}><td className="hh-faint">#{p.rank}</td><th scope="row"><div className="hh-flex"><Portrait name={p.name} photo={p.photo} size={40} /><span className="hh-upper">{p.name}</span></div></th><td className="c hh-gold">{p.gold}</td><td className="c hh-silver">{p.silver}</td><td className="c hh-bronze">{p.bronze}</td><td className="r hh-total">{p.total}</td></tr>)}</tbody></table></div> : null}
        {trophyTab === "shame" ? <><p className="hh-note hh-center">The final last-place finisher from each completed {config.leagueName} season.</p>
          <div className="hh-grid hh-grid-5">{trophyShame(results, ownerMap).map((s) => <article key={s.season} className="hh-shame"><Portrait name={s.names} photo={s.photo} size={76} grayscale /><h3>{s.season}</h3><p className="hh-tiny">{s.names}</p></article>)}</div></> : null}
      </section> : null}
    </section>
  );
}
