"use client";

import { useEffect, useState } from "react";

export interface SectionTab { readonly id: string; readonly label: string }

export function SectionTabs({ tabs, targetId, label, className = "rb-jump", linkClassName, initial }: { readonly tabs: readonly SectionTab[]; readonly targetId: string; readonly label: string; readonly className?: string; readonly linkClassName?: string; readonly initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id ?? "");

  useEffect(() => {
    const fromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      const direct = tabs.find((t) => t.id === hash) ?? tabs.find((t) => hash.startsWith(`${t.id}-`));
      if (direct) { setActive(direct.id); return; }
      // A link to something inside a panel (e.g. #rule-3) opens that panel.
      const inside = document.getElementById(hash)?.closest("[data-tab]")?.getAttribute("data-tab");
      if (inside && tabs.some((t) => t.id === inside)) setActive(inside);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  useEffect(() => {
    const root = document.getElementById(targetId);
    if (!root) return;
    root.querySelectorAll<HTMLElement>(":scope > [data-tab]").forEach((panel) => { panel.hidden = panel.dataset.tab !== active; });
  }, [active, targetId]);

  return (
    <nav className={`${className} st-tabs`} aria-label={label} role="tablist">
      {tabs.map((t) => (
        <a
          key={t.id}
          href={`#${t.id}`}
          role="tab"
          aria-selected={t.id === active}
          className={[linkClassName, t.id === active ? "st-active" : null].filter(Boolean).join(" ") || undefined}
          onClick={(event) => {
            event.preventDefault();
            setActive(t.id);
            window.history.replaceState(null, "", `#${t.id}`);
          }}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
