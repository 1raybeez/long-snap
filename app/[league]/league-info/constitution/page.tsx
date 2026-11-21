import Link from "next/link";
import { notFound } from "next/navigation";
import { LivingConstitution } from "../../../../hq/packages/league-site-pages/src/LivingConstitution.tsx";
import { AskConstitutionBox } from "../../../../hq/packages/league-tiles/src/constitution-ask-view.tsx";
import { pageStyle, themeCssVariables } from "../../../../hq/packages/league-tiles/src/themes.ts";
import type { CurrentSection, VersionHistoryUpdate } from "../../../../hq/packages/league-governance/src/index.ts";
import "../../../../hq/packages/league-tiles/src/tiles.css";
import "@/app/hq-pages.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks, sitePageHref } from "@/lib/links";
import { sitePage } from "@/lib/sitePage";
import { riverCityRuleBook, RIVER_CITY_LEAGUE_ID } from "@/lib/riverCityLegislative";
import { lccRuleBook } from "@/lib/lccLegislative";
import { rvaRuleBook } from "@/lib/rvaLegislative";
import { demoRuleBook } from "@/lib/demo/demoGovernance";
import { DEMO_SLUGS } from "@/lib/demo/demoLeagues";
import { LCC_ENGINE, RVA_ENGINE, SCORING_APPENDIX_LEAGUES } from "@/lib/leagueFeatures";

export const revalidate = 900;
export const metadata = { title: "Rules of Play" };

type Model = { sections: CurrentSection[]; history: VersionHistoryUpdate[]; lastAmendedAt: string | null; navLabels: Record<string, string> };
const RULE_BOOK_LEAGUES: ReadonlySet<string> = new Set(["river-city-ffl", "long-country-club", "rva-eskimo-brothers", ...DEMO_SLUGS]);

export default async function ConstitutionPage({ params }: { params: Promise<{ league: string }> }) {
  const { league, theme } = await leagueOr404(params);
  if (!RULE_BOOK_LEAGUES.has(league.id)) notFound();

  const model: Model | null = DEMO_SLUGS.includes(league.id) ? await demoRuleBook(league.id) : league.id === RIVER_CITY_LEAGUE_ID ? await riverCityRuleBook() : league.id === "long-country-club" && LCC_ENGINE.has("rulebook") ? await lccRuleBook().catch(() => null) : league.id === "rva-eskimo-brothers" && RVA_ENGINE.has("rulebook") ? await rvaRuleBook().catch(() => null) : await sitePage<Model>(league, "constitution");
  const hub = `/${league.slug}/league-info/legislative`;
  return (
    <>
      <LeagueNav league={league} active="league-info" />
      <main className="hq-lcc" style={{ ...pageStyle(theme), ...themeCssVariables(theme), padding: "24px 16px 56px" }}>
        <header className="lcc2-page-container pb-5">
          <Link href={`/${league.slug}/league-info`} className="lcc2-button lcc2-button--secondary">← Back to League Info</Link>
          <p className="mt-7 lcc2-label text-[var(--lcc-brand-primary)]">League Info</p>
          <h1 className="lcc2-home-identity__title mt-2">Rules of Play</h1>
          <p className="lcc2-home-identity__supporting max-w-3xl">
            The official {league.shortName} constitution. Rule changes passed in the <Link href={hub} className="text-[var(--lcc-interactive)] underline">Legislative Hub</Link> appear here automatically.
            {league.id === "river-city-ffl" ? null : <> Scoring and roster settings are in <a href={SCORING_APPENDIX_LEAGUES.has(league.id) ? `/${league.slug}/league-info/constitution/appendix` : sitePageHref(league, "/league-info/constitution/appendix")} className="text-[var(--lcc-interactive)] underline">Appendix B</a>, read live from Sleeper.</>}
          </p>
        </header>
        {DEMO_SLUGS.includes(league.id) ? null : (
        <div className="lcc2-page-container" style={{ paddingTop: 0, paddingBottom: 16 }}>
          <AskConstitutionBox apiPath={`/api/${league.slug}/constitution/ask`} theme={theme} signInHref="/" leagueName={league.name} />
        </div>
        )}
        {model ? (
          <LivingConstitution sections={rewriteLinks(league, model.sections)} history={model.history} lastAmendedAt={model.lastAmendedAt} navLabels={model.navLabels} legislativeHref={hub} />
        ) : (
          <p className="lcc2-page-container lcc2-body">The rule book couldn&rsquo;t be loaded right now. Try again in a minute.</p>
        )}
      </main>
    </>
  );
}
