import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { ROSTER_AREAS, ROSTER_TIERS, type RosterDetail } from "./roster-detail.ts";

export function RosterDetailView({ detail, teams, theme, dynasty }: {
  readonly detail: RosterDetail;
  readonly teams: Readonly<Record<number, { readonly teamName: string; readonly managerName?: string | null }>>;
  readonly theme: LeagueTileTheme;
  readonly dynasty: boolean;
}) {
  const counts = detail.teams.reduce<Record<string, number>>((c, t) => ({ ...c, [t.tier]: (c[t.tier] ?? 0) + 1 }), {});
  return (
    <section className="league-tiles rd" style={themeCssVariables(theme) as CSSProperties} aria-labelledby="rd-title">
      <h2 id="rd-title" className="rd-heading">Roster strength detail</h2>
      <div className="rd-tiers" aria-label="Tier counts">
        {ROSTER_TIERS.map((t) => <div key={t.key} className="rd-tier"><p className="rd-mini">{t.label}</p><p className="rd-tier-n">{counts[t.key] ?? 0}</p></div>)}
      </div>
      <p className="rd-intro">
        Roster strength only: how good each roster looks on paper right now, ignoring wins and losses{dynasty ? ", using dynasty values (so young talent and future value count)" : ""}. This is the &ldquo;roster&rdquo; part of the weekly rankings above, so its order is different. Each card ranks the starting lineup, depth and every position room, with the team&apos;s biggest strength and weakness.
      </p>
      <div className="rd-grid">
        {detail.teams.map((team) => {
          const who = teams[team.rosterId];
          return (
            <article key={team.rosterId} className="rd-card">
              <div className="rd-top">
                <span className="rd-rank" title="Roster-strength rank">#{team.rank}</span>
                <div className="rd-name-wrap">
                  <h3 className="rd-name">{who?.teamName ?? `Team ${team.rosterId}`}</h3>
                  {who?.managerName ? <p className="rd-manager">{who.managerName}</p> : null}
                  <span className="rd-pill">{team.tier}</span>
                </div>
              </div>
              <div className="rd-areas">
                {ROSTER_AREAS.map((a) => <div key={a.key}><p className="rd-mini">{a.label}</p><p className="rd-area-rank">#{team.ranks[a.key]}</p></div>)}
              </div>
              <div className="rd-sw">
                <div><p className="rd-mini rd-good">Biggest strength</p><p className="rd-sw-label">{team.strength.label}</p><p className="rd-mini">#{team.strength.rank} in league</p></div>
                <div><p className="rd-mini rd-bad">Biggest weakness</p><p className="rd-sw-label">{team.weakness.label}</p><p className="rd-mini">#{team.weakness.rank} in league</p></div>
              </div>
            </article>
          );
        })}
      </div>
      <aside className="rd-method">
        <p><b>How it works:</b> every rostered player gets a {dynasty ? "dynasty " : ""}value from FantasyCalc. Rooms count each position&apos;s starters plus one backup; Starters is the best legal lineup; Depth is everyone left over. Tiers follow the roster rank (top two title contenders, bottom two long shots in a 12-team league). Kickers and defenses don&apos;t count. Only ranks are shown.</p>
        <p><a href={detail.credit.href} target="_blank" rel="noopener noreferrer">{detail.credit.label}</a></p>
      </aside>
    </section>
  );
}
