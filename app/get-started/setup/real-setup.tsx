"use client";
import { useMemo, useState } from "react";

type Kind = "redraft" | "keeper" | "auction" | "dynasty";
type User = { user_id: string; display_name: string; avatar: string | null; metadata?: { team_name?: string } };
type Found = { name: string; season: string; teams: number; divisions: number; playoffTeams: number; draftType: string; sleeperType: number; seasons: Record<string, string>; users: User[] };

const SLEEPER = "https://api.sleeper.app/v1";
const REPO = "https://github.com/1raybeez/long-snap";
const KINDS: { id: Kind; name: string; line: string }[] = [
  { id: "redraft", name: "Redraft", line: "Everyone goes back in the pool every year." },
  { id: "keeper", name: "Keeper", line: "Keep a few players from year to year." },
  { id: "auction", name: "Auction keeper", line: "Auction draft; keepers cost last year's price plus a raise." },
  { id: "dynasty", name: "Dynasty", line: "Keep everyone. Rookie drafts and future picks." },
];
const PRESETS = [
  { header: "#071a33", accent: "#ea580c", action: "#1d4ed8" }, { header: "#14301f", accent: "#ca8a04", action: "#15803d" },
  { header: "#1e2a32", accent: "#f15b24", action: "#1f6f8f" }, { header: "#111827", accent: "#c8102e", action: "#1d4ed8" }, { header: "#2e1065", accent: "#facc15", action: "#7c3aed" },
];
const STEPS = ["Connect Sleeper", "League type", "House rules", "Name and colors", "Owners", "Put it online"];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "my-league";
const getJson = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); };

