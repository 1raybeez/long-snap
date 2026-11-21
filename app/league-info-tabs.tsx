"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function LeagueInfoTabs({ slug, tabs, accent }: { slug: string; tabs: readonly { readonly path: string; readonly label: string }[]; accent?: string }) {
  const pathname = usePathname() ?? "";
  const base = `/${slug}/league-info`;
  const active = [...tabs].sort((a, b) => b.path.length - a.path.length).find((t) => (t.path ? pathname.startsWith(`${base}/${t.path}`) : pathname === base));
  return (
    <nav className="p-tabs p-subtabs" aria-label="League Info sections">
      {tabs.map((t) => {
        const on = t === active;
        return <Link key={t.path} href={t.path ? `${base}/${t.path}` : base} className={on ? "is-active" : undefined} style={on ? { borderColor: accent } : undefined} aria-current={on ? "page" : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}
