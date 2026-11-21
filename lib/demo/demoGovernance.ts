// Long Snap demo: each made-up league's rule book, owners meetings and veto log, run through the same shared
// governance engine as a real league (packages/league-governance), on an in-memory database seeded with invented
// proposals and votes. Nothing here is a real league's rules or votes.
import {
  LEGISLATIVE_PATHS, LegislativeStore, MemoryFirestore, applyRatifiedRules, buildHubState, legislativePolicy, ruleOptions, serializeFirestoreValue, teamsVotedCount,
  type ConstitutionSection, type CurrentSection, type FranchiseDirectory, type LegislativeArchiveSession, type LegislativeHubState, type RuleOption, type VersionHistoryUpdate,
} from "../../hq/packages/league-governance/src/index.ts";
import { buildVetoLog, type VetoFlag, type VetoLogModel } from "../../hq/packages/league-tiles/src/veto-log.ts";
import { DEMO_LEAGUES, demoKeyForSlug, type DemoKey } from "./demoLeagues.ts";
import { players, season } from "./fakeSleeper.ts";
import { readFileSync } from "node:fs";
import { cookies } from "next/headers";
import { DEMO_OWNER_COOKIE } from "./demoSession.ts";
import path from "node:path";

type House = { name: string; founded: number; divisions: string[]; veto: { needed: number; of: number; hours: number } | null; keepers: { kind: string; max: number; per_position?: number; increment?: number; undrafted_round?: number } | null; taxi: number | null; rookie_rounds: number | null; vetoes: { season: number; week: number; transaction_id: string; teams: number[]; adds: Record<string, number>; votes_to_veto: number[]; needed: number; result: string }[] };
const house = (key: DemoKey): House => JSON.parse(readFileSync(path.join(process.cwd(), "data", "demo", key, "house.json"), "utf8"));

const s = (id: string, title: string, content: string[], type: "standard" | "sleeper" | "alert" | "loophole" = "standard") => ({ id, title: `${id} ${title}`, content, type, ...(type === "sleeper" ? { tag: "Sleeper Automated" } : {}) });

