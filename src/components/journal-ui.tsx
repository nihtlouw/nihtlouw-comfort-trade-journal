"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BookOpenText,
  ChevronLeft, ChevronRight, Leaf, Pencil, Plus, Sparkles, Target, TrendingUp, Wallet,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppLocale, JournalSettings, Trade } from "@/lib/types";
import {
  compactCurrency,
  currency,
  getStats,
  shortDate,
  todayString,
  type AccountBalanceSummary,
  type Period,
} from "@/lib/format";
import { monthGrid, monthTitle, performanceSeries } from "@/lib/analytics";
import { translateMarket, translateMood, translateSide, UI_COPY } from "@/lib/i18n";

export function CardTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="card-title"><div>{eyebrow && <span className="card-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function AccountBalanceCard({
  summary,
  hidden,
  locale = "en",
  onOpenAccounts,
}: {
  summary: AccountBalanceSummary;
  hidden: boolean;
  locale?: AppLocale;
  onOpenAccounts: () => void;
}) {
  const copy = UI_COPY[locale];

  if (summary.currentBalance === null || summary.startingBalance === null) {
    return (
      <section className="card balance-banner balance-unset">
        <div className="balance-unset-copy">
          <span className="stat-icon sage">
            <Wallet size={17} strokeWidth={1.8} />
          </span>
          <div>
            <span className="card-eyebrow">{copy.balanceEyebrow}</span>
            <strong>{copy.balanceTitle}</strong>
            <p>{copy.balanceUnsetNote}</p>
          </div>
        </div>
        <button type="button" className="button-secondary" onClick={onOpenAccounts}>
          {copy.balanceSetAction} <ArrowRight size={14} />
        </button>
      </section>
    );
  }

  const returnDisplay =
    summary.returnPct === null
      ? "—"
      : hidden
        ? "••••"
        : `${summary.returnPct < 0 ? "−" : summary.returnPct > 0 ? "+" : ""}${Math.abs(summary.returnPct).toFixed(2)}%`;

  const footnote =
    summary.totalAccounts > 1
      ? copy.balanceFootnoteMulti(summary.configuredCount, summary.totalAccounts)
      : copy.balanceFootnoteSingle;

  return (
    <section className="card balance-banner">
      <div className="balance-head">
        <div>
          <span className="card-eyebrow">{copy.balanceEyebrow}</span>
          <h2>
            {copy.balanceTitle}
            {summary.accountName ? <span> · {summary.accountName}</span> : null}
          </h2>
        </div>
        <button type="button" className="text-link" onClick={onOpenAccounts}>
          {copy.balanceManageAction} <ArrowRight size={14} />
        </button>
      </div>

      <div className="balance-metrics">
        <div className="balance-primary">
          <strong className={summary.currentBalance < 0 ? "loss-text" : ""}>
            {currency(summary.currentBalance, false, hidden)}
          </strong>
          <small>{footnote}</small>
        </div>
        <div className="balance-breakdown">
          <div>
            <small>{copy.balanceStartingLabel}</small>
            <strong>{currency(summary.startingBalance, false, hidden)}</strong>
          </div>
          <div>
            <small>{copy.balanceRealizedLabel}</small>
            <strong className={summary.realizedNet < 0 ? "loss-text" : summary.realizedNet > 0 ? "positive-text" : ""}>
              {currency(summary.realizedNet, summary.realizedNet > 0, hidden)}
            </strong>
          </div>
          <div>
            <small>{copy.balanceReturnLabel}</small>
            <strong className={summary.returnPct !== null && summary.returnPct < 0 ? "loss-text" : summary.returnPct !== null && summary.returnPct > 0 ? "positive-text" : ""}>
              {returnDisplay}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

export function StatsCards({ trades, hidden, locale = "en" }: { trades: Trade[]; hidden: boolean; locale?: AppLocale }) {
  const copy = UI_COPY[locale];
  const stats = getStats(trades);
  const items = [
    { label: copy.statNetPnl, value: currency(stats.net, stats.net > 0, hidden), icon: Wallet, tint: "sage", note: copy.statNetNote, className: stats.net < 0 ? "loss-text" : "" },
    { label: copy.statWinRate, value: stats.count && stats.wins + stats.losses ? `${stats.winRate}%` : "—", icon: Target, tint: "lavender", note: copy.statWinLossNote(stats.wins, stats.losses), className: "" },
    { label: copy.statProfitFactor, value: stats.profitFactor, icon: TrendingUp, tint: "peach", note: copy.statPfNote, className: "" },
    { label: copy.statTradesLogged, value: String(stats.count), icon: BookOpenText, tint: "butter", note: copy.statTradesNote, className: "" },
  ];
  return <div className="stats-grid">{items.map(({ label, value, icon: Icon, tint, note, className }) => <article className="stat-card card" key={label}>
    <div className="stat-top"><span>{label}</span><span className={`stat-icon ${tint}`}><Icon size={17} strokeWidth={1.8} /></span></div>
    <strong className={className}>{value}</strong><div className="stat-note"><span className={`stat-note-dot ${tint}`} />{note}</div>
  </article>)}</div>;
}

export function PeriodControl({ value, onChange, locale = "en" }: { value: Period; onChange: (value: Period) => void; locale?: AppLocale }) {
  const copy = UI_COPY[locale];
  return <div className="period-control" aria-label={copy.periodRangeAria}>{(["1W", "1M", "3M", "ALL"] as Period[]).map((period) => <button type="button" className={period === value ? "selected" : ""} aria-pressed={period === value} onClick={() => onChange(period)} key={period}>{period === "ALL" ? copy.periodAllShort : period}</button>)}</div>;
}

export function PerformanceChart({ trades, period, onPeriodChange, hidden, compact = false, locale = "en" }: { trades: Trade[]; period: Period; onPeriodChange: (period: Period) => void; hidden: boolean; compact?: boolean; locale?: AppLocale }) {
  const copy = UI_COPY[locale];
  const data = useMemo(() => performanceSeries(trades, period), [trades, period]);
  const stats = getStats(trades);
  const startTime = data[0]?.time || 0; const endTime = data.at(-1)?.time || startTime;
  const ticks = [...new Set(Array.from({ length: 5 }, (_, index) => startTime + Math.round((endTime - startTime) * index / 4 / 86_400_000) * 86_400_000))];
  const intlTag = locale === "id" ? "id-ID" : "en-US";
  return <section className={`card performance-card ${compact ? "compact-chart" : ""}`}>
    <CardTitle title={copy.perfTitle} description={copy.perfDesc} action={<PeriodControl value={period} onChange={onPeriodChange} locale={locale} />} />
    <div className="chart-headline"><strong>{currency(stats.net, stats.net > 0, hidden)}</strong><span><i /> {copy.cumNetPnl}</span></div>
    {trades.length ? <div className="chart-wrap" key={period} role="img" aria-label={`Cumulative realized P and L for ${trades.length} trades: ${hidden ? "amount hidden" : currency(stats.net)}. The chart starts at zero for the selected period.`}>
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 6, left: -19, bottom: 0 }}>
        <defs><linearGradient id="pnl-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.3}/><stop offset="95%" stopColor="var(--chart-line)" stopOpacity={0.015}/></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
        <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={(value: number) => new Date(value).toLocaleDateString(intlTag, { month: "short", day: "numeric", timeZone: "UTC" })} axisLine={false} tickLine={false} minTickGap={30} tick={{ fill: "var(--muted)", fontSize: 11 }} dy={10}/>
        <YAxis axisLine={false} tickLine={false} tickFormatter={(value: number) => compactCurrency(value, hidden)} tick={{ fill: "var(--muted)", fontSize: 11 }} width={64} domain={["auto", "auto"]}/>
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const point = payload[0].payload as { date: string; pnl: number; daily: number; trades: number };
          return <div className="chart-tooltip"><strong>{shortDate(point.date, true, locale)}</strong><span>{copy.tooltipCumulative} {currency(point.pnl, point.pnl > 0, hidden)}</span><small>{copy.tooltipOnDay(point.trades, currency(point.daily, point.daily > 0, hidden))}</small></div>;
        }} />
        <Area type="stepAfter" dataKey="pnl" stroke="var(--chart-line)" strokeWidth={2.5} fill="url(#pnl-gradient)" activeDot={{ r: 5, fill: "var(--chart-line)", stroke: "var(--surface)", strokeWidth: 3 }} isAnimationActive={false}/>
      </AreaChart></ResponsiveContainer>
    </div> : <div className="chart-empty"><span><TrendingUp size={20}/></span><strong>{copy.noChartTitle}</strong><p>{copy.noChartBody}</p></div>}
    {trades.length > 0 && <details className="chart-data"><summary>{copy.viewChartTable}</summary><p>{copy.chartTableNote}</p><div><table><thead><tr><th>{copy.colDate}</th><th>{copy.colTrades}</th><th>{copy.colDailyPnl}</th><th>{copy.colCumulative}</th></tr></thead><tbody>{data.slice(-60).map((point) => <tr key={point.date}><td>{shortDate(point.date, true, locale)}</td><td>{point.trades}</td><td>{currency(point.daily, point.daily > 0, hidden)}</td><td>{currency(point.pnl, point.pnl > 0, hidden)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}

const moodOptions = [
  { label: "Calm", emoji: "😌" }, { label: "Focused", emoji: "✦" }, { label: "Anxious", emoji: "☁" }, { label: "Tired", emoji: "☾" },
];
export function MoodCard({ settings, onMood, onOpen, locale }: { settings: JournalSettings; onMood: (mood: string) => void; onOpen?: () => void; locale?: AppLocale }) {
  const lang = locale ?? settings.locale ?? "en";
  const copy = UI_COPY[lang];
  const current = settings.moodDate === todayString() ? settings.mood : null;
  return <section className="card mood-card">
    <div className="widget-top"><span className="widget-icon blush"><span>♡</span></span><span className="widget-overline">{copy.dailyCheckinOverline}</span><Sparkles size={15} className="soft-icon" /></div>
    <h2>{copy.howFeelingTitle}</h2><p>{copy.howFeelingDesc}</p>
    <div className="mood-options">{moodOptions.map((item) => {
      const displayMood = translateMood(item.label, lang);
      return <button type="button" key={item.label} aria-label={displayMood} onClick={() => onMood(item.label)} className={current === item.label ? "selected" : ""} aria-pressed={current === item.label}><span>{item.emoji}</span><small>{displayMood}</small></button>;
    })}</div>
    <div className="mood-message"><Leaf size={14} /><span>{current ? `${copy.todayMoodPrefix} ${translateMood(current, lang)}` : copy.noMoodToday}</span></div>
    {onOpen && <button type="button" className="widget-link" onClick={onOpen}>{copy.viewCheckins} <ArrowRight size={14}/></button>}
  </section>;
}

export function GoalCard({ settings, onMark, onOpen, locale }: { settings: JournalSettings; onMark: (id: string) => void; onOpen?: () => void; locale?: AppLocale }) {
  const lang = locale ?? settings.locale ?? "en";
  const copy = UI_COPY[lang];
  const goal = settings.goals?.[0];
  return <section className="card goal-card"><div className="widget-top"><span className="widget-icon green"><Target size={17}/></span><span className="widget-overline">{copy.dailyHabitOverline}</span><Sparkles size={15} className="soft-icon" /></div>
    <h2>{copy.intentionsTitle}</h2><p>{copy.intentionsDesc}</p>
    {goal ? <><div className="goal-block"><div className="goal-name"><span>✳</span><strong id="overview-goal-name">{goal.text}</strong></div><div className="goal-progress-label"><span>{copy.daysCompleted}</span><b>{goal.progress}<span> / {goal.target} {copy.daysUnit}</span></b></div><div className="progress-track"><span style={{ width: `${Math.min(goal.progress / goal.target * 100, 100)}%` }}/></div></div>
      <button type="button" className="goal-button" aria-describedby="overview-goal-name" disabled={goal.progress >= goal.target || goal.markedDates.includes(todayString())} onClick={() => onMark(goal.id)}><Plus size={15}/>{goal.progress >= goal.target ? copy.intentionComplete : goal.markedDates.includes(todayString()) ? copy.todayMarked : copy.markToday}</button></>
      : <p className="goal-empty">{copy.noIntentionsYet}</p>}
    {onOpen && <button type="button" className="widget-link" onClick={onOpen}>{copy.viewAllIntentions} <ArrowRight size={14}/></button>}
  </section>;
}

function symbolColor(symbol: string) {
  const colors = ["asset-sage", "asset-lilac", "asset-peach", "asset-blue", "asset-gold"];
  return colors[Array.from(symbol).reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length];
}
export function AssetIcon({ symbol }: { symbol: string }) {
  const icon = symbol.startsWith("BTC") ? "₿" : symbol.startsWith("ETH") ? "◆" : symbol.startsWith("EUR") ? "€" : symbol.startsWith("GBP") ? "£" : symbol.startsWith("XAU") ? "✦" : symbol.slice(0, 1);
  return <span className={`asset-icon ${symbolColor(symbol)}`}>{icon}</span>;
}
export function TradeTable({ trades, hidden, onEdit, onNew, onViewAll, compact = false, locale = "en" }: { trades: Trade[]; hidden: boolean; onEdit: (trade: Trade) => void; onNew: () => void; onViewAll?: () => void; compact?: boolean; locale?: AppLocale }) {
  const copy = UI_COPY[locale];
  return <section className="card trades-card"><CardTitle title={compact ? copy.recentTrades : copy.tradeHistory} description={compact ? copy.recentTradesDesc : copy.tradesInView(trades.length)} action={onViewAll && <button type="button" className="text-link" onClick={onViewAll}>{copy.viewJournal} <ArrowRight size={14}/></button>}/>
    <div className="table-scroll"><table className="trade-table" role="table"><thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">{copy.colAsset}</th><th scope="col" role="columnheader">{copy.colDate}</th><th scope="col" role="columnheader">{copy.colSetup}</th><th scope="col" role="columnheader">{copy.colDirection}</th><th scope="col" role="columnheader">{copy.colNetPnl}</th><th scope="col" role="columnheader">{copy.colResult}</th><th scope="col" role="columnheader"><span className="sr-only">{copy.colActions}</span></th></tr></thead><tbody role="rowgroup">
      {trades.map((trade) => { const pnl = Number(trade.pnl); return <tr className="trade-row" role="row" key={trade.id}>
        <th scope="row" role="rowheader" className="trade-asset"><div className="asset-cell"><AssetIcon symbol={trade.symbol}/><span><strong>{trade.symbol}</strong><small>{translateMarket(trade.market, locale)}{trade.isDemo ? ` · ${copy.sampleBadge}` : ""}</small></span></div></th>
        <td role="cell" className="trade-date table-muted" data-label={copy.colDate}>{shortDate(trade.tradeDate, !compact, locale)}</td><td role="cell" className="trade-setup" data-label={copy.colSetup}><span className="setup-label">{trade.setup || "—"}</span></td>
        <td role="cell" className="trade-direction" data-label={copy.colDirection}><span className={`direction ${trade.side.toLowerCase()}`}>{trade.side === "Long" ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {translateSide(trade.side, locale)}</span></td>
        <td role="cell" data-label={copy.colNetPnl} className={`amount-cell ${pnl > 0 ? "positive-text" : pnl < 0 ? "loss-text" : ""}`}>{currency(pnl, pnl > 0, hidden)}</td>
        <td role="cell" className="trade-result" data-label={copy.colResult}><span className={`result-pill ${pnl > 0 ? "win" : pnl < 0 ? "loss" : "even"}`}><span />{pnl > 0 ? copy.win : pnl < 0 ? copy.loss : copy.breakeven}</span></td>
        <td role="cell" className="trade-action"><button type="button" className="row-more" onClick={() => onEdit(trade)} aria-label={copy.editTradeAria(trade.symbol)}><Pencil size={14}/><span>{copy.edit}</span></button></td>
      </tr>; })}
    </tbody></table></div>
    {!trades.length && <div className="empty-state"><span><BookOpenText size={20}/></span><strong>{copy.noTradesTitle}</strong><p>{copy.noTradesBody}</p><button type="button" className="text-link" onClick={onNew}><Plus size={14}/> {copy.logATrade}</button></div>}
  </section>;
}

export function TradingCalendar({ trades, hidden, onDay, compact = false, locale = "en" }: { trades: Trade[]; hidden: boolean; onDay: (date: string) => void; compact?: boolean; locale?: AppLocale }) {
  const copy = UI_COPY[locale];
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth(), direction: 0 });
  const days = monthGrid(month.year, month.month);
  const byDay = useMemo(() => {
    const map = new Map<string, { pnl: number; count: number }>();
    trades.forEach((trade) => { const item = map.get(trade.tradeDate) ?? { pnl: 0, count: 0 }; item.pnl += Number(trade.pnl); item.count++; map.set(trade.tradeDate, item); });
    return map;
  }, [trades]);
  function shift(amount: number) {
    setMonth((current) => {
      const date = new Date(Date.UTC(current.year, current.month + amount, 1));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth(), direction: amount };
    });
  }
  const monthTrades = trades.filter((trade) => trade.tradeDate.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}`));
  return <section className={`card calendar-card ${compact ? "calendar-compact" : ""}`}>
    <CardTitle title={compact ? copy.tradingActivity : copy.monthlyActivity} description={copy.selectDayDesc} action={<div className="calendar-nav"><button type="button" onClick={() => shift(-1)} aria-label={copy.prevMonth}><ChevronLeft size={16}/></button><strong aria-live="polite" aria-atomic="true">{monthTitle(month.year, month.month, locale)}</strong><button type="button" onClick={() => shift(1)} aria-label={copy.nextMonth}><ChevronRight size={16}/></button></div>}/>
    <p className="calendar-mobile-hint">{hidden ? copy.calMobileHintHidden : copy.calMobileHintVisible}</p>
    <div className="calendar-weekdays">{copy.weekdays.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid" data-direction={month.direction < 0 ? "previous" : month.direction > 0 ? "next" : "initial"} key={`${month.year}-${month.month}`}>{days.map((day, index) => { if (!day) return <span className="calendar-blank" key={`blank-${index}`}/>;
      const result = byDay.get(day); const value = result?.pnl ?? 0; const state = result ? value > 0 ? "day-win" : value < 0 ? "day-loss" : "day-even" : "";
      const dayLabel = locale === "id"
        ? `${shortDate(day, true, locale)}: ${result ? `${result.count} trade, ${hidden ? "nominal disembunyikan" : currency(value)}` : "tidak ada trade"}`
        : `${shortDate(day, true, locale)}: ${result ? `${result.count} ${result.count === 1 ? "trade" : "trades"}, ${hidden ? "amount hidden" : currency(value)}` : "no trades"}`;
      return <button type="button" key={day} className={`calendar-day ${state} ${day === todayString() ? "today" : ""}`} onClick={() => onDay(day)} aria-label={dayLabel}><span>{Number(day.slice(-2))}</span>{result && <small><span className="calendar-value-full">{compact ? "" : currency(value, value > 0, hidden)}</span><span className="calendar-value-marker" aria-hidden="true">{value > 0 ? "+" : value < 0 ? "−" : "="}</span></small>}</button>;
    })}</div>
    <div className="calendar-foot"><span><i className="legend-square win"/> {copy.profitLegend}</span><span><i className="legend-square loss"/> {copy.lossLegend}</span><span><i className="legend-square even"/> {copy.breakevenLegend}</span><span className="calendar-count">{copy.tradesThisMonth(monthTrades.length)}</span></div>
  </section>;
}
