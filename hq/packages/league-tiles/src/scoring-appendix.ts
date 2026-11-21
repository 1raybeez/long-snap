
export interface SleeperLeagueSettingsInput {
  readonly name?: string;
  readonly season?: string;
  readonly scoring_settings?: Readonly<Record<string, number>>;
  readonly roster_positions?: readonly string[];
  readonly settings?: Readonly<Record<string, unknown>>;
}

export interface ScoringRule { readonly key: string; readonly label: string; readonly points: number; readonly display: string; readonly note?: string }
export interface ScoringGroup { readonly id: string; readonly title: string; readonly rules: readonly ScoringRule[] }
export interface LineupSlot { readonly pos: string; readonly label: string; readonly count: number }
export interface ScoringAppendix {
  readonly leagueName: string;
  readonly season: string | null;
  readonly format: string;
  readonly lineup: readonly LineupSlot[];
  readonly bench: number;
  readonly ir: number;
  readonly taxi: number;
  readonly totalRoster: number;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly groups: readonly ScoringGroup[];
}

type Def = readonly [key: string, label: string, per?: { unit: string }];
const GROUPS: readonly { id: string; title: string; rules: readonly Def[] }[] = [
  { id: "passing", title: "Passing", rules: [
    ["pass_yd", "Passing yards", { unit: "yard" }], ["pass_td", "Passing TD"], ["pass_td_40p", "Bonus: 40+ yard passing TD"], ["pass_2pt", "2-point conversion (pass)"],
    ["pass_int", "Interception thrown"], ["pass_cmp", "Completion"], ["pass_inc", "Incompletion"], ["pass_sack", "Sacked"],
    ["bonus_pass_yd_300", "Bonus: 300–399 yard passing game"], ["bonus_pass_yd_400", "Bonus: 400+ yard passing game"],
  ] },
  { id: "rushing", title: "Rushing", rules: [
    ["rush_yd", "Rushing yards", { unit: "yard" }], ["rush_td", "Rushing TD"], ["rush_td_40p", "Bonus: 40+ yard rushing TD"], ["rush_2pt", "2-point conversion (rush)"],
    ["bonus_rush_yd_100", "Bonus: 100–199 yard rushing game"], ["bonus_rush_yd_200", "Bonus: 200+ yard rushing game"],
  ] },
  { id: "receiving", title: "Receiving", rules: [
    ["rec", "Reception"], ["rec_yd", "Receiving yards", { unit: "yard" }], ["rec_td", "Receiving TD"], ["rec_td_40p", "Bonus: 40+ yard receiving TD"], ["rec_2pt", "2-point conversion (catch)"],
    ["bonus_rec_yd_100", "Bonus: 100–199 yard receiving game"], ["bonus_rec_yd_200", "Bonus: 200+ yard receiving game"],
  ] },
  { id: "kicking", title: "Kicking", rules: [
    ["fgm_0_19", "Field goal made, 0–19 yards"], ["fgm_20_29", "Field goal made, 20–29 yards"], ["fgm_30_39", "Field goal made, 30–39 yards"],
    ["fgm_40_49", "Field goal made, 40–49 yards"], ["fgm_50p", "Field goal made, 50+ yards"], ["xpm", "Extra point made"],
    ["fgmiss_0_19", "Field goal missed, 0–19 yards"], ["fgmiss_20_29", "Field goal missed, 20–29 yards"], ["fgmiss_30_39", "Field goal missed, 30–39 yards"],
    ["fgmiss_40_49", "Field goal missed, 40–49 yards"], ["fgmiss_50p", "Field goal missed, 50+ yards"], ["xpmiss", "Extra point missed"],
  ] },
  { id: "defense", title: "Team defense", rules: [
    ["def_td", "Defensive TD"], ["pts_allow_0", "0 points allowed"], ["pts_allow_1_6", "1–6 points allowed"], ["pts_allow_7_13", "7–13 points allowed"],
    ["pts_allow_14_20", "14–20 points allowed"], ["pts_allow_21_27", "21–27 points allowed"], ["pts_allow_28_34", "28–34 points allowed"], ["pts_allow_35p", "35+ points allowed"],
    ["yds_allow_0_100", "Under 100 yards allowed"], ["yds_allow_100_199", "100–199 yards allowed"], ["yds_allow_200_299", "200–299 yards allowed"],
    ["sack", "Sack"], ["int", "Interception"], ["fum_rec", "Fumble recovery"], ["ff", "Forced fumble"], ["safe", "Safety"], ["blk_kick", "Blocked kick"],
    ["tkl_loss", "Tackle for loss"], ["def_pass_def", "Pass defended"],
  ] },
  { id: "special", title: "Special teams", rules: [
    ["def_st_td", "Special teams TD (team defense)"], ["def_kr_td", "Kick return TD (team defense)"], ["def_pr_td", "Punt return TD (team defense)"],
    ["def_st_ff", "Special teams forced fumble"], ["def_st_fum_rec", "Special teams fumble recovery"],
    ["def_pr_yd", "Punt return yards (team defense)", { unit: "yard" }], ["def_kr_yd", "Kick return yards (team defense)", { unit: "yard" }],
    ["st_td", "Special teams player TD"], ["kr_td", "Kick return TD (player)"], ["pr_td", "Punt return TD (player)"],
  ] },
  { id: "misc", title: "Miscellaneous", rules: [
    ["fum", "Fumble"], ["fum_lost", "Fumble lost"], ["fum_rec_td", "Fumble recovery TD"],
  ] },
];

