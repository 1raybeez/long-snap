import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";

export interface DirectoryOwner { readonly id: string; readonly name: string; readonly photo: string | null; readonly href: string; readonly teamName: string | null; readonly coOwner: string | null; readonly titles: number; readonly podiums: number; readonly seasons: number; readonly averageFinish: number | null; readonly active: boolean; readonly tag?: string | null; readonly group?: string | null; /** Last-place finishes ("toilets"). */ readonly toilets?: number | null; /** Team mode from the owner's survey (Rebuild / Win Now / Dynasty). */ readonly mode?: string | null }
/** League office (commissioner staff, auctioneer, etc.), shown on a Staff tab when given. */
export interface DirectoryStaff { readonly id: string; readonly name: string; readonly photo: string | null; readonly role: string; readonly detail?: string | null; readonly href?: string | null }
export interface DirectoryFranchise { readonly id: string; readonly name: string; readonly image: string | null; readonly href: string; readonly owners: readonly { readonly name: string; readonly href: string }[]; readonly since: number | null; readonly ownershipChanges: number; readonly titles: number; readonly record: string | null }

type View = "owners" | "divisions" | "franchises" | "retired" | "staff";

function Card({ o }: { readonly o: DirectoryOwner }) {
  return <a className="md-card" href={o.href}>
    <div className="md-photo">{o.photo ? <img src={o.photo} alt="" loading="lazy" /> : <span>{o.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2)}</span>}<div className="md-photo-label">{o.tag ? <small>{o.tag}</small> : null}{o.mode ? <small className="md-mode">{o.mode}</small> : null}<b>{o.name}</b>{o.teamName ? <em>{o.teamName}</em> : null}</div></div>
    {o.coOwner ? <p className="md-co">Co-owner · {o.coOwner}</p> : null}
    <dl className={`md-stats${typeof o.toilets === "number" ? " md-stats-5" : ""}`}><div><dt>Titles</dt><dd>{o.titles}</dd></div><div><dt>Podiums</dt><dd>{o.podiums}</dd></div>{typeof o.toilets === "number" ? <div title="Last-place finishes"><dt>Toilets</dt><dd>{o.toilets}</dd></div> : null}<div><dt>Seasons</dt><dd>{o.seasons}</dd></div><div><dt>Avg</dt><dd>{o.averageFinish ? o.averageFinish.toFixed(1) : "—"}</dd></div></dl>
  </a>;
}

