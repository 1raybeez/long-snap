import type { CSSProperties, ReactNode } from "react";
import type { TileLink } from "./contract.ts";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { contactIcon, contactKind } from "./contact-icons.ts";
import { ContactActions } from "./contact-actions.tsx";
import { SectionTabs } from "./section-tabs.tsx";

export interface OwnerProfileModel {
  readonly leagueName: string;
  readonly owner: { readonly id: string; readonly name: string; readonly photo: string | null; readonly teamName: string | null; readonly badges: readonly string[]; readonly status: "ACTIVE" | "FORMER"; readonly bio?: string | null };
  readonly backLink: TileLink;
  readonly record: { readonly wins: number; readonly losses: number; readonly ties: number; readonly coverage: string | null } | null;
  readonly success: { readonly titles: number; readonly podiums: number; readonly bestFinish: number | null; readonly seasons: number; readonly playoffAppearances?: number | null };

  readonly scouting: {
    /** `note` replaces "Self-rated" when the score comes from elsewhere (e.g. trade history). */
    readonly tradeActivity: { readonly value: number; readonly max: number; readonly note?: string | null } | null;

    readonly trashTalk?: { readonly value: number; readonly max: number } | null;

    readonly fields: readonly { readonly label: string; readonly value: string; readonly images?: readonly string[] }[];
  } | null;
  /** The rival the game results point to (most-played, closest series). `rivalryHref`: the head-to-head page. */
  readonly rival: { readonly id?: string; readonly name: string; readonly photo: string | null; readonly href: string | null; readonly rivalryHref?: string | null; readonly wins: number; readonly losses: number; readonly ties: number } | null;

  readonly surveyRivals?: readonly { readonly id?: string; readonly name: string; readonly href: string | null; readonly photo?: string | null; readonly rivalryHref?: string | null; readonly record?: { readonly wins: number; readonly losses: number; readonly ties: number } | null; readonly matchesResults?: boolean }[];
  /** League Rivalry Hub link, shown under the rivals. */
  readonly rivalryHubHref?: string | null;

  readonly contact: { readonly methods: readonly string[]; readonly quote: string | null; readonly actions?: { readonly endpoint: string; readonly signInHref: string | null } | null } | null;
  readonly legacy: readonly { readonly name: string; readonly href: string | null; readonly years: string; readonly role: string; readonly current: boolean; readonly ownershipHistory: readonly { readonly years: string; readonly owners: string }[]; readonly highlights?: readonly { readonly season: string; readonly title: string; readonly detail?: string | null }[] }[];
  /** Career Snapshot panel (overall / regular-season / playoff / title-game records, points), when the league has it. */
  readonly snapshot?: { readonly stats: readonly { readonly label: string; readonly value: string }[]; readonly note?: string | null } | null;
  /** Published preseason team outlook (draft grade, strengths, concerns…), when the league publishes one. */
  readonly outlook?: { readonly title: string; readonly summary?: string | null; readonly facts: readonly { readonly label: string; readonly value: string }[]; readonly lists: readonly { readonly label: string; readonly items: readonly string[] }[]; readonly notes: readonly { readonly label: string; readonly text: string }[]; readonly fine?: string | null } | null;
  /** Recorded winnings box with a link to the league's financial history. */
  readonly winnings?: { readonly value: string; readonly label: string; readonly note?: string | null; readonly href?: string | null } | null;
  readonly timeline: readonly { readonly season: string; readonly title: string; readonly detail: string | null; readonly tone?: "gold" | "silver" | "bronze" | "shame" | null }[];
  readonly seasons: readonly { readonly season: number; readonly team: string | null; readonly finish: number | null; readonly teamCount: number | null; readonly record: string | null; readonly pointsFor: number | null; readonly note: string | null }[];
  readonly opponents: readonly { readonly name: string; readonly photo: string | null; readonly href: string | null; readonly wins: number; readonly losses: number; readonly ties: number; readonly pointsFor: number; readonly pointsAgainst: number; readonly playoffGames: number; readonly rivalryHref?: string | null }[];
  readonly opponentCoverage?: string | null;
  /** Live current-season box (record, standing, this week's matchup); omitted for former owners. */
  readonly currentSeason?: { readonly title: string; readonly facts: readonly { readonly label: string; readonly value: string }[]; readonly note: string | null } | null;

