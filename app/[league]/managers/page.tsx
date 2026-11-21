import { ManagersDirectory, type DirectoryStaff } from "../../../hq/packages/league-tiles/src/managers-directory.tsx";
import { pageStyle } from "../../../hq/packages/league-tiles/src/themes.ts";
import "../../../hq/packages/league-tiles/src/tiles.css";
import { LeagueNav } from "@/app/league-nav";
import { leagueOr404 } from "@/lib/leaguePage";
import { rewriteLinks } from "@/lib/links";

export const metadata = { title: "Managers" };

/** Managers directory: owners, franchises and retired owners. */
export default async function ManagersPage({ params, searchParams }: { params: Promise<{ league: string }>; searchParams?: Promise<{ view?: string }> }) {
  const { league, data, theme } = await leagueOr404(params);
  const { view } = (await searchParams) ?? {};
  const dir = rewriteLinks(league, data.people.directory);
  return (
    <>
      <LeagueNav league={league} active="managers" />
      <main style={{ ...pageStyle(theme), padding: "24px 16px 48px" }}>
        <ManagersDirectory leagueName={league.name} owners={dir.owners} franchises={dir.franchises} staff={dir.staff as DirectoryStaff[] | undefined} groupLabel={dir.groupLabel} theme={theme} view={view} basePath={`/${league.slug}/managers`} />
      </main>
    </>
  );
}
