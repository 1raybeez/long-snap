"use client";

import { useEffect, useState } from "react";
import type { FirebaseWebConfig } from "@/lib/auth/webConfig";

/**
 * Alerts on this phone (2026-11-13). Push only works in the home-screen app on iPhone (iOS 16.4+), so in the browser
 * this explains how to add it. The tap that asks permission must come straight from the person.
 */
const VAPID_KEY = "BARjHtHYpI1cb86hNbCVA8JOwFkW9P7p26-vTSeYEIaHEDpV4FktR39J_16V_rLsWmar5F96ZgAHGp-_G4UUNA0";
const KINDS = [
  { id: "posts", label: "New posts and flyers from your league's host", commish: false },
  { id: "trades", label: "Trades accepted in your leagues", commish: false },
  { id: "lineup", label: "Lineup problems on game days (empty spot, bye, or a starter who's out)", commish: false },
  { id: "votes", label: "New Legislative Hub votes, and a last call before voting closes", commish: false },
  { id: "events", label: "Reminders: drafts, owners meetings and dues you owe", commish: false },
  { id: "commish", label: "Commissioner: awards ready to pay, failed weekly jobs", commish: true },
] as const;
const ALL_ON: Prefs = { posts: true, trades: true, lineup: true, votes: true, events: true, commish: true };
type Prefs = Record<(typeof KINDS)[number]["id"], boolean>;
const STORE = "ffl-push";

export function PushToggle({ config, isCommish = false }: { config: FirebaseWebConfig | null; isCommish?: boolean }) {
  const [support, setSupport] = useState<"unknown" | "ok" | "needs-app" | "none">("unknown");
  const [token, setToken] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(ALL_ON);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const has = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setSupport(has ? "ok" : ios && !standalone ? "needs-app" : "none");
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as { token?: string; prefs?: Prefs } | null;
      if (saved?.token && Notification.permission === "granted") {
        setToken(saved.token);
        // Kinds added later (lineup, 2026-11-13) start on, and the device record is refreshed with today's teams.
        const merged = { ...ALL_ON, ...(saved.prefs ?? {}) } as Prefs;
        setPrefs(merged);
        void save(saved.token, merged).catch(() => undefined);
      }
    } catch { /* fine */ }
  }, []);

  async function save(t: string, p: Prefs, test = false): Promise<string | null> {
    const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t, prefs: p, test }) });
    const out = (await r.json().catch(() => ({}))) as { error?: string; testError?: string | null };
    if (!r.ok) throw new Error(out.error ?? "Couldn't save your alerts.");
    try { localStorage.setItem(STORE, JSON.stringify({ token: t, prefs: p })); } catch { /* fine */ }
    return out.testError ?? null;
  }

  async function turnOn() {
    if (!config) return;
    setBusy(true); setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMsg("Alerts are blocked. Turn them on in your phone's Settings → Notifications, then try again."); return; }
      const reg = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
      const app = getApps().find((a) => a.name === "push") ?? initializeApp(config, "push");
      const t = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      if (!t) throw new Error("This phone didn't give an alert address. Try again in a minute.");
      const testError = await save(t, prefs, true);
      setToken(t);
      setMsg(testError ? `Alerts are saved, but the test alert didn't send (${testError}). Tell your commissioner.` : "Alerts are on. A test alert is on its way.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't turn on alerts.");
    } finally {
      setBusy(false);
    }
  }

  async function change(id: keyof Prefs, on: boolean) {
    const next = { ...prefs, [id]: on };
    setPrefs(next);
    if (token) await save(token, next).catch((e) => setMsg(e instanceof Error ? e.message : "Couldn't save."));
  }

  async function turnOff() {
    if (!token) return;
    setBusy(true);
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => undefined);
    try { localStorage.removeItem(STORE); } catch { /* fine */ }
    setToken(null); setBusy(false); setMsg("Alerts are off for this phone.");
  }

  if (support === "unknown" || support === "none" || !config) return null;
  return (
    <section className="p-section" aria-labelledby="push-h">
      <h2 className="p-h2" id="push-h">Alerts on this phone</h2>
      {support === "needs-app" ? (
        <p className="p-note">To get alerts on iPhone, open this site in Safari, tap Share → Add to Home Screen, then open the new icon and turn alerts on here.</p>
      ) : token ? (
        <>
          <div style={{ display: "grid", gap: 8, margin: "8px 0" }}>
            {KINDS.filter((k) => !k.commish || isCommish).map((k) => (
              <label key={k.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 16 }}>
                <input type="checkbox" checked={prefs[k.id]} onChange={(e) => change(k.id, e.target.checked)} style={{ width: 22, height: 22 }} />
                {k.label}
              </label>
            ))}
          </div>
          <button type="button" className="p-btn" onClick={turnOff} disabled={busy}>Turn off alerts</button>
        </>
      ) : (
        <>
          <p className="p-note">Get a tap on the shoulder when your league&rsquo;s host posts and when trades go through. You choose which.</p>
          <button type="button" className="p-btn p-btn--primary" onClick={turnOn} disabled={busy}>{busy ? "Turning on…" : "Turn on alerts"}</button>
        </>
      )}
      {msg ? <p className="p-note" role="status" style={{ marginTop: 8 }}>{msg}</p> : null}
    </section>
  );
}
