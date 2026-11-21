
import type { HostId } from "./host-flyer.ts";

export interface ColumnSegmentDef {
  readonly id: string;
  readonly title: string;
  /** What the segment covers, shown in the column's segment guide. */
  readonly blurb: string;
}

export interface ColumnHost {
  readonly host: HostId;

  readonly columnName: string;
  /** Short tab label. */
  readonly tabLabel: string;
  /** Big portrait for the column page (public path). */
  readonly portrait: string;
  /** Round face crop for bylines (public path). */
  readonly avatar: string;
  readonly nickname: string;
  readonly bio: string;
  /** The host's signature line. */
  readonly signature: string;
  /** Recurring segments, in the order a weekly post uses them. */
  readonly segments: readonly ColumnSegmentDef[];
}

export const COLUMN_HOSTS: Readonly<Partial<Record<HostId, ColumnHost>>> = {
};

export interface ColumnPostSegment {
  /** One of the host's segment ids. */
  readonly id: string;
  /** Markdown. */
  readonly body: string;
}

export interface ColumnPost {
  readonly version: 1;
  readonly league: string;
  readonly host: HostId;
  /** URL part, lower-case words joined by "-". */
  readonly slug: string;
  readonly title: string;
  /** One-line summary for cards. */
  readonly dek: string;
  /** "2026-11-11" (Eastern date the post went up). */
  readonly date: string;
  readonly season: number;
  /** NFL week the post covers; null for posts outside a week. */
  readonly week: number | null;
  readonly kind: "intro" | "weekly" | "special";
  /** Markdown body (intro/special posts; a weekly post may add a short opener here). */
  readonly body: string;
  readonly segments: readonly ColumnPostSegment[];

  readonly signoff: readonly string[];
}

/** Problems with a post file (empty = fine). */
export function columnPostProblems(post: ColumnPost, fileName: string): string[] {
  const out: string[] = [];
  const host = COLUMN_HOSTS[post.host];
  if (post.version !== 1) out.push("version must be 1");
  if (!host) out.push(`unknown host ${post.host}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug)) out.push("slug must be lower-case words joined by -");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date)) out.push("date must be YYYY-MM-DD");
  if (!post.title?.trim()) out.push("title missing");
  if (!post.dek?.trim()) out.push("dek missing");
  if (post.week !== null && !(Number.isInteger(post.week) && post.week >= 1 && post.week <= 18)) out.push("week must be 1–18 or null");
  const expected = `${post.season}-${String(post.week ?? 0).padStart(2, "0")}-${post.slug}.json`;
  if (fileName !== expected) out.push(`file should be named ${expected}`);
  if (!post.body?.trim() && !post.segments?.length) out.push("post has no body and no segments");
  const ids = new Set(host?.segments.map((s) => s.id) ?? []);
  for (const seg of post.segments ?? []) if (!ids.has(seg.id)) out.push(`unknown segment ${seg.id}`);
  if (post.kind === "weekly" && post.week === null) out.push("a weekly post needs its week");
  return out;
}

/** Newest first (the newest post is the one featured on the league home page). */
export function sortColumnPosts(posts: readonly ColumnPost[]): ColumnPost[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || b.season - a.season || (b.week ?? 0) - (a.week ?? 0) || a.slug.localeCompare(b.slug));
}
