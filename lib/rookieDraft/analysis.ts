

export type Position = "QB" | "RB" | "WR" | "TE";
export const POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE"];

export type Outcome = { season: number; rank: number | null; points: number; games: number; rankedAs: string | null; soFar?: boolean };
export type RookiePick = {
  season: number; round: number; pick: number; slot: number; rosterId: number;
  playerId: string; player: string; position: string | null; nflTeam: string | null;
  /** Person key of the franchise's (primary) owner when the pick was made; null = unattributed. */
  madeBy: string | null;
  /** Everyone who owned the franchise that season (owner first, then co-owners). */
  owners: string[];
  /** Who was on the clock in Sleeper (owner or co-owner), when Sleeper says. */
  clickedBy: string | null;
  ownerSource: string;
  /** Made with a pick that started in another franchise's draft slot (a traded pick). */
  acquired: boolean;
  /** The franchise is now run by someone else. */
  formerFranchise: boolean;
  outcomes: Outcome[];
};
export type Person = { name: string; current: boolean; siteOwnerId: string | null; hqOwnerId: string | null; sleeperUserId: string | null; nameSource: string };
export type RookieHistory = {
  league: string;
  leagueShortName: string;
  generatedAt: string;
  hitRule: Record<Position, number> & { text: string };
  currentSeason: number;
  scoring: Record<string, { weeks: number; inProgress: boolean; rec: number; passTd: number; tePremium: number; rosterPositions: string[] }>;
  people: Record<string, Person>;
  franchiseNow: Record<string, string[]>;
  drafts: { season: number; draftId: string; type: string; rounds: number; teams: number; picks: number }[];
  picks: RookiePick[];
};

// ---------- per pick ----------

const isPos = (p: string | null): p is Position => (POSITIONS as readonly string[]).includes(p ?? "");
/** Seasons Sleeper has finished (not "so far"). */
export const completed = (p: RookiePick) => p.outcomes.filter((o) => !o.soFar);
const hitLine = (h: RookieHistory, p: RookiePick) => (isPos(p.position) ? h.hitRule[p.position] : 0);
export const hitSeasons = (h: RookieHistory, p: RookiePick, includeSoFar = false) =>
  (includeSoFar ? p.outcomes : completed(p)).filter((o) => o.rank != null && o.rank <= hitLine(h, p)).length;
/** The last season Sleeper has finished in this league's file. */
const lastDone = new WeakMap<RookieHistory, number>();
export const lastCompletedSeason = (h: RookieHistory) => {
  if (!lastDone.has(h)) lastDone.set(h, Math.max(0, ...h.picks.flatMap((p) => completed(p).map((o) => o.season))));
  return lastDone.get(h)!;
};
/** Graded = at least two finished NFL seasons since the draft (a rookie year alone says little). */
export const isGraded = (h: RookieHistory, p: RookiePick) => isPos(p.position) && p.season <= lastCompletedSeason(h) - 1;
export const isHit = (h: RookieHistory, p: RookiePick) => hitSeasons(h, p) > 0;
export const bestRank = (p: RookiePick, includeSoFar = true) => {
  const ranks = (includeSoFar ? p.outcomes : completed(p)).map((o) => o.rank).filter((r): r is number => r != null);
  return ranks.length ? Math.min(...ranks) : null;
};

// ---------- small helpers ----------

export type Rate = { hits: number; of: number };
const rate = (h: RookieHistory, picks: readonly RookiePick[]): Rate => {
  const graded = picks.filter((p) => isGraded(h, p));
  return { hits: graded.filter((p) => isHit(h, p)).length, of: graded.length };
};
export const pct = (r: Rate) => (r.of ? Math.round((r.hits / r.of) * 100) : 0);
const rateText = (r: Rate) => (r.of ? `${r.hits} of ${r.of} (${pct(r)}%)` : "none graded yet");
const share = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const roundGroup = (round: number) => (round === 1 ? "R1" : round === 2 ? "R2" : "R3+");
export type RoundGroup = "R1" | "R2" | "R3+";
export const ROUND_GROUPS: readonly RoundGroup[] = ["R1", "R2", "R3+"];
const groupLabel: Record<RoundGroup, string> = { R1: "round 1", R2: "round 2", "R3+": "rounds 3+" };
const posCounts = (picks: readonly RookiePick[]) => Object.fromEntries(POSITIONS.map((p) => [p, picks.filter((x) => x.position === p).length])) as Record<Position, number>;
const ordinalPick = (h: RookieHistory, p: RookiePick) => {
  const teams = h.drafts.find((d) => d.season === p.season)?.teams ?? 12;
  return `${p.round}.${String(((p.pick - 1) % teams) + 1).padStart(2, "0")}`;
};
const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Picks a person made in this league: as the franchise's owner or one of its co-owners that season. */
export const picksOf = (h: RookieHistory, key: string) => h.picks.filter((p) => p.owners.includes(key));

