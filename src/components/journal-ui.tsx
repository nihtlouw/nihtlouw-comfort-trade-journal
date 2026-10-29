"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowDownRight, ArrowRight, ArrowUpRight, BookOpenText, CalendarDays,
  ChevronLeft, ChevronRight, CircleHelp, Leaf, MoreHorizontal, Plus, Sparkles, Target, TrendingUp, Wallet,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { JournalSettings, Trade } from "@/lib/types";
import { compactCurrency, currency, getStats, shortDate, todayString, type Period } from "@/lib/format";
import { monthGrid, monthTitle, performanceSeries } from "@/lib/analytics";

export function CardTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="card-title"><div>{eyebrow && <span className="card-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function StatsCards({ trades, hidden }: { trades: Trade[]; hidden: boolean }) {
  const stats = getStats(trades);
  const items = [
    { label: "Net P&L", value: currency(stats.net, stats.net > 0, hidden), icon: Wallet, tint: "sage", note: "Realized, after fees", className: stats.net < 0 ? "loss-text" : "" },
    { label: "Win rate", value: stats.count && stats.wins + stats.losses ? `${stats.winRate}%` : "—", icon: Target, tint: "lavender", note: `${stats.wins} wins · ${stats.losses} losses`, className: "" },
    { label: "Profit factor", value: stats.profitFactor, icon: TrendingUp, tint: "peach", note: "Gross wins / gross losses", className: "" },
    { label: "Trades logged", value: String(stats.count).padStart(2, "0"), icon: BookOpenText, tint: "butter", note: "Every trade is a lesson", className: "" },
  ];
  return <div className="stats-grid">{items.map(({ label, value, icon: Icon, tint, note, className }) => <article className="stat-card card" key={label}>
    <div className="stat-top"><span>{label}</span><span className={`stat-icon ${tint}`}><Icon size={17} strokeWidth={1.8} /></span></div>
    <strong className={className}>{value}</strong><div className="stat-note"><span className={`stat-note-dot ${tint}`} />{note}</div>
  </article>)}</div>;
}

export function PeriodControl({ value, onChange }: { value: Period; onChange: (value: Period) => void }) {
  return <div className="period-control" aria-label="Performance date range">{(["1W", "1M", "3M", "ALL"] as Period[]).map((period) => <button type="button" className={period === value ? "selected" : ""} aria-pressed={period === value} onClick={() => onChange(period)} key={period}>{period === "ALL" ? "All" : period}</button>)}</div>;
}