const POS_LABEL: Record<string, string> = { QB: "Quarterback", RB: "Running back", WR: "Wide receiver", TE: "Tight end", FLEX: "Flex (RB/WR/TE)", SUPER_FLEX: "Superflex (QB/RB/WR/TE)", REC_FLEX: "Flex (WR/TE)", WRRB_FLEX: "Flex (RB/WR)", K: "Kicker", DEF: "Team defense" };

/** Round Sleeper's float noise (0.03999999910593033 → 0.04). */
const tidy = (n: number) => Math.round(n * 1000) / 1000;

function display(points: number): string {
  const p = tidy(points);
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p)}`;
}

function yardsNote(points: number): string | undefined {
  const p = Math.abs(tidy(points));
  if (!p) return undefined;
  const per = Math.round(1 / p);
  return Math.abs(per * p - 1) < 0.001 ? `${per} yards = 1 point` : undefined;
}

export function buildScoringAppendix(league: SleeperLeagueSettingsInput, opts: { leagueName?: string } = {}): ScoringAppendix {
  const s = league.scoring_settings ?? {};
  const groups: ScoringGroup[] = GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    rules: g.rules
      .filter(([key]) => typeof s[key] === "number" && tidy(s[key]!) !== 0)
      .map(([key, label, per]) => ({ key, label: per ? `${label} (per ${per.unit})` : label, points: tidy(s[key]!), display: display(s[key]!), note: per ? yardsNote(s[key]!) : undefined })),
  })).filter((g) => g.rules.length > 0);

  const positions = league.roster_positions ?? [];
  const lineup: LineupSlot[] = [];
  for (const pos of positions) {
    if (pos === "BN" || pos === "IR" || pos === "TAXI") continue;
    const last = lineup[lineup.length - 1];
    if (last && last.pos === pos) lineup[lineup.length - 1] = { ...last, count: last.count + 1 };
    else lineup.push({ pos, label: POS_LABEL[pos] ?? pos, count: 1 });
  }
  const set = league.settings ?? {};
  const num = (k: string) => (typeof set[k] === "number" ? (set[k] as number) : 0);
  const bench = positions.filter((p) => p === "BN").length;
  const ir = num("reserve_slots");
  const taxi = num("taxi_slots");
  const starters = lineup.reduce((a, l) => a + l.count, 0);
  const rec = tidy(s.rec ?? 0);
  const format = rec === 1 ? "Full PPR" : rec === 0.5 ? "Half-point PPR" : rec === 0 ? "Standard (no PPR)" : `${rec} points per reception`;

  const facts: { label: string; value: string }[] = [];
  if (num("num_teams")) facts.push({ label: "Teams", value: String(num("num_teams")) });
  if (num("divisions") > 1) facts.push({ label: "Divisions", value: String(num("divisions")) });
  if (num("waiver_budget")) facts.push({ label: "FAAB budget", value: `$${num("waiver_budget")}` });
  if (num("trade_deadline")) facts.push({ label: "Trade deadline", value: `Week ${num("trade_deadline")}` });
  if (num("playoff_teams")) facts.push({ label: "Playoff teams", value: String(num("playoff_teams")) });
  if (num("playoff_week_start")) facts.push({ label: "Playoffs start", value: `Week ${num("playoff_week_start")}` });

  return {
    leagueName: opts.leagueName ?? league.name ?? "League",
    season: league.season ?? null,
    format,
    lineup,
    bench,
    ir,
    taxi,
    totalRoster: starters + bench,
    facts,
    groups,
  };
}

/** Server helper: read a league's settings from Sleeper (cached by the caller's fetch options). */
export async function loadScoringAppendix(leagueId: string, opts: { leagueName?: string; fetchImpl?: typeof fetch; init?: RequestInit } = {}): Promise<ScoringAppendix | null> {
  try {
    const r = await (opts.fetchImpl ?? fetch)(`https://api.sleeper.app/v1/league/${leagueId}`, opts.init);
    if (!r.ok) return null;
    return buildScoringAppendix((await r.json()) as SleeperLeagueSettingsInput, { leagueName: opts.leagueName });
  } catch {
    return null;
  }
}
