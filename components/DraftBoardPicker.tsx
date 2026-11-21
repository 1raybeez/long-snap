"use client";
import { useState } from "react";
import { DraftBoard, type DraftBoardTeam } from "../hq/packages/league-tiles/src/draft-board.tsx";

export type SavedDraftBoard = { id: string; season: number; label: string; teams: DraftBoardTeam[] };

/** The Draft Board tab: one season picker next to search, newest draft first (same as the league sites). */
export function DraftBoardPicker({ boards, accent, mode = "rookie" }: { boards: readonly SavedDraftBoard[]; accent: string; mode?: "rookie" | "auction" }) {
  const [id, setId] = useState(boards[0]?.id ?? "");
  const board = boards.find((b) => b.id === id) ?? boards[0];
  if (!board) return <p>No saved drafts yet.</p>;
  const picker = (
    <label className="db-season" htmlFor="draft-history-season">
      <span>Draft season</span>
      <select id="draft-history-season" value={board.id} onChange={(e) => setId(e.target.value)}>
        {boards.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </select>
    </label>
  );
  return <DraftBoard teams={board.teams} mode={mode} accent={accent} controls={picker} />;
}
