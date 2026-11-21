import type { ReactNode } from "react";

const SPEAKER = /^([A-Z][A-Z .'’“”"-]{1,30}):\s+/;

export const HOST_AVATARS: Readonly<Record<string, string>> = {
  CANNON: "/hosts/cannon.jpg",
  LEROY: "/hosts/leroy.jpg",
  VINCE: "/hosts/vince.jpg",
};

export function hostAvatarsFor(author: string | null | undefined): string[] {
  if (!author) return [];
  const out: string[] = [];
  if (/leroy/i.test(author)) out.push(HOST_AVATARS.LEROY);
  if (/vince/i.test(author)) out.push(HOST_AVATARS.VINCE);
  if (/cannon/i.test(author)) out.push(HOST_AVATARS.CANNON);
  return out;
}
export function hostAvatarFor(author: string | null | undefined): string | null {
  return hostAvatarsFor(author)[0] ?? null;
}
/** Byline text: the Unnecessary Roughness hosts read as the show, a single host as "<name>'s". */
export function showByline(author: string): { name: string; isShow: boolean } {
  const name = author.replace(/^Claude, as /, "");
  return { name: /leroy|vince/i.test(name) ? "Unnecessary Roughness" : name, isShow: /leroy|vince/i.test(name) };
}

export const SHOW_BANNER = "/hosts/unnecessary-roughness.jpg";

export function showInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.length === 1 && !parts[0].startsWith("**") ? text : parts.map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>));
}

export function showParagraphs(text: string, className?: string): ReactNode[] {
  return text.split(/\n{2,}/).map((para, i) => {
    const m = SPEAKER.exec(para);
    return (
      <p key={i} className={className}>
        {m ? <>{HOST_AVATARS[m[1]] ? <img className="show-avatar" src={HOST_AVATARS[m[1]]} alt="" width={28} height={28} /> : null}<b className="show-speaker">{m[1]}:</b> {showInline(para.slice(m[0].length))}</> : showInline(para)}
      </p>
    );
  });
}
