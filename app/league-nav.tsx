import Link from "next/link";
import type { PlatformLeague } from "@/lib/platformLeagues";
import { isSleeperOnly, leagueData } from "@/lib/leagueData";
import { hasTradeTools } from "@/lib/tradeLeagues";
import { HOST_FLYER_LEAGUES, VETO_LOG_LEAGUES, COLUMN_LEAGUES } from "@/lib/leagueFeatures";
import { COLUMN_HOSTS } from "../hq/packages/league-tiles/src/host-column.ts";
import { HOSTS } from "../hq/packages/league-tiles/src/host-flyer.ts";
import { LeagueInfoTabs } from "./league-info-tabs";
import { LeagueSwitcher } from "./league-switcher";
import { ShareButton } from "./share-button";
import { LongSnapBar } from "./longsnap-bar";
import { OWN_LEAGUE } from "@/lib/ownLeague";
import { isDemoMode } from "@/lib/demo/demoLeagues";

/** League header + tabs on the platform. Tabs appear as each page moves over (Package 5). */
type Tab = "home" | "matchups" | "standings" | "power-rankings" | "predictor" | "history" | "managers" | "league-info" | "recaps" | "trades" | "gm" | "champ-kind" | "picks" | "column" | "commish";

/** `commish` adds the Commish tab; only the (signed-in) Commissioner Hub page passes it, so public pages stay cached. */
export function LeagueNav({ league, active, commish = false }: { league: PlatformLeague; active: Tab; commish?: boolean }) {
  const c = league.theme?.colors;
  const hasData = Boolean(leagueData(league.id));
  const sleeperOnly = isSleeperOnly(league.id);
  const tabs: { key: Tab; label: string; href: string }[] = [
    { key: "home", label: "Home", href: `/${league.slug}` },
    // A Sleeper-only league has no rule book, history or managers pages of its own.
    ...(sleeperOnly ? ([
      { key: "matchups", label: "Matchups", href: `/${league.slug}/matchups` },
      { key: "standings", label: "Standings", href: `/${league.slug}/standings` },
      { key: "power-rankings", label: "Power Rankings", href: `/${league.slug}/power-rankings` },
      { key: "predictor", label: "Predictor", href: `/${league.slug}/predictor` },
      { key: "recaps", label: "Recaps", href: `/${league.slug}/recaps` },
      { key: "trades", label: "Trades", href: `/${league.slug}/league-info/trades` },
      ...(league.id === "c4g-fantasy-football" ? ([{ key: "champ-kind", label: "Weekly show", href: `/${league.slug}/champ-kind` }] as const) : []),
      ...(COLUMN_LEAGUES[league.id] ? ([{ key: "column", label: COLUMN_HOSTS[COLUMN_LEAGUES[league.id]!]?.tabLabel ?? "Column", href: `/${league.slug}/column` }] as const) : []),
    ] as const) : []),
    ...(hasData ? ([
      { key: "matchups", label: "Matchups", href: `/${league.slug}/matchups` },
      { key: "standings", label: "Standings", href: `/${league.slug}/standings` },
      { key: "power-rankings", label: "Power Rankings", href: `/${league.slug}/power-rankings` },
      { key: "predictor", label: "Predictor", href: `/${league.slug}/predictor` },
      { key: "recaps", label: "Recaps", href: `/${league.slug}/recaps` },
      ...(HOST_FLYER_LEAGUES[league.id] ? ([{ key: "picks", label: `${HOSTS[HOST_FLYER_LEAGUES[league.id]!].shortName}'s Picks`, href: `/${league.slug}/picks` }] as const) : []),
      { key: "history", label: "History", href: `/${league.slug}/history` },
      { key: "managers", label: "Managers", href: `/${league.slug}/managers` },
      { key: "league-info", label: "League Info", href: `/${league.slug}/league-info` },
    ] as const) : []),
    ...(hasTradeTools(league.id) ? ([{ key: "gm", label: "GM", href: `/${league.slug}/gm` }] as const) : []),
    ...(commish ? ([{ key: "commish", label: "Commish", href: `/${league.slug}/commish` }] as const) : []),
  ];
  return (
    <>
    {isDemoMode() ? <LongSnapBar active={league.slug} /> : null}
    <div style={{ background: c?.header ?? "#1f2937", color: c?.headerText ?? "#fff" }}>
      <div className="p-wrap" style={{ paddingTop: 18, paddingBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p className="p-kicker" style={{ color: "inherit", opacity: 0.75, margin: 0 }}>{process.env.LONGSNAP_LEAGUE ? null : <Link href="/">{isDemoMode() ? "← All league types" : "← My Leagues"}</Link>}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShareButton />
            <LeagueSwitcher current={league.slug} colors={{ bg: c?.header ?? "#1f2937", text: c?.headerText ?? "#fff", accent: c?.accent ?? "#f97316" }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
          {league.logo ? <img className="p-card__logo" src={league.logo} alt="" style={{ width: 64, height: 64 }} /> : null}
          <div>
            <h1 className="p-h1" style={{ margin: 0, color: "inherit" }}>{league.name}</h1>
            <p className="p-note" style={{ color: "inherit", opacity: 0.8 }}>{league.theme?.tagline ?? league.format} · {league.season} season</p>
          </div>
        </div>
        <nav className="p-tabs" aria-label={`${league.shortName} pages`}>
          {tabs.map((t) => <Link key={t.key} href={t.href} className={t.key === active ? "is-active" : undefined} style={t.key === active ? { borderColor: c?.accent } : undefined}>{t.label}</Link>)}
        </nav>
        {active === "league-info" && !sleeperOnly ? <LeagueInfoTabs slug={league.slug} accent={c?.accent} tabs={[
          { path: "", label: "Overview" },
          ...(OWN_LEAGUE?.slug === league.id ? [] : [{ path: "constitution", label: "Constitution" }, { path: "legislative", label: "Legislative Hub" }, { path: "fees", label: "Fees & Payouts" }]),
          { path: "records", label: "Records" },
          { path: "rivalries", label: "Rivalries" },
          { path: "trades", label: "Trades" },
          ...(VETO_LOG_LEAGUES.has(league.id) ? [{ path: "vetoes", label: "Veto Log" }] : []),
          ...(OWN_LEAGUE?.slug === league.id ? [] : [{ path: "drafts", label: "Draft" }, { path: "resources", label: "Resources" }]),
        ]} /> : null}
      </div>
    </div>
    </>
  );
}