/** The made-up league's constitution as it was written, before any owners-meeting amendments. */
export function demoConstitution(key: DemoKey): ConstitutionSection[] {
  const h = house(key);
  const name = h.name;
  const draft: ConstitutionSection["subsections"] = key === "auction"
    ? [s("3.1", "Auction Draft", ["The draft is a live auction held the last weekend of August.", "Every team has a **$200** budget and must fill a 16-player roster.", "Each nominated player opens at $1. The highest bid when the timer runs out wins."], "sleeper"),
       s("3.2", "Nomination Order", ["Nominations go in reverse order of last season's final standings, then repeat."]),
       s("3.3", "Draft Night", ["The Toilet Bowl loser runs the auction and wears the sailor hat."], "loophole")]
    : key === "dynasty"
      ? [s("3.1", "Rookie Draft", [`The rookie draft is ${h.rookie_rounds ?? 4} rounds, held in May after the NFL Draft.`, "Rookie picks can be traded up to three seasons ahead."], "sleeper"),
         s("3.2", "Draft Order", ["The six teams that miss the playoffs pick 1–6 by **Max PF**, lowest first.", "Playoff teams pick 7–12 by playoff finish."]),
         s("3.3", "Startup Draft (2022)", ["The 2022 dynasty startup was a 25-round snake draft. Every roster since carries over."])]
      : [s("3.1", "Snake Draft", ["The draft is a snake draft held the last weekend of August."], "sleeper"),
         s("3.2", "Draft Order", ["Draft order is the reverse of last season's final standings. New owners pick in the open slots."])];
  const keep: ConstitutionSection["subsections"] = key === "auction"
    ? [s("4.1", "Keepers", [`Each team may keep up to **${h.keepers?.max ?? 2}** players, no more than **${h.keepers?.per_position ?? 1}** at any position.`]),
       s("4.2", "Keeper Prices", [`A keeper costs his last auction price plus **$${h.keepers?.increment ?? 10}**. Free-agent pickups are priced at $5 before the increase.`]),
       s("4.3", "Keeper Deadline", ["Keepers are due one week before the auction. A team that misses the deadline keeps nobody."], "alert")]
    : key === "keeper"
      ? [s("4.1", "Keepers", [`Each team may keep up to **${h.keepers?.max ?? 3}** players.`]),
         s("4.2", "Keeper Cost", ["A keeper costs the round he was drafted in last season. Undrafted players cost a **10th-round** pick.", "A player can be kept two seasons in a row, then goes back into the draft."]),
         s("4.3", "Keeper Deadline", ["Keepers are due one week before the draft."], "alert")]
      : key === "dynasty"
        ? [s("4.1", "Rosters Carry Over", ["Every roster carries over from season to season. There are no keepers to declare."]),
           s("4.2", "Taxi Squad", [`Each team has a **${h.taxi ?? 4}-player** taxi squad for rookies and second-year players.`], "sleeper"),
           s("4.3", "Keeper Era (2012–2021)", ["Before 2022 the league kept two players a season. Those records stay in the league history."])]
        : [s("4.1", "No Keepers", ["Lakeview is a redraft league. Every player goes back into the pool each August."])];
  const veto = h.veto
    ? [s("5.2", "Trade Vetoes", [`Any owner may call for a veto vote. A trade is overturned if **${h.veto.needed} of ${h.veto.of}** owners not in the trade vote to veto within **${h.veto.hours} hours**.`, "Every veto vote is recorded in the Veto Log."])]
    : [s("5.2", "Trade Review", ["The commissioner reviews every trade within 24 hours and may reverse one only for collusion."])];
  const seeding = key === "auction"
    ? ["The three division winners get seeds 1–3, ordered by record.", "Seed 4 goes to the best remaining record.", "Seeds 5 and 6 go to the two highest **points for** among everyone else.", "Seeds 1 and 2 get a first-round bye."]
    : key === "keeper"
      ? ["The two division winners get seeds 1–2.", "Seeds 3–4 go to the best remaining records.", "Seeds 5–6 go to the highest points for among everyone else.", "Seeds 1 and 2 get a first-round bye."]
      : key === "dynasty"
        ? ["Seeds 1–4 go to the best records.", "Seeds 5–6 go to the highest points for among everyone else.", "Seeds 1 and 2 get a first-round bye."]
        : ["The top six records make the playoffs. Seeds 1 and 2 get a first-round bye."];
  return [
    { id: "1", anchor: "league", title: "1. The League", icon: "🏈", subsections: [
      s("1.1", "Name and Purpose", [`${name} is a 12-team fantasy football league founded in ${h.founded}. It exists for bragging rights, friendship and the trophy.`]),
      s("1.2", "Platform", ["The league plays on Sleeper. Scoring, rosters and waivers run there."], "sleeper"),
      s("1.3", "Commissioner", ["The commissioner runs the league, settles disputes and keeps this constitution current."]),
    ] },
    { id: "2", anchor: "owners", title: "2. Owners and Dues", icon: "🤝", subsections: [
      s("2.1", "Dues", ["League dues are due before the draft. An owner who has not paid may not draft."], "alert"),
      s("2.2", "Co-Owners", ["Two people may share a team. They share one vote."]),
      s("2.3", "Leaving the League", ["An owner who leaves gives the commissioner notice before the draft so the seat can be filled."]),
    ] },
    { id: "3", anchor: "draft", title: "3. The Draft", icon: "📋", subsections: draft },
    { id: "4", anchor: "rosters", title: key === "dynasty" ? "4. Rosters and Taxi Squad" : "4. Keepers", icon: "🔒", subsections: keep },
    { id: "5", anchor: "trades", title: "5. Trades", icon: "🔁", subsections: [
      s("5.1", "Trade Deadline", ["Trades are allowed until the end of the last game of **Week 11**."], "sleeper"),
      ...veto,
    ] },
    { id: "6", anchor: "waivers", title: "6. Waivers and Lineups", icon: "📝", subsections: [
      s("6.1", "Waivers", ["Waivers use blind bidding (FAAB). Claims run Wednesday morning."], "sleeper"),
      s("6.2", "Lineups", ["Every owner sets a full lineup every week. Starting an injured or bye-week player on purpose is not allowed."], "alert"),
    ] },
    { id: "7", anchor: "playoffs", title: "7. Playoffs", icon: "🏆", subsections: [
      s("7.1", "Playoff Field", ["Six teams make the playoffs, starting in Week 15. The championship is Week 17."], "sleeper"),
      s("7.2", "Seeding", seeding),
      s("7.3", "Toilet Bowl", ["The bottom teams play a losers bracket. Last place earns the league punishment."], "loophole"),
    ] },
    { id: "8", anchor: "changes", title: "8. Changing the Rules", icon: "🗳️", subsections: [
      s("8.1", "Owners Meeting", ["Rule changes are proposed in the Legislative Hub and voted on at the spring owners meeting."]),
      s("8.2", "Votes", ["Each team gets one vote. A simple majority passes a proposal. At least 8 teams must vote."]),
    ] },
  ];
}

