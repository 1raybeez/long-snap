import Link from "next/link";
import { LongSnapBar } from "../longsnap-bar";

export const metadata = { title: "Get your own site" };

/** Get your own site: the two editions, what you need, and the practice run. */
export default function GetStartedPage() {
  return (
    <div className="ls-page">
      <LongSnapBar />
      <main className="ls-main">
        <p className="ls-eyebrow">Get your own site</p>
        <h1 className="ls-h1">Run Long Snap for your league.</h1>
        <p className="ls-lead">Free, with no paid plan, and nothing to code. You run your own copy on your own free accounts, so your league&rsquo;s data stays with you. The guide has a picture for every click.</p>
        <div className="ls-btns"><Link className="ls-btn" href="/get-started/setup">Set up your league</Link><Link className="ls-btn ghost" href="/get-started/practice">Practice with a made-up league</Link><a className="ls-btn ghost" href="https://github.com/1raybeez/long-snap/blob/main/docs/GUIDE.md">Guide with pictures</a></div>

        <h2 className="ls-h2">Two editions</h2>
        <div className="ls-grid2">
          <div className="ls-card">
            <p className="ls-eyebrow" style={{ color: "#1d4ed8" }}>Basic edition</p>
            <h3 style={{ margin: 0, fontSize: 22 }}>Just Sleeper</h3>
            <p className="ls-body">Everything that only needs your Sleeper league: the league dashboard, standings seeded your way, matchups, power rankings, playoff odds, weekly recaps, league history, owner pages, rivalries, records, draft boards and trades.</p>
            <div className="ls-rows"><div><span>Hosting</span><b>Your free Vercel account</b></div><div><span>Setup</span><b>One button, then forms</b></div><div><span>Cost</span><b>$0</b></div></div>
          </div>
          <div className="ls-card">
            <p className="ls-eyebrow">Full edition</p>
            <h3 style={{ margin: 0, fontSize: 22 }}>Sign-in and league business</h3>
            <p className="ls-body">Adds owner sign-in, GM tools, a Commissioner Hub, a rule book your owners vote on, the veto log and dues tracking. It adds a free Google Firebase project, with a guided setup.</p>
            <div className="ls-rows"><div><span>Hosting</span><b>Vercel + free Firebase</b></div><div><span>Setup</span><b>Guided, a picture for every click</b></div><div><span>Cost</span><b>$0</b></div></div>
          </div>
        </div>

        <h2 className="ls-h2">What you&rsquo;ll need</h2>
        <div className="ls-steps">
          <div className="ls-step"><b>A Sleeper league</b><p className="ls-body">ESPN, Yahoo and MyFantasyLeague come later.</p></div>
          <div className="ls-step"><b>A free GitHub account</b><p className="ls-body">Where your copy of Long Snap lives.</p></div>
          <div className="ls-step"><b>A free Vercel account</b><p className="ls-body">Puts your site online. Sign up with GitHub in one click.</p></div>
          <div className="ls-step"><b>About 10 minutes</b><p className="ls-body">Most of it is answering your league&rsquo;s house rules.</p></div>
        </div>
        <div className="ls-callout">The Basic edition is ready today: dashboard, matchups, standings seeded your way, power rankings, playoff odds, weekly recaps, trades, GM tools, and league history, owner pages, records and rivalries for every season your league has been on Sleeper. The rule book with votes and the veto log for your own league are coming next. Each new Sleeper season, run the setup again so your site follows the new season.</div>
      </main>
      <footer className="ls-foot"><div><span>Long Snap · free league sites for Sleeper commissioners</span><span>Not affiliated with Sleeper or the NFL</span></div></footer>
    </div>
  );
}