/** The real setup: reads the commissioner's Sleeper league in the browser and writes the one setting their site needs. */
export function RealSetup() {
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(0);
  const [leagueId, setLeagueId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [kind, setKind] = useState<Kind>("redraft");
  const [div, setDiv] = useState(0);
  const [rec, setRec] = useState(6);
  const [pts, setPts] = useState(0);
  const [keepers, setKeepers] = useState(2);
  const [raise, setRaise] = useState(10);
  const [vetoOn, setVetoOn] = useState(false);
  const [vetoNeeded, setVetoNeeded] = useState(6);
  const [vetoHours, setVetoHours] = useState(24);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [colors, setColors] = useState(PRESETS[0]!);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const go = (n: number) => { setStep(n); setSeen((s) => Math.max(s, n)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function find() {
    const id = leagueId.trim().replace(/\D/g, "");
    if (!id) { setError("Paste your league ID first."); return; }
    setBusy(true); setError(null); setFound(null);
    try {
      const league = await getJson(`${SLEEPER}/league/${id}`);
      if (!league) throw new Error("not found");
      const users: User[] = (await getJson(`${SLEEPER}/league/${id}/users`)) ?? [];
      const drafts = (await getJson(`${SLEEPER}/league/${id}/drafts`).catch(() => [])) ?? [];
      const seasons: Record<string, string> = { [league.season]: id };
      let prev = league.previous_league_id;
      for (let i = 0; i < 20 && prev && prev !== "0"; i++) {
        const p = await getJson(`${SLEEPER}/league/${prev}`).catch(() => null);
        if (!p) break;
        seasons[p.season] = prev; prev = p.previous_league_id;
      }
      const s = league.settings ?? {};
      const f: Found = { name: league.name, season: league.season, teams: s.num_teams ?? users.length, divisions: s.divisions ?? 0, playoffTeams: s.playoff_teams ?? 6,
        draftType: drafts[0]?.type ?? "snake", sleeperType: s.type ?? 0, seasons, users };
      setFound(f);
      setName(league.name);
      const guess: Kind = f.draftType === "auction" ? "auction" : f.sleeperType === 2 ? "dynasty" : f.sleeperType === 1 ? "keeper" : "redraft";
      setKind(guess);
      const d = Math.min(f.divisions, f.playoffTeams); setDiv(d); setRec(f.playoffTeams - d); setPts(0);
    } catch {
      setError("Sleeper didn't find a league with that ID. Check the number and try again.");
    } finally { setBusy(false); }
  }

  const seats = found?.playoffTeams ?? 6;
  const seedSum = div + rec + pts;
  const settings = useMemo(() => {
    if (!found) return "";
    const cfg = {
      v: 1, name: name.trim() || found.name, slug: slugify(name || found.name), tagline: tagline.trim(), type: kind, seasons: found.seasons, colors,
      seeding: { divisionWinners: div, recordSeeds: rec, pointsSeeds: pts },
      keepers: kind === "auction" || kind === "keeper" ? { max: keepers, raise: kind === "auction" ? raise : null } : null,
      veto: vetoOn ? { needed: vetoNeeded, of: Math.max(vetoNeeded, (found.teams || 12) - 2), hours: vetoHours } : null,
      owners: Object.fromEntries(Object.entries(owners).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])),
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
  }, [found, name, tagline, kind, colors, div, rec, pts, keepers, raise, vetoOn, vetoNeeded, vetoHours, owners]);
  const projectName = slugify(name || found?.name || "my-league");
  const deployHref = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(REPO)}&project-name=${projectName}&repository-name=${projectName}&env=LONGSNAP_LEAGUE&envDescription=${encodeURIComponent("Paste the settings Long Snap gave you")}&envLink=${encodeURIComponent("https://long-snap.vercel.app/get-started/setup")}`;
  const num = (v: number, set: (n: number) => void, min: number, max: number) => (
    <input type="text" inputMode="numeric" value={v} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "") || 0); set(Math.max(min, Math.min(max, n))); }} style={{ width: 90 }} />
  );
  const next = (n: number, label: string, ok = true) => <button type="button" className="ls-btn dark" disabled={!ok} onClick={() => go(n)}>{label} →</button>;
  const back = (n: number) => <button type="button" className="ls-btn ghost" onClick={() => go(n)}>← Back</button>;

  return (
    <div className="wz">
      <ol className="wz-steps" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" className={`${i === step ? "on" : ""} ${i < seen && i !== step ? "done" : ""}`} onClick={() => i <= seen && go(i)} disabled={i > seen}>
            <span className="wz-n">{i < seen && i !== step ? "✓" : i + 1}</span>{s}
          </button></li>
        ))}
      </ol>
      <section className="ls-card wz-panel">
        {step === 0 && (<>
          <p className="ls-eyebrow">Step 1 of 6</p>
          <h2>Connect your Sleeper league</h2>
          <div className="wz-why"><b>Why we ask:</b> Long Snap reads your teams, owners, scores, drafts, trades and settings straight from Sleeper, so you never type them in. Your league ID is public on Sleeper; nothing is saved here.</div>
          <div className="wz-field">
            <label htmlFor="lid">Sleeper league ID</label>
            <input id="lid" type="text" inputMode="numeric" placeholder="e.g. 1048327109574893568" value={leagueId} onChange={(e) => setLeagueId(e.target.value)} />
            <span className="wz-hint">On sleeper.com, open your league: the ID is the long number at the end of the web address. In the Sleeper app: open your league → the gear → <b>General</b> → the number at the bottom.</span>
          </div>
          <button type="button" className="ls-btn" onClick={find} disabled={busy}>{busy ? "Looking…" : "Find my league"}</button>
          {error ? <p className="wz-hint" style={{ color: "#b91c1c", fontWeight: 700, marginTop: 10 }}>{error}</p> : null}
          {found ? (
            <div className="ls-card" style={{ marginTop: 16, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
              <b>Found it: {found.name}</b>
              <div className="ls-rows">
                <div><span>Teams</span><b>{found.teams}</b></div>
                <div><span>Seasons on Sleeper</span><b>{Object.keys(found.seasons).sort()[0]}–{found.season}</b></div>
                <div><span>Draft</span><b>{found.draftType === "auction" ? "Auction" : "Snake"}</b></div>
                <div><span>Divisions</span><b>{found.divisions || "None"}</b></div>
                <div><span>Playoff teams</span><b>{found.playoffTeams}</b></div>
              </div>
            </div>
          ) : null}
          <div className="wz-nav"><span />{next(1, "Next: league type", Boolean(found))}</div>
        </>)}

        {step === 1 && (<>
          <p className="ls-eyebrow">Step 2 of 6</p>
          <h2>What kind of league is this?</h2>
          <div className="wz-why"><b>Why we ask:</b> the type decides which pages fit your league. We guessed from your Sleeper settings; change it if we got it wrong.</div>
          <div className="wz-choices">
            {KINDS.map((k) => <button key={k.id} type="button" className={`wz-choice${kind === k.id ? " on" : ""}`} onClick={() => setKind(k.id)}><b>{k.name}</b><span>{k.line}</span></button>)}
          </div>
          <div className="wz-nav">{back(0)}{next(2, "Next: house rules")}</div>
        </>)}

        {step === 2 && (<>
          <p className="ls-eyebrow">Step 3 of 6</p>
          <h2>Your league&rsquo;s house rules</h2>
          <div className="wz-why"><b>Why we ask:</b> Sleeper can&rsquo;t store these. Long Snap uses them for standings, the playoff race, playoff odds and the trade tools.</div>
          <p className="wz-label">Playoff seeding ({seats} teams make it)</p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div className="wz-field"><label>Division winners</label>{num(div, setDiv, 0, found?.divisions ?? 0)}</div>
            <div className="wz-field"><label>Then by record</label>{num(rec, setRec, 0, seats)}</div>
            <div className="wz-field"><label>Then by points for</label>{num(pts, setPts, 0, seats)}</div>
          </div>
          <p className="wz-hint" style={{ color: seedSum === seats ? "#166534" : "#b91c1c", fontWeight: 700 }}>{seedSum === seats ? "These add up to your playoff field." : `These add up to ${seedSum}. They need to add up to ${seats}.`}</p>
          {kind === "auction" || kind === "keeper" ? (<>
            <p className="wz-label" style={{ marginTop: 18 }}>Keepers</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div className="wz-field"><label>Keepers per team</label>{num(keepers, setKeepers, 0, 20)}</div>
              {kind === "auction" ? <div className="wz-field"><label>Raise each year ($)</label>{num(raise, setRaise, 0, 100)}</div> : null}
            </div>
          </>) : null}
          <p className="wz-label" style={{ marginTop: 18 }}>Trade vetoes</p>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={vetoOn} onChange={(e) => setVetoOn(e.target.checked)} /> Owners can vote to veto a trade</label>
          {vetoOn ? <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div className="wz-field"><label>Veto votes needed</label>{num(vetoNeeded, setVetoNeeded, 1, 20)}</div>
            <div className="wz-field"><label>Hours to vote</label>{num(vetoHours, setVetoHours, 1, 168)}</div>
          </div> : null}
          <div className="wz-nav">{back(1)}{next(3, "Next: name and colors", seedSum === seats)}</div>
        </>)}

        {step === 3 && (<>
          <p className="ls-eyebrow">Step 4 of 6</p>
          <h2>Name and colors</h2>
          <div className="wz-why"><b>Why we ask:</b> it&rsquo;s your league&rsquo;s site, so it should look like it. The name also becomes your web address.</div>
          <div className="wz-field"><label htmlFor="nm">League name</label><input id="nm" type="text" value={name} onChange={(e) => setName(e.target.value)} /><span className="wz-hint">Your address will be <b>{projectName}.vercel.app</b> (if it&rsquo;s free; Vercel adds a few letters if not).</span></div>
          <div className="wz-field"><label htmlFor="tg">One-line description (optional)</label><input id="tg" type="text" placeholder="e.g. Auction keeper since 2011" value={tagline} onChange={(e) => setTagline(e.target.value)} /></div>
          <div className="wz-colors">
            {([["header", "Header"], ["accent", "Highlight"], ["action", "Buttons"]] as const).map(([k, label]) => <label key={k} className="wz-color">{label}<input type="color" value={colors[k]} onChange={(e) => setColors({ ...colors, [k]: e.target.value })} /></label>)}
          </div>
          <div className="wz-presets">{PRESETS.map((p, i) => <button key={i} type="button" className="wz-preset" onClick={() => setColors(p)}><i style={{ background: p.header }} /><i style={{ background: p.accent }} /><i style={{ background: p.action }} /></button>)}</div>
          <div className="wz-preview"><div className="wz-preview-head" style={{ background: colors.header }}><span style={{ fontSize: 12, opacity: .8 }}>{tagline || KINDS.find((k) => k.id === kind)!.name}</span><h3>{name || found?.name}</h3>
            <div className="wz-preview-tabs">{["Home", "Matchups", "Standings", "Power Rankings"].map((t, i) => <span key={t} className={i === 0 ? "on" : ""} style={{ borderColor: i === 0 ? colors.accent : "transparent" }}>{t}</span>)}</div></div>
            <div className="wz-preview-body"><span className="ls-btn" style={{ background: colors.action, padding: "8px 12px", fontSize: 13 }}>Full standings →</span></div></div>
          <div className="wz-nav">{back(2)}{next(4, "Next: owners")}</div>
        </>)}

        {step === 4 && found && (<>
          <p className="ls-eyebrow">Step 5 of 6</p>
          <h2>Owners</h2>
          <div className="wz-why"><b>Why we ask:</b> Sleeper only knows usernames. Type each owner&rsquo;s real name if you want it shown (optional). Pictures come from each owner&rsquo;s own Sleeper picture, or their initials.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {found.users.map((u) => (
              <div key={u.user_id} className="wz-owner" style={{ justifyContent: "space-between" }}>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="wz-av" style={{ background: "#e7e5e4" }}>{u.avatar ? <img src={`https://sleepercdn.com/avatars/thumbs/${u.avatar}`} alt="" /> : u.display_name.slice(0, 2).toUpperCase()}</span>
                  <span><b style={{ display: "block", fontSize: 14 }}>{u.metadata?.team_name || u.display_name}</b><small style={{ color: "#78716c" }}>@{u.display_name}</small></span>
                </span>
                <input type="text" placeholder="Real name (optional)" value={owners[u.user_id] ?? ""} onChange={(e) => setOwners({ ...owners, [u.user_id]: e.target.value })} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d6d3d1", minWidth: 180 }} />
              </div>
            ))}
          </div>
          <div className="wz-nav">{back(3)}{next(5, "Next: put it online")}</div>
        </>)}

        {step === 5 && found && (<>
          <p className="ls-eyebrow">Step 6 of 6</p>
          <h2>Put it online</h2>
          <div className="wz-why"><b>How this works:</b> Long Snap copies itself to your own free GitHub and Vercel accounts. Your answers travel as one block of text that you paste once. You can come back here any time to change them.</div>
          <p className="wz-label">1. Copy your settings</p>
          <textarea readOnly value={settings} style={{ width: "100%", height: 90, fontFamily: "monospace", fontSize: 12, padding: 10, borderRadius: 10, border: "1px solid #d6d3d1" }} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="ls-btn" onClick={async () => { try { await navigator.clipboard.writeText(settings); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied ✓" : "Copy settings"}</button>
          <p className="wz-label" style={{ marginTop: 20 }}>2. Click Deploy</p>
          <p className="ls-body">Vercel opens. Sign in with GitHub, then paste your settings into the box named <b>LONGSNAP_LEAGUE</b> and click <b>Deploy</b>. In about two minutes your site is live.</p>
          <div className="ls-btns"><a className="ls-btn dark" href={deployHref} target="_blank" rel="noreferrer">▲ Deploy to Vercel</a></div>
          <p className="wz-label" style={{ marginTop: 20 }}>Already have a site and want to change it?</p>
          <p className="ls-body">In Vercel, open your project → <b>Settings</b> → <b>Environment Variables</b> → <b>LONGSNAP_LEAGUE</b> → <b>Edit</b>, paste the new settings, <b>Save</b>, then <b>Deployments</b> → the newest one → <b>Redeploy</b>.</p>
          <div className="wz-nav">{back(4)}<span /></div>
        </>)}
      </section>
    </div>
  );
}
