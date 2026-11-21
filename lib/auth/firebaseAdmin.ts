import "server-only";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin for the platform, in the HQ project it runs in (HQ Staging during the pilot). App Hosting gives
 * the server its own Google credentials and FIREBASE_CONFIG; no keys in code or env files.
 */
export const HQ_PROJECT_ID = (() => {
  try { return (JSON.parse(process.env.FIREBASE_CONFIG ?? "{}") as { projectId?: string }).projectId ?? ""; } catch { return ""; }
})();

export function adminApp(): App {
  return getApps()[0] ?? initializeApp({ projectId: HQ_PROJECT_ID });
}

export const adminAuth = () => getAuth(adminApp());
// Same REST setting as the league databases (lib/leagueEngine.ts, 2026-11-08): no stale idle connection.
const tunedHq = new WeakSet<object>();
export const adminFirestore = () => {
  const db = getFirestore(adminApp());
  if (!tunedHq.has(db)) { tunedHq.add(db); try { db.settings({ preferRest: true }); } catch { /* already in use */ } }
  return db;
};
