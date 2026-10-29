import { DEFAULT_ACCOUNT, type Trade } from "@/lib/types";

export type TodaySessionStatus = "green_to_red" | "heavy_giveback" | "loss_streak_or_overtrade" | "over_cap_green" | "calm";

export type TodaySessionPulse = {
  tradeCount: number;
  intradayPeak: number;
  peakTradeNumber: number;
  currentNet: number;
  givebackAmount: number;
  givebackPct: number;
  consecutiveLossesTail: number;
  statusKind: TodaySessionStatus;
};

export type BucketSummary = {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  net: number;
};

export type GivebackSession = {
  date: string;
  accountId: string;
  tradeCount: number;
  peakPnl: number;
  peakAtTradeNumber: number;
  finalPnl: number;
  givebackPnl: number;
  givebackPct: number;
  kind: "green_to_red" | "heavy_giveback";
};

export type PatienceMirror = {
  maxDailyTrades: number;
  totalSessions: number;
  withinCap: BucketSummary;
  overCap: BucketSummary;
  actualNet: number;
  stoppedAtCapNet: number;
  /** Net P&L contributed by trades after the daily cap (negative means extra trades cost money). */
  overCapNet: number;
  greenToRedCount: number;
  heavyGivebackCount: number;
  givebackDays: GivebackSession[];
};

export type CompoundingInput = {
  startingBalance: number;
  riskPercent: number;
  winRate: number;
  rewardRisk: number;
  totalTrades: number;
  revengeDaysPer20: number;
};

export type CompoundingPoint = {
  trade: number;
  patient: number;
  revenge: number;
  flat: number;
  revengeEvent: boolean;
};

export type CompoundingSimulation = {
  input: CompoundingInput;
  wins: number;
  losses: number;
  expectancyR: number;
  patientFinal: number;
  patientGainPct: number;
  patientMaxDrawdownPct: number;
  revengeFinal: number;
  revengeGainPct: number;
  revengeMaxDrawdownPct: number;
  revengeEventsTriggered: number;
  impatienceCost: number;
  flatFinal: number;
  compoundingLift: number;
  points: CompoundingPoint[];
};

export type DrawdownRecoveryRow = {
  lossPct: number;
  recoveryPct: number;
  winsToRecover: number;
};

function toCents(pnlText: string): bigint {
  const numeric = Number(pnlText);
  if (pnlText.trim() === "" || !Number.isFinite(numeric)) return BigInt(0);
  return BigInt(Math.round(Math.abs(numeric) * 100) * Math.sign(numeric));
}

function fromCents(cents: bigint): number {
  return Number(cents) / 100;
}

function summarizeBucket(rows: Trade[]): BucketSummary {
  let cents = BigInt(0);
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  for (const row of rows) {
    const value = toCents(row.pnl);
    cents += value;
    if (value > BigInt(0)) wins++;
    else if (value < BigInt(0)) losses++;
    else breakeven++;
  }
  const decided = wins + losses;
  return {
    count: rows.length,
    wins,
    losses,
    breakeven,
    winRate: decided > 0 ? Math.round((wins / decided) * 100) : null,
    net: fromCents(cents),
  };
}

/** Evaluates today's visible trades ordered by entry ID so hot-state prompts stay grounded in actual records. */
export function getTodaySessionPulse(trades: Trade[], today: string, maxDailyTrades = 3): TodaySessionPulse {
  const cap = Math.max(1, Math.min(20, Math.trunc(maxDailyTrades) || 3));
  const todayTrades = trades
    .filter((trade) => trade.tradeDate === today)
    .sort((a, b) => a.id - b.id);

  let running = BigInt(0);
  let peak = BigInt(0);
  let peakTradeNumber = 0;
  todayTrades.forEach((trade, index) => {
    running += toCents(trade.pnl);
    if (running > peak) {
      peak = running;
      peakTradeNumber = index + 1;
    }
  });

  let consecutiveLossesTail = 0;
  for (let i = todayTrades.length - 1; i >= 0; i--) {
    if (toCents(todayTrades[i].pnl) < BigInt(0)) consecutiveLossesTail++;
    else break;
  }

  const givebackCents = peak > BigInt(0) && peak > running ? peak - running : BigInt(0);
  const intradayPeak = fromCents(peak);
  const currentNet = fromCents(running);
  const givebackAmount = fromCents(givebackCents);
  const givebackPct = peak > BigInt(0) && givebackCents > BigInt(0)
    ? Math.round((Number(givebackCents) / Number(peak)) * 100)
    : 0;

  let statusKind: TodaySessionStatus = "calm";
  if (peak > BigInt(0) && running < BigInt(0)) {
    statusKind = "green_to_red";
  } else if (peak > BigInt(0) && givebackCents * BigInt(100) >= peak * BigInt(40)) {
    statusKind = "heavy_giveback";
  } else if ((consecutiveLossesTail >= 2 || todayTrades.length > cap) && running < BigInt(0)) {
    statusKind = "loss_streak_or_overtrade";
  } else if (todayTrades.length > cap && running >= BigInt(0)) {
    statusKind = "over_cap_green";
  }

  return {
    tradeCount: todayTrades.length,
    intradayPeak,
    peakTradeNumber,
    currentNet,
    givebackAmount,
    givebackPct,
    consecutiveLossesTail,
    statusKind,
  };
}

