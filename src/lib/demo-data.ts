import type { JournalData, PlaybookRule, Trade } from "@/lib/types";

const defaultPlaybook: PlaybookRule[] = [
  { id: "b1", group: "Before trading", text: "Check in with how I'm feeling", checked: true },
  { id: "b2", group: "Before trading", text: "Mark key levels and review my plan", checked: true },
  { id: "b3", group: "Before trading", text: "Set my risk before entering", checked: false },
  { id: "d1", group: "While trading", text: "Be patient and wait for my setup", checked: false },
  { id: "d2", group: "While trading", text: "Let the trade play out without forcing it", checked: false },
  { id: "a1", group: "After trading", text: "Journal the trade, win or lose", checked: false },
  { id: "a2", group: "After trading", text: "Take a moment to reset", checked: false },
];

const sampleRows = [
  ["EUR/USD", "Forex", "Long", "Trend continuation", "285.00", "Focused", "Waited for confirmation and followed my plan."],
  ["BTC/USD", "Crypto", "Long", "Breakout", "420.50", "Calm", "A patient entry after the retest."],
  ["NAS100", "Futures", "Short", "Pullback", "-180.00", "Focused", "A good setup, even if it didn't work out."],
  ["XAU/USD", "Commodities", "Long", "Support bounce", "340.00", "Calm", "Kept risk small and trusted the setup."],
  ["GBP/USD", "Forex", "Short", "Trend continuation", "165.00", "Focused", "A simple, well-planned trade."],
  ["AAPL", "Stocks", "Long", "Breakout", "-125.00", "Tired", "Noticed I was tired. Time for a break."],
  ["EUR/USD", "Forex", "Long", "Pullback", "215.00", "Calm", "Good patience on this one."],
  ["ETH/USD", "Crypto", "Long", "Support bounce", "310.00", "Focused", "Followed the plan from entry to exit."],
  ["XAU/USD", "Commodities", "Short", "Reversal", "-95.00", "Calm", "Stopped out as planned. That's okay."],
  ["NAS100", "Futures", "Long", "Breakout", "265.00", "Focused", "Clean setup with clear risk."],
  ["GBP/USD", "Forex", "Long", "Pullback", "190.00", "Calm", "Took only the trade I planned."],
  ["BTC/USD", "Crypto", "Short", "Reversal", "-145.00", "Anxious", "A useful reminder to slow down."],
] as const;

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function createDemoData(): JournalData {
  return {
    trades: sampleRows.map((row, index) => ({
      id: index + 1,
      symbol: row[0],
      market: row[1],
      side: row[2] as Trade["side"],
      setup: row[3],
      tradeDate: daysAgo(index + 1),
      pnl: row[4],
      mood: row[5],
      notes: row[6],
      isDemo: true,
    })),
    settings: {
      id: 1,
      name: "friend",
      mood: null,
      moodDate: null,
      goal: "Stick to my trading plan",
      goalProgress: 0,
      goalTarget: 5,
      playbook: defaultPlaybook.map((rule) => ({ ...rule })),
    },
  };
}