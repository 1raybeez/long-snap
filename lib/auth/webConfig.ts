import "server-only";

/** The HQ project's public Firebase web config (App Hosting provides FIREBASE_WEBAPP_CONFIG for the linked web app). */
export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string; appId: string; messagingSenderId?: string; storageBucket?: string };

export function firebaseWebConfig(): FirebaseWebConfig | null {
  try {
    const c = JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG || process.env.HQ_FIREBASE_WEBAPP_CONFIG || "") as Partial<FirebaseWebConfig>;
    return c.apiKey && c.authDomain && c.projectId && c.appId ? (c as FirebaseWebConfig) : null;
  } catch {
    return null;
  }
}
