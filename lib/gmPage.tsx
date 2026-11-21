import { notFound } from "next/navigation";
import { GmFrame, type GmSection } from "../hq/packages/league-tiles/src/gm-view.tsx";
import { pageStyle, themeCssVariables } from "../hq/packages/league-tiles/src/themes.ts";
import "../hq/packages/league-tiles/src/tiles.css";
import type { ReactNode } from "react";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "./leaguePage.tsx";
import { hasTradeTools } from "./tradeLeagues.ts";
import { getSession } from "./auth/session.ts";
import { currentSleeperLeagueId, sleeperTeams, TEAM_PICK_LEAGUES } from "./auth/teamPicks.ts";
import { TeamPicker } from "@/components/TeamPicker";
import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { isDemoMode } from "./demo/demoLeagues.ts";
import { DEMO_OWNER_COOKIE, demoTeams } from "./demo/demoSession.ts";

/** Demo only: pick a team to see the GM tools as its owner. */
async function demoOwnerBar(slug: string, here: string) {
  const rid = (await cookies()).get(DEMO_OWNER_COOKIE)?.value ?? null;
  const teams = demoTeams(slug);
  const me = teams.find((t) => t.rosterId === rid);
  const box: CSSProperties = { background: "#fffbeb", border: "1px solid #fde68a", color: "#78350f", borderRadius: 14, padding: "12px 16px", marginBottom: 16, fontSize: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
  const link = (r: string, label: string) => <a key={r} href={`/demo-owner?team=${r}&next=${encodeURIComponent(here)}`} style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #fcd34d", background: r === rid ? "#f59e0b" : "#fff", color: "#78350f", fontWeight: 800, textDecoration: "none" }}>{label}</a>;
  return (
    <div style={box}>
      <b>{me ? `Demo: you're the owner of ${me.team}.` : "Demo: try the GM tools as an owner."}</b>
      <span>{me ? "Switch team:" : "Pick a team (no sign-in needed):"}</span>
      {teams.map((t) => link(t.rosterId, t.team))}
      {me ? <a href={`/demo-owner?team=out&next=${encodeURIComponent(here)}`} style={{ marginLeft: "auto", color: "#78350f", fontWeight: 800 }}>Sign out</a> : null}
    </div>
  );
}

/** Common shell for the GM pages (My Team, Waivers, Trades, Draft Room): league header + the shared GM frame. */
export async function gmPage(params: Promise<{ league: string }>, active: GmSection, body: (x: Awaited<ReturnType<typeof leagueOr404>> & { apiBase: string; base: string }) => ReactNode) {
  const x = await leagueOr404(params);
  if (!hasTradeTools(x.league.id)) notFound();
  const base = `/${x.league.slug}`;

  const session = TEAM_PICK_LEAGUES.has(x.league.id) ? await getSession() : null;
  const sleeperLeagueId = session ? currentSleeperLeagueId(x.league.id) : null;
  const teams = sleeperLeagueId ? await sleeperTeams(sleeperLeagueId).catch(() => []) : [];
  const v = (k: string) => `var(--tile-${k})`;
  const picker = session && teams.length ? (
    <div style={themeCssVariables(x.theme) as CSSProperties}>
      <TeamPicker apiPath={`/api/${x.league.slug}/my-team`} leagueName={x.league.shortName} current={session.leagues[x.league.id]?.sleeperRosterId ?? null}
        teams={teams.map((t) => ({ rosterId: t.rosterId, name: t.name, owner: t.owner }))}
        colors={{ card: v("card"), cardBorder: v("border"), text: v("text"), muted: v("muted"), action: v("action"), actionText: v("action-text") }} />
    </div>
  ) : null;
  return (
    <>
      <LeagueNav league={x.league} active="gm" />
      <main style={{ ...pageStyle(x.theme), padding: "24px 16px 48px" }}>
        {picker}
        {isDemoMode() ? await demoOwnerBar(x.league.slug, `${base}/${active === "my-team" ? "gm" : `gm/${active}`}`) : null}
        <GmFrame theme={x.theme} active={active} basePath={base}>
          {body({ ...x, apiBase: `/api/${x.league.slug}/trade`, base })}
        </GmFrame>
      </main>
    </>
  );
}
