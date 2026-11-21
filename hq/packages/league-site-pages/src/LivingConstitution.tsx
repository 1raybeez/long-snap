"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { CurrentSection, CurrentSubsection, VersionHistoryUpdate } from "@/lib/hq-governance";
import { wordingLineKind } from "@/lib/hq-governance/text-lines";

/**
 * The Constitution as data, with ratified amendments from the Legislative Hub applied
 * (shared Fantasy Football HQ engine). Same look as the original hand-written page.
 */
const KIND_LABEL: Record<string, string> = { REPLACE: "Rule changed", ADD: "New rule", REPEAL: "Rule deleted", APPEND: "Amended" };

export function LivingConstitution({ sections, history, lastAmendedAt, navLabels, legislativeHref, navClassName = "top-3" }: { sections: readonly CurrentSection[]; history: readonly VersionHistoryUpdate[]; lastAmendedAt: string | null; navLabels: Readonly<Record<string, string>>; legislativeHref: string; /** Sticky offset class for the section nav (a site may pass its own). */ navClassName?: string }) {

  const HISTORY = "amendment-history";
  const [active, setActive] = useState<string>(sections[0]?.anchor ?? HISTORY);
  useEffect(() => {
    const fromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      if (hash === HISTORY || sections.some((s) => s.anchor === hash)) { setActive(hash); return; }
      // A rule's current number first, then its old number (links made before the 2026 renumbering).
      const byId = sections.find((s) => s.subsections.some((rule) => `rule-${rule.id}` === hash));
      const byFormer = byId ? null : sections.flatMap((s) => s.subsections.map((rule) => ({ s, rule }))).find(({ rule }) => rule.formerIds?.some((f) => `rule-${f}` === hash));
      const owner = byId ?? byFormer?.s;
      const target = byFormer ? `rule-${byFormer.rule.id}` : hash;
      if (owner) { setActive(owner.anchor); window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: "start" }), 50); }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [sections]);
  const pick = (anchor: string) => { setActive(anchor); window.history.replaceState(null, "", `#${anchor}`); };

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = q.length >= 3 ? sections.flatMap((section) => section.subsections.flatMap((rule) => {
    const line = rule.content.find((text) => text.toLowerCase().includes(q));
    const inTitle = rule.title.toLowerCase().includes(q);
    return inTitle || line ? [{ section, rule, snippet: inTitle ? rule.title : (line ?? "").replace(/\*\*/g, "") }] : [];
  })) : [];
  const openResult = (anchor: string, ruleId: string) => {
    setActive(anchor);
    window.history.replaceState(null, "", `#rule-${ruleId}`);
    window.setTimeout(() => document.getElementById(`rule-${ruleId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const tabClass = (anchor: string) => `inline-flex min-h-11 shrink-0 items-center rounded-md border-0 px-3 py-2 font-ui text-xs font-black uppercase tracking-[0.04em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lcc-interactive-focus)] ${active === anchor ? "bg-[var(--lcc-brand-primary)] text-white" : "bg-transparent text-[var(--lcc-color-text-muted)] hover:bg-[var(--lcc-color-surface-muted)] hover:text-[var(--lcc-interactive)]"}`;
  return (
    <main className="lcc2-page-container pt-0">
      <nav aria-label="Constitution sections" role="tablist" className={`${navClassName} sticky z-10 mb-5 flex gap-1.5 overflow-x-auto rounded-lg border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)]/95 p-1.5 shadow-[var(--lcc-shadow-soft)] backdrop-blur`}>
        {sections.map((section) => (
          <button key={section.id} type="button" role="tab" aria-selected={active === section.anchor} onClick={() => pick(section.anchor)} className={tabClass(section.anchor)}>
            {navLabels[section.anchor] ?? section.title}
          </button>
        ))}
        <button type="button" role="tab" aria-selected={active === HISTORY} onClick={() => pick(HISTORY)} className={tabClass(HISTORY)}>History</button>
      </nav>
      <div className="mb-5">
        <label htmlFor="constitution-search" className="sr-only">Search the Constitution</label>
        <div className="relative">
          <input id="constitution-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the rules (e.g. trade, keeper, tiebreaker)…" className="h-12 w-full rounded-lg border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)] px-4 font-ui text-base text-[var(--lcc-color-text)] shadow-[var(--lcc-shadow-soft)] outline-none focus:border-[var(--lcc-interactive)]" />
        </div>
        {q.length > 0 && q.length < 3 ? <p className="mt-2 font-ui text-xs font-bold text-[var(--lcc-color-text-muted)]">Type at least 3 letters.</p> : null}
        {q.length >= 3 ? (
          <div className="mt-3 rounded-lg border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)] p-2 shadow-[var(--lcc-shadow-soft)]">
            <p className="px-2 py-1 font-ui text-xs font-black uppercase tracking-[0.08em] text-[var(--lcc-brand-primary)]">{results.length ? `${results.length} match${results.length === 1 ? "" : "es"}` : "No rules match"}</p>
            <ul className="max-h-80 overflow-y-auto">
              {results.map(({ section, rule, snippet }) => (
                <li key={`${section.anchor}-${rule.id}`}>
                  <button type="button" onClick={() => openResult(section.anchor, rule.id)} className="w-full rounded-md border-0 bg-transparent px-2 py-2 text-left font-ui hover:bg-[var(--lcc-color-surface-muted)]">
                    <span className="block text-xs font-black uppercase tracking-[0.06em] text-[var(--lcc-color-text-muted)]">{navLabels[section.anchor] ?? section.title} · {rule.title}</span>
                    <span className="mt-0.5 block text-sm text-[var(--lcc-color-text)]"><Highlight text={snippet} query={q} /></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {lastAmendedAt ? <p className="mb-4 font-ui text-xs font-bold text-[var(--lcc-color-text-muted)]">Last amended {formatDate(lastAmendedAt)} through the <Link href={legislativeHref} className="text-[var(--lcc-interactive)] underline">Legislative Hub</Link>.</p> : null}

      {sections.map((section) => (
        <RuleSection key={section.id} id={section.anchor} title={section.title} amendments={section.amendmentCount} hidden={active !== section.anchor}>
          {section.content?.length ? <div className="mt-5 max-w-4xl font-ui text-[0.95rem] leading-7 text-[var(--lcc-color-text-muted)]"><RichLines lines={section.content} /></div> : null}
          {section.subsections.map((rule) => <Rule key={rule.id} rule={rule} />)}
        </RuleSection>
      ))}

      <section id="amendment-history" hidden={active !== HISTORY} className="scroll-mt-24 rounded-xl border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)] p-5 shadow-[var(--lcc-shadow-soft)] sm:p-6">
        <p className="lcc2-label text-[var(--lcc-brand-primary)]">Amendment history</p>
        <h2 className="mt-1 font-ui text-xl font-black">Changes made through the Legislative Hub</h2>
        {history.length ? (
          <ul className="mt-4 grid gap-3">
            {history.map((entry) => (
              <li key={entry.proposalId} className="rounded-lg border border-[var(--lcc-color-border)] p-3 font-ui text-sm">
                <span className="font-black">{entry.date}</span>
                {entry.changes.map((change, index) => <span key={index} className="block"><a href={`#rule-${change.rule}`} className="font-black text-[var(--lcc-interactive)]">{change.rule}</a>: {change.description}</span>)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="lcc2-body mt-3">No amendments yet. When a proposal passes in the <Link href={legislativeHref} className="text-[var(--lcc-interactive)] underline">Legislative Hub</Link>, it&apos;s applied here automatically. Earlier changes are listed under Amendments &amp; League Records.</p>
        )}
      </section>
    </main>
  );
}

