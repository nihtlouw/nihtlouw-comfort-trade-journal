import { DEFAULT_ACCOUNT, type RiskLimits, type Trade } from "@/lib/types";

export type RiskAlert =
  | { kind: "trade"; date: string; accountId: string; tradeId: number; symbol: string; amount: number; limit: number }
  | { kind: "daily"; date: string; accountId: string; amount: number; limit: number };

/** Post-trade reminders only. Daily realized net loss is calculated per account and date;
 * gains offset losses, and samples are never treated as real trades. */
export function getRiskAlerts(trades: Trade[], limits: RiskLimits): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const days = new Map<string, { date: string; accountId: string; netCents: bigint }>();
  for (const trade of trades) {
    if (trade.isDemo) continue;
    const accountId = trade.accountId ?? DEFAULT_ACCOUNT.id;
    const risk = Number(trade.initialRisk);
    if (limits.perTrade !== null && Number.isFinite(risk) && risk > limits.perTrade) {
      alerts.push({ kind: "trade", date: trade.tradeDate, accountId, tradeId: trade.id, symbol: trade.symbol, amount: risk, limit: limits.perTrade });
    }
    const pnl = Number(trade.pnl);
    if (limits.dailyLoss !== null && trade.pnl.trim() !== "" && Number.isFinite(pnl)) {
      const key = `${accountId}\u0000${trade.tradeDate}`;
      const day = days.get(key) ?? { date: trade.tradeDate, accountId, netCents: BigInt(0) };
      day.netCents += BigInt(Math.round(Math.abs(pnl) * 100) * Math.sign(pnl));
      days.set(key, day);
    }
  }
  if (limits.dailyLoss !== null) {
    for (const day of days.values()) {
      if (-day.netCents > BigInt(Math.round(limits.dailyLoss * 100))) alerts.push({ kind: "daily", date: day.date, accountId: day.accountId, amount: Number(-day.netCents) / 100, limit: limits.dailyLoss });
    }
  }
  return alerts.sort((a, b) => b.date.localeCompare(a.date) || a.accountId.localeCompare(b.accountId) || a.kind.localeCompare(b.kind));
}

/** Check the current draft without double-counting the trade being edited. */
export function getDraftRiskAlerts(trades: Trade[], draft: Trade, limits: RiskLimits, editingId?: number) {
  if (draft.isDemo) return [];
  return getRiskAlerts([...trades.filter((trade) => trade.id !== editingId), draft], limits).filter((alert) =>
    alert.kind === "trade" ? alert.tradeId === draft.id : alert.date === draft.tradeDate && alert.accountId === (draft.accountId ?? DEFAULT_ACCOUNT.id),
  );
}
