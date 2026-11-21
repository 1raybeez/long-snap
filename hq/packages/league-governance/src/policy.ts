
export type VoteThreshold = "SIMPLE_MAJORITY" | "TWO_THIRDS";

export interface LegislativePolicy {
  readonly leagueId: string;
  readonly leagueName: string;
  readonly meetingName: string;
  /** Usual timing, in owners' words. */
  readonly meetingWindow: string;
  readonly votingWindowDays: number;
  /** Close a proposal as soon as every team has voted on it. */
  readonly closeWhenAllTeamsVote: boolean;
  /** Proposals that change the constitution. */
  readonly ruleChangeThreshold: VoteThreshold;
  /** Everything else (league business). */
  readonly ordinaryThreshold: VoteThreshold;
  /** Minimum teams voting for a result to count; null = none. */
  readonly quorum: number | null;

  readonly confirmed: boolean;
  readonly sources: readonly string[];
}

const demoPolicy = (leagueId: string, leagueName: string): LegislativePolicy => ({
  leagueId, leagueName, meetingName: "Owners Meeting", meetingWindow: "late March", votingWindowDays: 7, closeWhenAllTeamsVote: true,
  ruleChangeThreshold: "SIMPLE_MAJORITY", ordinaryThreshold: "SIMPLE_MAJORITY", quorum: 8, confirmed: true, sources: ["Long Snap demo league (made up)"],
});

export const LEGISLATIVE_POLICIES: Readonly<Record<string, LegislativePolicy>> = {
  "lakeview-ffl": demoPolicy("lakeview-ffl", "Lakeview FFL"),
  "mill-creek-ffl": demoPolicy("mill-creek-ffl", "Mill Creek FFL"),
  "harbor-city-ffl": demoPolicy("harbor-city-ffl", "Harbor City FFL"),
  "ironworks-dynasty": demoPolicy("ironworks-dynasty", "Ironworks Dynasty"),
};

export function legislativePolicy(leagueId: string): LegislativePolicy {
  const policy = LEGISLATIVE_POLICIES[leagueId];
  if (!policy) throw new Error(`No legislative policy for league ${leagueId}`);
  return policy;
}

export function thresholdLabel(threshold: VoteThreshold): string {
  return threshold === "TWO_THIRDS" ? "two-thirds of votes cast" : "more yes than no votes";
}
