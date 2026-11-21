
export interface ConstitutionSubsection {
  readonly id: string;
  readonly title: string;
  readonly content: readonly string[];

  readonly type?: "standard" | "loophole" | "sleeper" | "alert" | "club" | "hybrid";
  /** Badge text shown with the rule, e.g. "Sleeper Automated". */
  readonly tag?: string;
  /** Numbers this rule had before the league renumbered its constitution (shown as "Formerly …"; old links still find it). */
  readonly formerIds?: readonly string[];
}
export interface ConstitutionSection {
  readonly id: string;
  readonly anchor: string;
  readonly title: string;
  readonly icon: string;
  readonly content?: readonly string[];
  readonly subsections?: readonly ConstitutionSubsection[];
}

export type AmendmentKind = "APPEND" | "REPLACE" | "ADD" | "REPEAL";

export interface RatifiedRule {
  readonly proposalId: string;
  readonly sectionId: string;
  readonly title: string;
  readonly content: readonly string[];
  readonly passedAt: string;
  readonly voteTotals: { readonly yes: number; readonly no: number };
  readonly changeType?: AmendmentKind;
  /** ADD only: the new rule's number and title, e.g. "4.4", "4.4 Taxi Squad". */
  readonly newRuleId?: string | null;
  readonly newRuleTitle?: string | null;
  /** Rule-numbering version the record was written under (missing = the league's original numbering). */
  readonly ruleNumbering?: number;
  /**
   * One proposal can change several rules (2026-11-03). Each change is its own record, applied in this
   * order: 0 is stored at `ratified_rules/{proposalId}` (as before), the rest at `{proposalId}~2`, `~3`…
   */
  readonly changeIndex?: number;
  /** How the vote went, in words, when it isn't a plain yes/no count (e.g. "Option A won 7–4–1"). */
  readonly outcomeLabel?: string;
}

/** Firestore id for a ratified rule (the first change of a proposal keeps the original id). */
export function ratifiedRuleDocId(rule: Pick<RatifiedRule, "proposalId" | "changeIndex">): string {
  return rule.changeIndex ? `${rule.proposalId}~${rule.changeIndex + 1}` : rule.proposalId;
}

export interface RuleNumbering { readonly version: number; readonly map: Readonly<Record<string, string>> }

/** The current number for a rule id stored under `recordVersion` (missing = original numbering). */
export function currentRuleId(id: string, numbering: RuleNumbering | null | undefined, recordVersion?: number | null): string {
  if (!numbering || (recordVersion ?? 1) >= numbering.version) return id;
  return numbering.map[id] ?? id;
}

/** Translate ratified rules stored under the old numbering. An added rule's old number is dropped so it's renumbered in its new chapter. */
export function renumberRatifiedRules(rules: readonly RatifiedRule[], numbering: RuleNumbering | null | undefined): readonly RatifiedRule[] {
  if (!numbering) return rules;
  return rules.map((rule) => {
    if ((rule.ruleNumbering ?? 1) >= numbering.version) return rule;
    const sectionId = currentRuleId(rule.sectionId, numbering);
    const newRuleId = rule.newRuleId ? numbering.map[rule.newRuleId] ?? null : null;
    const newRuleTitle = rule.newRuleTitle && rule.newRuleId ? (newRuleId ? rule.newRuleTitle.replace(rule.newRuleId, newRuleId) : null) : rule.newRuleTitle ?? null;
    return { ...rule, sectionId, newRuleId, newRuleTitle, ruleNumbering: numbering.version };
  });
}

/** Amendment-history entries name rules by the number in force when they passed; translate the old ones. */
export function renumberHistory(history: readonly VersionHistoryUpdate[], rules: readonly RatifiedRule[], numbering: RuleNumbering | null | undefined): readonly VersionHistoryUpdate[] {
  if (!numbering) return history;
  const old = new Set(rules.filter((r) => (r.ruleNumbering ?? 1) < numbering.version).map((r) => r.proposalId));
  return history.map((entry) => (old.has(entry.proposalId) ? { ...entry, changes: entry.changes.map((c) => ({ ...c, rule: currentRuleId(c.rule, numbering) })) } : entry));
}

export interface AppliedAmendment {
  readonly proposalId: string;
  readonly kind: AmendmentKind;
  readonly ruleId: string;
  readonly title: string;
  readonly ratifiedAt: string;
  readonly voteTotals: { readonly yes: number; readonly no: number };
}

export interface CurrentSubsection extends ConstitutionSubsection {
  readonly repealed?: boolean;
  readonly amendments: readonly AppliedAmendment[];
}
export interface CurrentSection extends Omit<ConstitutionSection, "subsections"> {
  readonly subsections: readonly CurrentSubsection[];
  readonly amendmentCount: number;
}

export function constitutionRuleIds(base: readonly ConstitutionSection[]): ReadonlySet<string> {
  return new Set(base.flatMap((s) => [s.id, ...(s.subsections?.map((sub) => sub.id) ?? [])]));
}

export function isSectionId(base: readonly ConstitutionSection[], id: string): boolean { return base.some((s) => s.id === id); }

/** Next free rule number under a section ("4" → "4.4"), counting earlier additions. */
export function nextRuleId(sections: readonly { readonly id: string; readonly subsections?: readonly { readonly id: string }[] }[], sectionId: string): string {
  const section = sections.find((s) => s.id === sectionId);
  const used = (section?.subsections ?? []).map((sub) => sub.id).filter((id) => id.startsWith(`${sectionId}.`)).map((id) => Number(id.slice(sectionId.length + 1).split(".")[0])).filter(Number.isFinite);
  return `${sectionId}.${(used.length ? Math.max(...used) : 0) + 1}`;
}

