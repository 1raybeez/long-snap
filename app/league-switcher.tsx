"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Choice = { slug: string; name: string; fullSite?: boolean };

const SHARED: ReadonlySet<string> = new Set([
  "", "/matchups", "/standings", "/power-rankings", "/predictor", "/recaps", "/history", "/managers",
  "/gm", "/gm/waivers", "/gm/trades", "/gm/draft",
  "/league-info", "/league-info/records", "/league-info/rivalries", "/league-info/trades", "/league-info/resources",
  "/league-info/fees", "/league-info/constitution", "/league-info/legislative", "/league-info/drafts",
  "/commish", "/commish/finance", "/commish/feedback", "/feedback",
]);

/** Where to land in another league for the page you're on now. */
export function samePageIn(target: Choice, rest: string): string {
  if (!target.fullSite) return `/${target.slug}`;
  if (/^\/nfl\/week\/\d+$/.test(rest)) return `/${target.slug}${rest}`; // the NFL week is the same in every league
  let path = rest.replace(/\/$/, "");
  while (path && !SHARED.has(path)) path = path.slice(0, path.lastIndexOf("/"));
  return `/${target.slug}${path}`;
}

const KEY = "ffl-my-leagues";

export function LeagueSwitcher({ current, colors }: { readonly current: string; readonly colors: { readonly bg: string; readonly text: string; readonly accent: string } }) {
  const router = useRouter();
  const pathname = usePathname() ?? `/${current}`;
  const [leagues, setLeagues] = useState<readonly Choice[]>([]);
  useEffect(() => {
    let live = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { at: number; leagues: Choice[] } | null;
      if (saved && Date.now() - saved.at < 10 * 60_000) { setLeagues(saved.leagues); return; }
    } catch { /* no storage: ask the server */ }
    fetch("/api/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { leagues: null }))
      .then((j: { leagues?: Choice[] | null }) => {
        if (!live || !j.leagues) return;
        setLeagues(j.leagues);
        try { if (j.leagues.length) sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), leagues: j.leagues })); } catch { /* fine */ }
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  if (leagues.length < 2) return null;
  const list = leagues.some((l) => l.slug === current) ? leagues : [{ slug: current, name: "This league" }, ...leagues];
  const rest = pathname.startsWith(`/${current}`) ? pathname.slice(current.length + 1) : "";
  return (
    <label className="p-switcher" style={{ ["--sw-bg" as string]: colors.bg, ["--sw-text" as string]: colors.text, ["--sw-accent" as string]: colors.accent }}>
      <span className="p-switcher__label">League</span>
      <select
        value={current}
        onChange={(e) => {
          const target = list.find((l) => l.slug === e.target.value);
          if (target && target.slug !== current) router.push(samePageIn(target, rest));
        }}
        aria-label="Switch league"
      >
        {list.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
      </select>
    </label>
  );
}
