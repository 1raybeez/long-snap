
import type { LeagueOutcomes, OutcomeSide, TradeOutcome } from "./trade-outcomes.ts";

export interface CoachPattern {
  key: string;
  /** "Trading away early picks" */
  label: string;
  won: number; lost: number; even: number;
  /** Net games and starter points across those trades (later seasons included for dynasty). */
  wins: number; points: number;
  tone: "warning" | "strength";
  /** Worst (or best) examples: "2023: 2023 1st → Jahmyr Gibbs to Roaring20". */
  examples: string[];
}
export interface CoachReport {
  record: { won: number; lost: number; even: number };
  recent: { won: number; lost: number; even: number };
  patterns: CoachPattern[];
  /** One-line summary for the top of the card. */
  headline: string;

  best: string | null;
}
/** What a proposed trade looks like from my side. */
export interface ProposalShape { givePicks: number; getPicks: number; givePlayers: number; getPlayers: number; givePositions: string[]; getPositions: string[]; week: number; preseason: boolean }

type Feature = { key: string; label: string; test: (s: OutcomeSide, t: TradeOutcome, pos: (id: string) => string | null) => boolean; matches: (p: ProposalShape) => boolean };

const early = (round: string) => /\b(1st|2nd)\b/.test(round);
const FEATURES: Feature[] = [
  { key: "sell-early-picks", label: "Trading away 1st or 2nd-round picks", test: (s) => s.gavePicks.some(early), matches: (p) => p.givePicks > 0 },
  { key: "buy-picks", label: "Selling players for picks", test: (s) => s.gotPicks.length > 0 && s.gave.length > 0, matches: (p) => p.getPicks > 0 && p.givePlayers > 0 },
  { key: "consolidate", label: "2-for-1 deals where you get the best player", test: (s) => s.gave.length + s.gavePicks.length > s.got.length + s.gotPicks.length && s.got.length >= 1, matches: (p) => p.givePlayers + p.givePicks > p.getPlayers + p.getPicks && p.getPlayers >= 1 },
  { key: "split", label: "Breaking up a star for several pieces", test: (s) => s.got.length + s.gotPicks.length > s.gave.length + s.gavePicks.length && s.gave.length >= 1, matches: (p) => p.getPlayers + p.getPicks > p.givePlayers + p.givePicks && p.givePlayers >= 1 },
  ...["QB", "RB", "WR", "TE"].map((pos): Feature => ({ key: `sell-${pos}`, label: `Trading away ${pos === "RB" ? "running backs" : pos === "WR" ? "receivers" : pos === "TE" ? "tight ends" : "quarterbacks"}`, test: (s, _t, posOf) => s.gave.some((id) => posOf(id) === pos), matches: (p) => p.givePositions.includes(pos) })),
  { key: "midseason", label: "In-season trades (week 4 on)", test: (_s, t) => t.week >= 4, matches: (p) => !p.preseason && p.week >= 4 },
];

const resultOf = (t: TradeOutcome, s: OutcomeSide) => (t.verdict.winner === null ? "even" : t.verdict.winner === s.rosterId ? "won" : "lost");