/** Splits each (account, date) session by trade entry order and highlights green-to-red or >=50% profit-giveback days. */
export function getPatienceMirror(trades: Trade[], maxDailyTrades = 3): PatienceMirror {
  const cap = Math.max(1, Math.min(20, Math.trunc(maxDailyTrades) || 3));
  const sessions = new Map<string, { date: string; accountId: string; rows: Trade[] }>();

  for (const trade of trades) {
    const accountId = trade.accountId ?? DEFAULT_ACCOUNT.id;
    const key = `${accountId}\u0000${trade.tradeDate}`;
    const existing = sessions.get(key);
    if (existing) existing.rows.push(trade);
    else sessions.set(key, { date: trade.tradeDate, accountId, rows: [trade] });
  }

  const withinRows: Trade[] = [];
  const overRows: Trade[] = [];
  const givebackDays: GivebackSession[] = [];
  let greenToRedCount = 0;
  let heavyGivebackCount = 0;

  for (const session of sessions.values()) {
    const ordered = [...session.rows].sort((a, b) => a.id - b.id);
    ordered.forEach((trade, index) => {
      if (index < cap) withinRows.push(trade);
      else overRows.push(trade);
    });

    if (ordered.length >= 2) {
      let running = BigInt(0);
      let peak = BigInt(0);
      let peakAtTradeNumber = 0;
      ordered.forEach((trade, index) => {
        running += toCents(trade.pnl);
        if (running > peak) {
          peak = running;
          peakAtTradeNumber = index + 1;
        }
      });

      if (peak > BigInt(0) && peakAtTradeNumber < ordered.length) {
        const givebackCents = peak - running;
        if (running < BigInt(0)) {
          greenToRedCount++;
          givebackDays.push({
            date: session.date,
            accountId: session.accountId,
            tradeCount: ordered.length,
            peakPnl: fromCents(peak),
            peakAtTradeNumber,
            finalPnl: fromCents(running),
            givebackPnl: fromCents(givebackCents),
            givebackPct: Math.round((Number(givebackCents) / Number(peak)) * 100),
            kind: "green_to_red",
          });
        } else if (givebackCents > BigInt(0) && givebackCents * BigInt(2) >= peak) {
          heavyGivebackCount++;
          givebackDays.push({
            date: session.date,
            accountId: session.accountId,
            tradeCount: ordered.length,
            peakPnl: fromCents(peak),
            peakAtTradeNumber,
            finalPnl: fromCents(running),
            givebackPnl: fromCents(givebackCents),
            givebackPct: Math.round((Number(givebackCents) / Number(peak)) * 100),
            kind: "heavy_giveback",
          });
        }
      }
    }
  }

  givebackDays.sort((a, b) => b.date.localeCompare(a.date) || a.accountId.localeCompare(b.accountId));
  const withinCap = summarizeBucket(withinRows);
  const overCap = summarizeBucket(overRows);
  const stoppedAtCapCents = withinRows.reduce((sum, row) => sum + toCents(row.pnl), BigInt(0));
  const overCapCents = overRows.reduce((sum, row) => sum + toCents(row.pnl), BigInt(0));
  const actualCents = stoppedAtCapCents + overCapCents;

  return {
    maxDailyTrades: cap,
    totalSessions: sessions.size,
    withinCap,
    overCap,
    actualNet: fromCents(actualCents),
    stoppedAtCapNet: fromCents(stoppedAtCapCents),
    overCapNet: fromCents(overCapCents),
    greenToRedCount,
    heavyGivebackCount,
    givebackDays,
  };
}