function Rule({ rule }: { rule: CurrentSubsection }) {
  return (
    <div id={`rule-${rule.id}`} className="scroll-mt-24">
      {rule.tag ? <span className={`lcc2-badge ${rule.type === "sleeper" ? "lcc2-badge--info" : "lcc2-badge--neutral"} mr-2 mt-2`}>{rule.tag}</span> : null}
      {rule.formerIds?.some((f) => /^\d/.test(f)) ? <span className="lcc2-badge lcc2-badge--neutral mr-2 mt-2" title="Rule number before the rule book was renumbered (Oct 2026)">Formerly {rule.formerIds.filter((f) => /^\d/.test(f)).join(", ")}</span> : null}
      {rule.amendments.map((amendment) => (
        <span key={amendment.proposalId} className={`lcc2-badge ${amendment.kind === "REPEAL" ? "lcc2-badge--neutral" : "lcc2-badge--info"} mr-2 mt-2`}>
          {KIND_LABEL[amendment.kind]} {formatDate(amendment.ratifiedAt)} · {amendment.voteTotals.yes}-{amendment.voteTotals.no}
        </span>
      ))}
      <div className="mt-5">
        <h4 className={`mb-1.5 font-ui text-xs font-black uppercase tracking-[0.1em] ${rule.repealed ? "text-[var(--lcc-color-text-muted)] line-through" : "text-[var(--lcc-brand-primary)]"}`}>{rule.title}</h4>
        <div className="max-w-4xl font-ui text-[0.95rem] leading-7 text-[var(--lcc-color-text-muted)]">
          <RichLines lines={rule.content} />
        </div>
      </div>
    </div>
  );
}