// ---------- league baseline ----------

export type LeagueBaseline = {
  rate: Rate;
  byGroup: Record<RoundGroup, Rate>;
  byGroupPos: Record<RoundGroup, Record<Position, Rate>>;
  mix: Record<Position, number>;
  mixByGroup: Record<RoundGroup, Record<Position, number>>;
  picks: number;
};
export function leagueBaseline(h: RookieHistory): LeagueBaseline {
  const all = h.picks.filter((p) => isPos(p.position));
  const g = (grp: RoundGroup) => all.filter((p) => roundGroup(p.round) === grp);
  return {
    rate: rate(h, all),
    byGroup: Object.fromEntries(ROUND_GROUPS.map((grp) => [grp, rate(h, g(grp))])) as LeagueBaseline["byGroup"],
    byGroupPos: Object.fromEntries(ROUND_GROUPS.map((grp) => [grp, Object.fromEntries(POSITIONS.map((pos) => [pos, rate(h, g(grp).filter((p) => p.position === pos))]))])) as LeagueBaseline["byGroupPos"],
    mix: posCounts(all),
    mixByGroup: Object.fromEntries(ROUND_GROUPS.map((grp) => [grp, posCounts(g(grp))])) as LeagueBaseline["mixByGroup"],
    picks: all.length,
  };
}

// ---------- owner tendencies ----------

export type PickView = { season: number; slot: string; player: string; position: string | null; nflTeam: string | null; finishes: string; hit: boolean; hitSoFar: boolean; graded: boolean; acquired: boolean; formerFranchise: boolean };
export type Tendencies = {
  key: string;
  name: string;
  current: boolean;
  picks: number;
  draftsIn: number;
  perDraft: { season: number; made: number; standard: number; acquired: number }[];
  mix: Record<Position, number>;
  mixByGroup: Record<RoundGroup, Record<Position, number>>;
  firstPicks: PickView[];
  rate: Rate;
  byGroup: Record<RoundGroup, Rate>;
  earlyQb: { early: number; total: number };
  earlyTe: { early: number; total: number };
  hits: PickView[];
  misses: PickView[];
  recent: { seasons: number[]; picks: PickView[]; earlyHits: Rate; leagueEarlyHits: Rate; earlyMix: Record<Position, number>; earlierMix: Record<Position, number> };
  coOwned: { with: string[]; seasons: number[]; detail: string; clickedByThem: number; clickedByOthers: number } | null;
  formerFranchisePicks: number;
  sentences: string[];
};

const finishText = (h: RookieHistory, p: RookiePick) => p.outcomes.length
  ? p.outcomes.map((o) => `${o.season}${o.soFar ? " so far" : ""}: ${o.rank != null ? `${o.rankedAs ?? p.position}${o.rank}` : "no games"}`).join(" · ")
  : "no NFL games yet";
const view = (h: RookieHistory, p: RookiePick): PickView => ({ season: p.season, slot: ordinalPick(h, p), player: p.player, position: p.position, nflTeam: p.nflTeam, finishes: finishText(h, p), hit: hitSeasons(h, p) > 0, hitSoFar: hitSeasons(h, p, true) > hitSeasons(h, p), graded: isGraded(h, p), acquired: p.acquired, formerFranchise: p.formerFranchise });

