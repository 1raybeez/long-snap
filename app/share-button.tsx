"use client";

import { useState, type CSSProperties } from "react";

export function ShareButton({ title, text, path, label = "Share", style }: { title?: string; text?: string; path?: string; label?: string; style?: CSSProperties }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const onClick = async () => {
    const url = new URL(path ?? window.location.pathname + window.location.search, window.location.origin).toString();
    const shareTitle = title ?? document.title;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareTitle, text, url });
        return;
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={path ? label : `${label} this page`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid currentColor", borderRadius: 999, background: "transparent", color: "inherit", font: "inherit", fontSize: 13, fontWeight: 800, padding: "5px 12px", cursor: "pointer", ...style }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v13" /><path d="M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
      {state === "copied" ? "Link copied" : state === "failed" ? "Couldn't copy" : label}
    </button>
  );
}
