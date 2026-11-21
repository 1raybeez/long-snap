

export type HostId = "leroy" | "cannon" | "vince" | "beau";
export type FlyerKind = "predictions" | "receipts";
export type PickConfidence = "lean" | "solid" | "lock";

export interface HostProfile {
  readonly id: HostId;
  /** "Vince “The Grudge” Maddox" */
  readonly fullName: string;
  /** "Vince" (used in "Vince's Picks", "Vince's Week 9"). */
  readonly shortName: string;
  /** Hero photo (public path). */
  readonly hero: string;
}

export const HOSTS: Readonly<Record<HostId, HostProfile>> = {
  leroy: { id: "leroy", fullName: "League Host", shortName: "Host", hero: "" },
  cannon: { id: "cannon", fullName: "League Host", shortName: "Host", hero: "" },
  vince: { id: "vince", fullName: "League Host", shortName: "Host", hero: "" },

  beau: { id: "beau", fullName: "League Host", shortName: "Host", hero: "" },
};

export interface FlyerTeamLine {
  readonly name: string;
  /** Record shown on the flyer (before the week for predictions, after it for receipts). */
  readonly record: string;
  /** Final points (receipts only). */
  readonly points: number | null;
}

export interface FlyerGame {
  readonly n: number;
  /** [picked team, other team]. */
  readonly teams: readonly [FlyerTeamLine, FlyerTeamLine];
  readonly confidence: PickConfidence;
  /** Predicted score [picked, other]. */
  readonly predicted: readonly [number, number] | null;
  /** Receipts only. */
  readonly result: "hit" | "miss" | null;
  /** "GAME OF THE WEEK", "CANNON'S LOCK", "UPSET WATCH"… */
  readonly tag: string | null;
  /** The host's line for this game (roast welcome; football only). */
  readonly take: string;
}

export type HuntStatus = "IN" | "HUNT" | "LONG SHOT" | "OUT";

export interface FlyerStandingRow {
  readonly rank: number;
  readonly name: string;
  readonly record: string;
  readonly pointsFor: number;
  /** "DIV" | "REC" | "PTS" for teams in playoff position. */
  readonly seed: string | null;
  readonly status: HuntStatus;
}

export interface FlyerPowerRow { readonly rank: number; readonly name: string; readonly movement: number | null }

export interface FlyerSpotlight { readonly label: string; readonly text: string; readonly result: "hit" | "miss" | null }

export interface HostFlyer {
  readonly version: 1;
  readonly league: string;
  readonly season: number;
  readonly week: number;
  readonly kind: FlyerKind;
  readonly host: HostId;
  /** "Wednesday, November 11, 2026". */
  readonly dateLabel: string;
  readonly writtenAt: string;
  /** Big boxes under the title, e.g. [{value:"4–2",label:"THIS WEEK"},{value:"8–4",label:"SINCE WEEK 8"}]. */
  readonly records: readonly { readonly value: string; readonly label: string }[];
  readonly games: readonly FlyerGame[];
  readonly standings: { readonly label: string; readonly rows: readonly FlyerStandingRow[]; readonly playoffSpots: number } | null;
  readonly power: { readonly label: string; readonly rows: readonly FlyerPowerRow[] } | null;
  /** Three short paragraphs: in position / in the hunt / don't quit. */
  readonly hunt: { readonly label: string; readonly inPosition: string; readonly inHunt: string; readonly dontQuit: string } | null;
  readonly spotlight: readonly FlyerSpotlight[];
  /** Receipts: the week's lowest scorer. Predictions: optional "Fix it before Sunday" style callout. */
  readonly callout: { readonly kicker: string; readonly title: string; readonly sub: string; readonly line: string } | null;
  readonly quote: string;
}

export function flyerFileName(season: number, week: number, kind: FlyerKind): string {
  return `${season}-week-${String(week).padStart(2, "0")}-${kind}.json`;
}

/** "4–2" from hit/miss results (receipts) or null (predictions). */
export function weekRecord(games: readonly FlyerGame[]): string | null {
  const graded = games.filter((g) => g.result);
  if (!graded.length) return null;
  const w = graded.filter((g) => g.result === "hit").length;
  return `${w}–${graded.length - w}`;
}