/** The leading position in a count, with a word for how strongly. */
export function styleOf(counts: Record<Position, number>): { top: Position | null; label: string; n: number; of: number } {
  const of = POSITIONS.reduce((s, p) => s + counts[p], 0);
  if (!of) return { top: null, label: "no picks", n: 0, of };
  const sorted = [...POSITIONS].sort((a, b) => counts[b] - counts[a]);
  const [a, b] = sorted;
  if (counts[a] === counts[b]) return { top: null, label: `balanced ${sorted.filter((p) => counts[p] === counts[a]).join("/")}`, n: counts[a], of };
  const s = counts[a] / of;
  return { top: a, label: s >= 0.5 ? `${a}-heavy` : `${a}-first`, n: counts[a], of };
}

export function tendencies(h: RookieHistory, key: string, base: LeagueBaseline = leagueBaseline(h)): Tendencies {
  const person = h.people[key];
  const mine = picksOf(h, key).sort((a, b) => a.season - b.season || a.pick - b.pick);
  const all = mine.filter((p) => isPos(p.position));
  const g = (grp: RoundGroup) => all.filter((p) => roundGroup(p.round) === grp);
  const seasons = [...new Set(mine.map((p) => p.season))].sort();
  const perDraft = h.drafts.filter((d) => seasons.includes(d.season)).map((d) => {
    const ps = mine.filter((p) => p.season === d.season);
    return { season: d.season, made: ps.length, standard: d.rounds, acquired: ps.filter((p) => p.acquired).length };
  });
  const firstPicks = seasons.map((s) => mine.filter((p) => p.season === s).sort((a, b) => a.pick - b.pick)[0]).map((p) => view(h, p));
  const early = (pos: Position) => ({ early: all.filter((p) => p.position === pos && p.round <= 2).length, total: all.filter((p) => p.position === pos).length });
  const hits = all.filter((p) => hitSeasons(h, p) > 0).sort((a, b) => hitSeasons(h, b) - hitSeasons(h, a) || (bestRank(a, false) ?? 99) - (bestRank(b, false) ?? 99)).slice(0, 4).map((p) => view(h, p));
  const misses = all.filter((p) => isGraded(h, p) && !isHit(h, p) && p.round <= 2).sort((a, b) => a.round - b.round || a.season - b.season).slice(0, 4).map((p) => view(h, p));

  // Last three drafts in this league's file: picks, early read against the league's picks in the same drafts.
  const recentSeasons = h.drafts.map((d) => d.season).sort((a, b) => a - b).slice(-3);
  const inRecent = all.filter((p) => recentSeasons.includes(p.season));
  const leagueRecent = h.picks.filter((p) => isPos(p.position) && recentSeasons.includes(p.season));
  const early3 = (ps: readonly RookiePick[]) => ({ hits: ps.filter((p) => hitSeasons(h, p, true) > 0).length, of: ps.length });
  const recent = {
    seasons: recentSeasons,
    picks: inRecent.map((p) => view(h, p)),
    earlyHits: early3(inRecent),
    leagueEarlyHits: early3(leagueRecent),
    earlyMix: posCounts(inRecent.filter((p) => p.round <= 2)),
    earlierMix: posCounts(all.filter((p) => !recentSeasons.includes(p.season) && p.round <= 2)),
  };

  const coSeasons = mine.filter((p) => p.owners.length > 1);
  const partners = [...new Set(coSeasons.flatMap((p) => p.owners.filter((o) => o !== key)))];
  const yearsText = (ys: number[]) => (ys.length > 2 && ys[ys.length - 1] - ys[0] === ys.length - 1 ? `${ys[0]}–${ys[ys.length - 1]}` : ys.join(", "));
  const coOwned = coSeasons.length ? {
    with: partners.map((k) => h.people[k]?.name ?? k),
    seasons: [...new Set(coSeasons.map((p) => p.season))].sort(),
    detail: partners.map((k) => `${h.people[k]?.name ?? k} (${yearsText([...new Set(coSeasons.filter((p) => p.owners.includes(k)).map((p) => p.season))].sort())})`).join(" and "),
    clickedByThem: coSeasons.filter((p) => p.clickedBy === key).length,
    clickedByOthers: coSeasons.filter((p) => p.clickedBy && p.clickedBy !== key).length,
  } : null;

  const t: Tendencies = {
    key, name: person?.name ?? key, current: Boolean(person?.current),
    picks: mine.length, draftsIn: seasons.length, perDraft,
    mix: posCounts(all), mixByGroup: Object.fromEntries(ROUND_GROUPS.map((grp) => [grp, posCounts(g(grp))])) as Tendencies["mixByGroup"],
    firstPicks, rate: rate(h, all), byGroup: Object.fromEntries(ROUND_GROUPS.map((grp) => [grp, rate(h, g(grp))])) as Tendencies["byGroup"],
    earlyQb: early("QB"), earlyTe: early("TE"), hits, misses, recent, coOwned,
    formerFranchisePicks: mine.filter((p) => p.formerFranchise).length,
    sentences: [],
  };
  t.sentences = scoutingSentences(h, t, base);
  return t;
}

