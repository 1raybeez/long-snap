// Runs once when the platform server starts: load league keys from each league's Secret Manager (lib/leagueSecrets.ts).
// The server's Google token can take a moment at start-up, so try a few times in the background.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.LONGSNAP_DEMO ?? "1") !== "0") { const { installFakeSleeper } = await import("./lib/demo/fakeSleeper"); installFakeSleeper(); return; }
  const { loadLeagueSecrets } = await import("./lib/leagueSecrets");
  void (async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const report = await loadLeagueSecrets().catch(() => ({} as Record<string, string>));
      if (Object.values(report).every((v) => v === "connected")) return;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  })();
  // The start-up warm-up (2026-11-06) was removed on 2026-11-08: measured live, it made the first minute after a
  // wake-up slower (nine page renders competing with the visitor on one processor). Keeping the server awake is the fix.
}
