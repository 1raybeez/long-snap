import { LongSnapBar } from "../../longsnap-bar";
import { PracticeSetup } from "./practice-setup";

export const metadata = { title: "Practice setup" };

/** A practice run of the commissioner setup, with a made-up league. Nothing is saved. */
export default function PracticePage() {
  return (
    <div className="ls-page">
      <LongSnapBar />
      <main className="ls-main">
        <p className="ls-eyebrow">Practice run · nothing is saved</p>
        <h1 className="ls-h1" style={{ fontSize: 40 }}>Set up a league site</h1>
        <p className="ls-lead" style={{ marginBottom: 24 }}>These are the same forms you fill in for your own league. Every question says why it&rsquo;s asked. Try it with our made-up league.</p>
        <PracticeSetup />
      </main>
      <footer className="ls-foot"><div><span>Long Snap · free league sites for Sleeper commissioners</span><span>Not affiliated with Sleeper or the NFL</span></div></footer>
    </div>
  );
}
