import type { Trade } from "@/lib/types";

export type Period = "1W" | "1M" | "3M" | "ALL";

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function dateFromString(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

export function shortDate(value: string, includeYear = false) {
  return dateFromString(value).toLocaleDateString("en-US", {
    month: "short", day: "numeric", ...(includeYear ? { year: "numeric" } : {}), timeZone: "UTC",
  });
}

export function longToday() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

export function currency(value: number, signed = false) {
  const abs = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : signed && value > 0 ? "+" : ""}$${abs}`;
}

export function compactCurrency(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1000) return `${sign}$${(absolute / 1000).toFixed(absolute >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(absolute)}`;
}

export function periodStart(period: Period, allTrades: Trade[]) {
  const today = dateFromString(todayString());
  if (period === "ALL") {
    const oldest = allTrades.reduce((min, trade) => Math.min(min, dateFromString(trade.tradeDate).getTime()), today.getTime());
    return new Date(Math.min(oldest, today.getTime() - 29 * 86400000));
  }
  const days = period === "1W" ? 7 : period === "1M" ? 30 : 90;
  return new Date(today.getTime() - (days - 1) * 86400000);
}

export function filterTrades(allTrades: Trade[], period: Period) {
  const start = periodStart(period, allTrades).getTime();
  const end = dateFromString(todayString()).getTime() + 86400000;
  return allTrades.filter((trade) => {
    const date = dateFromString(trade.tradeDate).getTime();
    return date >= start && date < end;
  });
}

export function getStats(trades: Trade[]) {
  const values = trades.map((trade) => Number(trade.pnl));
  const wins = values.filter((value) => value > 0);
  const losses = values.filter((value) => value < 0);
  const grossWins = wins.reduce((sum, value) => sum + value, 0);
  const grossLosses = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  return {
    net: values.reduce((sum, value) => sum + value, 0),
    wins: wins.length,
    losses: losses.length,
    winRate: wins.length + losses.length ? Math.round(wins.length / (wins.length + losses.length) * 100) : 0,
    count: trades.length,
    profitFactor: grossLosses ? (grossWins / grossLosses).toFixed(2) : grossWins > 0 ? "∞" : "—",
  };
}
