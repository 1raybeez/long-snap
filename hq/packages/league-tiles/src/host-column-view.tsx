import type { CSSProperties, ReactNode } from "react";
import { HOSTS } from "./host-flyer.ts";
import type { ColumnHost, ColumnPost } from "./host-column.ts";

/**
 * Host column views (shared): the host's card, a post card for lists and the home page, and a full post. Colors come
 * from the league theme's --tile-* variables, so each league's column wears its own colors in light and dark mode.
 * Post bodies arrive as HTML the caller already rendered from Markdown with the site's safe renderer.
 */

const card: CSSProperties = { background: "var(--tile-card)", border: "1px solid var(--tile-border)", borderRadius: 18, color: "var(--tile-text)", overflow: "hidden" };
const kicker: CSSProperties = { margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--tile-accent)" };

export function CheckerStrip({ a = "#ff8200", b = "#ffffff", height = 10 }: { a?: string; b?: string; height?: number }) {
  return <div aria-hidden="true" style={{ height, backgroundImage: `repeating-conic-gradient(${a} 0 25%, ${b} 0 50%)`, backgroundSize: `${height * 2}px ${height * 2}px` }} />;
}

export function postDateLabel(post: ColumnPost): string {
  const d = new Date(`${post.date}T12:00:00Z`);
  const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return post.week ? `Week ${post.week} · ${date}` : date;
}

/** The host's card at the top of the column: portrait, name, bio, signature line and segment guide. */
export function ColumnHostCard({ host, badge, leagueName }: { host: ColumnHost; badge?: string | null; leagueName: string }) {
  const profile = HOSTS[host.host];
  return (
    <section style={card} aria-labelledby="column-host-name">
      <CheckerStrip />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: 20, alignItems: "stretch" }}>
        <img src={host.portrait} alt={`${profile.fullName}, ${leagueName}'s host, at his desk with an AG microphone`} width={720} height={960} style={{ flex: "1 1 220px", maxWidth: 320, width: "100%", height: "auto", borderRadius: 14, objectFit: "cover", alignSelf: "flex-start" }} />
        <div style={{ flex: "999 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {badge ? <img src={badge} alt="" aria-hidden="true" width={56} height={56} style={{ flex: "none", borderRadius: 999 }} /> : null}
            <p style={kicker}>{host.columnName} · {leagueName}</p>
          </div>
          <h1 id="column-host-name" style={{ margin: 0, fontFamily: "var(--tile-font-display)", fontSize: "clamp(28px, 5vw, 42px)", lineHeight: 1.05 }}>{profile.fullName}</h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "var(--tile-muted)" }}>{host.bio}</p>
          <blockquote style={{ margin: 0, padding: "12px 16px", borderRadius: 12, background: "var(--tile-page)", fontSize: 18, fontWeight: 800, lineHeight: 1.4 }}>“{host.signature}”</blockquote>
          <div>
            <p style={{ ...kicker, color: "var(--tile-muted)", marginBottom: 8 }}>Every week</p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 230px), 1fr))", gap: 8 }}>
              {host.segments.map((s) => (
                <li key={s.id} style={{ border: "1px solid var(--tile-border)", borderRadius: 12, padding: "10px 12px" }}>
                  <strong style={{ display: "block", fontSize: 15 }}>{s.title}</strong>
                  <span style={{ fontSize: 13, color: "var(--tile-muted)" }}>{s.blurb}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A post as a card (column list and league home). */
export function ColumnPostCard({ post, host, href, featured = false }: { post: ColumnPost; host: ColumnHost; href: string; featured?: boolean }) {
  const profile = HOSTS[host.host];
  return (
    <a href={href} style={{ ...card, display: "block", textDecoration: "none" }}>
      {featured ? <CheckerStrip height={8} /> : null}
      <div style={{ display: "flex", gap: 14, padding: featured ? 18 : 14, alignItems: "center" }}>
        <img src={host.avatar} alt="" aria-hidden="true" width={featured ? 72 : 52} height={featured ? 72 : 52} style={{ flex: "none", borderRadius: 999, objectFit: "cover", border: "3px solid var(--tile-trophy)" }} />
        <div style={{ minWidth: 0 }}>
          <p style={kicker}>{featured ? `${host.columnName} · New` : host.columnName}</p>
          <h2 style={{ margin: "4px 0", fontSize: featured ? 22 : 18, lineHeight: 1.2, color: "var(--tile-text)" }}>{post.title}</h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--tile-muted)" }}>{post.dek}</p>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--tile-muted)" }}>{profile.shortName} · {postDateLabel(post)} · <span style={{ color: "var(--tile-accent)", fontWeight: 800 }}>Read →</span></p>
        </div>
      </div>
    </a>
  );
}

/** A full post. `bodyHtml` and each segment's `html` are already-rendered, safe HTML. */
export function ColumnPostView({ post, host, bodyHtml, segments, back }: { post: ColumnPost; host: ColumnHost; bodyHtml: string | null; segments: readonly { id: string; title: string; html: string }[]; back: ReactNode }) {
  const profile = HOSTS[host.host];
  return (
    <article style={card} aria-labelledby="column-post-title">
      <CheckerStrip />
      <div style={{ padding: "20px clamp(16px, 4vw, 36px) 28px", maxWidth: 760, margin: "0 auto" }}>
        <p style={{ margin: "0 0 12px", fontSize: 14 }}>{back}</p>
        <p style={kicker}>{host.columnName}</p>
        <h1 id="column-post-title" style={{ margin: "6px 0 10px", fontFamily: "var(--tile-font-display)", fontSize: "clamp(26px, 5vw, 40px)", lineHeight: 1.1 }}>{post.title}</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "0 0 20px" }}>
          <img src={host.avatar} alt="" aria-hidden="true" width={48} height={48} style={{ borderRadius: 999, objectFit: "cover", border: "3px solid var(--tile-trophy)" }} />
          <div style={{ fontSize: 14, lineHeight: 1.35 }}>
            <strong>{profile.fullName}</strong>
            <div style={{ color: "var(--tile-muted)" }}>{postDateLabel(post)}</div>
          </div>
        </div>
        {bodyHtml ? <div className="hc-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} /> : null}
        {segments.map((s) => (
          <section key={s.id} aria-labelledby={`seg-${s.id}`} style={{ marginTop: 26 }}>
            <h2 id={`seg-${s.id}`} style={{ margin: "0 0 8px", fontSize: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, background: "var(--tile-accent)", transform: "rotate(45deg)", flex: "none" }} />
              {s.title}
            </h2>
            <div className="hc-body" dangerouslySetInnerHTML={{ __html: s.html }} />
          </section>
        ))}
        {post.signoff.length ? (
          <footer style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid var(--tile-border)", fontSize: 15, lineHeight: 1.5 }}>
            {post.signoff.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 800 } : { color: "var(--tile-muted)" }}>{l}</div>)}
          </footer>
        ) : null}
      </div>
    </article>
  );
}
