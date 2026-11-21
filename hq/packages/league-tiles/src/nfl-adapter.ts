import { empty, ready, type NflGame, type NflGameCenterData, type TileLink, type TileState } from "./contract.ts";

/** Minimal ESPN NFL scoreboard shape (site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard). */
export interface EspnScoreboardLike {
  readonly week?: { readonly number?: number };
  readonly events?: readonly {
    readonly id?: string;
    readonly date?: string;
    readonly status?: { readonly type?: { readonly state?: string; readonly shortDetail?: string; readonly completed?: boolean } };
    readonly competitions?: readonly {
      readonly broadcasts?: readonly { readonly names?: readonly string[] }[];
      readonly competitors?: readonly { readonly homeAway?: string; readonly score?: string; readonly team?: { readonly abbreviation?: string; readonly logo?: string } }[];
    }[];
  }[];
}

export function normalizeEspnGames(scoreboard: EspnScoreboardLike): readonly NflGame[] {
  const games: NflGame[] = [];
  for (const event of scoreboard.events ?? []) {
    const competition = event.competitions?.[0];
    const home = competition?.competitors?.find((c) => c.homeAway === "home");
    const away = competition?.competitors?.find((c) => c.homeAway === "away");
    if (!event.id || !event.date || !home?.team?.abbreviation || !away?.team?.abbreviation) continue;
    const state = event.status?.type?.state;
    const status: NflGame["status"] = state === "in" ? "LIVE" : state === "post" || event.status?.type?.completed ? "FINAL" : "SCHEDULED";
    const score = (value: string | undefined) => (status === "SCHEDULED" || value === undefined || value === "" ? null : Number(value));
    games.push({
      id: event.id,
      kickoff: event.date,
      status,
      detail: event.status?.type?.shortDetail ?? null,
      network: competition?.broadcasts?.[0]?.names?.[0] ?? null,
      home: { abbr: home.team.abbreviation, score: score(home.score), logoUrl: home.team.logo ?? null },
      away: { abbr: away.team.abbreviation, score: score(away.score), logoUrl: away.team.logo ?? null },
    });
  }
  return games.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/**
 * Picks the one game the tile features: a live game first (a favorite team's if
 * provided), otherwise the next kickoff, otherwise the most recent final.
 */
export function nflGameCenterTile(input: {
  readonly scoreboard: EspnScoreboardLike | null;
  readonly now: Date;
  readonly favoriteTeams?: readonly string[];
  readonly scoresLink?: TileLink;
  readonly asOf?: string | null;
}): TileState<NflGameCenterData> {
  if (!input.scoreboard) return empty("NFL scores are temporarily unavailable.");
  const games = normalizeEspnGames(input.scoreboard);
  if (!games.length) return empty("No NFL games are scheduled this week.");
  const favorites = new Set((input.favoriteTeams ?? []).map((team) => team.toUpperCase()));
  const isFavorite = (game: NflGame) => favorites.has(game.home.abbr) || favorites.has(game.away.abbr);
  const prefer = (list: readonly NflGame[]) => list.find(isFavorite) ?? list[0] ?? null;
  const live = games.filter((game) => game.status === "LIVE");
  const upcoming = games.filter((game) => game.status === "SCHEDULED" && Date.parse(game.kickoff) >= input.now.getTime() - 15 * 60_000);
  const finals = games.filter((game) => game.status === "FINAL").reverse();
  const [label, featured] = live.length ? ["LIVE NOW", prefer(live)] as const : upcoming.length ? ["NEXT UP", upcoming[0]] as const : ["LATEST FINAL", finals[0] ?? null] as const;
  return ready({ nflWeek: input.scoreboard.week?.number ?? null, featured, label, scoresLink: input.scoresLink ?? null }, input.asOf ?? input.now.toISOString());
}
