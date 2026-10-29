import { DEFAULT_ACCOUNT, type AppLocale, type Trade, type TradingAccount } from "@/lib/types";

export type Period = "1W" | "1M" | "3M" | "ALL";
const intlTag = (locale: AppLocale) => (locale === "id" ? "id-ID" : "en-US");

/** Date-only records use the trader's local calendar day, not UTC midnight. */
export function todayString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateFromString(value: string) { return new Date(`${value}T12:00:00Z`); }
export function shortDate(value: string, includeYear = false, locale: AppLocale = "en") {
  return dateFromString(value).toLocaleDateString(intlTag(locale), { month: "short", day: "numeric", ...(includeYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}
export function longToday(locale: AppLocale = "en") {
  return new Date().toLocaleDateString(intlTag(locale), { weekday: "long", month: "long", day: "numeric" });
}
export function currency(value: number, signed = false, hidden = false) {
  if (hidden) return "••••••";
  const abs = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}$${abs}`;
}
export function compactCurrency(value: number, hidden = false) {
  if (hidden) return "•••";
  const sign = value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1000) return `${sign}$${(absolute / 1000).toFixed(absolute >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(absolute)}`;
}
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function tradeRMultiple(trade: Trade): number | null {
  const risk = Number(trade.initialRisk);
  if (!Number.isFinite(risk) || risk <= 0) return null;
  const pnl = Number(trade.pnl);
  return Number.isFinite(pnl) ? pnl / risk : null;
}
export function formatRMultiple(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value).toFixed(2);
  return `${value < 0 ? "−" : value > 0 ? "+" : ""}${abs}R`;
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
  return allTrades.filter((trade) => { const date = dateFromString(trade.tradeDate).getTime(); return date >= start && date < end; });
}
export function getStats(trades: Trade[]) {
  const values = trades.map((trade) => Number(trade.pnl));
  const wins = values.filter((value) => value > 0);
  const losses = values.filter((value) => value < 0);
  const grossWins = wins.reduce((sum, value) => sum + value, 0);
  const grossLosses = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const riskTrades = trades.filter((trade) => Number(trade.initialRisk) > 0);
  const avgR = riskTrades.length ? riskTrades.reduce((sum, trade) => sum + Number(trade.pnl) / Number(trade.initialRisk), 0) / riskTrades.length : null;
  return {
    net: values.reduce((sum, value) => sum + value, 0), wins: wins.length, losses: losses.length,
    breakeven: values.length - wins.length - losses.length,
    winRate: wins.length + losses.length ? Math.round(wins.length / (wins.length + losses.length) * 100) : 0,
    count: trades.length,
    profitFactor: grossLosses ? (grossWins / grossLosses).toFixed(2) : grossWins > 0 ? "∞" : "—",
    avgWin: wins.length ? grossWins / wins.length : null, avgLoss: losses.length ? -grossLosses / losses.length : null,
    expectancy: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    avgR, riskCount: riskTrades.length,
  };
}

export type AccountBalanceSummary = {
  accountName: string | null;
  configuredCount: number;
  totalAccounts: number;
  startingBalance: number | null;
  realizedNet: number;
  currentBalance: number | null;
  returnPct: number | null;
  realTradeCount: number;
};

/**
 * Computes realized account balance using real trades only (`!trade.isDemo`),
 * so sample trades never distort actual account capital.
 */
export function getAccountBalanceSummary(
  allTrades: Trade[],
  accounts: TradingAccount[],
  accountFilter: string,
): AccountBalanceSummary {
  const list = accounts.length ? accounts : [DEFAULT_ACCOUNT];
  const realTrades = allTrades.filter((trade) => !trade.isDemo);

  if (accountFilter !== "all") {
    const selected = list.find((item) => item.id === accountFilter) ?? list[0];
    const scopedTrades = realTrades.filter((trade) => (trade.accountId ?? DEFAULT_ACCOUNT.id) === selected.id);
    const realizedNet = scopedTrades.reduce((sum, trade) => sum + Number(trade.pnl), 0);
    const startingBalance = selected.startingBalance ?? null;
    const currentBalance = startingBalance !== null ? startingBalance + realizedNet : null;
    const returnPct = startingBalance !== null && startingBalance > 0 ? (realizedNet / startingBalance) * 100 : null;
    return {
      accountName: selected.name,
      configuredCount: startingBalance !== null ? 1 : 0,
      totalAccounts: 1,
      startingBalance,
      realizedNet,
      currentBalance,
      returnPct,
      realTradeCount: scopedTrades.length,
    };
  }

  const configured = list.filter((item) => item.startingBalance !== null && item.startingBalance !== undefined);
  if (!configured.length) {
    const realizedNet = realTrades.reduce((sum, trade) => sum + Number(trade.pnl), 0);
    return {
      accountName: null,
      configuredCount: 0,
      totalAccounts: list.length,
      startingBalance: null,
      realizedNet,
      currentBalance: null,
      returnPct: null,
      realTradeCount: realTrades.length,
    };
  }

  const configuredIds = new Set(configured.map((item) => item.id));
  const scopedTrades = realTrades.filter((trade) => configuredIds.has(trade.accountId ?? DEFAULT_ACCOUNT.id));
  const startingBalance = configured.reduce((sum, item) => sum + (item.startingBalance ?? 0), 0);
  const realizedNet = scopedTrades.reduce((sum, trade) => sum + Number(trade.pnl), 0);
  const currentBalance = startingBalance + realizedNet;
  const returnPct = startingBalance > 0 ? (realizedNet / startingBalance) * 100 : null;
  return {
    accountName: configured.length === 1 && list.length === 1 ? configured[0].name : null,
    configuredCount: configured.length,
    totalAccounts: list.length,
    startingBalance,
    realizedNet,
    currentBalance,
    returnPct,
    realTradeCount: scopedTrades.length,
  };
}