export function PerformanceChart({ trades, period, onPeriodChange, hidden, compact = false }: { trades: Trade[]; period: Period; onPeriodChange: (period: Period) => void; hidden: boolean; compact?: boolean }) {
  const data = useMemo(() => performanceSeries(trades, period), [trades, period]);
  const stats = getStats(trades);
  const startTime = data[0]?.time || 0; const endTime = data.at(-1)?.time || startTime;
  const ticks = [...new Set(Array.from({ length: 5 }, (_, index) => startTime + Math.round((endTime - startTime) * index / 4 / 86_400_000) * 86_400_000))];
  return <section className={`card performance-card ${compact ? "compact-chart" : ""}`}>
    <CardTitle eyebrow="THE BIGGER PICTURE" title="Your performance" description="Realized P&L over your selected period." action={<PeriodControl value={period} onChange={onPeriodChange} />} />
    <div className="chart-headline"><strong>{currency(stats.net, stats.net > 0, hidden)}</strong><span><i /> Cumulative net P&L</span></div>
    {trades.length ? <div className="chart-wrap" key={period} role="img" aria-label={`Cumulative realized P and L for ${trades.length} trades: ${hidden ? "amount hidden" : currency(stats.net)}. The chart starts at zero for the selected period.`}>
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 6, left: -19, bottom: 0 }}>
        <defs><linearGradient id="pnl-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#81b39a" stopOpacity={0.3}/><stop offset="95%" stopColor="#81b39a" stopOpacity={0.015}/></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
        <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={(value: number) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} axisLine={false} tickLine={false} minTickGap={30} tick={{ fill: "var(--muted)", fontSize: 11 }} dy={10}/>
        <YAxis axisLine={false} tickLine={false} tickFormatter={(value: number) => compactCurrency(value, hidden)} tick={{ fill: "var(--muted)", fontSize: 11 }} width={64} domain={["auto", "auto"]}/>
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const point = payload[0].payload as { date: string; pnl: number; daily: number; trades: number };
          return <div className="chart-tooltip"><strong>{shortDate(point.date, true)}</strong><span>Cumulative {currency(point.pnl, point.pnl > 0, hidden)}</span><small>{point.trades} {point.trades === 1 ? "trade" : "trades"} · {currency(point.daily, point.daily > 0, hidden)} on day</small></div>;
        }} />
        <Area type="stepAfter" dataKey="pnl" stroke="var(--chart-line)" strokeWidth={2.5} fill="url(#pnl-gradient)" activeDot={{ r: 5, fill: "var(--chart-line)", stroke: "#fff", strokeWidth: 3 }} isAnimationActive={false}/>
      </AreaChart></ResponsiveContainer>
    </div> : <div className="chart-empty"><span><TrendingUp size={20}/></span><strong>Your story starts here.</strong><p>Log a trade to see your progress take shape.</p></div>}
    <div className="chart-footer"><span><span className="chart-legend-dot"/> Net realized P&L</span><span>For the selected period <CircleHelp size={13} aria-label="The chart starts from zero for each selected period." /></span></div>
    {trades.length > 0 && <details className="chart-data"><summary>View chart data as a table</summary><p>Most recent 60 dates; the chart starts at zero for this period.</p><div><table><thead><tr><th>Date</th><th>Trades</th><th>Daily net P&L</th><th>Cumulative</th></tr></thead><tbody>{data.slice(-60).map((point) => <tr key={point.date}><td>{shortDate(point.date, true)}</td><td>{point.trades}</td><td>{currency(point.daily, point.daily > 0, hidden)}</td><td>{currency(point.pnl, point.pnl > 0, hidden)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}

const moodOptions = [
  { label: "Calm", emoji: "😌" }, { label: "Focused", emoji: "✦" }, { label: "Anxious", emoji: "☁" }, { label: "Tired", emoji: "☾" },
];
const moodCopy: Record<string, string> = { Calm: "A calm mind is a lovely place to begin.", Focused: "You’re present. Trust the plan you made.", Anxious: "It’s okay to pause. There’s no need to rush.", Tired: "Rest is productive, too. Be gentle with yourself." };
export function MoodCard({ settings, onMood, onOpen }: { settings: JournalSettings; onMood: (mood: string) => void; onOpen?: () => void }) {
  const current = settings.moodDate === todayString() ? settings.mood : null;
  return <section className="card mood-card">
    <div className="widget-top"><span className="widget-icon blush"><span>♡</span></span><span className="widget-overline">YOUR DAILY CHECK-IN</span><Sparkles size={15} className="soft-icon" /></div>
    <h2>How are you feeling?</h2><p>Take a moment to check in with yourself.</p>
    <div className="mood-options">{moodOptions.map((item) => <button type="button" key={item.label} aria-label={item.label} onClick={() => onMood(item.label)} className={current === item.label ? "selected" : ""} aria-pressed={current === item.label}><span>{item.emoji}</span><small>{item.label}</small></button>)}</div>
    <div className="mood-message"><Leaf size={14} /><span>{current ? moodCopy[current] || "All feelings are welcome here." : "All feelings are welcome here."}</span></div>
    {onOpen && <button type="button" className="widget-link" onClick={onOpen}>Explore your mindset <ArrowRight size={14}/></button>}
  </section>;
}

export function GoalCard({ settings, onMark, onOpen }: { settings: JournalSettings; onMark: (id: string) => void; onOpen?: () => void }) {
  const goal = settings.goals?.[0];
  return <section className="card goal-card"><div className="widget-top"><span className="widget-icon green"><Target size={17}/></span><span className="widget-overline">A LITTLE INTENTION</span><Sparkles size={15} className="soft-icon" /></div>
    <h2>One day at a time.</h2><p>Small, intentional steps add up.</p>
    {goal ? <><div className="goal-block"><div className="goal-name"><span>✳</span><strong>{goal.text}</strong></div><div className="goal-progress-label"><span>Your progress</span><b>{goal.progress}<span> / {goal.target} days</span></b></div><div className="progress-track"><span style={{ width: `${Math.min(goal.progress / goal.target * 100, 100)}%` }}/></div></div>
      <button type="button" className="goal-button" disabled={goal.progress >= goal.target || goal.markedDates.includes(todayString())} onClick={() => onMark(goal.id)}><Plus size={15}/>{goal.progress >= goal.target ? "Intention complete" : goal.markedDates.includes(todayString()) ? "Today is marked" : "Mark a mindful day"}</button></>
      : <p className="goal-empty">Set an intention for your next session.</p>}
    {onOpen && <button type="button" className="widget-link" onClick={onOpen}>View all intentions <ArrowRight size={14}/></button>}
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
export function TradeTable({ trades, hidden, onEdit, onNew, onViewAll, compact = false }: { trades: Trade[]; hidden: boolean; onEdit: (trade: Trade) => void; onNew: () => void; onViewAll?: () => void; compact?: boolean }) {
  return <section className="card trades-card"><CardTitle eyebrow={compact ? "YOUR LATEST ENTRIES" : undefined} title={compact ? "Recent trades" : "Trade history"} description={compact ? "Every entry is a step forward." : `${trades.length} ${trades.length === 1 ? "trade" : "trades"} in this view`} action={onViewAll && <button type="button" className="text-link" onClick={onViewAll}>View journal <ArrowRight size={14}/></button>}/>
    <div className="table-scroll"><table className="trade-table"><thead><tr><th>ASSET</th><th>DATE</th><th>SETUP</th><th>DIRECTION</th><th>NET P&L</th><th>RESULT</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {trades.map((trade) => { const pnl = Number(trade.pnl); return <tr className="trade-row" key={trade.id}>
        <td><button type="button" className="asset-cell" onClick={() => onEdit(trade)}><AssetIcon symbol={trade.symbol}/><span><strong>{trade.symbol}</strong><small>{trade.market}{trade.isDemo ? " · Sample" : ""}</small></span></button></td>
        <td className="table-muted">{shortDate(trade.tradeDate, !compact)}</td><td><span className="setup-label">{trade.setup || "—"}</span></td>
        <td><span className={`direction ${trade.side.toLowerCase()}`}>{trade.side === "Long" ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {trade.side}</span></td>
        <td className={`amount-cell ${pnl > 0 ? "positive-text" : pnl < 0 ? "loss-text" : ""}`}>{currency(pnl, pnl > 0, hidden)}</td>
        <td><span className={`result-pill ${pnl > 0 ? "win" : pnl < 0 ? "loss" : "even"}`}><span />{pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Even"}</span></td>
        <td><button type="button" className="row-more" onClick={() => onEdit(trade)} aria-label={`Edit ${trade.symbol} trade`}><MoreHorizontal size={18}/></button></td>
      </tr>; })}
    </tbody></table></div>
    {!trades.length && <div className="empty-state"><span><BookOpenText size={20}/></span><strong>No trades in this view yet.</strong><p>Try another filter, or add your first entry.</p><button type="button" className="text-link" onClick={onNew}><Plus size={14}/> Log a trade</button></div>}
  </section>;
}

export function TradingCalendar({ trades, hidden, onDay, compact = false }: { trades: Trade[]; hidden: boolean; onDay: (date: string) => void; compact?: boolean }) {
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const days = monthGrid(month.year, month.month);
  const byDay = useMemo(() => {
    const map = new Map<string, { pnl: number; count: number }>();
    trades.forEach((trade) => { const item = map.get(trade.tradeDate) ?? { pnl: 0, count: 0 }; item.pnl += Number(trade.pnl); item.count++; map.set(trade.tradeDate, item); });
    return map;
  }, [trades]);
  function shift(amount: number) { const date = new Date(Date.UTC(month.year, month.month + amount, 1)); setMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() }); }
  const monthTrades = trades.filter((trade) => trade.tradeDate.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}`));
  return <section className={`card calendar-card ${compact ? "calendar-compact" : ""}`}>
    <CardTitle eyebrow="ONE DAY AT A TIME" title={compact ? "Trading activity" : "Trading calendar"} description={compact ? "A little look at your journey." : "Select a day to see its trades."} action={<div className="calendar-nav"><button type="button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16}/></button><strong>{monthTitle(month.year, month.month)}</strong><button type="button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16}/></button></div>}/>
    <div className="calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid" key={`${month.year}-${month.month}`}>{days.map((day, index) => { if (!day) return <span className="calendar-blank" key={`blank-${index}`}/>;
      const result = byDay.get(day); const value = result?.pnl ?? 0; const state = result ? value > 0 ? "day-win" : value < 0 ? "day-loss" : "day-even" : "";
      return <button type="button" key={day} className={`calendar-day ${state} ${day === todayString() ? "today" : ""}`} onClick={() => onDay(day)} aria-label={`${shortDate(day, true)}: ${result ? `${result.count} trades, ${hidden ? "amount hidden" : currency(value)}` : "no trades"}`}><span>{Number(day.slice(-2))}</span>{result && <small>{compact ? <i/> : currency(value, value > 0, hidden)}</small>}</button>;
    })}</div>
    <div className="calendar-foot"><span><i className="legend-square win"/> Positive day</span><span><i className="legend-square loss"/> Negative day</span><span className="calendar-count">{monthTrades.length} trades this month</span></div>
  </section>;
}

export function GentleNote({ onOpen }: { onOpen: () => void }) {
  return <div className="gentle-note"><div className="gentle-note-head"><Sparkles size={15}/><span>A GENTLE REMINDER</span></div><div className="quote-mark">“</div><p>You don’t have to win every trade to be a growing trader.</p><button type="button" onClick={onOpen}>Take a mindful moment <ArrowRight size={14}/></button><span className="gentle-flower">✳</span></div>;
}

export function EmptyInsight() { return <div className="empty-insight"><ArrowDownLeft size={17}/><span>More insight appears as you record more trades.</span></div>; }