/** Derives simulator win-rate and payoff-ratio presets from visible journal trades when at least 3 decided trades exist. */
export function getJournalSimPreset(trades: Trade[]): { winRate: number; rewardRisk: number; source: "r_multiple" | "pnl_ratio" } | null {
  const wins = trades.filter((trade) => Number(trade.pnl) > 0);
  const losses = trades.filter((trade) => Number(trade.pnl) < 0);
  if (wins.length + losses.length < 3 || wins.length === 0 || losses.length === 0) return null;

  const winRate = Math.max(25, Math.min(80, Math.round((wins.length / (wins.length + losses.length)) * 100)));
  const rWins = wins.filter((trade) => Number(trade.initialRisk) > 0).map((trade) => Number(trade.pnl) / Number(trade.initialRisk));
  const rLosses = losses.filter((trade) => Number(trade.initialRisk) > 0).map((trade) => Math.abs(Number(trade.pnl)) / Number(trade.initialRisk));

  if (rWins.length > 0 && rLosses.length > 0) {
    const avgWinR = rWins.reduce((sum, value) => sum + value, 0) / rWins.length;
    const avgLossR = rLosses.reduce((sum, value) => sum + value, 0) / rLosses.length;
    if (avgLossR > 0) {
      const ratio = Math.max(0.8, Math.min(4, Math.round((avgWinR / avgLossR) * 10) / 10));
      return { winRate, rewardRisk: ratio, source: "r_multiple" };
    }
  }

  const avgWin = wins.reduce((sum, trade) => sum + Number(trade.pnl), 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((sum, trade) => sum + Number(trade.pnl), 0) / losses.length);
  if (avgLoss <= 0) return null;
  const ratio = Math.max(0.8, Math.min(4, Math.round((avgWin / avgLoss) * 10) / 10));
  return { winRate, rewardRisk: ratio, source: "pnl_ratio" };
}

function deterministicRanks(length: number): number[] {
  let state = (0x424c4f4f + length * 97) >>> 0;
  const nextRandom = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const indices = Array.from({ length }, (_, index) => index);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom() * (i + 1));
    const temp = indices[i];
    indices[i] = indices[j];
    indices[j] = temp;
  }
  const ranks = new Array<number>(length);
  indices.forEach((slot, rank) => { ranks[slot] = rank; });
  return ranks;
}

