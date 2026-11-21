
export type WordingLineKind = "heading" | "item" | "paragraph";

export function wordingLineKind(line: string): WordingLineKind {
  const text = line.trim();
  if (text.length <= 60 && text.endsWith(":")) return "heading";
  if (text.length <= 60 && !/[.!?]$/.test(text)) return "item";
  return "paragraph";
}

/** Top margin in px for a line, given the line before it. */
export function wordingLineGap(kind: WordingLineKind, previous: WordingLineKind | null): number {
  if (previous === null) return 0;
  if (kind === "heading") return 14;
  if (kind === "item") return previous === "paragraph" ? 10 : 2;
  return 12;
}
