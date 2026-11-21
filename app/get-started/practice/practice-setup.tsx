"use client";
import { useMemo, useState, type ChangeEvent } from "react";

type Kind = "redraft" | "keeper" | "auction" | "dynasty";
const KINDS: { id: Kind; name: string; line: string; slug: string }[] = [
  { id: "redraft", name: "Redraft", line: "Everyone goes back in the pool every year.", slug: "lakeview-ffl" },
  { id: "keeper", name: "Keeper", line: "Snake draft. Keep a few players at a draft-round cost.", slug: "mill-creek-ffl" },
  { id: "auction", name: "Auction keeper", line: "Auction draft. Keepers cost last year's price plus a raise.", slug: "harbor-city-ffl" },
  { id: "dynasty", name: "Dynasty", line: "Keep everyone. Rookie drafts, future picks and a taxi squad.", slug: "ironworks-dynasty" },
];
const STEPS = ["Connect Sleeper", "League type", "House rules", "Colors and owners", "Pick your pages", "Finish"];
const PRESETS = [
  { name: "Harbor", header: "#071a33", accent: "#ea580c", action: "#1d4ed8" },
  { name: "Forest", header: "#14301f", accent: "#ca8a04", action: "#15803d" },
  { name: "Steel", header: "#1e2a32", accent: "#f15b24", action: "#1f6f8f" },
  { name: "Classic", header: "#111827", accent: "#c8102e", action: "#1d4ed8" },
  { name: "Royal", header: "#2e1065", accent: "#facc15", action: "#7c3aed" },
];
const PRACTICE_ID = "930000000000002026";
const OWNERS = [
  { name: "Kevin Petrakis", team: "Tidewater Toros", sleeperAvatar: false },
  { name: "Bree Delgado", team: "Lantern Bay Lights", sleeperAvatar: true },
  { name: "Omar Dubois", team: "Port Authority", sleeperAvatar: false },
  { name: "Wes Rivers", team: "Dockside Dogs", sleeperAvatar: true },
];
const PAGES: { id: string; name: string; note: string; full?: boolean; kinds?: Kind[] }[] = [
  { id: "home", name: "League dashboard", note: "High score, playoff race, matchups, recap" },
  { id: "matchups", name: "Matchups", note: "Box scores for every week" },
  { id: "standings", name: "Standings", note: "Seeded by your rules" },
  { id: "power", name: "Power rankings", note: "Results plus roster value" },
  { id: "predictor", name: "Playoff odds", note: "10,000 simulated seasons" },
  { id: "recaps", name: "Weekly recaps", note: "Written for you every week" },
  { id: "history", name: "League history", note: "Champions, eras, Hall of Fame" },
  { id: "managers", name: "Owner pages", note: "Career records and rivals" },
  { id: "draft", name: "Draft boards", note: "Every draft, pick by pick" },
  { id: "keepers", name: "Keeper prices", note: "What each keeper costs next year", kinds: ["keeper", "auction"] },
  { id: "future", name: "Future picks", note: "Who owns every rookie pick", kinds: ["dynasty"] },
  { id: "rules", name: "Rule book and votes", note: "Owners propose and vote on rule changes", full: true },
  { id: "vetoes", name: "Veto log", note: "Every veto vote on record", full: true },
  { id: "gm", name: "GM tools", note: "Trade ideas and waiver help for each owner", full: true },
];
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