/** Invented owners-meeting history: proposal, how the vote went, and the year. */
type PastProposal = { year: number; title: string; description: string; change: { changeType: "CHANGE" | "ADD" | "DELETE"; targetRuleId: string; proposedText?: string; newRuleTitle?: string }; yes: number };
function pastProposals(key: DemoKey): PastProposal[] {
  const common: PastProposal[] = [
    { year: 2023, title: "Trade deadline to Week 12", description: "Contenders want one more week to make a move.", change: { changeType: "CHANGE", targetRuleId: "5.1", proposedText: "Trades are allowed until the end of the last game of **Week 12**." }, yes: 5 },
    { year: 2024, title: "Weekly high-score prize", description: "Give every team something to play for each week.", change: { changeType: "ADD", targetRuleId: "2", proposedText: "The top scorer each regular-season week wins a cash prize paid from league dues.", newRuleTitle: "Weekly High Score" }, yes: 10 },
  ];
  const own: Record<DemoKey, PastProposal[]> = {
    auction: [
      { year: 2025, title: "Points-for playoff seeds", description: "Reward the teams that score the most, not just the lucky ones.", change: { changeType: "CHANGE", targetRuleId: "7.2", proposedText: "The three division winners get seeds 1–3, ordered by record. Seed 4 goes to the best remaining record. Seeds 5 and 6 go to the two highest **points for** among everyone else. Seeds 1 and 2 get a first-round bye." }, yes: 9 },
      { year: 2026, title: "Keeper price increase to $15", description: "Make keepers a little harder to hold.", change: { changeType: "CHANGE", targetRuleId: "4.2", proposedText: "A keeper costs his last auction price plus **$15**." }, yes: 4 },
    ],
    keeper: [
      { year: 2025, title: "Three keepers instead of two", description: "More continuity from year to year.", change: { changeType: "CHANGE", targetRuleId: "4.1", proposedText: "Each team may keep up to **3** players." }, yes: 8 },
      { year: 2026, title: "Points-for wild cards", description: "The last two playoff spots go to the top scorers.", change: { changeType: "CHANGE", targetRuleId: "7.2", proposedText: "The two division winners get seeds 1–2. Seeds 3–4 go to the best remaining records. Seeds 5–6 go to the highest points for among everyone else. Seeds 1 and 2 get a first-round bye." }, yes: 7 },
    ],
    dynasty: [
      { year: 2025, title: "Taxi squad to four players", description: "More room to stash rookies.", change: { changeType: "CHANGE", targetRuleId: "4.2", proposedText: "Each team has a **4-player** taxi squad for rookies and second-year players." }, yes: 9 },
      { year: 2026, title: "Max PF rookie order", description: "Stop rewarding tanking: order the non-playoff picks by Max PF.", change: { changeType: "CHANGE", targetRuleId: "3.2", proposedText: "The six teams that miss the playoffs pick 1–6 by **Max PF**, lowest first. Playoff teams pick 7–12 by playoff finish." }, yes: 8 },
    ],
    redraft: [
      { year: 2025, title: "Last-place lake jump", description: "Make last place mean something.", change: { changeType: "ADD", targetRuleId: "7", proposedText: "Last place jumps in the lake on the first cold Saturday of spring. Photos are mandatory.", newRuleTitle: "Lake Jump" }, yes: 11 },
      { year: 2026, title: "Two-QB lineups", description: "Quarterbacks should matter more.", change: { changeType: "CHANGE", targetRuleId: "6.2", proposedText: "Every lineup starts two quarterbacks." }, yes: 3 },
    ],
  };
  return [...common, ...own[key]];
}

