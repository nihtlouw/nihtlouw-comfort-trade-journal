"use client";

import { useState } from "react";
import { ArrowRight, BookOpenText, ChevronLeft, ChevronRight, CircleAlert, ShieldCheck, Sparkles } from "lucide-react";
import { currency, shortDate, todayString } from "@/lib/format";
import { getWeeklyReview, shiftWeek, weekBounds } from "@/lib/review";
import { getRiskAlerts, type RiskAlert } from "@/lib/risk";
import { DEFAULT_ACCOUNT, type JournalSettings, type RiskLimits, type Trade, type TradingAccount } from "@/lib/types";
import { CardTitle, StatsCards, TradeTable } from "@/components/journal-ui";

const noLimits: RiskLimits = { perTrade: null, dailyLoss: null };
const limitsEnabled = (limits: RiskLimits) => limits.perTrade !== null || limits.dailyLoss !== null;
const accountName = (accounts: TradingAccount[], id: string) => accounts.find((account) => account.id === id)?.name ?? "Account";

function RiskAlertLines({ alerts, accounts, hidden }: { alerts: RiskAlert[]; accounts: TradingAccount[]; hidden: boolean }) {
  return <ul className="risk-alert-list">{alerts.slice(0, 8).map((alert) => <li key={`${alert.kind}-${alert.accountId}-${alert.date}-${alert.kind === "trade" ? alert.tradeId : "day"}`}>
    <CircleAlert size={15} aria-hidden="true"/><div><strong>{alert.kind === "trade" ? `${alert.symbol || "Trade"} · initial risk` : "Daily realized net loss"}</strong>
      <span>{shortDate(alert.date, true)} · {accountName(accounts, alert.accountId)}</span>
      <small>{currency(alert.amount, false, hidden)} exceeds {currency(alert.limit, false, hidden)} limit</small></div>
  </li>)}{alerts.length > 8 && <li className="risk-more">Plus {alerts.length - 8} more reminders.</li>}</ul>;
}

export function RiskOverview({ trades, settings, hidden, onReview, onSettings }: { trades: Trade[]; settings: JournalSettings; hidden: boolean; onReview: () => void; onSettings: () => void }) {
  const limits = settings.riskLimits ?? noLimits;
  const alerts = getRiskAlerts(trades, limits);
  const todayAlerts = alerts.filter((alert) => alert.date === todayString());
  const missingToday = trades.filter((trade) => !trade.isDemo && trade.tradeDate === todayString() && !(Number(trade.initialRisk) > 0)).length;
  const accounts = settings.accounts ?? [DEFAULT_ACCOUNT];
  return <section className="card risk-overview"><div className="widget-top"><span className="widget-icon green"><ShieldCheck size={18}/></span><span className="widget-overline">RECORDED RISK</span></div>
    <h2>Risk reminders</h2>
    {!limitsEnabled(limits) ? <><p>Set optional limits for a gentle post-trade check-in.</p><button type="button" className="widget-link" onClick={onSettings}>Set limits <ArrowRight size={14}/></button></> : <>
      <p>{todayAlerts.length ? `${todayAlerts.length} ${todayAlerts.length === 1 ? "reminder" : "reminders"} for today’s recorded trades.` : "No recorded limit breaches today."}</p>
      {todayAlerts.length > 0 && <RiskAlertLines alerts={todayAlerts} accounts={accounts} hidden={hidden}/>}
      <p className="risk-overview-note">{alerts.length} total {alerts.length === 1 ? "reminder" : "reminders"} in this account filter. Samples excluded.</p>
      {limits.perTrade !== null && missingToday > 0 && <p className="risk-overview-note">{missingToday} {missingToday === 1 ? "trade today has" : "trades today have"} no positive initial risk to check.</p>}
      {alerts.length > todayAlerts.length && <details className="risk-history"><summary>Recent recorded reminders</summary><RiskAlertLines alerts={alerts} accounts={accounts} hidden={hidden}/></details>}
      <button type="button" className="widget-link" onClick={onReview}>Open weekly review <ArrowRight size={14}/></button>
    </>}
  </section>;
}

