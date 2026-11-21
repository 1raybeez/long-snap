import "server-only";
import { GM_PREFS_COLLECTION, sanitizeGmPrefs, type GmPrefs, type GmPrefsStore } from "../hq/packages/league-tiles/src/gm-prefs.ts";
import { adminFirestore } from "./auth/firebaseAdmin.ts";

/**
 * "My GM style" per team on the platform (its own Firestore, one doc per league + team), written only through the
 * GM API for the signed-in owner's own team. Styles saved on a league's current site move over with that league's data.
 */
export function gmPrefsStore(leagueId: string): GmPrefsStore | null {
  try {
    const db = adminFirestore();
    const doc = (teamId: string) => db.collection(GM_PREFS_COLLECTION).doc(encodeURIComponent(`${leagueId}__${teamId}`));
    return {
      async get(teamId: string) { const snap = await doc(teamId).get(); return snap.exists ? sanitizeGmPrefs(snap.data()) : null; },
      async set(teamId: string, prefs: GmPrefs) { await doc(teamId).set(sanitizeGmPrefs(prefs)); },
    };
  } catch {
    return null;
  }
}
