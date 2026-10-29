"use client";

import { useState } from "react";
import { ArrowRight, BookOpenText, ChevronLeft, ChevronRight, CircleAlert, ImageDown, ShieldCheck, Sparkles } from "lucide-react";
import { currency, shortDate, todayString } from "@/lib/format";
import { translateAccountName, UI_COPY } from "@/lib/i18n";
import { getWeeklyReview, shiftWeek, weekBounds } from "@/lib/review";
import { getRiskAlerts, type RiskAlert } from "@/lib/risk";
import { DEFAULT_ACCOUNT, type AppLocale, type JournalSettings, type RiskLimits, type Trade, type TradingAccount } from "@/lib/types";
import { CardTitle, StatsCards, TradeTable } from "@/components/journal-ui";

const noLimits: RiskLimits = { perTrade: null, dailyLoss: null };
const limitsEnabled = (limits: RiskLimits) => limits.perTrade !== null || limits.dailyLoss !== null;
const accountName = (accounts: TradingAccount[], id: string, locale: AppLocale) =>
  translateAccountName(accounts.find((account) => account.id === id)?.name ?? "Account", locale);

function RiskAlertLines({ alerts, accounts, hidden, locale }: { alerts: RiskAlert[]; accounts: TradingAccount[]; hidden: boolean; locale: AppLocale }) {
  const copy = UI_COPY[locale];
  return <ul className="risk-alert-list">{alerts.slice(0, 8).map((alert) => <li key={`${alert.kind}-${alert.accountId}-${alert.date}-${alert.kind === "trade" ? alert.tradeId : "day"}`}>
    <CircleAlert size={15} aria-hidden="true"/><div><strong>{alert.kind === "trade" ? copy.initialRiskAlert(alert.symbol) : copy.dailyLossAlert}</strong>
      <span>{shortDate(alert.date, true, locale)} · {accountName(accounts, alert.accountId, locale)}</span>
      <small>{copy.exceedsLimit(currency(alert.amount, false, hidden), currency(alert.limit, false, hidden))}</small></div>
  </li>)}{alerts.length > 8 && <li className="risk-more">{copy.plusMoreReminders(alerts.length - 8)}</li>}</ul>;
}

export function RiskOverview({ trades, settings, hidden, onReview, onSettings }: { trades: Trade[]; settings: JournalSettings; hidden: boolean; onReview: () => void; onSettings: () => void }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const limits = settings.riskLimits ?? noLimits;
  const alerts = getRiskAlerts(trades, limits);
  const todayAlerts = alerts.filter((alert) => alert.date === todayString());
  const missingToday = trades.filter((trade) => !trade.isDemo && trade.tradeDate === todayString() && !(Number(trade.initialRisk) > 0)).length;
  const accounts = settings.accounts ?? [DEFAULT_ACCOUNT];
  return <section className="card risk-overview"><div className="widget-top"><span className="widget-icon green"><ShieldCheck size={18}/></span><span className="widget-overline">{copy.recordedRiskOverline}</span></div>
    <h2>{copy.riskRemindersTitle}</h2>
    {!limitsEnabled(limits) ? <><p>{copy.riskSetPrompt}</p><button type="button" className="widget-link" onClick={onSettings}>{copy.setLimits} <ArrowRight size={14}/></button></> : <>
      <p>{todayAlerts.length ? copy.riskTodayCount(todayAlerts.length) : copy.noLimitBreachesToday}</p>
      {todayAlerts.length > 0 && <RiskAlertLines alerts={todayAlerts} accounts={accounts} hidden={hidden} locale={locale}/>}
      <p className="risk-overview-note">{copy.totalRemindersFilter(alerts.length)}</p>
      {limits.perTrade !== null && missingToday > 0 && <p className="risk-overview-note">{copy.missingRiskToday(missingToday)}</p>}
      {alerts.length > todayAlerts.length && <details className="risk-history"><summary>{copy.recentRecordedReminders}</summary><RiskAlertLines alerts={alerts} accounts={accounts} hidden={hidden} locale={locale}/></details>}
      <button type="button" className="widget-link" onClick={onReview}>{copy.openWeeklyReview} <ArrowRight size={14}/></button>
    </>}
  </section>;
}

