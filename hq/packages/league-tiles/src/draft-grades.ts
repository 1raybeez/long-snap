import type { FantasyCalcValueLike } from "./roster-strength.ts";
import { FANTASYCALC_CREDIT } from "./roster-strength.ts";

export interface GradePickInput {
  readonly overall: number;
  readonly round: number | null;
  readonly pickInRound: number | null;
  readonly playerId: string | null;
  readonly playerName: string;
  readonly position: string | null;
  readonly teamId: string;
}

export interface GradeTeamInput { readonly id: string; readonly name: string; readonly owner?: string | null }

export interface GradedPick {
  readonly overall: number;
  readonly label: string;
  readonly playerName: string;
  readonly position: string | null;
  readonly teamId: string;
  /** Where the player ranks today among this draft's picks (1 = most valuable). */
  readonly valueRank: number;
  /** Draft slot minus today's rank: positive = a steal, negative = a reach. */
  readonly delta: number;
}

export interface GradedTeam {
  readonly id: string;
  readonly name: string;
  readonly owner: string | null;
  readonly rank: number;
  readonly grade: string;
  readonly classImpactRank: number;
  readonly efficiencyRank: number;
  readonly picks: number;
  readonly best: GradedPick | null;
}

export interface DraftGradeReport {
  readonly season: number;
  readonly title: string;
  readonly teams: readonly GradedTeam[];
  readonly steals: readonly GradedPick[];
  readonly reaches: readonly GradedPick[];
  /** Every pick, graded (ranks and +/- only). */
  readonly picks: readonly GradedPick[];
  readonly credit: typeof FANTASYCALC_CREDIT;
}

const LETTERS: readonly [number, string][] = [[1.25, "A"], [0.8, "A-"], [0.45, "B+"], [0.15, "B"], [-0.15, "B-"], [-0.45, "C+"], [-0.8, "C"], [-1.15, "C-"], [-1.5, "D"]];
export function letterFor(z: number): string {
  for (const [min, letter] of LETTERS) if (z >= min) return letter;
  return "F";
}

const zscores = (xs: readonly number[]) => {
  const mean = xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length || 1)) || 1;
  return xs.map((x) => (x - mean) / sd);
};

function ranksDesc(values: readonly number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const out = new Array<number>(values.length);
  order.forEach(([, i], r) => { out[i] = r + 1; });
  return out;
}

export function gradeRookieDraft(input: {
  readonly season: number;
  readonly title: string;
  readonly picks: readonly GradePickInput[];
  readonly teams: readonly GradeTeamInput[];
  readonly values: readonly FantasyCalcValueLike[];
}): DraftGradeReport | null {
  const valueById = new Map(input.values.flatMap((row) => (row.player?.sleeperId && typeof row.value === "number" ? [[row.player.sleeperId, row.value] as const] : [])));
  if (!valueById.size || !input.picks.length) return null;
  const picks = [...input.picks].sort((a, b) => a.overall - b.overall);
  const values = picks.map((p) => (p.playerId ? valueById.get(p.playerId) ?? 0 : 0));
  const sortedValues = [...values].sort((a, b) => b - a);
  const valueRanks = ranksDesc(values);

  const graded: GradedPick[] = picks.map((p, i) => ({
    overall: p.overall,
    label: p.round && p.pickInRound ? `${p.round}.${String(p.pickInRound).padStart(2, "0")}` : `#${p.overall}`,
    playerName: p.playerName,
    position: p.position,
    teamId: p.teamId,
    valueRank: valueRanks[i],
    delta: i + 1 - valueRanks[i],
  }));

  const teamIds = input.teams.map((t) => t.id).filter((id) => picks.some((p) => p.teamId === id));
  const impact = teamIds.map((id) => picks.reduce((s, p, i) => s + (p.teamId === id ? values[i] : 0), 0));
  // Efficiency: value captured above what each slot is "worth" (the k-th most valuable player in the class).
  const efficiency = teamIds.map((id) => picks.reduce((s, p, i) => s + (p.teamId === id ? values[i] - sortedValues[i] : 0), 0));
  const composite = zscores(impact).map((z, i) => 0.6 * z + 0.4 * zscores(efficiency)[i]);
  const impactRanks = ranksDesc(impact);
  const effRanks = ranksDesc(efficiency);
  const overallRanks = ranksDesc(composite);

  const teams = teamIds.map((id, i) => {
    const team = input.teams.find((t) => t.id === id)!;
    const mine = graded.filter((g) => g.teamId === id);
    return {
      id,
      name: team.name,
      owner: team.owner ?? null,
      rank: overallRanks[i],
      grade: letterFor(composite[i]),
      classImpactRank: impactRanks[i],
      efficiencyRank: effRanks[i],
      picks: mine.length,
      best: [...mine].sort((a, b) => a.valueRank - b.valueRank)[0] ?? null,
    } satisfies GradedTeam;
  }).sort((a, b) => a.rank - b.rank);

  return {
    season: input.season,
    title: input.title,
    teams,
    steals: [...graded].sort((a, b) => b.delta - a.delta || a.overall - b.overall).slice(0, 5).filter((g) => g.delta > 0),
    reaches: [...graded].sort((a, b) => a.delta - b.delta || a.overall - b.overall).slice(0, 5).filter((g) => g.delta < 0),
    picks: graded,
    credit: FANTASYCALC_CREDIT,
  };
}
