import type { AppLocale, DayJournalEntry, SetupBlueprint, Trade } from "@/lib/types";
import { dateFromString, periodStart, shortDate, todayString, tradeRMultiple, type Period } from "@/lib/format";

export type ChartPoint = { date: string; time: number; label: string; pnl: number; daily: number; trades: number; drawdown: number };
export type TradeGroupRow = {
  name: string;
  count: number;
  pnl: number;
  wins: number;
  losses: number;
  avgR: number | null;
};

function computeAvgR(rows: Trade[]): number | null {
  const rValues = rows.map(tradeRMultiple).filter((v): v is number => v !== null);
  if (!rValues.length) return null;
  return rValues.reduce((sum, v) => sum + v, 0) / rValues.length;
}

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

export function groupTrades(trades: Trade[], key: (trade: Trade) => string, fallbackLabel = "Not specified"): TradeGroupRow[] {
  const groups = new Map<string, Trade[]>();
  trades.forEach((trade) => { const value = key(trade).trim() || fallbackLabel; const existing = groups.get(value); if (existing) existing.push(trade); else groups.set(value, [trade]); });
  return [...groups.entries()].map(([name, rows]) => ({
    name,
    count: rows.length,
    pnl: rows.reduce((sum, trade) => sum + Number(trade.pnl), 0),
    wins: rows.filter((trade) => Number(trade.pnl) > 0).length,
    losses: rows.filter((trade) => Number(trade.pnl) < 0).length,
    avgR: computeAvgR(rows),
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Multi-label breakdown: a trade with multiple tags is counted under each tag it carries. */
export function groupTradesByTag(trades: Trade[], untaggedLabel = "No tags"): TradeGroupRow[] {
  const displayNames = new Map<string, string>();
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    const rawTags = (trade.tags ?? []).map((t) => t.trim()).filter(Boolean);
    if (!rawTags.length) {
      const bucket = groups.get("__untagged__") ?? [];
      bucket.push(trade);
      groups.set("__untagged__", bucket);
      continue;
    }
    const seenOnTrade = new Set<string>();
    for (const tag of rawTags) {
      const norm = tag.toLowerCase();
      if (seenOnTrade.has(norm)) continue;
      seenOnTrade.add(norm);
      if (!displayNames.has(norm)) displayNames.set(norm, `#${tag}`);
      const bucket = groups.get(norm) ?? [];
      bucket.push(trade);
      groups.set(norm, bucket);
    }
  }
  return [...groups.entries()]
    .map(([normKey, rows]) => ({
      name: normKey === "__untagged__" ? untaggedLabel : displayNames.get(normKey)!,
      count: rows.length,
      pnl: rows.reduce((sum, trade) => sum + Number(trade.pnl), 0),
      wins: rows.filter((trade) => Number(trade.pnl) > 0).length,
      losses: rows.filter((trade) => Number(trade.pnl) < 0).length,
      avgR: computeAvgR(rows),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export type ProcessStatus = "followed" | "broken" | "unrated";

/**
 * Evaluates whether a trade followed the trader's plan:
 * 1. Explicit `followedPlan` boolean wins (`true` -> followed, `false` -> broken).
 * 2. Otherwise, if at least one playbook rule was checked on the trade, >=70% checked -> followed, <70% -> broken.
 * 3. Trades with no explicit rating and 0 checked rules remain honestly `"unrated"`.
 */
export function evaluateTradeProcess(trade: Trade): {
  status: ProcessStatus;
  checked: number;
  total: number;
  ratio: number | null;
} {
  const total = trade.checklist?.length ?? 0;
  const checked = trade.checklist?.filter((rule) => rule.checked).length ?? 0;
  if (typeof trade.followedPlan === "boolean") {
    return {
      status: trade.followedPlan ? "followed" : "broken",
      checked,
      total,
      ratio: total > 0 ? checked / total : null,
    };
  }
  if (total > 0 && checked > 0) {
    const ratio = checked / total;
    return {
      status: ratio >= 0.7 ? "followed" : "broken",
      checked,
      total,
      ratio,
    };
  }
  return { status: "unrated", checked, total, ratio: null };
}

export type ProcessQuadrantStats = {
  count: number;
  pnl: number;
  avgR: number | null;
};

export type ProcessMatrixSummary = {
  modelWin: ProcessQuadrantStats;
  goodLoss: ProcessQuadrantStats;
  badWin: ProcessQuadrantStats;
  unforcedLoss: ProcessQuadrantStats;
  ratedBreakevens: number;
  unratedCount: number;
  ratedCount: number;
  followedCount: number;
  processScorePct: number | null;
};

function summarizeQuadrant(rows: Trade[]): ProcessQuadrantStats {
  return {
    count: rows.length,
    pnl: rows.reduce((sum, trade) => sum + Number(trade.pnl), 0),
    avgR: computeAvgR(rows),
  };
}

export function getProcessMatrix(trades: Trade[]): ProcessMatrixSummary {
  const modelWin: Trade[] = [];
  const goodLoss: Trade[] = [];
  const badWin: Trade[] = [];
  const unforcedLoss: Trade[] = [];
  let ratedBreakevens = 0;
  let unratedCount = 0;
  let followedCount = 0;

  for (const trade of trades) {
    const { status } = evaluateTradeProcess(trade);
    if (status === "unrated") {
      unratedCount++;
      continue;
    }
    if (status === "followed") followedCount++;
    const pnl = Number(trade.pnl);
    if (pnl === 0) {
      ratedBreakevens++;
    } else if (status === "followed" && pnl > 0) {
      modelWin.push(trade);
    } else if (status === "followed" && pnl < 0) {
      goodLoss.push(trade);
    } else if (status === "broken" && pnl > 0) {
      badWin.push(trade);
    } else {
      unforcedLoss.push(trade);
    }
  }

  const ratedCount = trades.length - unratedCount;
  return {
    modelWin: summarizeQuadrant(modelWin),
    goodLoss: summarizeQuadrant(goodLoss),
    badWin: summarizeQuadrant(badWin),
    unforcedLoss: summarizeQuadrant(unforcedLoss),
    ratedBreakevens,
    unratedCount,
    ratedCount,
    followedCount,
    processScorePct: ratedCount > 0 ? Math.round((followedCount / ratedCount) * 100) : null,
  };
}

const STARTER_TAGS = ["A+", "patient", "breakout", "pullback", "fomo", "early-exit", "revenge"] as const;
export const PRESET_TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4", "D1"] as const;
export const PRESET_SESSIONS = ["Asia", "London", "New York", "Overlap"] as const;

export function getSmartEntrySuggestions(
  trades: Trade[],
  blueprints: SetupBlueprint[] = [],
): {
  symbols: string[];
  setups: string[];
  tags: string[];
} {
  const realTrades = trades.filter((t) => !t.isDemo);
  const demoTrades = trades.filter((t) => t.isDemo);

  const rankUnique = (realVals: string[], demoVals: string[], maxLen: number, limit: number) => {
    const pick = (values: string[]) => {
      const counts = new Map<string, { display: string; count: number; firstIdx: number }>();
      values.forEach((raw, idx) => {
        const trimmed = raw.trim();
        if (!trimmed || trimmed.length > maxLen) return;
        const norm = trimmed.toLowerCase();
        const prev = counts.get(norm);
        if (prev) prev.count++;
        else counts.set(norm, { display: trimmed, count: 1, firstIdx: idx });
      });
      return [...counts.values()]
        .sort((a, b) => b.count - a.count || a.firstIdx - b.firstIdx)
        .map((item) => item.display);
    };
    const primary = pick(realVals);
    const seen = new Set(primary.map((v) => v.toLowerCase()));
    const combined = [...primary];
    for (const item of pick(demoVals)) {
      if (combined.length >= limit) break;
      if (!seen.has(item.toLowerCase())) {
        seen.add(item.toLowerCase());
        combined.push(item);
      }
    }
    return combined.slice(0, limit);
  };

  const symbols = rankUnique(realTrades.map((t) => t.symbol), demoTrades.map((t) => t.symbol), 16, 5);
  const blueprintNames = blueprints.map((b) => b.name.trim()).filter((n) => n && n.length <= 28);
  const setups = rankUnique(
    [...blueprintNames, ...realTrades.map((t) => t.setup)],
    demoTrades.map((t) => t.setup),
    28,
    5,
  );

  const userTags = rankUnique(realTrades.flatMap((t) => t.tags ?? []), demoTrades.flatMap((t) => t.tags ?? []), 24, 8);
  const seenTagNorms = new Set(userTags.map((t) => t.toLowerCase()));
  const mergedTags = [...userTags];
  for (const starter of STARTER_TAGS) {
    if (mergedTags.length >= 9) break;
    if (!seenTagNorms.has(starter.toLowerCase())) {
      seenTagNorms.add(starter.toLowerCase());
      mergedTags.push(starter);
    }
  }

  return { symbols, setups, tags: mergedTags };
}

export type SetupBlueprintMetrics = {
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  net: number;
  avgR: number | null;
};

export function getSetupBlueprintStats(trades: Trade[], setupName: string): SetupBlueprintMetrics {
  const norm = setupName.trim().toLowerCase();
  if (!norm) return { count: 0, wins: 0, losses: 0, winRate: null, net: 0, avgR: null };
  const matched = trades.filter((t) => t.setup.trim().toLowerCase() === norm);
  let wins = 0;
  let losses = 0;
  let net = 0;
  for (const trade of matched) {
    const pnl = Number(trade.pnl);
    net += pnl;
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
  }
  const decisive = wins + losses;
  return {
    count: matched.length,
    wins,
    losses,
    winRate: decisive > 0 ? Math.round((wins / decisive) * 100) : null,
    net,
    avgR: computeAvgR(matched),
  };
}

export function upsertDayJournal(
  entries: DayJournalEntry[],
  patch: DayJournalEntry,
): DayJournalEntry[] {
  const cleaned: DayJournalEntry = {
    date: patch.date,
    intentionalNoTrade: Boolean(patch.intentionalNoTrade),
    preMarketPlan: patch.preMarketPlan.trim().slice(0, 600),
    postSessionNote: patch.postSessionNote.trim().slice(0, 1000),
  };
  const rest = entries.filter((item) => item.date !== cleaned.date);
  const isEmpty = !cleaned.intentionalNoTrade && !cleaned.preMarketPlan && !cleaned.postSessionNote;
  const next = isEmpty ? rest : [...rest, cleaned];
  return next.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3660);
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
export function monthTitle(year: number, month: number, locale: AppLocale = "en") {
  return dateFromString(`${year}-${String(month + 1).padStart(2, "0")}-01`).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Previous equal-length calendar period; ALL has no meaningful comparison. */
export function previousPeriodTrades(trades: Trade[], period: Period) {
  if (period === "ALL") return [];
  const days = period === "1W" ? 7 : period === "1M" ? 30 : 90;
  const currentStart = periodStart(period, trades).getTime();
  const previousStart = currentStart - days * 86_400_000;
  return trades.filter((trade) => { const time = dateFromString(trade.tradeDate).getTime(); return time >= previousStart && time < currentStart; });
}
