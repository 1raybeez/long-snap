
export interface NewsItem { source: string; headline: string; at: number; url: string | null }
export interface SleeperPlayerFacts { espnId: string | null; newsUpdated: number | null; injuryStatus: string | null; bodyPart: string | null; practice: string | null; name: string; team: string | null; pos: string | null; age: number | null }

async function getText(url: string, ms = 8000): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ctl.signal, headers: { "user-agent": "FantasyFootballHQ/1.0 (league site)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

/** Sleeper's player list, reduced to the news-related fields for the ids asked for. */
export async function loadSleeperPlayerFacts(ids: readonly string[]): Promise<Map<string, SleeperPlayerFacts>> {
  const want = new Set(ids);
  const out = new Map<string, SleeperPlayerFacts>();
  try {
    const all = JSON.parse(await getText("https://api.sleeper.app/v1/players/nfl", 20000)) as Record<string, Record<string, unknown>>;
    for (const id of want) {
      const p = all[id];
      if (!p) continue;
      const s = (k: string) => (typeof p[k] === "string" && p[k] ? (p[k] as string) : null);
      out.set(id, {
        espnId: p.espn_id !== null && p.espn_id !== undefined ? String(p.espn_id) : null,
        newsUpdated: typeof p.news_updated === "number" ? p.news_updated : null,
        injuryStatus: s("injury_status"), bodyPart: s("injury_body_part"), practice: s("practice_participation"),
        name: [s("first_name"), s("last_name")].filter(Boolean).join(" "), team: s("team"), pos: s("position"), age: typeof p.age === "number" ? p.age : null,
      });
    }
  } catch { /* news is optional */ }
  return out;
}

/** ESPN fantasy news for a few players (latest first), a handful of requests at a time. */
export async function loadEspnPlayerNews(espnIds: readonly string[], perPlayer = 2): Promise<Map<string, NewsItem[]>> {
  const out = new Map<string, NewsItem[]>();
  const queue = [...new Set(espnIds)].slice(0, 60);
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        const j = JSON.parse(await getText(`https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=${encodeURIComponent(id)}&limit=${perPlayer + 4}`)) as { feed?: { type?: string; headline?: string; published?: string; links?: { web?: { href?: string } } }[] };
        // Player notes only (type "Rotowire"); ESPN also files league-wide columns ("Rest-of-season rankings") under each player.
        const items = (j.feed ?? []).filter((f) => f.type === "Rotowire" || f.type === "HeadlineNews").flatMap((f) => (f.headline ? [{ source: "ESPN", headline: f.headline, at: Date.parse(f.published ?? "") || 0, url: f.links?.web?.href ?? `https://www.espn.com/nfl/player/_/id/${id}` }] : [])).slice(0, perPlayer);
        if (items.length) out.set(id, items);
      } catch { /* skip this player */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&#8217;|&#039;|&apos;/g, "'").replace(/&#8216;/g, "'").replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8211;|&#8212;/g, "-").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/** Pro Football Rumors' RSS feed (reporter scoops). Pure parser exported for tests. */
export function parseRssItems(xml: string, source: string): (NewsItem & { text: string })[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const tag = (t: string) => decode(m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
    return { source, headline: tag("title"), url: tag("link") || null, at: Date.parse(tag("pubDate")) || 0, text: `${tag("title")} ${tag("description")} ${tag("category")}` };
  }).filter((x) => x.headline);
}
export async function loadRumors(): Promise<(NewsItem & { text: string })[]> {
  try { return parseRssItems(await getText("https://www.profootballrumors.com/feed"), "Pro Football Rumors"); } catch { return []; }
}
/** Feed items that mention a player by full name. */
export function rumorsFor(items: readonly (NewsItem & { text: string })[], fullName: string): NewsItem[] {
  if (!fullName || fullName.split(" ").length < 2) return [];
  const re = new RegExp(`\\b${fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return items.filter((i) => re.test(i.text)).map(({ source, headline, at, url }) => ({ source, headline, at, url }));
}

/** "Limited practice Thursday · hamstring" style status line from Sleeper's fields. */
export function statusLine(f: SleeperPlayerFacts | undefined): string | null {
  if (!f) return null;
  const parts = [f.injuryStatus, f.bodyPart ? f.bodyPart.toLowerCase() : null, f.practice ? `${f.practice === "Full" ? "full" : f.practice === "Limited" ? "limited" : f.practice === "DNP" ? "did not" : f.practice.toLowerCase()} practice` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const ESPN_TEAM: Record<string, string> = { WAS: "wsh", JAX: "jax", LAR: "lar", LV: "lv", LAC: "lac", KC: "kc", NE: "ne", NO: "no", NYG: "nyg", NYJ: "nyj", SF: "sf", TB: "tb", GB: "gb" };
const norm = (s: string) => s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");

/** ESPN athlete ids by NFL team roster and name, for players Sleeper has no ESPN id for. */
export async function resolveEspnIds(players: readonly { id: string; name: string; team: string | null }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const teams = [...new Set(players.map((p) => p.team).filter((t): t is string => Boolean(t)))];
  const rosters = new Map<string, Map<string, string>>();
  await Promise.all(teams.map(async (t) => {
    try {
      const j = JSON.parse(await getText(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${ESPN_TEAM[t] ?? t.toLowerCase()}/roster`)) as { athletes?: { items?: { id?: string; fullName?: string }[] }[] };
      rosters.set(t, new Map((j.athletes ?? []).flatMap((g) => g.items ?? []).flatMap((a) => (a.id && a.fullName ? [[norm(a.fullName), a.id] as const] : []))));
    } catch { /* skip team */ }
  }));
  for (const p of players) { const id = p.team ? rosters.get(p.team)?.get(norm(p.name)) : undefined; if (id) out.set(p.id, id); }
  return out;
}

export interface PlayerNewsBundle { status: string | null; newsUpdated: number | null; news: NewsItem[] }
/** News for a set of rostered players (My Team): Sleeper status, ESPN notes and Pro Football Rumors, last 3 days. */
export async function loadPlayerNewsBundle(players: readonly { id: string; name: string; team: string | null }[]): Promise<Record<string, PlayerNewsBundle>> {
  const people = players.filter((p) => !/^[A-Z]{2,3}$/.test(p.id)).slice(0, 40);
  const [facts, rumors] = await Promise.all([loadSleeperPlayerFacts(people.map((p) => p.id)), loadRumors()]);
  const resolved = await resolveEspnIds(people.filter((p) => !facts.get(p.id)?.espnId));
  const espnOf = (id: string) => facts.get(id)?.espnId ?? resolved.get(id) ?? null;
  const espn = await loadEspnPlayerNews(people.map((p) => espnOf(p.id)).filter((x): x is string => Boolean(x)));
  const since = Date.now() - 3 * 86400000;
  const out: Record<string, PlayerNewsBundle> = {};
  for (const p of people) {
    const e = espnOf(p.id);
    const news = [...(e ? espn.get(e) ?? [] : []), ...rumorsFor(rumors, p.name)].filter((n) => n.at >= since).sort((a, b) => b.at - a.at).slice(0, 2);
    out[p.id] = { status: statusLine(facts.get(p.id)), newsUpdated: facts.get(p.id)?.newsUpdated ?? null, news };
  }
  return out;
}