export function WeeklyReview({ trades, settings, hidden, onMindset, onSettings, onEditTrade, onNewTrade, onJournal, onPreviewCharts, onOpenRecap }: { trades: Trade[]; settings: JournalSettings; hidden: boolean; onMindset: () => void; onSettings: () => void; onEditTrade: (trade: Trade) => void; onNewTrade: () => void; onJournal: () => void; onPreviewCharts?: (trade: Trade) => void; onOpenRecap?: (weekStart: string) => void }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const [weekStart, setWeekStart] = useState(() => weekBounds().start);
  const review = getWeeklyReview(trades, settings.reflections ?? [], weekStart);
  const limits = settings.riskLimits ?? noLimits;
  const alerts = getRiskAlerts(review.trades, limits);
  const currentStart = weekBounds().start;
  const accounts = settings.accounts ?? [DEFAULT_ACCOUNT];
  return <div className="view-stack weekly-review">
    <section className="review-intro card"><div><span className="card-eyebrow"><Sparkles size={13}/> {copy.reviewEyebrow}</span><h2 aria-live="polite" aria-atomic="true">{shortDate(review.start, true, locale)} – {shortDate(review.end, true, locale)}</h2><p>{copy.reviewSub}</p></div>
      <div className="review-intro-controls">
        {onOpenRecap && <button type="button" className="button-secondary recap-open-btn" onClick={() => onOpenRecap(weekStart)}><ImageDown size={15}/> <span>{copy.recapOpenBtn}</span></button>}
        <div className="review-navigation"><button type="button" className="icon-button" aria-label={copy.prevWeek} onClick={() => setWeekStart(shiftWeek(weekStart, -1))}><ChevronLeft size={19}/></button><button type="button" className="review-today" onClick={() => setWeekStart(currentStart)} disabled={weekStart === currentStart}>{copy.thisWeek}</button><button type="button" className="icon-button" aria-label={copy.nextWeek} onClick={() => setWeekStart(shiftWeek(weekStart, 1))}><ChevronRight size={19}/></button></div>
      </div>
    </section>
    <StatsCards trades={review.trades} hidden={hidden} locale={locale}/>
    <div className="review-grid"><div className="review-column">
      <section className="card review-card"><CardTitle eyebrow={copy.reviewTradesEyebrow} title={copy.setupsThisWeek} description={copy.setupsThisWeekDesc}/>
        {review.setups.length ? <div className="review-setup-list">{review.setups.map((setup) => <div key={setup.name}><span className="review-setup-mark"><BookOpenText size={15}/></span><span><strong>{setup.name === "Not specified" ? copy.notSpecified : setup.name}</strong><small>{copy.setupStatsLine(setup.count, setup.wins, setup.losses)}</small></span><b className={setup.pnl < 0 ? "loss-text" : ""}>{currency(setup.pnl, setup.pnl > 0, hidden)}</b></div>)}</div> : <div className="simple-empty">{copy.noTradesThisWeek}</div>}
      </section>
      <section className="card review-card"><CardTitle eyebrow={copy.reviewContextEyebrow} title={copy.tradeNotesTitle} description={copy.tradeNotesDesc}/>
        {review.tradeNotes.length ? <div className="review-notes">{review.tradeNotes.slice(0, 10).map((trade) => <article key={trade.id}><div><strong>{trade.symbol}</strong><small>{shortDate(trade.tradeDate, true, locale)} · {accountName(accounts, trade.accountId ?? DEFAULT_ACCOUNT.id, locale)}{trade.isDemo ? ` · ${copy.sampleBadge}` : ""}</small></div><p>{trade.notes}</p></article>)}{review.tradeNotes.length > 10 && <p className="review-footnote">{copy.showing10Notes(review.tradeNotes.length)}</p>}</div> : <div className="simple-empty">{copy.noTradeNotesWeek}</div>}
      </section>
    </div><div className="review-column">
      <section className="card review-card risk-review"><CardTitle eyebrow={copy.reviewProcessEyebrow} title={copy.riskInRecordsTitle} description={copy.riskInRecordsDesc}/>
        <div className="risk-coverage"><div><strong>{copy.initialRiskRecorded}</strong><span>{review.riskCount} / {review.trades.length} {copy.colTrades.toLowerCase()}</span></div><div className="progress-track" role="progressbar" aria-label={copy.initialRiskRecorded} aria-valuemin={0} aria-valuemax={review.trades.length || 1} aria-valuenow={review.riskCount}><span style={{ width: `${review.trades.length ? review.riskCount / review.trades.length * 100 : 0}%` }}/></div></div>
        <div className="risk-metrics"><div><small>{copy.avgInitialRiskUpper}</small><strong>{review.averageRisk === null ? "—" : currency(review.averageRisk, false, hidden)}</strong></div><div><small>{copy.avgRUpper}</small><strong>{review.stats.avgR === null ? "—" : `${review.stats.avgR.toFixed(2)}R`}</strong></div></div>
        <p className="review-footnote">{copy.riskCoverageFootnote(review.trades.length - review.riskCount)}</p>
        <div className="risk-limit-heading"><strong>{copy.limitRemindersHeading}</strong><button type="button" onClick={onSettings}>{copy.editLimits}</button></div>
        {!limitsEnabled(limits) ? <p className="review-footnote">{copy.noLimitsSetNote}</p> : alerts.length ? <RiskAlertLines alerts={alerts} accounts={accounts} hidden={hidden} locale={locale}/> : <p className="review-footnote">{copy.noBreachesWeekNote}</p>}
        <p className="review-footnote">{copy.dailyLossFootnote}</p>
      </section>
      <section className="card review-card"><CardTitle eyebrow={copy.reviewReflectionEyebrow} title={copy.yourNotesTitle} description={copy.yourNotesDesc}/>
        {review.reflections.length ? <div className="review-reflections">{review.reflections.map((item) => <article key={item.id}><strong>{shortDate(item.date, true, locale)}</strong>{item.wentWell && <p><b>{copy.wentWellLabel}</b>{item.wentWell}</p>}{item.learned && <p><b>{copy.learnedLabel}</b>{item.learned}</p>}{item.nextWeek && <p><b>{copy.carryForwardLabel}</b>{item.nextWeek}</p>}</article>)}</div> : <div className="simple-empty">{copy.noReflectionWeek}</div>}
        <button type="button" className="widget-link review-mindset-link" onClick={onMindset}>{copy.writeReflectionLink} <ArrowRight size={14}/></button>
      </section>
    </div></div>
    <div><TradeTable trades={review.trades.slice(0, 100)} hidden={hidden} onEdit={onEditTrade} onNew={onNewTrade} onViewAll={onJournal} onPreviewCharts={onPreviewCharts} locale={locale}/>{review.trades.length > 100 && <p className="review-footnote review-trade-limit">{copy.showing100Trades(review.trades.length)}</p>}</div>
  </div>;
}
