import Link from "next/link";
import { DEMO_KEYS, DEMO_LEAGUES } from "@/lib/demo/demoLeagues";
import { PLATFORM_THEMES } from "@/lib/platformLeagues";
import { LongSnapBar, TYPE_LABEL } from "./longsnap-bar";

const LOGO: Record<string, string> = { redraft: "LV", keeper: "MC", auction: "HC", dynasty: "IW" };
const BLURB: Record<string, { line: string; points: string[] }> = {
  redraft: { line: "A fresh draft every August.", points: ["Snake draft board", "Weekly recaps and power rankings", "Playoff odds all season"] },
  keeper: { line: "Keep 3 at a draft-round cost.", points: ["Keepers and their costs", "Two divisions, points-for wild cards", "Trade veto log"] },
  auction: { line: "$200 auction, keepers at last price + $10.", points: ["Auction board with keeper prices", "3 divisions, points-for seeds", "Rule book the owners vote on"] },
  dynasty: { line: "Keep everyone. Was a keeper league until 2021.", points: ["Rookie drafts and future picks", "Taxi squads", "League history back to 2012"] },
};

/** The public demo's front page: what Long Snap is, the four league types, and how to get your own. */
export function LongSnapLanding() {
  return (
    <div className="ls-page">
      <LongSnapBar />
      <main className="ls-main">
        <section className="ls-hero">
          <div>
            <p className="ls-eyebrow">Free for every commissioner</p>
            <h1 className="ls-h1">Your league deserves its own site.</h1>
            <p className="ls-lead">Long Snap turns your Sleeper league into a full league website: standings seeded your way, matchups, power rankings, playoff odds, league history, owner pages, a rule book your owners vote on, a trade veto log and draft boards. Your own copy, on your own free account. No code.</p>
            <div className="ls-btns">
              <a className="ls-btn dark" href="#types">Pick a league type</a>
              <Link className="ls-btn" href="/get-started">Get your own site</Link>
            </div>
          </div>
          <div className="ls-card">
            <p className="ls-eyebrow" style={{ color: "#1d4ed8" }}>One template, four kinds of league</p>
            <p className="ls-body">Every league in this demo is made up: the teams, the owners and the votes. The scores are real, though. Every lineup was scored from real NFL games using Sleeper&rsquo;s public stats.</p>
            <div className="ls-minis">
              <div className="ls-mini"><span>League types</span><b>4</b></div>
              <div className="ls-mini"><span>Seasons on Sleeper</span><b>5</b></div>
              <div className="ls-mini"><span>Oldest history</span><b>2011</b></div>
              <div className="ls-mini"><span>Cost to run</span><b>$0</b></div>
            </div>
          </div>
        </section>

        <h2 className="ls-h2" id="types">See it as…</h2>
        <div className="ls-types">
          {DEMO_KEYS.map((k) => {
            const l = DEMO_LEAGUES[k];
            const c = PLATFORM_THEMES[l.slug]?.colors;
            return (
              <Link key={k} className="ls-type" href={`/${l.slug}`}>
                <div className="ls-type-top" style={{ background: c?.header ?? "#0f172a" }}>
                  <span className="ls-logo" style={{ color: c?.header ?? "#0f172a" }}>{LOGO[k]}</span>
                  <div><div className="ls-type-kind" style={{ color: c?.accent ?? "#f59e0b" }}>{TYPE_LABEL[k]}</div><div className="ls-type-name">{l.name}</div></div>
                </div>
                <div className="ls-type-body">
                  <span>{BLURB[k]!.line}</span>
                  <ul>{BLURB[k]!.points.map((p) => <li key={p}>{p}</li>)}</ul>
                  <span className="ls-type-go">See the {TYPE_LABEL[k]!.toLowerCase()} site →</span>
                </div>
              </Link>
            );
          })}
        </div>

        <h2 className="ls-h2">How it works</h2>
        <div className="ls-steps">
          <div className="ls-step"><b>Copy it</b><p className="ls-body">One button copies Long Snap to your own free GitHub and Vercel accounts. You host it, so your league&rsquo;s data stays yours.</p></div>
          <div className="ls-step"><b>Connect Sleeper</b><p className="ls-body">Paste your league ID. Long Snap reads your teams, scores, history and settings from Sleeper.</p></div>
          <div className="ls-step"><b>Pick your league type</b><p className="ls-body">Redraft, keeper, auction keeper or dynasty. Long Snap guesses from Sleeper and you confirm. Changed types over the years? Long Snap keeps each era.</p></div>
          <div className="ls-step"><b>Answer your house rules</b><p className="ls-body">Seeding, keeper prices, rookie draft order, vetoes, colors and owner photos. All on forms.</p></div>
        </div>
        <div className="ls-btns"><Link className="ls-btn" href="/get-started/practice">Try the setup (practice run)</Link></div>
      </main>
      <footer className="ls-foot"><div><span>Long Snap · free league sites for Sleeper commissioners</span><span>Not affiliated with Sleeper or the NFL</span></div></footer>
    </div>
  );
}
