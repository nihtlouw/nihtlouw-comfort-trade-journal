import type { Trade } from "@/lib/types";
import { dateFromString, periodStart, shortDate, todayString, type Period } from "@/lib/format";

export type ChartPoint = { date: string; time: number; label: string; pnl: number; daily: number; trades: number; drawdown: number };

/** Daily realized P&L, rebased to zero for the selected period. */
export function performanceSeries(trades: Trade[], period: Period): ChartPoint[] {
  const totals = new Map<string, { daily: number; trades: number }>();
  for (const trade of trades) {
    const item = totals.get(trade.tradeDate) ?? { daily: 0, trades: 0 };
    item.daily += Number(trade.pnl); item.trades++;
    totals.set(trade.tradeDate, item);
  }
  const start = periodStart(period, trades).toISOString().slice(0, 10);
  const end = todayString();
  const dates = Array.from(new Set([start, ...totals.keys(), end])).filter((day) => day >= start && day <= end).sort();
  let pnl = 0; let peak = 0;
  return dates.map((day) => {
    const daily = totals.get(day)?.daily ?? 0;
    pnl += daily; peak = Math.max(peak, pnl);
    return { date: day, time: dateFromString(day).getTime(), label: shortDate(day), pnl, daily, trades: totals.get(day)?.trades ?? 0, drawdown: pnl - peak };
  });
}

/** Trade-by-trade peak-to-trough decline in realized P&L, starting at zero. */
export function maxRealizedDrawdown(trades: Trade[]) {
  let cumulative = 0; let peak = 0; let maxDrawdown = 0;
  for (const trade of [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id)) {
    cumulative += Number(trade.pnl);
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  return maxDrawdown;
}

export function groupTrades(trades: Trade[], key: (trade: Trade) => string) {
  const groups = new Map<string, Trade[]>();
  trades.forEach((trade) => { const value = key(trade) || "Not specified"; const existing = groups.get(value); if (existing) existing.push(trade); else groups.set(value, [trade]); });
  return [...groups.entries()].map(([name, rows]) => ({
    name, count: rows.length, pnl: rows.reduce((sum, trade) => sum + Number(trade.pnl), 0),
    wins: rows.filter((trade) => Number(trade.pnl) > 0).length,
    losses: rows.filter((trade) => Number(trade.pnl) < 0).length,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > count ? null : `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}
export function monthTitle(year: number, month: number) {
  return dateFromString(`${year}-${String(month + 1).padStart(2, "0")}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Previous equal-length calendar period; ALL has no meaningful comparison. */
export function previousPeriodTrades(trades: Trade[], period: Period) {
  if (period === "ALL") return [];
  const days = period === "1W" ? 7 : period === "1M" ? 30 : 90;
  const currentStart = periodStart(period, trades).getTime();
  const previousStart = currentStart - days * 86_400_000;
  return trades.filter((trade) => { const time = dateFromString(trade.tradeDate).getTime(); return time >= previousStart && time < currentStart; });
}
