import type { CSSProperties } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { money, type PayoutCard, type PayoutEarningRow, type PayoutsModel, type PostseasonPrize } from "./payouts.ts";

export interface PayoutsViewProps {
  readonly model: PayoutsModel;
  readonly theme: LeagueTileTheme;
  readonly basePath: string;
  readonly season?: string | null;
}

function Card({ card }: { readonly card: PayoutCard }) {
  return <div className="hh-card py-card"><p className="hh-label">{card.label}</p><p className="py-value">{card.value}</p>{card.note ? <p className="hh-note">{card.note}</p> : null}</div>;
}

function Heading({ eyebrow, title, id }: { readonly eyebrow: string; readonly title: string; readonly id: string }) {
  return <div><p className="hh-eyebrow">{eyebrow}</p><h2 id={id} className="py-h2">{title}</h2></div>;
}

const PRIZE_STATE: Record<PostseasonPrize["state"], string> = { WON: "Won", LEADING: "Leading", TIED: "Tied", OPEN: "Open" };

function prizeStatus(prize: PostseasonPrize): { readonly text: string; readonly tone: "done" | "owed" | "pending" | "none" } {
  if (prize.state !== "WON") return { text: "Not decided", tone: "none" };
  if (prize.status === "PAID" || prize.status === "CREDITED") return { text: "✓ Paid", tone: "done" };
  if (prize.status === "APPROVED") return { text: "To pay", tone: "owed" };
  if (prize.status === "FORFEITED") return { text: "Forfeited", tone: "none" };
  return { text: "Awaiting approval", tone: "pending" };
}

function earningStatus(row: PayoutEarningRow): { readonly text: string; readonly tone: "done" | "owed" | "pending" | "none" } {
  if (!row.earnedCents) return { text: "—", tone: "none" };
  if (row.owedCents) return { text: `${money(row.owedCents)} to pay`, tone: "owed" };
  if (row.pendingCents) return { text: "Awaiting approval", tone: "pending" };
  return { text: "✓ Paid", tone: "done" };
}