const mixText = (m: Record<Position, number>) => {
  const of = POSITIONS.reduce((s, p) => s + m[p], 0);
  return [...POSITIONS].filter((p) => m[p]).sort((a, b) => m[b] - m[a]).map((p) => `${p} ${share(m[p], of)}%`).join(", ");
};

/** Plain, short, factual sentences from the numbers (no AI). */
export function scoutingSentences(h: RookieHistory, t: Tendencies, base: LeagueBaseline): string[] {
  const out: string[] = [];
  if (!t.picks) return [`${t.name} has made no ${h.leagueShortName} rookie picks on Sleeper.`];
  const standard = t.perDraft.reduce((s, d) => s + d.standard, 0);
  const acquired = t.perDraft.reduce((s, d) => s + d.acquired, 0);
  const own = t.picks - acquired;
  const diff = t.picks - standard;
  out.push(`${t.picks} picks in ${t.draftsIn} ${h.leagueShortName} rookie draft${t.draftsIn === 1 ? "" : "s"} (standard ${standard}): ${diff === 0 ? "right at the standard" : diff > 0 ? `${diff} more than standard` : `${-diff} fewer than standard`}; ${acquired} made with traded-for picks, ${Math.max(0, standard - own)} own pick${standard - own === 1 ? "" : "s"} moved away.`);
  out.push(`Position mix: ${mixText(t.mix)} (league: ${mixText(base.mix)}).`);
  const r1 = styleOf(t.mixByGroup.R1);
  if (r1.of) out.push(`Round 1: ${r1.top ? `${r1.top} with ${r1.n} of ${r1.of}` : r1.label + ` (${r1.of} picks)`}; rounds 1–2 overall ${styleOf({ QB: t.mixByGroup.R1.QB + t.mixByGroup.R2.QB, RB: t.mixByGroup.R1.RB + t.mixByGroup.R2.RB, WR: t.mixByGroup.R1.WR + t.mixByGroup.R2.WR, TE: t.mixByGroup.R1.TE + t.mixByGroup.R2.TE }).label}.`);
  else out.push("No round-1 picks on Sleeper.");
  const qbte: string[] = [];
  if (t.earlyQb.total) qbte.push(`${t.earlyQb.early} of ${t.earlyQb.total} QBs in rounds 1–2`);
  else qbte.push("no QBs");
  if (t.earlyTe.total) qbte.push(`${t.earlyTe.early} of ${t.earlyTe.total} TEs in rounds 1–2`);
  else qbte.push("no TEs");
  const lq = { e: base.mixByGroup.R1.QB + base.mixByGroup.R2.QB, n: base.mix.QB };
  out.push(`QB/TE timing: ${qbte.join("; ")} (league: ${lq.e} of ${lq.n} QBs go in rounds 1–2).`);
  out.push(`Hit rate: ${t.rate.of ? `${t.rate.hits} of ${t.rate.of} graded picks (${pct(t.rate)}%)` : "no graded picks yet"} had a hit season; league ${base.rate.hits} of ${base.rate.of} (${pct(base.rate)}%).`);
  const rec = t.recent;
  if (rec.earlyHits.of) out.push(`Last ${rec.seasons.length} drafts (${rec.seasons[0]}–${rec.seasons[rec.seasons.length - 1]}): ${rec.earlyHits.hits} of ${rec.earlyHits.of} picks have a hit season so far (league ${share(rec.leagueEarlyHits.hits, rec.leagueEarlyHits.of)}% in the same drafts); rounds 1–2 lately ${styleOf(rec.earlyMix).label}${POSITIONS.some((p) => rec.earlierMix[p]) ? `, before that ${styleOf(rec.earlierMix).label}` : ""}.`);
  if (t.coOwned) out.push(`Co-owned with ${t.coOwned.detail}: those picks belong to the franchise, all its owners listed${t.coOwned.clickedByThem || t.coOwned.clickedByOthers ? `; Sleeper shows ${t.name} on the clock for ${t.coOwned.clickedByThem} of ${t.coOwned.clickedByThem + t.coOwned.clickedByOthers}` : ""}.`);
  if (t.formerFranchisePicks) out.push(`${t.formerFranchisePicks} of these picks were for a franchise now run by someone else.`);
  return out;
}

