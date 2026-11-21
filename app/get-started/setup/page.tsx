import { LongSnapBar } from "../../longsnap-bar";
import { RealSetup } from "./real-setup";

export const metadata = { title: "Set up your league" };

/** The real setup: connect a Sleeper league, answer the house rules, and put the site online. */
export default function SetupPage() {
  return (
    <div className="ls-page">
      <LongSnapBar />
      <main className="ls-main">
        <p className="ls-eyebrow">Get your own site</p>
        <h1 className="ls-h1" style={{ fontSize: 40 }}>Set up your league</h1>
        <p className="ls-lead" style={{ marginBottom: 24 }}>Six short steps. Every question says why it&rsquo;s asked. Nothing is saved on this page: your answers go straight into your own site.</p>
        <RealSetup />
      </main>
      <footer className="ls-foot"><div><span>Long Snap · free league sites for Sleeper commissioners</span><span>Not affiliated with Sleeper or the NFL</span></div></footer>
    </div>
  );
}