  readonly seasonHref?: ((season: number) => string) | null;
}

const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`; };
const pct = (w: number, l: number, t: number) => (w + l + t ? `${(((w + t / 2) / (w + l + t)) * 100).toFixed(1)}%` : "—");
const rec = (w: number, l: number, t: number) => `${w}-${l}${t ? `-${t}` : ""}`;

function Portrait({ name, photo, size }: { readonly name: string; readonly photo: string | null; readonly size: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return photo ? <img className="hh-portrait" src={photo} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" /> : <span className="hh-portrait hh-portrait-fallback" style={{ width: size, height: size }} aria-hidden="true">{initials}</span>;
}

function Panel({ title, icon, children, id }: { readonly title: string; readonly icon?: string; readonly children: ReactNode; readonly id?: string }) {
  return <section className="op-panel" id={id}><header className="op-panel-head">{icon ? <span className="op-icon" aria-hidden="true">{icon}</span> : null}<h2>{title}</h2></header>{children}</section>;
}
function Box({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <div className="op-box"><p className="op-box-title">{title}</p>{children}</div>;
}
function Meter({ label, meter }: { readonly label: string; readonly meter: { readonly value: number; readonly max: number; readonly note?: string | null } }) {
  return <div className="op-meter"><div className="op-meter-head"><span>{label}<small>{meter.note ?? "Self-rated"}</small></span><b>{meter.value}/{meter.max}</b></div><div className="op-meter-track"><div className="op-meter-fill" style={{ width: `${Math.max(0, Math.min(1, meter.value / meter.max)) * 100}%` }} /></div></div>;
}

function Rivals({ m }: { readonly m: OwnerProfileModel }) {
  const picks = m.surveyRivals ?? [];
  const r = m.rival;
  const resultsPicked = picks.some((p) => p.matchesResults);
  if (!picks.length && !r) return null;
  const rivalLine = r ? <>{rec(r.wins, r.losses, r.ties)} · {r.wins + r.losses + r.ties} meetings · {pct(r.wins, r.losses, r.ties)}</> : null;
  return (
    <Box title={picks.length ? "Rivals" : "Primary Rival"}>
      {picks.length ? <>
        <p className="op-fine"><b>Picked Rivals</b>: the owner's own picks, not official rivalry records.{resultsPicked ? " ★ = the one the game results agree with." : ""}</p>
        <ul className="op-rivals">{picks.map((p) => { const target = p.rivalryHref ?? p.href; const face = <><span className="op-rival-face"><Portrait name={p.name} photo={p.photo ?? null} size={48} />{p.matchesResults ? <span className="op-star" title="Game results agree">★</span> : null}</span><span className="op-rival-name">{p.name}</span>{p.record && p.record.wins + p.record.losses + p.record.ties ? <span className="op-fine">{rec(p.record.wins, p.record.losses, p.record.ties)}</span> : null}</>; return <li key={p.name}>{target ? <a href={target} title={`${m.owner.name} vs ${p.name}`}>{face}</a> : face}</li>; })}</ul>
        {r && !resultsPicked ? <p className="op-fine op-mt">By the numbers: <span className="op-star">★</span> {r.rivalryHref ? <a href={r.rivalryHref}>{r.name}</a> : r.name} · {rivalLine}</p> : null}
      </> : r ? <>
        <div className="hh-flex">{r.rivalryHref ? <a href={r.rivalryHref}><Portrait name={r.name} photo={r.photo} size={52} /></a> : <Portrait name={r.name} photo={r.photo} size={52} />}<div><p className="op-name op-name-sm">{r.name}</p><p className="op-sub">{rivalLine}</p></div></div>
        {r.href ? <a className="op-button" href={r.href}>View rival profile →</a> : null}
      </> : null}
      {m.rivalryHubHref ? <a className="op-button op-button-ghost" href={m.rivalryHubHref}>Rivalry Hub →</a> : null}
    </Box>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return <div className="op-stat"><p className="op-stat-value">{value}</p><p className="op-stat-label">{label}</p></div>;
}

export function OwnerProfileView({ model, theme }: { readonly model: OwnerProfileModel; readonly theme: LeagueTileTheme }) {
  const m = model;
  const sections = [["overview", "Overview"], ["legacy", "Team Legacy"], ["timeline", "Timeline"], ["seasons", "Seasons"], ["opponents", "Opponents"]] as const;
  return (
    <section className="league-tiles hh op" style={themeCssVariables(theme) as CSSProperties}>
      <a className="hh-link" href={m.backLink.href}>← {m.backLink.label}</a>
      <header className="op-hero">
        <Portrait name={m.owner.name} photo={m.owner.photo} size={168} />
        <div className="op-hero-body">
          <div className="op-badges">{m.owner.badges.map((b) => <span key={b} className="op-badge">{b}</span>)}</div>
          <p className="hh-eyebrow">{m.leagueName} · Manager</p>
          <h1>{m.owner.name}</h1>
          {m.owner.teamName ? <p className="op-team">{m.owner.teamName}</p> : null}
          {m.owner.bio ? <p className="op-bio">{m.owner.bio}</p> : null}
        </div>
      </header>
      <SectionTabs className="op-nav" label="Manager profile sections" targetId="op-panels" tabs={sections.map(([id, label]) => ({ id, label }))} />
      <div id="op-panels">
      <div data-tab="overview">

      <Panel title="Owner Overview" icon="👤" id="overview">
        <div className="op-two">
          <div className="op-col">
            <Box title="Owner Summary"><p className="op-name">{m.owner.name}</p>{m.owner.teamName ? <p className="op-sub">{m.owner.teamName}</p> : null}<div className="op-chips">{[m.owner.status === "ACTIVE" ? "Active owner" : "Former owner", ...m.owner.badges].map((c) => <span key={c} className="op-chip">{c}</span>)}</div></Box>
            {m.winnings ? <Box title={m.winnings.label}><p className="op-money">{m.winnings.value}</p>{m.winnings.note ? <p className="op-fine">{m.winnings.note}</p> : null}{m.winnings.href ? <a className="op-button op-button-ghost" href={m.winnings.href}>View financial history →</a> : null}</Box> : null}
            {m.record ? <Box title="Career Record"><div className="op-grid op-grid-2"><Stat label="Overall record" value={rec(m.record.wins, m.record.losses, m.record.ties)} /><Stat label="Winning %" value={pct(m.record.wins, m.record.losses, m.record.ties)} /></div>{m.record.coverage ? <p className="op-fine">{m.record.coverage}</p> : null}</Box> : null}
            <Box title="Career Success"><div className="op-grid op-grid-4"><Stat label="League titles" value={m.success.titles} /><Stat label="Podiums" value={m.success.podiums} /><Stat label="Best finish" value={m.success.bestFinish ? ordinal(m.success.bestFinish) : "—"} /><Stat label="Seasons" value={m.success.seasons} /></div>{typeof m.success.playoffAppearances === "number" ? <p className="op-fine">{m.success.playoffAppearances} playoff appearances</p> : null}</Box>
          </div>
          <div className="op-col">
            {m.scouting ? <Box title="Scouting Report">
              {m.scouting.tradeActivity ? <Meter label="Trade activity" meter={m.scouting.tradeActivity} /> : null}
              {m.scouting.trashTalk ? <Meter label="Trash talk" meter={m.scouting.trashTalk} /> : null}
              <div className="op-grid op-grid-2">{m.scouting.fields.map((f) => <div key={f.label} className={`op-field${f.images?.length ? " op-field-pic" : ""}`}>{f.images?.length ? <span className="op-pics">{f.images.map((src) => <img key={src} src={src} alt="" width={40} height={40} loading="lazy" />)}</span> : null}<span><p className="op-field-label">{f.label}</p><p className="op-field-value">{f.value}</p></span></div>)}</div>
            </Box> : null}
            <Rivals m={m} />
            {m.contact && (m.contact.methods.length || m.contact.quote || m.contact.actions) ? <Box title="Contact & Quote">
              {/* With the members-only links on, each contact row (icon + name) is the link itself (Ray, 2026-11-06). */}
              {m.contact.actions ? <ContactActions endpoint={m.contact.actions.endpoint} signInHref={m.contact.actions.signInHref} methods={m.contact.methods} />
                : m.contact.methods.length ? <><p className="op-field-label">Preferred contact</p><ul className="op-contact">{m.contact.methods.map((method) => { const icon = contactIcon(contactKind(method)); return <li key={method}>{icon ? <img src={icon} alt="" width={36} height={36} /> : <span className="op-contact-dot" aria-hidden="true">✉</span>}<span>{method}</span></li>; })}</ul></> : null}
              {m.contact.quote ? <><p className="op-field-label op-mt">Owner quote</p><blockquote className="op-quote">“{m.contact.quote}”</blockquote></> : null}
            </Box> : null}
          </div>
        </div>
      </Panel>

      {m.currentSeason ? <Panel title={m.currentSeason.title} icon="📍" id="current">
        <div className="op-grid op-grid-4">{m.currentSeason.facts.map((f) => <div key={f.label} className="op-field"><p className="op-field-label">{f.label}</p><p className="op-field-value">{f.value}</p></div>)}</div>
        {m.currentSeason.note ? <p className="op-fine">{m.currentSeason.note}</p> : null}
      </Panel> : null}

      {m.outlook ? <Panel title={m.outlook.title} icon="🔭" id="outlook">
        {m.outlook.facts.length ? <div className="op-grid op-grid-4">{m.outlook.facts.map((f) => <div key={f.label} className="op-field"><p className="op-field-label">{f.label}</p><p className="op-field-value">{f.value}</p></div>)}</div> : null}
        {m.outlook.summary ? <p className="op-bio op-mt">{m.outlook.summary}</p> : null}
        {m.outlook.lists.length ? <div className="op-two op-mt">{m.outlook.lists.map((l) => <div key={l.label} className="op-box"><p className="op-box-title">{l.label}</p><ul className="op-list">{l.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div> : null}
        {m.outlook.notes.length ? <div className="op-grid op-grid-2 op-mt">{m.outlook.notes.map((n) => <div key={n.label} className="op-field"><p className="op-field-label">{n.label}</p><p className="op-sub">{n.text}</p></div>)}</div> : null}
        {m.outlook.fine ? <p className="op-fine">{m.outlook.fine}</p> : null}
      </Panel> : null}

      </div>
      <div data-tab="legacy" hidden>
      <Panel title="Team Legacy" icon="🏈" id="legacy">
        <div className="op-grid op-grid-legacy">{m.legacy.map((f) => <div key={f.name + f.years} className="op-box">
          <p className="op-name op-name-sm">{f.href ? <a href={f.href}>{f.name}</a> : f.name}</p>
          <p className="op-sub">{f.role} · {f.years}{f.current ? " · Current" : ""}</p>
          {f.ownershipHistory.length > 1 ? <><p className="op-field-label op-mt">Ownership history</p><ol className="op-owners">{f.ownershipHistory.map((o) => <li key={o.years + o.owners}><span>{o.owners}</span><span>{o.years}</span></li>)}</ol></> : null}
          {f.highlights?.length ? <><p className="op-field-label op-mt">Franchise highlights</p><ul className="op-highlights">{f.highlights.map((h) => <li key={h.season + h.title}><span className="op-tl-season">{h.season}</span><span><b>{h.title}</b>{h.detail ? <span className="op-sub op-block">{h.detail}</span> : null}</span></li>)}</ul></> : null}
        </div>)}</div>
      </Panel>

      {m.snapshot?.stats.length ? <Panel title="Career Snapshot" icon="📊" id="snapshot">
        <div className="op-grid op-grid-4">{m.snapshot.stats.map((st) => <Stat key={st.label} label={st.label} value={st.value} />)}</div>
        {m.snapshot.note ? <p className="op-fine">{m.snapshot.note}</p> : null}
      </Panel> : null}

      </div>
      <div data-tab="timeline" hidden>
      <Panel title="Career Timeline" icon="🕒" id="timeline">
        <ol className="op-timeline">{m.timeline.map((t) => <li key={t.season + t.title} className={t.tone ? `op-tone-${t.tone}` : undefined}><span className="op-tl-season">{t.season}</span><div><p className="op-tl-title">{t.title}</p>{t.detail ? <p className="op-sub">{t.detail}</p> : null}</div></li>)}</ol>
      </Panel>

      </div>
      <div data-tab="seasons" hidden>
      <Panel title="Season History" icon="📅" id="seasons">
        <div className="hh-table-card"><table className="hh-table"><thead><tr><th>Season</th><th>Team</th><th className="c">Finish</th><th className="c">Record</th><th className="r">PF</th></tr></thead>
          <tbody>{m.seasons.map((s) => <tr key={s.season}><td className="op-strong">{m.seasonHref ? <a href={m.seasonHref(s.season)}>{s.season}</a> : s.season}</td><td>{s.team ?? "—"}{s.note ? <span className="hh-note hh-block">{s.note}</span> : null}</td><td className="c">{s.finish ? `${ordinal(s.finish)}${s.teamCount ? ` of ${s.teamCount}` : ""}` : "—"}</td><td className="c">{s.record ?? "—"}</td><td className="r">{s.pointsFor !== null ? s.pointsFor.toFixed(2) : "—"}</td></tr>)}</tbody></table></div>
      </Panel>

      </div>
      <div data-tab="opponents" hidden>
      <Panel title="Opponent History" icon="⚔️" id="opponents">
        {m.opponents.length ? <div className="hh-table-card"><table className="hh-table"><thead><tr><th>Opponent</th><th className="c">Record</th><th className="c">Win %</th><th className="c">Games</th><th className="r">PF</th><th className="r">PA</th></tr></thead>
          <tbody>{m.opponents.map((o) => <tr key={o.name}><th scope="row"><div className="hh-flex"><Portrait name={o.name} photo={o.photo} size={34} />{o.href ? <a href={o.href}>{o.name}</a> : <span>{o.name}</span>}{o.rivalryHref ? <a className="op-h2h" href={o.rivalryHref}>Head-to-head →</a> : null}</div></th><td className="c">{rec(o.wins, o.losses, o.ties)}</td><td className="c">{pct(o.wins, o.losses, o.ties)}</td><td className="c">{o.wins + o.losses + o.ties}{o.playoffGames ? <span className="hh-note hh-block">{o.playoffGames} playoff</span> : null}</td><td className="r">{o.pointsFor.toFixed(1)}</td><td className="r">{o.pointsAgainst.toFixed(1)}</td></tr>)}</tbody></table></div> : <p className="hh-note">No completed opponent matchups on record.</p>}
        {m.opponentCoverage ? <p className="op-fine">{m.opponentCoverage}</p> : null}
      </Panel>
      </div>
      </div>
    </section>
  );
}
