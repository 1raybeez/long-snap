import "server-only";

const SECRETS: readonly { readonly env: string; readonly project: string; readonly name: string }[] = [];
export const LEAGUE_SECRET_ENVS = SECRETS.map((s) => s.env);

async function accessToken(): Promise<string | null> {
  try {
    const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(4000) });
    return r.ok ? ((await r.json()) as { access_token?: string }).access_token ?? null : null;
  } catch {
    return null; // not on Google Cloud (local build or test)
  }
}

/** One secret's value from Secret Manager with this server's identity, or null (never logged). Used by lib/jobsAuth.ts. */
export async function readSecretValue(project: string, name: string): Promise<{ value: string | null; status: string }> {
  const token = await accessToken();
  if (!token) return { value: null, status: "no server token" };
  try {
    const r = await fetch(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${encodeURIComponent(name)}/versions/latest:access`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { value: null, status: `refused (${r.status})` };
    const data = ((await r.json()) as { payload?: { data?: string } }).payload?.data;
    return data ? { value: Buffer.from(data, "base64").toString("utf8").trim(), status: "connected" } : { value: null, status: "empty" };
  } catch (error) {
    return { value: null, status: `error (${error instanceof Error ? error.name : "unknown"})` };
  }
}

/** Loads any missing keys. Returns, per key, "connected" or why not (a status code only; never a value). */
export async function loadLeagueSecrets(): Promise<Record<string, string>> {
  const report: Record<string, string> = {};
  const missing = SECRETS.filter((s) => { if (process.env[s.env]) report[s.env] = "connected"; return !process.env[s.env]; });
  if (!missing.length) return report;
  const token = await accessToken();
  if (!token) { for (const s of missing) report[s.env] = "no server token"; return report; }
  await Promise.all(missing.map(async (s) => {
    try {
      const r = await fetch(`https://secretmanager.googleapis.com/v1/projects/${s.project}/secrets/${s.name}/versions/latest:access`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) { report[s.env] = `refused (${r.status})`; console.warn("LEAGUE_SECRET_UNAVAILABLE", s.env, r.status); return; }
      const data = ((await r.json()) as { payload?: { data?: string } }).payload?.data;
      if (data) { process.env[s.env] = Buffer.from(data, "base64").toString("utf8").trim(); report[s.env] = "connected"; } // trimmed 2026-11-13: a stray space or newline in a key is rejected by the provider else report[s.env] = "empty";
    } catch (error) {
      report[s.env] = `error (${error instanceof Error ? error.name : "unknown"})`;
    }
  }));
  return report;
}

let retry: Promise<unknown> | null = null;
let lastTry = 0;
export async function ensureLeagueSecrets(): Promise<void> {
  if (SECRETS.every((s) => process.env[s.env])) return;
  if (!retry && Date.now() - lastTry > 30_000) {
    lastTry = Date.now();
    retry = loadLeagueSecrets().catch(() => undefined).finally(() => { retry = null; });
  }
  if (retry) await retry;
}
