import { desc } from "drizzle-orm";
import { db } from "@/db";
import { journalSettings, trades } from "@/db/schema";
import type { JournalData, PlaybookRule } from "@/lib/types";

const defaultPlaybook: PlaybookRule[] = [
  { id: "b1", group: "Before trading", text: "Check in with how I'm feeling", checked: true },
  { id: "b2", group: "Before trading", text: "Mark key levels and review my plan", checked: true },
  { id: "b3", group: "Before trading", text: "Set my risk before entering", checked: false },
  { id: "d1", group: "While trading", text: "Be patient and wait for my setup", checked: false },
  { id: "d2", group: "While trading", text: "Let the trade play out without forcing it", checked: false },
  { id: "a1", group: "After trading", text: "Journal the trade, win or lose", checked: false },
  { id: "a2", group: "After trading", text: "Take a moment to reset", checked: false },
];

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const sampleRows = [
  { days: 1, symbol: "EUR/USD", market: "Forex", side: "Long", setup: "Trend continuation", pnl: "285.00", mood: "Focused", notes: "Waited for confirmation and followed my plan." },
  { days: 2, symbol: "BTC/USD", market: "Crypto", side: "Long", setup: "Breakout", pnl: "420.50", mood: "Calm", notes: "A patient entry after the retest." },
  { days: 3, symbol: "NAS100", market: "Futures", side: "Short", setup: "Pullback", pnl: "-180.00", mood: "Focused", notes: "A good setup, even if it didn't work out." },
  { days: 5, symbol: "XAU/USD", market: "Commodities", side: "Long", setup: "Support bounce", pnl: "340.00", mood: "Calm", notes: "Kept risk small and trusted the setup." },
  { days: 6, symbol: "GBP/USD", market: "Forex", side: "Short", setup: "Trend continuation", pnl: "165.00", mood: "Focused", notes: "A simple, well-planned trade." },
  { days: 8, symbol: "AAPL", market: "Stocks", side: "Long", setup: "Breakout", pnl: "-125.00", mood: "Tired", notes: "Noticed I was tired. Time for a break." },
  { days: 9, symbol: "EUR/USD", market: "Forex", side: "Long", setup: "Pullback", pnl: "215.00", mood: "Calm", notes: "Good patience on this one." },
  { days: 11, symbol: "ETH/USD", market: "Crypto", side: "Long", setup: "Support bounce", pnl: "310.00", mood: "Focused", notes: "Followed the plan from entry to exit." },
  { days: 12, symbol: "XAU/USD", market: "Commodities", side: "Short", setup: "Reversal", pnl: "-95.00", mood: "Calm", notes: "Stopped out as planned. That's okay." },
  { days: 14, symbol: "NAS100", market: "Futures", side: "Long", setup: "Breakout", pnl: "265.00", mood: "Focused", notes: "Clean setup with clear risk." },
  { days: 16, symbol: "GBP/USD", market: "Forex", side: "Long", setup: "Pullback", pnl: "190.00", mood: "Calm", notes: "Took only the trade I planned." },
  { days: 18, symbol: "BTC/USD", market: "Crypto", side: "Short", setup: "Reversal", pnl: "-145.00", mood: "Anxious", notes: "A useful reminder to slow down." },
  { days: 19, symbol: "EUR/USD", market: "Forex", side: "Short", setup: "Trend continuation", pnl: "235.00", mood: "Focused", notes: "Stuck to my entry rules." },
  { days: 21, symbol: "TSLA", market: "Stocks", side: "Long", setup: "Breakout", pnl: "180.00", mood: "Calm", notes: "One step at a time." },
  { days: 23, symbol: "XAU/USD", market: "Commodities", side: "Long", setup: "Support bounce", pnl: "-110.00", mood: "Focused", notes: "Risk was managed well." },
  { days: 25, symbol: "ETH/USD", market: "Crypto", side: "Long", setup: "Pullback", pnl: "260.00", mood: "Calm", notes: "Patience paid off." },
  { days: 27, symbol: "EUR/USD", market: "Forex", side: "Long", setup: "Reversal", pnl: "155.00", mood: "Focused", notes: "A clear plan made this feel easy." },
  { days: 29, symbol: "NAS100", market: "Futures", side: "Short", setup: "Pullback", pnl: "-75.00", mood: "Calm", notes: "A small loss is part of the process." },
] as const;

export async function ensureJournal() {
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(journalSettings).values({
      id: 1,
      name: "friend",
      goal: "Stick to my trading plan",
      goalProgress: 0,
      goalTarget: 5,
      playbook: defaultPlaybook,
    }).onConflictDoNothing().returning({ id: journalSettings.id });

    if (inserted.length > 0) {
      await tx.insert(trades).values(sampleRows.map(({ days, ...row }) => ({
        ...row,
        tradeDate: daysAgo(days),
        isDemo: true,
      })));
    }
  });
}

export async function getJournalData(): Promise<JournalData> {
  await ensureJournal();
  const [allTrades, settingsRows] = await Promise.all([
    db.select().from(trades).orderBy(desc(trades.tradeDate), desc(trades.id)),
    db.select().from(journalSettings).limit(1),
  ]);
  return {
    trades: allTrades.map(({ createdAt: _createdAt, ...trade }) => trade),
    settings: settingsRows[0],
  };
}