export function ManagersDirectory({ leagueName, owners, franchises, staff, theme, view, basePath = "/managers", groupLabel = "Divisions" }: { readonly leagueName: string; readonly owners: readonly DirectoryOwner[]; readonly franchises?: readonly DirectoryFranchise[] | null; readonly staff?: readonly DirectoryStaff[] | null; readonly theme: LeagueTileTheme; readonly view?: string | null; readonly basePath?: string; readonly groupLabel?: string }) {
  const groups = [...new Set(owners.filter((o) => o.active && o.group).map((o) => o.group!))];
  const views: [View, string][] = [["owners", "Active owners"], ...(groups.length ? [["divisions", groupLabel] as [View, string]] : []), ...(franchises?.length ? [["franchises", "Franchises"] as [View, string]] : []), ["retired", "Retired owners"], ...(staff?.length ? [["staff", "Staff"] as [View, string]] : [])];
  const active: View = views.some(([id]) => id === view) ? view as View : "owners";
  const list = owners.filter((o) => (active === "retired" ? !o.active : o.active));
  return (
    <section className="league-tiles hh md" style={themeCssVariables(theme) as CSSProperties}>
      <header className="md-head">
        <div><p className="hh-eyebrow">{leagueName} · Managers</p><h1>League Owners</h1><p className="hh-note">Current managers, their legacies, and the league's history makers.</p></div>
        <nav className="hh-pills hh-pills-square" aria-label="Manager views">{views.map(([id, label]) => <a key={id} href={id === "owners" ? basePath : `${basePath}?view=${id}`} aria-current={active === id ? "page" : undefined}>{label}</a>)}</nav>
      </header>
      {active === "franchises" && franchises ? <div className="hh-grid hh-grid-4">{franchises.map((f) => <a key={f.id} className="md-franchise" href={f.href}>
        <div className="md-fr-image">{f.image ? <img src={f.image} alt="" loading="lazy" /> : null}<b>{f.name}</b></div>
        <div className="md-fr-body"><p className="md-fr-owners">{f.owners.map((o) => o.name).join(" + ")}</p><p className="hh-note">{f.since ? `Since ${f.since}` : ""}{f.ownershipChanges ? ` · ${f.ownershipChanges} ownership ${f.ownershipChanges === 1 ? "change" : "changes"}` : " · Original owner"}</p><dl className="md-stats md-stats-3"><div><dt>Titles</dt><dd>{f.titles}</dd></div><div><dt>Record</dt><dd>{f.record ?? "—"}</dd></div><div><dt>History</dt><dd>View →</dd></div></dl></div>
      </a>)}</div> : active === "staff" && staff ? <div className="hh-grid hh-grid-4">{staff.map((p) => { const body = <><div className="md-photo">{p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <span>{p.name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2)}</span>}<div className="md-photo-label"><small>{p.role}</small><b>{p.name}</b></div></div>{p.detail ? <p className="md-co">{p.detail}</p> : null}</>; return p.href ? <a key={p.id} className="md-card" href={p.href}>{body}</a> : <div key={p.id} className="md-card">{body}</div>; })}</div> : active === "divisions" ? groups.map((g) => <section key={g} className="hh-section"><h2>{g}</h2><div className="hh-grid hh-grid-4">{list.filter((o) => o.group === g).map((o) => <Card key={o.id} o={o} />)}</div></section>) : <div className="hh-grid hh-grid-4">{list.map((o) => <Card key={o.id} o={o} />)}</div>}
    </section>
  );
}

export function FranchiseDirectory({ leagueName, franchises, theme, ownersHref, retired }: { readonly leagueName: string; readonly franchises: readonly DirectoryFranchise[]; readonly theme: LeagueTileTheme; readonly ownersHref: string; readonly retired?: readonly DirectoryFranchise[] }) {
  const grid = (list: readonly DirectoryFranchise[]) => <div className="hh-grid hh-grid-4">{list.map((f) => <a key={f.id} className="md-franchise" href={f.href}>
    <div className="md-fr-image">{f.image ? <img src={f.image} alt="" loading="lazy" /> : null}<b>{f.name}</b></div>
    <div className="md-fr-body"><p className="md-fr-owners">{f.owners.map((o) => o.name).join(" + ")}</p><p className="hh-note">{f.since ? `Since ${f.since}` : ""}{f.ownershipChanges ? ` · ${f.ownershipChanges} ownership ${f.ownershipChanges === 1 ? "change" : "changes"}` : " · Original owner"}</p><dl className="md-stats md-stats-3"><div><dt>Titles</dt><dd>{f.titles}</dd></div><div><dt>Record</dt><dd>{f.record ?? "—"}</dd></div><div><dt>History</dt><dd>View →</dd></div></dl></div>
  </a>)}</div>;
  return (
    <section className="league-tiles hh md" style={themeCssVariables(theme) as CSSProperties}>
      <header className="md-head">
        <div><p className="hh-eyebrow">{leagueName} · Managers</p><h1>Franchises</h1><p className="hh-note">Every franchise, who owns it, and its history.</p></div>
        <nav className="hh-pills hh-pills-square" aria-label="Manager views"><a href={ownersHref}>Owners</a><a href="#active" aria-current="page">Franchises</a></nav>
      </header>
      <section id="active">{grid(franchises)}</section>
      {retired?.length ? <section className="hh-section" aria-labelledby="retired-franchises"><h2 id="retired-franchises">Retired franchises</h2>{grid(retired)}</section> : null}
    </section>
  );
}