type Teams = { id: string; name: string; owner: string; rosterId: number }[];
function teams(key: DemoKey): Teams {
  const d = season(key, 2026);
  const names = JSON.parse(readFileSync(path.join(process.cwd(), "data", "demo", "owners.json"), "utf8")).owners as Record<string, string>;
  return d.rosters.map((r: { roster_id: number; owner_id: string }) => {
    const u = d.users.find((x: { user_id: string }) => x.user_id === r.owner_id);
    return { id: r.owner_id, name: u?.metadata?.team_name ?? `Team ${r.roster_id}`, owner: names[r.owner_id] ?? u?.display_name ?? "", rosterId: r.roster_id };
  });
}

const cache = new Map<DemoKey, Promise<{ store: LegislativeStore; directory: FranchiseDirectory; base: ConstitutionSection[]; db: MemoryFirestore }>>();
const day = 86_400_000;

/** The league's governance database: every past owners meeting replayed through the real engine, plus next spring's open business. */
function governance(key: DemoKey) {
  const hit = cache.get(key);
  if (hit) return hit;
  const run = (async () => {
    const db = new MemoryFirestore();
    const base = demoConstitution(key);
    const ts = teams(key);
    const directory: FranchiseDirectory = ts.map((t) => ({ franchiseId: t.id, name: t.name, voterIds: [t.id] }));
    const store = new LegislativeStore(db, { policy: legislativePolicy(DEMO_LEAGUES[key].slug), directory, constitution: base, numbering: null,
      fallbackSession: { sessionYear: 2027, phase: "COLLECTING", meetingDate: "", annualVotingOpensAt: "", annualVotingClosesAt: "", source: "default" } });
    const author = (i: number) => ({ voterId: ts[i % ts.length]!.id, name: ts[i % ts.length]!.owner, email: "owner@example.com" });
    for (const [i, p] of pastProposals(key).entries()) {
      const meeting = Date.parse(`${p.year}-03-28T23:00:00Z`);
      await store.scheduleMeeting(p.year, new Date(meeting).toISOString(), "commissioner", new Date(meeting - 40 * day));
      const id = await store.submit({ ...p.change, title: p.title, description: p.description, proposedText: p.change.proposedText ?? "" } as never, author(i * 5 + 1), new Date(meeting - 20 * day));
      for (const [j, t] of ts.entries()) { if (j === 11 && i % 2) continue; await store.vote(id, t.id, j < p.yes ? "yes" : "no", new Date(meeting + day + j * 3_600_000)).catch(() => undefined); }
      await store.closeDue(new Date(meeting + 9 * day));
    }
    // Next spring's meeting: business collecting now.
    const now = Date.parse("2026-11-21T15:00:00Z");
    await store.scheduleMeeting(2027, "2027-03-27T23:00:00.000Z", "commissioner", new Date(now - 10 * day));
    await store.submit({ changeType: "ADD", targetRuleId: "7", title: "Consolation bracket prize", description: "Give the non-playoff teams something to play for in December.", proposedText: "The consolation bracket winner gets the first waiver claim of Week 1 next season.", newRuleTitle: "Consolation Prize" } as never, author(3), new Date(now - 6 * day));
    await store.submit({ ballotType: "TRUE_FALSE", targetRuleId: "", title: "The draft should be in person", description: "True or false: next year's draft is held in person." } as never, author(8), new Date(now - 2 * day));
    return { store, directory, base, db };
  })();
  cache.set(key, run);
  return run;
}

export async function demoRuleBook(slug: string): Promise<{ sections: CurrentSection[]; history: VersionHistoryUpdate[]; lastAmendedAt: string | null; navLabels: Record<string, string> } | null> {
  const key = demoKeyForSlug(slug);
  if (!key) return null;
  const { store, base, db } = await governance(key);
  const snapshot = await store.read(new Date("2026-11-21T15:00:00Z"));
  const sections = applyRatifiedRules(base, snapshot.ratifiedRules) as CurrentSection[];
  const history = (await db.collection(LEGISLATIVE_PATHS.versionHistory).get()).docs.map((d) => serializeFirestoreValue(d.data()) as VersionHistoryUpdate).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const lastAmendedAt = snapshot.ratifiedRules.map((r) => r.passedAt).filter(Boolean).sort().at(-1) ?? null;
  return JSON.parse(JSON.stringify({ sections, history, lastAmendedAt, navLabels: Object.fromEntries(sections.map((x) => [x.anchor, x.title])) }));
}