/** Deterministic comparison of proportional equity compounding vs. the same strategy interrupted by periodic -5R revenge sessions. */
export function simulateCompoundingComparison(raw: CompoundingInput): CompoundingSimulation {
  const startingBalance = Math.max(100, Math.min(10_000_000, Number.isFinite(raw.startingBalance) ? raw.startingBalance : 5000));
  const riskPercent = Math.max(0.25, Math.min(5, Number.isFinite(raw.riskPercent) ? raw.riskPercent : 1));
  const winRate = Math.max(20, Math.min(80, Math.round(Number.isFinite(raw.winRate) ? raw.winRate : 50)));
  const rewardRisk = Math.max(0.8, Math.min(4, Math.round((Number.isFinite(raw.rewardRisk) ? raw.rewardRisk : 1.8) * 10) / 10));
  const totalTrades = Math.max(20, Math.min(200, Math.round(Number.isFinite(raw.totalTrades) ? raw.totalTrades : 100)));
  const revengeDaysPer20 = Math.max(0, Math.min(4, Math.round(Number.isFinite(raw.revengeDaysPer20) ? raw.revengeDaysPer20 : 2)));

  const input: CompoundingInput = { startingBalance, riskPercent, winRate, rewardRisk, totalTrades, revengeDaysPer20 };
  const exactWins = Math.round((totalTrades * winRate) / 100);
  const ranks = deterministicRanks(totalTrades);
  const isWinSlot = ranks.map((rank) => rank < exactWins);

  // Pick evenly spaced loss slots inside each 20-trade block to model periodic emotional blowups.
  const revengeSlots = new Set<number>();
  if (revengeDaysPer20 > 0) {
    for (let blockStart = 0; blockStart < totalTrades; blockStart += 20) {
      const blockEnd = Math.min(totalTrades, blockStart + 20);
      const lossIndices: number[] = [];
      for (let i = blockStart; i < blockEnd; i++) {
        if (!isWinSlot[i]) lossIndices.push(i);
      }
      const countInBlock = Math.min(lossIndices.length, Math.max(0, Math.round((revengeDaysPer20 * (blockEnd - blockStart)) / 20)));
      for (let k = 0; k < countInBlock; k++) {
        const pick = lossIndices[Math.min(lossIndices.length - 1, Math.floor(((k + 1) * lossIndices.length) / (countInBlock + 1)))];
        revengeSlots.add(pick);
      }
    }
  }

  const r = riskPercent / 100;
  const flatUnit = startingBalance * r;
  let patient = startingBalance;
  let patientPeak = startingBalance;
  let patientMaxDd = 0;

  let revenge = startingBalance;
  let revengePeak = startingBalance;
  let revengeMaxDd = 0;

  let flat = startingBalance;
  let revengeEventsTriggered = 0;

  const points: CompoundingPoint[] = [{
    trade: 0,
    patient: Math.round(startingBalance * 100) / 100,
    revenge: Math.round(startingBalance * 100) / 100,
    flat: Math.round(startingBalance * 100) / 100,
    revengeEvent: false,
  }];

  for (let i = 0; i < totalTrades; i++) {
    const win = isWinSlot[i];
    const isRevenge = !win && revengeSlots.has(i);
    if (win) {
      patient *= 1 + r * rewardRisk;
      revenge *= 1 + r * rewardRisk;
      flat += flatUnit * rewardRisk;
    } else {
      patient *= 1 - r;
      if (isRevenge) {
        revenge *= Math.max(0.05, 1 - 5 * r);
        revengeEventsTriggered++;
      } else {
        revenge *= 1 - r;
      }
      flat = Math.max(0, flat - flatUnit);
    }

    if (patient > patientPeak) patientPeak = patient;
    const pDd = patientPeak > 0 ? ((patientPeak - patient) / patientPeak) * 100 : 0;
    if (pDd > patientMaxDd) patientMaxDd = pDd;

    if (revenge > revengePeak) revengePeak = revenge;
    const rDd = revengePeak > 0 ? ((revengePeak - revenge) / revengePeak) * 100 : 0;
    if (rDd > revengeMaxDd) revengeMaxDd = rDd;

    points.push({
      trade: i + 1,
      patient: Math.round(patient * 100) / 100,
      revenge: Math.round(revenge * 100) / 100,
      flat: Math.round(flat * 100) / 100,
      revengeEvent: isRevenge,
    });
  }

  const p = winRate / 100;
  const expectancyR = Math.round((p * rewardRisk - (1 - p)) * 100) / 100;
  const patientFinal = Math.round(patient * 100) / 100;
  const revengeFinal = Math.round(revenge * 100) / 100;
  const flatFinal = Math.round(flat * 100) / 100;

  return {
    input,
    wins: exactWins,
    losses: totalTrades - exactWins,
    expectancyR,
    patientFinal,
    patientGainPct: Math.round(((patientFinal - startingBalance) / startingBalance) * 1000) / 10,
    patientMaxDrawdownPct: Math.round(patientMaxDd * 10) / 10,
    revengeFinal,
    revengeGainPct: Math.round(((revengeFinal - startingBalance) / startingBalance) * 1000) / 10,
    revengeMaxDrawdownPct: Math.round(revengeMaxDd * 10) / 10,
    revengeEventsTriggered,
    impatienceCost: Math.round((patientFinal - revengeFinal) * 100) / 100,
    flatFinal,
    compoundingLift: Math.round((patientFinal - flatFinal) * 100) / 100,
    points,
  };
}

/** Exact asymmetric drawdown recovery percentages and consecutive +R winning trades required to recover. */
export function getDrawdownRecoveryRows(riskPercent = 1, rewardRisk = 1.8): DrawdownRecoveryRow[] {
  const perWinGain = Math.max(0.002, (Math.max(0.25, riskPercent) / 100) * Math.max(0.8, rewardRisk));
  return [2, 5, 10, 20, 35, 50].map((lossPct) => {
    const recoveryPct = Math.round((lossPct / (100 - lossPct)) * 10000) / 100;
    const winsToRecover = Math.max(1, Math.ceil(Math.log(1 / (1 - lossPct / 100)) / Math.log(1 + perWinGain)));
    return { lossPct, recoveryPct, winsToRecover };
  });
}
