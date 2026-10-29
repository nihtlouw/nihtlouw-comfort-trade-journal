import { dateFromString, getStats, todayString } from "@/lib/format";
import { groupTrades } from "@/lib/analytics";
import type { Trade, WeeklyReflection } from "@/lib/types";

const DAY_MS = 86_400_000;
/** Weeks use local date-only entries, Monday through Sunday; UTC noon avoids DST shifts. */
export function weekBounds(day = todayString()) {
  const date = dateFromString(day);
  const offset = (date.getUTCDay() + 6) % 7;
  const start = date.getTime() - offset * DAY_MS;
  return { start: new Date(start).toISOString().slice(0, 10), end: new Date(start + 6 * DAY_MS).toISOString().slice(0, 10) };
}
export function shiftWeek(start: string, weeks: number) {
  return new Date(dateFromString(start).getTime() + weeks * 7 * DAY_MS).toISOString().slice(0, 10);
}
export function getWeeklyReview(trades: Trade[], reflections: WeeklyReflection[], start: string) {
  const { end } = weekBounds(start);
  const inWeek = (date: string) => date >= start && date <= end;
  const selected = trades.filter((trade) => inWeek(trade.tradeDate));
  const risks = selected.map((trade) => Number(trade.initialRisk)).filter((risk) => Number.isFinite(risk) && risk > 0);
  return {
    start, end, trades: selected, stats: getStats(selected),
    setups: groupTrades(selected, (trade) => trade.setup),
    riskCount: risks.length,
    averageRisk: risks.length ? risks.reduce((total, risk) => total + risk, 0) / risks.length : null,
    reflections: reflections.filter((item) => inWeek(item.date)).sort((a, b) => b.date.localeCompare(a.date)),
    tradeNotes: selected.filter((trade) => trade.notes.trim()).sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id),
  };
}
