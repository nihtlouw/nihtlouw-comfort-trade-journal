"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BookOpenText, Check, ChevronRight,
  CircleDollarSign, Heart, ListChecks, MoreHorizontal, Pencil, Plus, RefreshCw,
  Search, Sparkles, Target, TrendingUp, Wallet,
} from "lucide-react";
import type { JournalSettings, Trade } from "@/lib/types";
import { compactCurrency, currency, dateFromString, filterTrades, getStats, periodStart, shortDate, todayString, type Period } from "@/lib/format";

export function StatsRow({ trades }: { trades: Trade[] }) {
  const stats = getStats(trades);
  return (
    <div className="stats-grid">
      <div className="card stat-card">
        <div className="stat-top"><span>Net P&amp;L</span><span className="stat-icon mint"><Wallet size={17} /></span></div>
        <strong>{currency(stats.net, stats.net > 0)}</strong>
        <div className="stat-caption"><span className="caption-dot green-dot" />Your total result</div>
      </div>
      <div className="card stat-card">
        <div className="stat-top"><span>Win rate</span><span className="stat-icon lilac"><Target size={17} /></span></div>
        <strong>{stats.winRate}<span className="stat-unit">%</span></strong>
        <div className="stat-caption"><span className="caption-dot purple-dot" />{stats.wins} wins <span className="caption-separator">·</span> {stats.losses} losses</div>
      </div>
      <div className="card stat-card">
        <div className="stat-top"><span>Total trades</span><span className="stat-icon peach"><ListChecks size={17} /></span></div>
        <strong>{stats.count}</strong>
        <div className="stat-caption"><span className="caption-dot peach-dot" />Each one a lesson</div>
      </div>
      <div className="card stat-card">
        <div className="stat-top"><span>Profit factor</span><span className="stat-icon yellow"><TrendingUp size={17} /></span></div>
        <strong>{stats.profitFactor}</strong>
        <div className="stat-caption"><span className="caption-dot yellow-dot" />Gross wins / losses</div>
      </div>
    </div>
  );
}