export function PayoutsView({ model, theme, basePath, season }: PayoutsViewProps) {
  const cur = model.current;
  const selected = model.seasons.find((s) => String(s.season) === season) ?? model.seasons[0] ?? null;
  const earnings = model.earnings ?? [];
  const earnedTotal = earnings.reduce((t, r) => t + r.earnedCents, 0);
  const weekly = model.weeklyHighs;
  const postseason = model.postseason ?? [];
  const postseasonTotal = postseason.reduce((t, p) => t + p.amountCents, 0);
  return (
    <section className="league-tiles hh py" style={themeCssVariables(theme) as CSSProperties}>
      <header className="hh-hero">
        <p className="hh-hero-eyebrow">{model.leagueName} · League Info</p>
        <h1>{model.leagueName} Payouts</h1>
        <p>Where the money comes from, where it goes, who has won what this season, and how past seasons paid out. Owner payment details stay with the commissioner.</p>
      </header>

      {cur ? <section className="hh-section py-current" aria-labelledby="py-current">
        <div><p className="hh-eyebrow">This season</p><h2 id="py-current" className="py-h2">{cur.season} Season</h2><p className="hh-note">{cur.statusLabel}</p></div>
        <div className="hh-grid hh-grid-4">
          <Card card={{ label: "League dues", value: money(cur.duesCents), note: "Per owner" }} />
          <Card card={{ label: "Owners", value: String(cur.ownerCount) }} />
          <Card card={{ label: "Prize pool", value: money(cur.poolCents) }} />
          <Card card={{ label: "Paid / owed", value: cur.paidCount === null ? "Not yet recorded" : `${cur.paidCount} / ${cur.owedCount ?? 0}`, note: cur.paidCount === null ? null : cur.paidNote ?? `${cur.paidCount} of ${cur.ownerCount} paid` }} />
        </div>
        {cur.feeNotes.map((note) => <p key={note} className="hh-note">{note}</p>)}
        <div><p className="hh-label">Where the {money(cur.poolCents)} goes</p>
          <dl className="hh-grid hh-grid-5 py-dl py-tight-top">{cur.allocation.map((line) => <div key={line.label} className="hh-card"><dt className="hh-note">{line.label}</dt><dd className="py-value">{money(line.amountCents)}</dd>{line.note ? <dd className="hh-note">{line.note}</dd> : null}</div>)}</dl>
          <p className="hh-note">Champion: {money(cur.championAllocationCents)} allocation · ring {cur.ringCostCents === null ? "cost pending" : money(cur.ringCostCents)} · projected champion cash {cur.projectedChampionCashCents === null ? "pending" : money(cur.projectedChampionCashCents)}</p>
        </div>
        <p className="hh-note"><b>Money is held in:</b> {cur.fundLocations.map((loc) => `${loc.label}${loc.note ? ` (${loc.note})` : ""}`).join(" · ")}. No account details are public.</p>
      </section> : null}

      <section className="hh-section" aria-labelledby="py-earnings">
        <div className="hh-row"><Heading eyebrow={`Weekly high score · ${weekly.length ? `weeks 1–${Math.max(...weekly.map((w) => w.week))}` : "no weeks yet"}${postseason.length ? " · postseason prizes" : ""}`} title="Season earnings" id="py-earnings" /><p className="hh-note">{money(earnedTotal)} won so far</p></div>
        {earnings.length ? <div className="hh-table-card"><table className="hh-table py-earn">
          <thead><tr><th scope="col">Team</th><th scope="col">Won</th><th scope="col" className="py-num">Earned</th><th scope="col" className="py-num">Status</th></tr></thead>
          <tbody>{earnings.map((row) => { const status = earningStatus(row); return <tr key={row.key} className={row.earnedCents ? "" : "py-zero"}>
            <td><b>{row.teamName}</b><span className="hh-block">{row.owners}</span></td>
            <td>{row.weeks.length || row.prizes?.length ? [...row.weeks.map((w) => `Wk ${w}`), ...(row.prizes ?? [])].join(", ") : "—"}{row.leading?.length ? <span className="hh-block py-prize-note">{row.leading.map((l) => `Leads: ${l}`).join(" · ")}</span> : null}</td>
            <td className="py-num"><b>{money(row.earnedCents)}</b></td>
            <td className={`py-num py-status-${status.tone}`}>{status.text}</td>
          </tr>; })}</tbody>
        </table></div> : <p className="hh-card hh-muted hh-note">Season earnings appear once Sleeper has scored the first week.</p>}
        {postseason.length ? <div className="py-post">
          <div className="hh-row"><p className="hh-label">Postseason prizes</p><p className="hh-note">{money(postseasonTotal)} in prizes</p></div>
          <div className="hh-table-card"><table className="hh-table py-earn">
            <thead><tr><th scope="col">Prize</th><th scope="col">Winner</th><th scope="col" className="py-num">Prize</th><th scope="col" className="py-num">Status</th></tr></thead>
            <tbody>{postseason.map((prize) => { const status = prizeStatus(prize); return <tr key={prize.key} className={prize.state === "WON" ? "" : "py-zero"}>
              <td><b>{prize.label}</b></td>
              <td>{prize.rosterIds.length ? <><span className={`py-chip py-chip-${prize.state.toLowerCase()}`}>{PRIZE_STATE[prize.state]}</span> <b>{prize.teamNames.join(" / ")}</b><span className="hh-block">{prize.owners.join(" / ")}</span></> : <span className="hh-note">To be decided</span>}{prize.note ? <span className="hh-block py-prize-note">{prize.note}</span> : null}</td>
              <td className="py-num"><b>{money(prize.amountCents)}</b></td>
              <td className={`py-num py-status-${status.tone}`}>{status.text}</td>
            </tr>; })}</tbody>
          </table></div>
        </div> : null}
        {weekly.length ? <details className="hh-card hh-muted py-details"><summary>Week-by-week high scores</summary><ul className="py-weeks">{weekly.map((w) => <li key={w.week}><b>Week {w.week}</b> · {w.teamNames.join(" / ")} · {w.score.toFixed(2)} · {money(w.prizeCents)}</li>)}</ul></details> : null}
      </section>

      {selected ? <section className="hh-section" aria-labelledby="py-history">
        <div className="hh-row"><Heading eyebrow="Past seasons" title="Payout history" id="py-history" />
          <form className="rv-filters py-picker" method="get" action={basePath}><label>Season<select name="season" defaultValue={String(selected.season)}>{model.seasons.map((s) => <option key={s.season} value={s.season}>{s.season}</option>)}</select></label><button type="submit" className="op-button">Show</button></form>
        </div>
        {model.overall.length ? <div className="hh-grid hh-grid-4">{model.overall.map((card) => <Card key={card.label} card={card} />)}</div> : null}
        <article className="hh-card py-season-card">
          <div className="py-split"><div><p className="hh-label">{selected.season} season</p><p className="py-value hh-upper">{selected.statusLabel}</p></div></div>
          <div className="hh-grid hh-grid-4 py-tight-top">{selected.cards.map((card) => <div key={card.label}><p className="hh-label">{card.label}</p><p className="hh-strong">{card.value}</p>{card.note ? <p className="hh-tiny">{card.note}</p> : null}</div>)}</div>
          <p className="hh-label py-gap">How the {selected.season} pool was paid out</p>
          <div className="py-rows">
            {selected.awards.map((a) => <div key={a.label} className="py-split py-row"><b>{a.label}</b><span className="py-amount">{money(a.amountCents)}</span></div>)}
            {selected.weeklyCount ? <div className="py-split py-row"><b>Weekly high scores ({selected.weeklyCount})</b><span className="py-amount">{money(selected.weeklyTotalCents)}</span></div> : null}
            {selected.expenses.map((e) => <div key={e.label} className="py-split py-row"><b>{e.label} <span className="hh-tiny">· expense, {e.funding.toLowerCase()}</span></b><span className="py-amount">{money(e.amountCents)}</span></div>)}
            {!selected.awards.length && !selected.weeklyCount && !selected.expenses.length ? <p className="hh-note">Nothing recorded for {selected.season}.</p> : null}
          </div>
          {selected.note ? <p className="py-callout py-gap">{selected.note}</p> : null}
        </article>
      </section> : null}

      {model.owners?.length ? <section className="hh-section" aria-labelledby="py-owners">
        <Heading eyebrow="All time" title="Money by owner" id="py-owners" />
        <div className="hh-table-card"><table className="hh-table py-earn">
          <thead><tr><th scope="col">Owner</th><th scope="col" className="py-num">Seasons</th><th scope="col" className="py-num">Fees paid</th><th scope="col" className="py-num">Winnings</th><th scope="col" className="py-num">Net</th><th scope="col" className="py-num">Titles</th></tr></thead>
          <tbody>{model.owners.map((row) => <tr key={row.name}>
            <td><b>{row.name}</b></td>
            <td className="py-num">{row.seasons}</td>
            <td className="py-num">{money(row.feesCents)}</td>
            <td className="py-num">{money(row.winningsCents)}</td>
            <td className={`py-num ${row.netCents >= 0 ? "py-status-done" : "py-status-none"}`}><b>{row.netCents >= 0 ? "+" : "−"}{money(Math.abs(row.netCents))}</b></td>
            <td className="py-num">{row.titles || "—"}</td>
          </tr>)}</tbody>
        </table></div>
        {model.ownersNote ? <p className="hh-note">{model.ownersNote}</p> : null}
      </section> : null}

      <footer className="hh-section py-foot">
        {model.coverage.map((line) => <p key={line} className="hh-note">{line}</p>)}
        {model.constitutionHref ? <a className="hh-link" href={model.constitutionHref}>Financial rules in the Constitution →</a> : null}
      </footer>
    </section>
  );
}