export async function demoLegislativeHub(slug: string): Promise<{ available: boolean; state: LegislativeHubState | null; viewer: { signedIn: boolean; voterId: string | null; name: string | null; email: string | null; isCommissioner: boolean }; rules: readonly RuleOption[]; teamsVoted: Record<string, number> }> {
  const key = demoKeyForSlug(slug)!;
  const { store, directory, base } = await governance(key);
  const now = new Date("2026-11-21T15:00:00Z");
  const snapshot = await store.read(now);
  const archive: LegislativeArchiveSession[] = [{ year: house(key).founded + 1, title: "Before the Legislative Hub", notes: "Votes before the hub were taken at the owners meeting by show of hands.", proposals: [
    { id: `${key}-old-1`, year: house(key).founded + 1, title: "League dues set", status: "passed", description: "Dues set for every team, paid before the draft.", sourceFile: "demo", voteTotals: { yes: 11, no: 1 }, sourceLabel: "show-of-hands vote" },
  ] }];
  const rid = (await cookies()).get(DEMO_OWNER_COOKIE)?.value ?? null;
  const me = rid ? teams(key).find((t) => String(t.rosterId) === rid) ?? null : null;
  const state = buildHubState(snapshot, legislativePolicy(slug), archive, { directory, numbering: null, viewerVoterId: me?.id ?? null, ruleHref: (id: string | null) => (id ? `/league-info/constitution#rule-${id}` : null), versionHistoryHref: "/league-info/constitution#amendment-history", authenticated: false } as never);
  const teamsVoted = Object.fromEntries(snapshot.proposals.filter((p) => p.status === "active").map((p) => [p.id, teamsVotedCount(p, directory)]));
  return JSON.parse(JSON.stringify({ available: true, state, viewer: { signedIn: Boolean(me), voterId: me?.id ?? null, name: me?.owner ?? null, email: null, isCommissioner: false }, rules: ruleOptions(applyRatifiedRules(base, snapshot.ratifiedRules)), teamsVoted }));
}

/** The Veto Log: every made-up veto vote, built by the shared veto-log engine. */
export function demoVetoLog(slug: string): { model: VetoLogModel; constitutionHref: string } | null {
  const key = demoKeyForSlug(slug);
  if (!key) return null;
  const h = house(key);
  if (!h.veto) return null;
  const ts = teams(key);
  const byRoster = new Map(ts.map((t) => [t.rosterId, t]));
  const P = players();
  const pname = (id: string) => (P[id] ? `${P[id][0]} ${P[id][1]}` : `Player ${id}`);
  const flags: VetoFlag[] = h.vetoes.map((v, i) => {
    const [a, b] = v.teams;
    const got = (rid: number) => Object.entries(v.adds).filter(([, r]) => r === rid).map(([p]) => pname(p)).join(" + ");
    const yes = v.votes_to_veto.length;
    return {
      id: `${key}-veto-${i}`, season: v.season, week: v.week, flaggedBy: byRoster.get(v.votes_to_veto[0] ?? 0)?.id ?? null, tradeId: v.transaction_id,
      trade: `${byRoster.get(a!)?.owner} got ${got(a!)} · ${byRoster.get(b!)?.owner} got ${got(b!)}`,
      reason: yes ? "Lopsided for a contender." : "Owner asked for a vote.", outcome: v.result === "vetoed" ? "overturned" : "upheld",
      pollYes: yes, pollNo: Math.max(0, 10 - yes), notes: `${v.needed} of 10 veto votes needed.`, source: "log",
    };
  });
  const model = buildVetoLog(flags, ts.map((t) => ({ id: t.id, name: `${t.name} (${t.owner})` })), 2026,
    { flagsPerSeason: null, pollHours: h.veto.hours, rule: `A trade is overturned if ${h.veto.needed} of ${h.veto.of} owners not in the trade vote to veto within ${h.veto.hours} hours.` });
  return { model: JSON.parse(JSON.stringify(model)), constitutionHref: "/league-info/constitution#constitution-subsection-5.2" };
}
