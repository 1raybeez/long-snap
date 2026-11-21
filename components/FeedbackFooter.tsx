"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FeedbackFooter({ slug, leagueName }: { slug: string; leagueName: string }) {
  const pathname = usePathname() ?? `/${slug}`;
  const inLeague = pathname.startsWith(`/${slug}`) ? pathname.slice(slug.length + 1) || "/" : "/";
  const href = `/${slug}/feedback?from=${encodeURIComponent(inLeague)}`;
  return (
    <footer style={{ borderTop: "1px solid rgba(127,127,127,0.25)" }}>
      <div className="p-wrap" style={{ paddingTop: 16, paddingBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
        <span className="p-note" style={{ fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 11 }}>{leagueName}</span>
        <span className="p-note">Found a problem or have an idea? <Link href={href} style={{ fontWeight: 800 }}>Send feedback</Link></span>
      </div>
    </footer>
  );
}
