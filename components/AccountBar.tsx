"use client";

import { useEffect, useRef, useState } from "react";
import type { Auth } from "firebase/auth";
import type { FirebaseWebConfig } from "@/lib/auth/webConfig";

/** Sign in with Google (same Google account owners use on the league sites) or sign out. */
export function AccountBar({ config, signedInAs, linked }: { config: FirebaseWebConfig | null; signedInAs: string | null; linked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Firebase before the tap: iPhone Safari blocks the Google pop-up if anything is awaited between the tap and
  // opening it (that was the "popup-blocked" error on first try).
  const fb = useRef<{ auth: Auth; mod: typeof import("firebase/auth") } | null>(null);
  useEffect(() => {
    if (!config || signedInAs) return;
    let live = true;
    const standalone = isHomeScreenApp();
    Promise.all([import("firebase/app"), import("firebase/auth")]).then(([{ initializeApp, getApps }, mod]) => {
      if (!live) return;
      // Home-screen app (2026-11-13): sign in by redirect through this site's own address (next.config rewrites
      // /__/auth to Firebase), because pop-ups don't come back to a home-screen app on iPhone.
      const app = standalone ? (getApps().find((a) => a.name === "home-screen") ?? initializeApp({ ...config, authDomain: window.location.host }, "home-screen")) : (getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp(config));
      fb.current = { auth: mod.getAuth(app), mod };
      if (standalone) {
        setBusy(true);
        mod.getRedirectResult(fb.current.auth)
          .then(async (result) => { if (result) await finishSignIn(result.user, mod, fb.current!.auth); else setBusy(false); })
          .catch((e) => { setError(e instanceof Error ? e.message : "Sign-in failed."); setBusy(false); });
      }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [config, signedInAs]);

  async function finishSignIn(user: import("firebase/auth").User, mod: typeof import("firebase/auth"), auth: Auth) {
    const idToken = await user.getIdToken();
    try { sessionStorage.removeItem("ffl-my-leagues"); } catch { /* fine */ }
    const r = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
    await mod.signOut(auth); // the server cookie is the session; don't keep a second one in the browser
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Sign-in failed.");
    window.location.reload();
  }

  function signIn() {
    const f = fb.current;
    if (!config || !f) { setError("Sign-in is still loading. Tap again in a second."); return; }
    setBusy(true); setError(null);
    const provider = new f.mod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    if (isHomeScreenApp()) {
      f.mod.signInWithRedirect(f.auth, provider).catch((e) => { setError(e instanceof Error ? e.message : "Sign-in failed."); setBusy(false); });
      return;
    }
    // Opened synchronously inside the tap.
    f.mod.signInWithPopup(f.auth, provider)
      .then(async (result) => {
        const idToken = await result.user.getIdToken();
        try { sessionStorage.removeItem("ffl-my-leagues"); } catch { /* fine */ }
        const r = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
        await f.mod.signOut(f.auth); // the server cookie is the session; don't keep a second one in the browser
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Sign-in failed.");
        window.location.reload();
      })
      .catch((e) => {
        const code = (e as { code?: string })?.code ?? "";
        setError(code === "auth/unauthorized-domain" ? "This address isn't allowed for sign-in yet (Firebase authorized domains)." : code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" ? null : code === "auth/popup-blocked" ? "Your browser blocked the sign-in window. Allow pop-ups for this site, then tap Sign in again." : e instanceof Error ? e.message : "Sign-in failed.");
        setBusy(false);
      });
  }

  async function signOutAll() {
    setBusy(true);
    try { sessionStorage.removeItem("ffl-my-leagues"); } catch { /* fine */ }
    await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
    window.location.reload();
  }

  if (signedInAs) {
    return (
      <div className="p-account">
        <span>Signed in as <strong>{signedInAs}</strong>{linked ? null : <em> · not linked to a league yet</em>}</span>
        <button type="button" className="p-btn" onClick={signOutAll} disabled={busy}>Sign out</button>
      </div>
    );
  }
  if (!config) return null;
  return (
    <div className="p-account">
      <button type="button" className="p-btn p-btn--primary" style={{ background: "#1d4ed8" }} onClick={signIn} disabled={busy}>{busy ? "Signing in…" : "Sign in with Google"}</button>
      {error ? <span className="p-account__err">{error}</span> : null}
    </div>
  );
}

/** True when the site was opened from a home-screen icon (iPhone or Android), not in the browser. */
function isHomeScreenApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