export function ProgressChart({ allTrades, period, onPeriodChange }: { allTrades: Trade[]; period: Period; onPeriodChange: (period: Period) => void }) {
  const selected = useMemo(() => filterTrades(allTrades, period), [allTrades, period]);
  const stats = getStats(selected);
  const chart = useMemo(() => {
    const start = periodStart(period, allTrades).getTime();
    const end = dateFromString(todayString()).getTime();
    const span = Math.max(end - start, 86400000);
    const byDay = new Map<number, number>();
    selected.forEach((trade) => {
      const day = dateFromString(trade.tradeDate).getTime();
      byDay.set(day, (byDay.get(day) ?? 0) + Number(trade.pnl));
    });
    let running = 0;
    const values: { time: number; value: number }[] = [{ time: start, value: 0 }];
    Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]).forEach(([time, pnl]) => {
      running += pnl;
      values.push({ time, value: running });
    });
    values.push({ time: end, value: running });
    const rawMin = Math.min(0, ...values.map((point) => point.value));
    const rawMax = Math.max(0, ...values.map((point) => point.value));
    const padding = Math.max((rawMax - rawMin) * 0.16, 30);
    const min = rawMin - padding;
    const max = rawMax + padding;
    const x = (time: number) => 4 + ((time - start) / span) * 652;
    const y = (value: number) => 156 - ((value - min) / (max - min)) * 140;
    const points = values.map((point) => ({ x: x(point.time), y: y(point.value) }));
    let line = `M ${points[0].x} ${points[0].y}`;
    points.slice(1).forEach((point, index) => {
      const previous = points[index];
      const middle = (previous.x + point.x) / 2;
      line += ` C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
    });
    const area = `${line} L ${points[points.length - 1].x} 164 L ${points[0].x} 164 Z`;
    const labels = [0, 1, 2, 3].map((index) => max - ((max - min) * index) / 3);
    const dates = [0, 1, 2, 3, 4].map((index) => new Date(start + (span * index) / 4).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }));
    return { line, area, labels, dates, last: points[points.length - 1] };
  }, [allTrades, selected, period]);

  return (
    <section className="card chart-card">
      <div className="card-heading chart-heading">
        <div><div className="heading-with-icon"><span className="heading-icon"><TrendingUp size={16} /></span><h2>Your performance</h2></div><p>Every step forward is worth celebrating.</p></div>
        <div className="period-switch" aria-label="Chart time period">
          {(["1W", "1M", "3M", "ALL"] as Period[]).map((item) => <button type="button" key={item} className={period === item ? "active" : ""} onClick={() => onPeriodChange(item)} aria-pressed={period === item}>{item}</button>)}
        </div>
      </div>
      <div className="chart-summary"><strong>{currency(stats.net, stats.net > 0)}</strong><span><span className="live-dot" /> Net P&amp;L over time</span></div>
      <div className="chart-area" aria-label={`Cumulative profit and loss: ${currency(stats.net)} for this period`}>
        <div className="chart-y-labels">{chart.labels.map((label, index) => <span key={index}>{compactCurrency(label)}</span>)}</div>
        <svg className="equity-chart" viewBox="0 0 660 164" preserveAspectRatio="none" role="img" aria-label="Cumulative P and L chart">
          <defs><linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8cc8a3" stopOpacity=".32"/><stop offset="100%" stopColor="#c4e6cb" stopOpacity=".02"/></linearGradient></defs>
          {[16, 62.7, 109.3, 156].map((y) => <line key={y} x1="0" x2="660" y1={y} y2={y} stroke="#e9eee9" strokeDasharray="4 5" />)}
          <path d={chart.area} fill="url(#equityFill)" />
          <path d={chart.line} fill="none" stroke="#62a77e" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <circle cx={chart.last.x} cy={chart.last.y} r="4.5" fill="#5c9d76" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="chart-dates">{chart.dates.map((date, index) => <span key={index}>{date}</span>)}</div>
    </section>
  );
}

function assetStyle(trade: Trade) {
  if (trade.symbol.startsWith("BTC")) return { glyph: "₿", color: "asset-orange" };
  if (trade.symbol.startsWith("ETH")) return { glyph: "◆", color: "asset-purple" };
  if (trade.symbol.startsWith("EUR")) return { glyph: "€", color: "asset-blue" };
  if (trade.symbol.startsWith("GBP")) return { glyph: "£", color: "asset-rose" };
  if (trade.symbol.startsWith("XAU")) return { glyph: "✦", color: "asset-gold" };
  return { glyph: trade.symbol.charAt(0), color: "asset-green" };
}

export function TradesTable({ trades, all = false, onViewAll, onEdit, onNew }: { trades: Trade[]; all?: boolean; onViewAll?: () => void; onEdit: (trade: Trade) => void; onNew: () => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("All results");
  const filtered = trades.filter((trade) => {
    const search = `${trade.symbol} ${trade.market} ${trade.setup} ${trade.notes}`.toLowerCase().includes(query.toLowerCase());
    const value = Number(trade.pnl);
    return search && (result === "All results" || (result === "Wins" && value > 0) || (result === "Losses" && value < 0) || (result === "Breakeven" && value === 0));
  });
  const visible = all ? filtered : filtered.slice(0, 4);
  return (
    <section className={`card trades-card ${all ? "all-trades-card" : ""}`}>
      <div className="card-heading trades-heading">
        <div><div className="heading-with-icon"><span className="heading-icon"><BookOpenText size={16} /></span><h2>{all ? "All trades" : "Recent trades"}</h2></div><p>{all ? "Your story, one trade at a time." : "The little details make a big difference."}</p></div>
        {!all && <button type="button" className="text-link" onClick={onViewAll}>View journal <ArrowRight size={14} /></button>}
        {all && <span className="trade-count">{filtered.length} {filtered.length === 1 ? "trade" : "trades"}</span>}
      </div>
      {all && <div className="table-toolbar"><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search asset, setup or notes..." /></label><select value={result} onChange={(event) => setResult(event.target.value)} aria-label="Filter trade results"><option>All results</option><option>Wins</option><option>Losses</option><option>Breakeven</option></select></div>}
      <div className="table-scroll"><table className="trade-table"><thead><tr><th>ASSET</th><th>DATE</th><th>DIRECTION</th><th>P&amp;L</th><th>RESULT</th><th aria-label="Actions"></th></tr></thead><tbody>
        {visible.map((trade) => {
          const asset = assetStyle(trade);
          const pnl = Number(trade.pnl);
          return <tr key={trade.id} onClick={() => onEdit(trade)} className="trade-row"><td><div className="asset-cell"><span className={`asset-icon ${asset.color}`}>{asset.glyph}</span><span><strong>{trade.symbol}</strong><small>{trade.market}{trade.isDemo ? " · Sample" : ""}</small></span></div></td><td className="trade-date">{shortDate(trade.tradeDate, all)}</td><td><span className={`direction ${trade.side === "Long" ? "long" : "short"}`}>{trade.side === "Long" ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{trade.side}</span></td><td className={pnl > 0 ? "positive" : pnl < 0 ? "negative" : "neutral"}>{currency(pnl, pnl > 0)}</td><td><span className={`result-pill ${pnl > 0 ? "win" : pnl < 0 ? "loss" : "even"}`}><span />{pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Even"}</span></td><td><button className="row-more" type="button" onClick={(event) => { event.stopPropagation(); onEdit(trade); }} aria-label={`Edit ${trade.symbol} trade`}><MoreHorizontal size={18} /></button></td></tr>;
        })}
      </tbody></table></div>
      {visible.length === 0 && <div className="empty-state"><span className="empty-icon"><BookOpenText size={22} /></span><strong>{query || result !== "All results" ? "No trades found" : "A fresh page, just for you"}</strong><p>{query || result !== "All results" ? "Try a different search or filter." : "Your journey begins with your first journal entry."}</p>{!query && result === "All results" && <button type="button" className="text-link" onClick={onNew}><Plus size={14} /> Log your first trade</button>}</div>}
    </section>
  );
}

const moods = [
  { label: "Calm", emoji: "😌" },
  { label: "Focused", emoji: "🎯" },
  { label: "Anxious", emoji: "😟" },
  { label: "Tired", emoji: "😴" },
];
const moodMessages: Record<string, string> = {
  Calm: "A calm mind is a lovely place to begin.",
  Focused: "You're present and ready. Trust your plan.",
  Anxious: "It's okay to pause. You don't have to trade today.",
  Tired: "Rest is productive, too. Be gentle with yourself.",
};

export function MoodCard({ settings, onMood }: { settings: JournalSettings; onMood: (mood: string) => void }) {
  const currentMood = settings.moodDate === todayString() ? settings.mood : null;
  return <section className="card mood-card">
    <div className="side-card-top"><span className="side-icon pink"><Heart size={15} /></span><span className="side-overline">DAILY CHECK-IN</span><span className="tiny-sparkle">✳</span></div>
    <h2>How are you feeling?</h2><p>Take a moment to check in with yourself.</p>
    <div className="mood-grid">{moods.map((mood) => <button type="button" key={mood.label} className={currentMood === mood.label ? "selected" : ""} onClick={() => onMood(mood.label)} aria-pressed={currentMood === mood.label}><span>{mood.emoji}</span><small>{mood.label}</small></button>)}</div>
    <div className="mood-note"><Heart size={14} fill="#a9c7ad" /> <span>{currentMood ? moodMessages[currentMood] : "All feelings are welcome here."}</span></div>
  </section>;
}

export function GoalCard({ settings, onMark, onUndo, onEdit }: { settings: JournalSettings; onMark: () => void; onUndo: () => void; onEdit: () => void }) {
  const progress = Math.min(settings.goalProgress, settings.goalTarget);
  return <section className="card goal-card">
    <div className="side-card-top"><span className="side-icon green"><Target size={16} /></span><span className="side-overline">WEEKLY INTENTION</span><button className="subtle-icon" type="button" onClick={onEdit} aria-label="Edit intention"><Pencil size={14} /></button></div>
    <h2>One day at a time.</h2><p>A little intention goes a long way.</p>
    <div className="goal-content"><div className="goal-label"><span className="goal-flower">✿</span><strong>{settings.goal}</strong></div><div className="goal-progress-label"><span>Your progress</span><b>{progress} <span>/ {settings.goalTarget} days</span></b></div><div className="progress-track"><div style={{ width: `${progress / settings.goalTarget * 100}%` }} /></div><div className="goal-bottom"><span>{progress >= settings.goalTarget ? "A little win worth celebrating!" : "You're doing wonderfully."}</span>{progress > 0 && <button type="button" onClick={onUndo}>Undo</button>}</div></div>
    <button type="button" className="goal-button" onClick={onMark} disabled={progress >= settings.goalTarget}><Check size={15} /> {progress >= settings.goalTarget ? "Intention complete" : "Mark a mindful day"}</button>
  </section>;
}

export const REMINDERS = [
  "You don't have to win every trade to be a winning trader.",
  "Your worth is not measured by a chart or a single trade.",
  "Slow progress is still progress. Keep going at your own pace.",
  "A thoughtful pause is a powerful trading decision.",
  "Trust the process. You are learning with every step.",
];

export function ReminderCard({ index, onNext }: { index: number; onNext: () => void }) {
  return <section className="reminder-card"><div className="reminder-top"><span><Sparkles size={15} /> A GENTLE REMINDER</span><span className="reminder-flower">✳</span></div><div className="quote-mark">“</div><blockquote>{REMINDERS[index]}</blockquote><div className="reminder-bottom"><span>For wherever you are today.</span><button type="button" onClick={onNext} aria-label="Show another reminder"><RefreshCw size={15} /></button></div></section>;
}

export function MiniInsight({ trades }: { trades: Trade[] }) {
  const stats = getStats(trades);
  return <div className="insight-row"><div className="insight-icon"><CircleDollarSign size={19} /></div><div><strong>Every trade tells a story.</strong><p>You&apos;ve documented {stats.count} {stats.count === 1 ? "trade" : "trades"}. That&apos;s {stats.count} opportunities to grow.</p></div><ChevronRight size={18} /></div>;
}
