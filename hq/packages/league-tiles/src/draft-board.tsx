"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

export interface DraftBoardPick {
  readonly key: string;
  readonly pickNo: number | null;
  readonly round: number | null;
  readonly slot: number | null;
  readonly playerId: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly position: string | null;
  /** null = free agent; "" = team not recorded (old drafts from spreadsheets). */
  readonly nflTeam: string | null;
  /** Auction price in dollars (auction drafts). */
  readonly price?: number | null;
  readonly keeper?: boolean;
  /** Original owner when the pick was traded (rookie drafts). */
  readonly via?: string | null;
}

export interface DraftBoardTeam {
  readonly id: string;
  readonly slot: number;
  readonly name: string;
  readonly owner?: string | null;
  readonly avatarUrl?: string | null;
  readonly picks: readonly DraftBoardPick[];
}

export interface DraftBoardProps {
  readonly teams: readonly DraftBoardTeam[];
  readonly mode: "auction" | "rookie";
  /** Accent color for highlights (league theme). */
  readonly accent?: string;
  readonly emptyMessage?: string;
  /** Rendered above the board, next to search (e.g. a season picker). */
  readonly controls?: ReactNode;
}

const POSITION_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  QB: { bg: "#fee2e2", border: "#fecaca", text: "#7f1d1d" },
  RB: { bg: "#d1fae5", border: "#a7f3d0", text: "#064e3b" },
  WR: { bg: "#e0f2fe", border: "#bae6fd", text: "#0c4a6e" },
  TE: { bg: "#fef3c7", border: "#fde68a", text: "#78350f" },
  K: { bg: "#f3e8ff", border: "#e9d5ff", text: "#581c87" },
  DEF: { bg: "#e7e5e4", border: "#d6d3d1", text: "#1c1917" },
};
const OTHER = { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" };

function photo(pick: DraftBoardPick) {
  if (pick.position === "DEF") return `https://sleepercdn.com/images/team_logos/nfl/${String(pick.nflTeam ?? pick.playerId ?? "").toLowerCase()}.png`;
  return pick.playerId ? `https://sleepercdn.com/content/nfl/players/${pick.playerId}.jpg` : "https://sleepercdn.com/images/v2/icons/player_default.webp";
}

function pickLabel(pick: DraftBoardPick) {
  if (pick.round === null) return pick.pickNo ? `#${pick.pickNo}` : "";
  return `${pick.round}.${String(pick.slot ?? 0).padStart(2, "0")}`;
}

export function DraftBoard({ teams, mode, accent = "#ea580c", emptyMessage = "No picks for this draft yet.", controls }: DraftBoardProps) {
  const [query, setQuery] = useState("");
  const refs = useRef(new Map<string, HTMLElement>());
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    const owners = new Set<string>();
    const players = new Set<string>();
    let first: string | null = null;
    if (!q) return { owners, players, first };
    for (const team of teams) {
      if (`${team.name} ${team.owner ?? ""}`.toLowerCase().includes(q)) { owners.add(team.id); first ??= `owner:${team.id}`; }
      for (const pick of team.picks) {
        if (`${pick.firstName} ${pick.lastName}`.toLowerCase().includes(q)) { players.add(pick.key); first ??= pick.key; }
      }
    }
    return { owners, players, first };
  }, [teams, q]);

  useEffect(() => {
    if (!matches.first) return;
    const frame = window.requestAnimationFrame(() => refs.current.get(matches.first!)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [matches.first]);

  const setRef = (key: string) => (el: HTMLElement | null) => { if (el) refs.current.set(key, el); else refs.current.delete(key); };
  const total = teams.reduce((n, t) => n + t.picks.length, 0);

  return (
    <div className="db" style={{ "--db-accent": accent } as CSSProperties}>
      <div className="db-controls">
        {controls}
        <label className="db-search">
          <span className="db-sr">Search player or owner</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search player or owner…" />
        </label>
      </div>
      {total === 0 ? (
        <p className="db-empty">{emptyMessage}</p>
      ) : (
        <div className="db-scroll" role="region" aria-label="Draft board" tabIndex={0}>
          <div className="db-columns">
            {teams.map((team) => {
              const spent = team.picks.reduce((s, p) => s + (p.price ?? 0), 0);
              return (
                <div key={team.id} className={`db-col${matches.owners.has(team.id) ? " db-hit" : ""}`}>
                  <div ref={setRef(`owner:${team.id}`)} className="db-head">
                    <span className="db-slot">#{team.slot}</span>
                    <span className="db-avatar">{team.avatarUrl ? <img src={team.avatarUrl} alt="" loading="lazy" /> : <span>{team.name.slice(0, 1)}</span>}</span>
                    <span className="db-team">{team.name}</span>
                    <span className="db-meta">{team.owner && team.owner !== team.name ? `${team.owner} · ` : ""}{mode === "auction" ? `$${spent} · ` : ""}{team.picks.length} {team.picks.length === 1 ? "pick" : "picks"}</span>
                  </div>
                  {team.picks.length ? team.picks.map((pick) => {
                    const style = POSITION_STYLE[pick.position ?? ""] ?? OTHER;
                    return (
                      <div key={pick.key} ref={setRef(pick.key)} className={`db-card${matches.players.has(pick.key) ? " db-hit" : ""}`} style={{ background: style.bg, borderColor: style.border, color: style.text }}>
                        <span className="db-pickno">{pickLabel(pick)}</span>
                        {mode === "auction" ? <span className="db-price">{pick.price != null ? `$${pick.price}` : "—"}</span> : null}
                        {pick.keeper ? <span className="db-tag">Keeper</span> : pick.via ? <span className="db-tag db-tag--via" title={`Pick acquired from ${pick.via}`}>via {pick.via}</span> : null}
                        <img className="db-photo" src={photo(pick)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "https://sleepercdn.com/images/v2/icons/player_default.webp"; }} />
                        <span className="db-name">{pick.firstName ? `${pick.firstName[0]}. ${pick.lastName}` : pick.lastName}</span>
                        <span className="db-pos">{pick.position ?? "—"}{pick.nflTeam === "" ? null : ` · ${pick.nflTeam ?? "FA"}`}</span>
                      </div>
                    );
                  }) : <div className="db-none">No picks</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
