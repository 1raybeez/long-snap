"use client";

import { useEffect, useState } from "react";
import type { BirthdayToday } from "./birthdays.ts";

export function BirthdayBanner({ apiPath = "/api/birthdays", leagueName }: { apiPath?: string; leagueName: string }) {
  const [people, setPeople] = useState<BirthdayToday[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(apiPath, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { birthdays: [] }))
      .then((j: { birthdays?: BirthdayToday[] }) => { if (!cancelled) setPeople(Array.isArray(j.birthdays) ? j.birthdays : []); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [apiPath]);
  if (!people.length) return null;
  return (
    <div className="bday-stack" role="status">
      {people.map((p) => (
        <section key={p.name} className="bday" style={{ background: `linear-gradient(120deg, ${p.primary} 0%, ${p.primary} 58%, ${p.secondary} 100%)`, color: p.text, borderColor: p.secondary }}>
          <span className="bday-confetti" aria-hidden="true">🎉</span>
          <div>
            <p className="bday-eyebrow" style={{ color: p.secondary === "#FFFFFF" ? p.text : p.secondary }}>{leagueName}</p>
            <p className="bday-title">Happy Birthday, {p.firstName}!</p>
            <p className="bday-sub">From everyone in the league. 🎂</p>
          </div>
          <span className="bday-confetti" aria-hidden="true">🎈</span>
        </section>
      ))}
    </div>
  );
}