export function WeeklyReview({ trades, settings, hidden, onMindset, onSettings, onEditTrade, onNewTrade, onJournal }: { trades: Trade[]; settings: JournalSettings; hidden: boolean; onMindset: () => void; onSettings: () => void; onEditTrade: (trade: Trade) => void; onNewTrade: () => void; onJournal: () => void }) {
  const [weekStart, setWeekStart] = useState(() => weekBounds().start);
  const review = getWeeklyReview(trades, settings.reflections ?? [], weekStart);
  const limits = settings.riskLimits ?? noLimits;
  const alerts = getRiskAlerts(review.trades, limits);
  const currentStart = weekBounds().start;
  const accounts = settings.accounts ?? [DEFAULT_ACCOUNT];
  return <div className="view-stack weekly-review">
    <section className="review-intro card"><div><span className="card-eyebrow"><Sparkles size={13}/> A LITTLE SPACE TO REFLECT</span><h2 aria-live="polite" aria-atomic="true">{shortDate(review.start, true)} – {shortDate(review.end, true)}</h2><p>Monday to Sunday · account and sample filters apply to trade data.</p></div>
      <div className="review-navigation"><button type="button" className="icon-button" aria-label="Previous week" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}><ChevronLeft size={19}/></button><button type="button" className="review-today" onClick={() => setWeekStart(currentStart)} disabled={weekStart === currentStart}>This week</button><button type="button" className="icon-button" aria-label="Next week" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}><ChevronRight size={19}/></button></div>
    </section>
    <StatsCards trades={review.trades} hidden={hidden}/>
    <div className="review-grid"><div className="review-column">
      <section className="card review-card"><CardTitle eyebrow="THE TRADES" title="Setups this week" description="Recorded net P&L by setup, after fees."/>
        {review.setups.length ? <div className="review-setup-list">{review.setups.map((setup) => <div key={setup.name}><span className="review-setup-mark"><BookOpenText size={15}/></span><span><strong>{setup.name}</strong><small>{setup.count} {setup.count === 1 ? "trade" : "trades"} · {setup.wins} wins / {setup.losses} losses</small></span><b className={setup.pnl < 0 ? "loss-text" : ""}>{currency(setup.pnl, setup.pnl > 0, hidden)}</b></div>)}</div> : <div className="simple-empty">No trades recorded in this week.</div>}
      </section>
      <section className="card review-card"><CardTitle eyebrow="THE CONTEXT" title="Trade notes" description="Notes from the trades in the selected week and account."/>
        {review.tradeNotes.length ? <div className="review-notes">{review.tradeNotes.slice(0, 10).map((trade) => <article key={trade.id}><div><strong>{trade.symbol}</strong><small>{shortDate(trade.tradeDate, true)} · {accountName(accounts, trade.accountId ?? DEFAULT_ACCOUNT.id)}{trade.isDemo ? " · Sample" : ""}</small></div><p>{trade.notes}</p></article>)}{review.tradeNotes.length > 10 && <p className="review-footnote">Showing 10 of {review.tradeNotes.length} notes. Open the journal for the rest.</p>}</div> : <div className="simple-empty">No trade notes for this week yet.</div>}
      </section>
    </div><div className="review-column">
      <section className="card review-card risk-review"><CardTitle eyebrow="THE PROCESS" title="Risk in your records" description="A check-in, not live brokerage monitoring."/>
        <div className="risk-coverage"><div><strong>Initial risk recorded</strong><span>{review.riskCount} / {review.trades.length} trades</span></div><div className="progress-track" role="progressbar" aria-label="Trades with initial risk recorded" aria-valuemin={0} aria-valuemax={review.trades.length || 1} aria-valuenow={review.riskCount}><span style={{ width: `${review.trades.length ? review.riskCount / review.trades.length * 100 : 0}%` }}/></div></div>
        <div className="risk-metrics"><div><small>AVERAGE INITIAL RISK</small><strong>{review.averageRisk === null ? "—" : currency(review.averageRisk, false, hidden)}</strong></div><div><small>AVERAGE R</small><strong>{review.stats.avgR === null ? "—" : `${review.stats.avgR.toFixed(2)}R`}</strong></div></div>
        <p className="review-footnote">Based only on positive initial risk entries. {review.trades.length - review.riskCount} {review.trades.length - review.riskCount === 1 ? "trade has" : "trades have"} no positive risk recorded. Coverage includes samples when shown.</p>
        <div className="risk-limit-heading"><strong>Limit reminders</strong><button type="button" onClick={onSettings}>Edit limits</button></div>
        {!limitsEnabled(limits) ? <p className="review-footnote">No limits set. Add optional thresholds in Settings.</p> : alerts.length ? <RiskAlertLines alerts={alerts} accounts={accounts} hidden={hidden}/> : <p className="review-footnote">No recorded breaches this week. Samples are excluded.</p>}
        <p className="review-footnote">Daily loss is the net of recorded P&L per account and date; gains offset losses. Reminders never place or block trades.</p>
      </section>
      <section className="card review-card"><CardTitle eyebrow="THE REFLECTION" title="Your notes to yourself" description="Reflections are journal-wide, not tied to an account."/>
        {review.reflections.length ? <div className="review-reflections">{review.reflections.map((item) => <article key={item.id}><strong>{shortDate(item.date, true)}</strong>{item.wentWell && <p><b>Went well</b>{item.wentWell}</p>}{item.learned && <p><b>Learned</b>{item.learned}</p>}{item.nextWeek && <p><b>Carry forward</b>{item.nextWeek}</p>}</article>)}</div> : <div className="simple-empty">No reflection saved in this week.</div>}
        <button type="button" className="widget-link review-mindset-link" onClick={onMindset}>Write a reflection in Mindset <ArrowRight size={14}/></button>
      </section>
    </div></div>
    <div><TradeTable trades={review.trades.slice(0, 100)} hidden={hidden} onEdit={onEditTrade} onNew={onNewTrade} onViewAll={onJournal}/>{review.trades.length > 100 && <p className="review-footnote review-trade-limit">Showing 100 of {review.trades.length} trades. Open the journal to see the rest.</p>}</div>
  </div>;
}
