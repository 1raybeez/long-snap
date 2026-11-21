import Link from "next/link";
import { DEMO_KEYS, DEMO_LEAGUES } from "@/lib/demo/demoLeagues";
import "./longsnap.css";

export const TYPE_LABEL: Record<string, string> = { redraft: "Redraft", keeper: "Keeper", auction: "Auction keeper", dynasty: "Dynasty" };

/** The Long Snap demo bar: brand, the league-type switch and "Get your own site". Only on the public demo. */
export function LongSnapBar({ active }: { active?: string | null }) {
  return (
    <div className="ls-bar">
      <div className="ls-bar-in">
        <Link className="ls-brand" href="/"><span className="ls-mark">LS</span>Long Snap</Link>
        <span className="ls-tag">Demo · see it as</span>
        <nav className="ls-switch" aria-label="League type">
          {DEMO_KEYS.map((k) => (
            <Link key={k} className={DEMO_LEAGUES[k].slug === active ? "on" : undefined} href={`/${DEMO_LEAGUES[k].slug}`}>{TYPE_LABEL[k]}</Link>
          ))}
        </nav>
        <Link className="ls-cta" href="/get-started">Get your own site</Link>
      </div>
    </div>
  );
}