/** A practice run of Long Snap's setup. Nothing is saved; it shows each form a commissioner fills in. */
export function PracticeSetup() {
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(0);
  const [leagueId, setLeagueId] = useState(PRACTICE_ID);
  const [found, setFound] = useState(false);
  const [kind, setKind] = useState<Kind>("auction");
  const [changed, setChanged] = useState(false);
  const [changeYear, setChangeYear] = useState("2021");
  const [oldKind, setOldKind] = useState<Kind>("keeper");
  const [divWinners, setDivWinners] = useState(3);
  const [byRecord, setByRecord] = useState(1);
  const [byPoints, setByPoints] = useState(2);
  const [keepers, setKeepers] = useState(2);
  const [raise, setRaise] = useState(10);
  const [vetoNeeded, setVetoNeeded] = useState(6);
  const [vetoHours, setVetoHours] = useState(24);
  const [taxi, setTaxi] = useState(4);
  const [rookieRounds, setRookieRounds] = useState(4);
  const [colors, setColors] = useState(PRESETS[0]!);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<Record<string, boolean>>(Object.fromEntries(PAGES.map((p) => [p.id, true])));
  const [full, setFull] = useState(false);

  const go = (n: number) => { setStep(n); setSeen((s) => Math.max(s, n)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const seats = 6;
  const seedSum = divWinners + byRecord + byPoints;
  const seeding = useMemo(() => {
    const parts = [divWinners ? `${divWinners} division winner${divWinners > 1 ? "s" : ""}` : null, byRecord ? `${byRecord} by record` : null, byPoints ? `${byPoints} by points for` : null].filter(Boolean);
    return parts.join(", then ");
  }, [divWinners, byRecord, byPoints]);
  const upload = (name: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setPhotos((p) => ({ ...p, [name]: URL.createObjectURL(f) }));
  };
  const target = KINDS.find((k) => k.id === kind)!;
  const num = (v: number, set: (n: number) => void, min: number, max: number) => (
    <input type="text" inputMode="numeric" value={v} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (!Number.isNaN(n)) set(Math.max(min, Math.min(max, n))); }} style={{ width: 90 }} />
  );

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
        {step === 0 && (
          <>
            <p className="ls-eyebrow">Step 1 of 6</p>
            <h2>Connect your Sleeper league</h2>
            <div className="wz-why"><b>Why we ask:</b> Long Snap reads everything it can straight from Sleeper: teams, owners, scores, drafts, trades and your league settings. You never type those in.</div>
            <div className="wz-field">
              <label htmlFor="lid">Sleeper league ID</label>
              <input id="lid" type="text" value={leagueId} onChange={(e) => { setLeagueId(e.target.value); setFound(false); }} />
              <span className="wz-hint">In the Sleeper app: open your league, tap the gear, then <b>General</b>. The league ID is the long number at the bottom. For this practice run we filled in a made-up league.</span>
            </div>
            <button type="button" className="ls-btn" onClick={() => setFound(true)}>Find my league</button>
            {found ? (
              <div className="ls-card" style={{ marginTop: 16, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                <b>Found it: Harbor City FFL</b>
                <div className="ls-rows">
                  <div><span>Teams</span><b>12</b></div><div><span>Seasons on Sleeper</span><b>2022–2026</b></div>
                  <div><span>Draft</span><b>Auction, $200 budget</b></div><div><span>Divisions</span><b>3</b></div>
                </div>
                {leagueId.trim() !== PRACTICE_ID ? <p className="wz-hint" style={{ marginTop: 10 }}>This practice run always uses the made-up Harbor City league. Your real setup reads the league ID you paste.</p> : null}
              </div>
            ) : null}
            <div className="wz-nav"><span /><button type="button" className="ls-btn dark" disabled={!found} onClick={() => go(1)}>Next: league type →</button></div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="ls-eyebrow">Step 2 of 6</p>
            <h2>What kind of league is this?</h2>
            <div className="wz-why"><b>Why we ask:</b> the league type decides which pages your site gets: keeper prices for keeper leagues, rookie drafts and future picks for dynasty, and so on. Long Snap made a guess from your Sleeper settings.</div>
            <div className="wz-choices">
              {KINDS.map((k) => (
                <button key={k.id} type="button" className={`wz-choice${kind === k.id ? " on" : ""}`} onClick={() => setKind(k.id)}>
                  <b>{k.name}{k.id === "auction" ? <span className="wz-tag">Our guess</span> : null}</b><span>{k.line}</span>
                </button>
              ))}
            </div>
            <div className="wz-field" style={{ marginTop: 20 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={changed} onChange={(e) => setChanged(e.target.checked)} /> Our league used to be a different type</label>
              <span className="wz-hint">Plenty of leagues change. Ironworks, one of the demo leagues, was a keeper league until 2021 and went dynasty in 2022. Your history keeps each era.</span>
            </div>
            {changed ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div className="wz-field"><label htmlFor="old">It used to be</label><select id="old" value={oldKind} onChange={(e) => setOldKind(e.target.value as Kind)}>{KINDS.filter((k) => k.id !== kind).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></div>
                <div className="wz-field"><label htmlFor="yr">Last season as that type</label><select id="yr" value={changeYear} onChange={(e) => setChangeYear(e.target.value)}>{Array.from({ length: 16 }, (_, i) => String(2025 - i)).map((y) => <option key={y}>{y}</option>)}</select></div>
              </div>
            ) : null}
            <div className="wz-nav"><button type="button" className="ls-btn ghost" onClick={() => go(0)}>← Back</button><button type="button" className="ls-btn dark" onClick={() => go(2)}>Next: house rules →</button></div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="ls-eyebrow">Step 3 of 6</p>
            <h2>Your league&rsquo;s house rules</h2>
            <div className="wz-why"><b>Why we ask:</b> Sleeper can&rsquo;t store everything. These are the rules that make your league yours, and Long Snap uses them for standings, playoff odds, keeper prices and the veto log.</div>
            <p className="wz-label">Playoff seeding ({seats} teams)</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div className="wz-field"><label>Division winners</label>{num(divWinners, setDivWinners, 0, 4)}</div>
              <div className="wz-field"><label>Then by record</label>{num(byRecord, setByRecord, 0, 6)}</div>
              <div className="wz-field"><label>Then by points for</label>{num(byPoints, setByPoints, 0, 6)}</div>
            </div>
            <p className="wz-hint" style={{ color: seedSum === seats ? "#166534" : "#b91c1c", fontWeight: 700 }}>{seedSum === seats ? `Seeds: ${seeding}.` : `These add up to ${seedSum}. They need to add up to ${seats}.`}</p>
            {kind === "auction" || kind === "keeper" ? (
              <>
                <p className="wz-label" style={{ marginTop: 18 }}>Keepers</p>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <div className="wz-field"><label>Keepers per team</label>{num(keepers, setKeepers, 0, 10)}</div>
                  {kind === "auction" ? <div className="wz-field"><label>Raise each year ($)</label>{num(raise, setRaise, 0, 50)}</div> : null}
                </div>
                <p className="wz-hint">{kind === "auction" ? `A keeper costs last year's price plus $${raise}.` : "A keeper costs the round he was drafted in."}</p>
              </>
            ) : null}
            {kind === "dynasty" ? (
              <>
                <p className="wz-label" style={{ marginTop: 18 }}>Rookie draft and rosters</p>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <div className="wz-field"><label>Rookie draft rounds</label>{num(rookieRounds, setRookieRounds, 1, 8)}</div>
                  <div className="wz-field"><label>Taxi squad spots</label>{num(taxi, setTaxi, 0, 10)}</div>
                </div>
              </>
            ) : null}
            <p className="wz-label" style={{ marginTop: 18 }}>Trade vetoes</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div className="wz-field"><label>Veto votes needed (of 10)</label>{num(vetoNeeded, setVetoNeeded, 1, 10)}</div>
              <div className="wz-field"><label>Hours to vote</label>{num(vetoHours, setVetoHours, 1, 96)}</div>
            </div>
            <div className="wz-nav"><button type="button" className="ls-btn ghost" onClick={() => go(1)}>← Back</button><button type="button" className="ls-btn dark" disabled={seedSum !== seats} onClick={() => go(3)}>Next: colors and owners →</button></div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="ls-eyebrow">Step 4 of 6</p>
            <h2>Colors and owners</h2>
            <div className="wz-why"><b>Why we ask:</b> it&rsquo;s your league&rsquo;s site, so it should look like it. Owner photos are optional: without one, Long Snap uses the owner&rsquo;s own Sleeper picture, and if there isn&rsquo;t one, their initials.</div>
            <div className="wz-colors">
              {([["header", "Header"], ["accent", "Highlight"], ["action", "Buttons"]] as const).map(([k, label]) => (
                <label key={k} className="wz-color">{label}<input type="color" value={colors[k]} onChange={(e) => setColors({ ...colors, name: "Custom", [k]: e.target.value })} /></label>
              ))}
            </div>
            <div className="wz-presets" aria-label="Color ideas">
              {PRESETS.map((p) => <button key={p.name} type="button" className="wz-preset" title={p.name} onClick={() => setColors(p)}><i style={{ background: p.header }} /><i style={{ background: p.accent }} /><i style={{ background: p.action }} /></button>)}
            </div>
            <div className="wz-preview" aria-label="Preview">
              <div className="wz-preview-head" style={{ background: colors.header }}>
                <span style={{ fontSize: 12, opacity: .8 }}>{target.name} · 2026 season</span>
                <h3>Harbor City FFL</h3>
                <div className="wz-preview-tabs">{["Home", "Standings", "History", "Managers"].map((t, i) => <span key={t} className={i === 0 ? "on" : ""} style={{ borderColor: i === 0 ? colors.accent : "transparent" }}>{t}</span>)}</div>
              </div>
              <div className="wz-preview-body">
                {OWNERS.map((o) => (
                  <div key={o.name} className="wz-owner">
                    <span className="wz-av" style={{ background: photos[o.name] ? "#fff" : o.sleeperAvatar ? colors.accent : "#e7e5e4", color: o.sleeperAvatar ? "#fff" : "#44403c" }}>
                      {photos[o.name] ? <img src={photos[o.name]} alt="" /> : o.sleeperAvatar ? "🏈" : initials(o.name)}
                    </span>
                    <span><b style={{ display: "block", fontSize: 14 }}>{o.name}</b><small style={{ color: "#78716c" }}>{photos[o.name] ? "Your photo" : o.sleeperAvatar ? "Sleeper picture" : "Initials"}</small></span>
                    <label className="ls-btn ghost" style={{ padding: "6px 10px", fontSize: 12 }}>Photo<input type="file" accept="image/*" hidden onChange={upload(o.name)} /></label>
                  </div>
                ))}
                <span style={{ alignSelf: "center" }}><span className="ls-btn" style={{ background: colors.action, padding: "8px 12px", fontSize: 13 }}>Full standings →</span></span>
              </div>
            </div>
            <p className="wz-hint" style={{ marginTop: 8 }}>Photos you pick here stay on this page. Nothing in the practice run is uploaded or saved.</p>
            <div className="wz-nav"><button type="button" className="ls-btn ghost" onClick={() => go(2)}>← Back</button><button type="button" className="ls-btn dark" onClick={() => go(4)}>Next: pick your pages →</button></div>
          </>
        )}

        {step === 4 && (
          <>
            <p className="ls-eyebrow">Step 5 of 6</p>
            <h2>Pick your pages</h2>
            <div className="wz-why"><b>Why we ask:</b> not every league wants every page. Turn off anything you don&rsquo;t need. You can change this any time.</div>
            <div className="wz-choices" style={{ marginBottom: 14 }}>
              <button type="button" className={`wz-choice${!full ? " on" : ""}`} onClick={() => setFull(false)}><b>Basic edition</b><span>Everything that only needs Sleeper. Vercel only. About 10 minutes.</span></button>
              <button type="button" className={`wz-choice${full ? " on" : ""}`} onClick={() => setFull(true)}><b>Full edition</b><span>Adds owner sign-in, the rule book and votes, the veto log and GM tools. Adds a free Firebase project.</span></button>
            </div>
            <div className="wz-pages">
              {PAGES.filter((p) => !p.kinds || p.kinds.includes(kind)).map((p) => {
                const locked = p.full && !full;
                return (
                  <label key={p.id} className="wz-page" style={locked ? { opacity: .5 } : undefined}>
                    <input type="checkbox" disabled={locked} checked={!locked && Boolean(pages[p.id])} onChange={(e) => setPages({ ...pages, [p.id]: e.target.checked })} />
                    <span><b>{p.name}</b>{p.full ? <span className="wz-tag" style={{ background: "#fef3c7", color: "#92400e" }}>Full</span> : null}<small>{p.note}</small></span>
                  </label>
                );
              })}
            </div>
            <div className="wz-nav"><button type="button" className="ls-btn ghost" onClick={() => go(3)}>← Back</button><button type="button" className="ls-btn dark" onClick={() => go(5)}>Finish →</button></div>
          </>
        )}

        {step === 5 && (
          <div className="wz-done">
            <div className="wz-check">✓</div>
            <h2>That&rsquo;s the whole setup.</h2>
            <p className="ls-body" style={{ maxWidth: 560, margin: "8px auto 0" }}>In the real setup, Long Snap saves these answers and your site goes live on your own free Vercel account, at an address like <b>your-league.vercel.app</b>. Here&rsquo;s what you picked:</p>
            <div className="ls-rows" style={{ maxWidth: 520, margin: "16px auto", textAlign: "left" }}>
              <div><span>League type</span><b>{target.name}{changed ? ` (${KINDS.find((k) => k.id === oldKind)!.name} through ${changeYear})` : ""}</b></div>
              <div><span>Playoff seeds</span><b>{seeding}</b></div>
              {kind === "auction" || kind === "keeper" ? <div><span>Keepers</span><b>{keepers}{kind === "auction" ? `, last price + $${raise}` : ", at draft-round cost"}</b></div> : null}
              {kind === "dynasty" ? <div><span>Rookie draft / taxi</span><b>{rookieRounds} rounds / {taxi} spots</b></div> : null}
              <div><span>Vetoes</span><b>{vetoNeeded} of 10 within {vetoHours} hours</b></div>
              <div><span>Edition</span><b>{full ? "Full" : "Basic"}</b></div>
              <div><span>Pages</span><b>{PAGES.filter((p) => (!p.kinds || p.kinds.includes(kind)) && !(p.full && !full) && pages[p.id]).length}</b></div>
            </div>
            <div className="ls-btns" style={{ justifyContent: "center" }}>
              <a className="ls-btn" href={`/${target.slug}`}>See a finished {target.name.toLowerCase()} site →</a>
              <button type="button" className="ls-btn ghost" onClick={() => { setSeen(0); go(0); setFound(false); }}>Start over</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