/** Renders content lines: paragraphs, "• " list items, headings (short lines ending in ":", bold with space above), **bold** and [text](href) links. */
export function RichLines({ lines }: { lines: readonly string[] }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={`ul-${out.length}`} style={{ paddingLeft: "1.25rem", marginTop: "4px" }} className="list-disc">{list.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>); list = []; } };
  lines.forEach((line) => {
    if (line.startsWith("• ")) { list.push(line.slice(2)); return; }
    flush();
    const heading = wordingLineKind(line) === "heading";
    out.push(<p key={`p-${out.length}`} className={heading ? "font-black" : "mt-2"} style={heading ? { marginTop: out.length ? 14 : 8 } : undefined}>{inline(line)}</p>);
  });
  flush();
  return <>{out}</>;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return link[2].startsWith("/") ? <Link key={i} href={link[2]} className="font-bold text-[var(--lcc-interactive)] underline underline-offset-4">{link[1]}</Link> : <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--lcc-interactive)] underline underline-offset-4">{link[1]}</a>;
    return part;
  });
}

function RuleSection({ id, title, amendments, hidden, children }: { id: string; title: string; amendments: number; hidden: boolean; children: ReactNode }) {
  return (
    <section id={id} hidden={hidden} className="mb-4 scroll-mt-24 overflow-hidden rounded-xl border border-[var(--lcc-color-border)] bg-[var(--lcc-color-surface-raised)] shadow-[var(--lcc-shadow-soft)]">
      <h2 className="px-5 py-4 font-ui text-lg font-black leading-tight">
        {title}{amendments > 0 ? <span className="lcc2-badge lcc2-badge--info ml-3 align-middle">{amendments} amendment{amendments === 1 ? "" : "s"}</span> : null}
      </h2>
      <div id={`${id}-content`} className="border-t border-[var(--lcc-color-border)] px-5 pb-6 sm:px-6">{children}</div>
    </section>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query);
  if (at < 0) return <>{text}</>;
  let start = Math.max(0, at - 60);
  if (start > 0) { const space = text.indexOf(" ", start); start = space >= 0 && space < at ? space + 1 : start; }
  const end = Math.min(text.length, at + query.length + 100);
  return <>{start > 0 ? "…" : ""}{text.slice(start, at)}<mark className="rounded bg-[var(--lcc-color-surface-muted)] px-0.5 font-bold text-[var(--lcc-interactive)]">{text.slice(at, at + query.length)}</mark>{text.slice(at + query.length, end)}{end < text.length ? "…" : ""}</>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(date);
}
