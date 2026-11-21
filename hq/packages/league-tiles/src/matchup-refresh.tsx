"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes the server-rendered matchups every minute while games are live (the page itself caches Sleeper ~60 s). */
export function MatchupRefresh({ seconds = 60 }: { readonly seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