// ---------- scouting report for the whole league ----------

export type ScoutingReport = { key: string; name: string; coOwners: string[]; tendencies: Tendencies };
/** Every current owner in this league, with their tendencies (no private fields: names and picks only). */
export function scoutingReports(h: RookieHistory): ScoutingReport[] {
  const base = leagueBaseline(h);
  const keys = Object.entries(h.people).filter(([, p]) => p.current).map(([k]) => k);
  return keys.map((key) => {
    const franchise = Object.values(h.franchiseNow).find((o) => o.includes(key)) ?? [key];
    return { key, name: h.people[key].name, coOwners: franchise.filter((o) => o !== key).map((o) => h.people[o]?.name ?? o), tendencies: tendencies(h, key, base) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- my draft report (the signed-in owner only) ----------

export type Suggestion = { title: string; detail: string };
export type MyReport = { tendencies: Tendencies; league: LeagueBaseline; vsLeague: string[]; suggestions: Suggestion[] };

export function myReport(h: RookieHistory, key: string): MyReport {
  const base = leagueBaseline(h);
  const t = tendencies(h, key, base);
  const vs: string[] = [];
  for (const grp of ROUND_GROUPS) {
    if (t.byGroup[grp].of) vs.push(`${groupLabel[grp][0].toUpperCase()}${groupLabel[grp].slice(1)}: your picks hit ${rateText(t.byGroup[grp])}, league ${rateText(base.byGroup[grp])}.`);
  }
  const early = (m: Tendencies["mixByGroup"]) => ({ QB: m.R1.QB + m.R2.QB, RB: m.R1.RB + m.R2.RB, WR: m.R1.WR + m.R2.WR, TE: m.R1.TE + m.R2.TE });
  const myEarly = early(t.mixByGroup); const lgEarly = early(base.mixByGroup);
  vs.push(`Rounds 1–2, you: ${mixText(myEarly) || "no picks"}; league: ${mixText(lgEarly)}.`);
  return { tendencies: t, league: base, vsLeague: vs, suggestions: suggestions(h, t, base) };
}

/** 2–4 concrete "switch it up" ideas, each from a gap between what paid off in this league and what the owner does. */
export function suggestions(h: RookieHistory, t: Tendencies, base: LeagueBaseline): Suggestion[] {
  const out: { score: number; s: Suggestion }[] = [];
  const L = h.leagueShortName;
  const MIN = 5;
  // 1. The round-1 position: what the owner usually takes vs what has hit in round 1 here.
  const r1 = t.mixByGroup.R1;
  const myR1 = styleOf(r1).top ?? [...POSITIONS].sort((a, b) => r1[b] - r1[a])[0];
  const lgR1 = base.byGroupPos.R1;
  const bestR1 = [...POSITIONS].filter((p) => lgR1[p].of >= MIN).sort((a, b) => pct(lgR1[b]) - pct(lgR1[a]))[0];
  if (myR1 && r1[myR1] && bestR1 && bestR1 !== myR1 && lgR1[myR1].of >= MIN && pct(lgR1[bestR1]) - pct(lgR1[myR1]) >= 10) {
    out.push({ score: pct(lgR1[bestR1]) - pct(lgR1[myR1]), s: { title: `Round 1: look at ${bestR1} before ${myR1}`, detail: `In ${L}, round-1 ${bestR1}s have hit ${rateText(lgR1[bestR1])}; round-1 ${myR1}s ${rateText(lgR1[myR1])}. You've used ${r1[myR1]} of your ${POSITIONS.reduce((s, p) => s + r1[p], 0)} firsts on ${myR1}.` } });
  }
  // 2. Late rounds: where the league's late hits come from vs the owner's late picks.
  const late = base.byGroupPos["R3+"];
  const lateTotal = POSITIONS.reduce((s, p) => s + late[p].hits, 0);
  const bestLate = [...POSITIONS].filter((p) => late[p].of >= MIN).sort((a, b) => pct(late[b]) - pct(late[a]))[0];
  const myLate = t.mixByGroup["R3+"];
  const myLateN = POSITIONS.reduce((s, p) => s + myLate[p], 0);
  if (bestLate && myLateN >= 3 && lateTotal > 0) {
    const myShare = share(myLate[bestLate], myLateN);
    const lgShare = share(base.mixByGroup["R3+"][bestLate], POSITIONS.reduce((s, p) => s + base.mixByGroup["R3+"][p], 0));
    if (myShare < lgShare + 5) out.push({ score: pct(late[bestLate]) - pct(base.byGroup["R3+"]) + (lgShare - myShare), s: { title: `Late rounds: ${bestLate}s have paid off here`, detail: `In ${L}, round 3+ ${bestLate}s hit ${rateText(late[bestLate])}, the best late-round position (all late picks: ${rateText(base.byGroup["R3+"])}). ${bestLate} has been ${myShare}% of your late picks (${myLate[bestLate]} of ${myLateN}).` } });
  }
  // 3. Early QB/TE: the owner's early QB/TE record vs the league's.
  for (const pos of ["QB", "TE"] as const) {
    const mineEarly = h.picks.filter((p) => p.owners.includes(t.key) && p.position === pos && p.round <= 2 && isGraded(h, p));
    const lg = { hits: base.byGroupPos.R1[pos].hits + base.byGroupPos.R2[pos].hits, of: base.byGroupPos.R1[pos].of + base.byGroupPos.R2[pos].of };
    const myRate = rate(h, mineEarly);
    if (myRate.of >= 2 && pct(myRate) + 10 <= pct(lg)) out.push({ score: pct(lg) - pct(myRate), s: { title: `Early ${pos}s haven't worked for you`, detail: `Your round 1–2 ${pos}s: ${rateText(myRate)} hit. League round 1–2 ${pos}s: ${rateText(lg)}.` } });
  }
  // 4. Round 1 vs later: if firsts are where the hits are, and the owner's round-1 record or volume trails.
  const r1Rate = base.byGroup.R1; const laterRate = { hits: base.byGroup.R2.hits + base.byGroup["R3+"].hits, of: base.byGroup.R2.of + base.byGroup["R3+"].of };
  const myFirsts = t.perDraft.length ? POSITIONS.reduce((s, p) => s + r1[p], 0) : 0;
  const draftsN = t.perDraft.length;
  if (draftsN && pct(r1Rate) - pct(laterRate) >= 20 && myFirsts < draftsN) {
    out.push({ score: pct(r1Rate) - pct(laterRate), s: { title: "Keep (or buy) a first", detail: `In ${L}, round-1 picks hit ${rateText(r1Rate)}; rounds 2+ ${rateText(laterRate)}. You've made ${myFirsts} round-1 pick${myFirsts === 1 ? "" : "s"} in ${draftsN} drafts.` } });
  }
  if (t.byGroup.R1.of >= 2 && pct(t.byGroup.R1) + 15 <= pct(r1Rate)) {
    out.push({ score: pct(r1Rate) - pct(t.byGroup.R1), s: { title: "Your round-1 choice is the biggest gap", detail: `Your graded round-1 picks hit ${rateText(t.byGroup.R1)}; the league's ${rateText(r1Rate)}. Misses: ${t.misses.filter((m) => m.slot.startsWith("1.")).map((m) => `${m.player} (${m.season})`).join(", ") || "none listed"}.` } });
  }
  // 5. Lean into what has worked for this owner (always available when they have a hit).
  const bestMine = ROUND_GROUPS.flatMap((grp) => POSITIONS.map((pos) => ({ grp, pos, r: rate(h, h.picks.filter((p) => p.owners.includes(t.key) && p.position === pos && roundGroup(p.round) === grp)) }))).filter((x) => x.r.of >= 2 && x.r.hits > 0).sort((a, b) => pct(b.r) - pct(a.r) || b.r.of - a.r.of)[0];
  if (bestMine) out.push({ score: 1, s: { title: `What has worked for you: ${groupLabel[bestMine.grp]} ${bestMine.pos}s`, detail: `Your ${groupLabel[bestMine.grp]} ${bestMine.pos}s hit ${rateText(bestMine.r)} (league ${rateText(base.byGroupPos[bestMine.grp][bestMine.pos])}).` } });
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter(({ s }) => (seen.has(s.title) ? false : (seen.add(s.title), true))).slice(0, 4).map((x) => x.s);
}

// ---------- the same person in two leagues ----------

export type CrossLeague = { hqOwnerId: string; name: string; leagues: { league: string; shortName: string; picks: number; style: string; r12: Record<Position, number>; rate: Rate; leagueRate: Rate }[]; line: string };

/** People in both leagues (by HQ owner id), each league's numbers computed from its own file only. */
export function crossLeague(histories: readonly RookieHistory[]): CrossLeague[] {
  const bases = new Map<RookieHistory, LeagueBaseline>();
  const baseOf = (h: RookieHistory) => bases.get(h) ?? (bases.set(h, leagueBaseline(h)), bases.get(h)!);
  const byHq = new Map<string, { h: RookieHistory; key: string }[]>();
  for (const h of histories) for (const [key, p] of Object.entries(h.people)) if (p.current && p.hqOwnerId) byHq.set(p.hqOwnerId, [...(byHq.get(p.hqOwnerId) ?? []), { h, key }]);
  const out: CrossLeague[] = [];
  for (const [hq, entries] of byHq) {
    if (entries.length < 2) continue;
    const leagues = entries.map(({ h, key }) => {
      const t = tendencies(h, key, baseOf(h));
      const r12 = { QB: t.mixByGroup.R1.QB + t.mixByGroup.R2.QB, RB: t.mixByGroup.R1.RB + t.mixByGroup.R2.RB, WR: t.mixByGroup.R1.WR + t.mixByGroup.R2.WR, TE: t.mixByGroup.R1.TE + t.mixByGroup.R2.TE };
      return { league: h.league, shortName: h.leagueShortName, picks: t.picks, style: styleOf(r12).label, r12, rate: t.rate, leagueRate: baseOf(h).rate, top: styleOf(r12).top, co: t.coOwned };
    });
    const name = entries[0].h.people[entries[0].key].name;
    const withPicks = leagues.filter((l) => l.picks);
    // A co-owner who was never on the clock: that league's picks are the franchise's, not this person's style.
    const neverClicked = withPicks.filter((l) => l.co && l.co.clickedByThem === 0 && l.co.clickedByOthers > 0 && l.co.clickedByOthers === l.picks);
    let line: string;
    if (withPicks.length < 2) line = `${name} has rookie picks in ${withPicks.map((l) => l.shortName).join("") || "neither league"} only, so there's no style to compare.`;
    else {
      const parts = withPicks.map((l) => `${l.style} in ${l.shortName}${l.co ? ` (franchise co-owned with ${list(l.co.with)})` : ""}`);
      const same = withPicks[0].top && withPicks.every((l) => l.top === withPicks[0].top);
      const verdict = neverClicked.length
        ? `Not a fair comparison: Sleeper shows a co-owner, not ${name}, on the clock for every ${list(neverClicked.map((l) => l.shortName))} pick.`
        : same ? "The style carries over." : "The style doesn't carry over.";
      line = `Rounds 1–2: ${list(parts)}. ${verdict} Hit rate ${withPicks.map((l) => `${pct(l.rate)}% in ${l.shortName} (league ${pct(l.leagueRate)}%)`).join(", ")}.`;
    }
    out.push({ hqOwnerId: hq, name, leagues: leagues.map(({ top: _t, co: _c, ...l }) => l), line });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