const byDate = (a: RatifiedRule, b: RatifiedRule) => (Date.parse(a.passedAt) || 0) - (Date.parse(b.passedAt) || 0) || a.proposalId.localeCompare(b.proposalId) || (a.changeIndex ?? 0) - (b.changeIndex ?? 0);

/**
 * The constitution as it stands today: base text with every ratified amendment
 * applied in the order passed. Amendments that point at unknown rules are ignored.
 */
export function applyRatifiedRules(base: readonly ConstitutionSection[], storedRules: readonly RatifiedRule[], numbering?: RuleNumbering | null): readonly CurrentSection[] {
  const rules = renumberRatifiedRules(storedRules, numbering);
  const sections = base.map((section) => ({
    ...section,
    subsections: (section.subsections ?? []).map((sub): CurrentSubsection => ({ ...sub, amendments: [] })),
  }));
  const findSub = (id: string) => {
    for (const section of sections) { const index = section.subsections.findIndex((s) => s.id === id); if (index >= 0) return { section, index }; }
    return null;
  };
  for (const rule of [...rules].sort(byDate)) {
    const kind: AmendmentKind = rule.changeType ?? "APPEND";
    const note = (ruleId: string): AppliedAmendment => ({ proposalId: rule.proposalId, kind, ruleId, title: rule.title, ratifiedAt: rule.passedAt, voteTotals: rule.voteTotals });
    const sectionTarget = sections.find((s) => s.id === rule.sectionId);
    if (kind === "ADD" || (kind === "APPEND" && sectionTarget)) {
      // New rule under a section. (Old section-level records become a generated rule, as before.)
      if (!sectionTarget) continue;
      const id = kind === "ADD" ? rule.newRuleId ?? nextRuleId(sections, sectionTarget.id) : `${sectionTarget.id}-ratified-${rule.proposalId}`;
      const title = kind === "ADD" ? rule.newRuleTitle ?? `${id} ${rule.title}` : `${rule.sectionId} Additional Rule`;
      sectionTarget.subsections = [...sectionTarget.subsections, { id, title, content: rule.content, amendments: [note(id)] }];
      continue;
    }
    const found = findSub(rule.sectionId);
    if (!found) continue;
    const current = found.section.subsections[found.index];
    const next: CurrentSubsection =
      kind === "REPLACE" ? { ...current, content: rule.content, repealed: false, amendments: [...current.amendments, note(current.id)] }
      : kind === "REPEAL" ? { ...current, content: [`Repealed by league vote (${rule.outcomeLabel ?? `${rule.voteTotals.yes}-${rule.voteTotals.no}`}).`], repealed: true, amendments: [...current.amendments, note(current.id)] }
      : { ...current, content: [...current.content, ...rule.content], amendments: [...current.amendments, note(current.id)] };
    found.section.subsections = found.section.subsections.map((sub, i) => (i === found.index ? next : sub));
  }
  return sections.map((section) => ({ ...section, amendmentCount: section.subsections.reduce((n, sub) => n + sub.amendments.length, 0) }));
}

export interface RuleOption { readonly id: string; readonly title: string; readonly content: readonly string[]; readonly isSection: boolean }

/** Rules an owner can point a proposal at: sections (to add a rule under) and current, unrepealed rules. */
/** Rules an owner can aim a proposal at (not repealed rules or highlighted notes such as a one-season league ruling). */
export function ruleOptions(current: readonly CurrentSection[]): readonly RuleOption[] {
  return current.flatMap((section) => [
    { id: section.id, title: section.title, content: section.content ?? [], isSection: true },
    ...section.subsections.filter((sub) => !sub.repealed && sub.type !== "alert" && !sub.id.includes("-ratified-")).map((sub) => ({ id: sub.id, title: sub.title, content: sub.content, isSection: false })),
  ]);
}

export interface VersionHistoryUpdate {
  readonly version: string;
  readonly date: string;
  readonly changes: readonly { readonly rule: string; readonly description: string }[];
  readonly proposalId: string;
}

const KIND_WORD: Record<AmendmentKind, string> = { APPEND: "", REPLACE: "Changed: ", ADD: "Added: ", REPEAL: "Deleted: " };

export function versionHistoryEntry(rule: RatifiedRule, now: Date): VersionHistoryUpdate {
  return versionHistoryForRules([rule], now)!;
}

/** One history entry for a proposal, listing every rule it changed (2026-11-03: one proposal, several rules). */
export function versionHistoryForRules(rules: readonly RatifiedRule[], now: Date): VersionHistoryUpdate | null {
  if (!rules.length) return null;
  return {
    version: "Auto-Update",
    date: now.toLocaleDateString("en-US", { timeZone: "America/New_York" }),
    changes: rules.map((rule) => ({
      rule: rule.changeType === "ADD" ? rule.newRuleId ?? rule.sectionId : rule.sectionId,
      description: `${KIND_WORD[rule.changeType ?? "APPEND"]}${rule.title} (${rule.outcomeLabel ?? `Passed ${rule.voteTotals.yes}-${rule.voteTotals.no}`})`,
    })),
    proposalId: rules[0]!.proposalId,
  };
}