export function buildCoachReport(outcomes: LeagueOutcomes, teamId: string): CoachReport | null {
  const posOf = (id: string) => outcomes.players?.[id]?.pos ?? (/^[A-Z]{2,3}$/.test(id) ? "DEF" : null);
  const name = (id: string) => outcomes.players?.[id]?.name ?? id;
  const mine = [...outcomes.trades].filter((t) => t.verdict.status !== "Early read").sort((a, b) => b.at - a.at)
    .flatMap((t) => { const s = t.sides.find((x) => x.teamId === teamId); const o = t.sides.find((x) => x !== s); return s && o ? [{ t, s, o }] : []; });
  if (!mine.length) return null;
  const tally = (list: typeof mine) => ({ won: list.filter((x) => resultOf(x.t, x.s) === "won").length, lost: list.filter((x) => resultOf(x.t, x.s) === "lost").length, even: list.filter((x) => resultOf(x.t, x.s) === "even").length });
  const describe = ({ t, s, o }: (typeof mine)[number]) => {
    const gaveNames = [...s.gave.map(name), ...s.gavePicks.map((label, i) => { const key = s.gavePickKeys?.[i]; const became = key ? o.turnedInto.find((x) => x.key === key) : undefined; return became ? `${label} → ${name(became.playerId)}` : label; })];
    const gotNames = [...s.got.map(name), ...s.gotPicks.map((label, i) => { const key = s.gotPickKeys?.[i]; const became = key ? s.turnedInto.find((x) => x.key === key) : undefined; return became ? `${label} → ${name(became.playerId)}` : label; })].slice(0, 3);
    return `${t.season} Wk ${t.week}: ${gaveNames.slice(0, 3).join(", ")} to ${o.teamName ?? "another team"}${gotNames.length ? ` for ${gotNames.join(", ")}` : ""} (${t.verdict.label === "Even" ? "even" : resultOf(t, s) === "won" ? "you won it" : (t.verdict.label === "Fleeced" ? "they fleeced you" : t.verdict.label === "Clear win" ? "clear win for them" : "edge to them")})`;
  };
  const patterns: CoachPattern[] = [];
  for (const f of FEATURES) {
    const list = mine.filter((x) => f.test(x.s, x.t, posOf));
    if (list.length < 3) continue;
    const r = tally(list);
    const decided = r.won + r.lost;
    const wins = list.reduce((a, x) => a + x.s.wins, 0);
    const points = Math.round(list.reduce((a, x) => a + x.s.points + (x.s.later ?? 0), 0));
    const tone = r.lost >= 2 && r.lost / Math.max(1, decided) >= 0.65 ? "warning" : r.won >= 2 && r.won / Math.max(1, decided) >= 0.65 ? "strength" : null;
    if (!tone) continue;
    const pick = list.filter((x) => resultOf(x.t, x.s) === (tone === "warning" ? "lost" : "won")).sort((a, b) => (tone === "warning" ? 1 : -1) * ((a.s.points + (a.s.later ?? 0)) - (b.s.points + (b.s.later ?? 0)))).slice(0, 2);
    patterns.push({ key: f.key, label: f.label, ...r, wins, points, tone, examples: pick.map(describe) });
  }
  patterns.sort((a, b) => (a.tone === b.tone ? b.lost + b.won - (a.lost + a.won) : a.tone === "warning" ? -1 : 1));
  const record = tally(mine);
  const recent = tally(mine.slice(0, 5));
  const warn = patterns.filter((p) => p.tone === "warning");
  const headline = warn.length
    ? `Your trades: ${record.won}-${record.lost}-${record.even}. Watch out for: ${warn.slice(0, 2).map((p) => p.label.toLowerCase()).join("; ")}.`
    : `Your trades: ${record.won}-${record.lost}-${record.even}.${patterns.length ? ` You do best with ${patterns[0].label.toLowerCase()}.` : ""}`;
  const winners = mine.filter((x) => resultOf(x.t, x.s) === "won" && x.s.points + (x.s.later ?? 0) + 20 * x.s.wins > 0).sort((a, b) => (b.s.points + (b.s.later ?? 0) + 20 * b.s.wins) - (a.s.points + (a.s.later ?? 0) + 20 * a.s.wins));
  const top = winners[0];
  const best = top ? `Your best deal: ${describe(top).replace(/ \(you won it\)$/, "")}. ${top.t.verdict.label === "Fleeced" ? "An absolute fleece" : top.t.verdict.label === "Clear win" ? "A clear win" : "A win"}: ${[top.s.wins ? `${top.s.wins > 0 ? "+" : ""}${top.s.wins} win${Math.abs(top.s.wins) === 1 ? "" : "s"}` : null, `${Math.round(top.s.points + (top.s.later ?? 0)) > 0 ? "+" : ""}${Math.round(top.s.points + (top.s.later ?? 0))} starter pts`].filter(Boolean).join(", ")}.` : null;
  return { record, recent, patterns, headline, best };
}

/** Coaching lines for a proposal that looks like one of the owner's bad (or good) patterns. */
export function coachProposal(report: CoachReport | null, shape: ProposalShape): { tone: "warning" | "strength"; text: string }[] {
  if (!report) return [];
  const byKey = new Map(FEATURES.map((f) => [f.key, f] as const));
  return report.patterns.filter((p) => byKey.get(p.key)?.matches(shape)).slice(0, 3).map((p) => ({
    tone: p.tone,
    text: p.tone === "warning"
      ? `Remember how this went before? ${p.label} has gone ${p.won}-${p.lost}${p.even ? `-${p.even}` : ""} for you (${p.points > 0 ? "+" : ""}${p.points} starter pts${p.wins ? `, ${p.wins > 0 ? "+" : ""}${p.wins} wins` : ""}).${p.examples.length ? ` ${p.examples.join("; ")}.` : ""}`
      : `This fits what works for you: ${p.label.toLowerCase()} has gone ${p.won}-${p.lost}${p.even ? `-${p.even}` : ""}.`,
  }));
}
