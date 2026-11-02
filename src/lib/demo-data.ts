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

type SampleSeed = {
  daysAgo: number;
  symbol: string;
  market: Trade["market"];
  side: Trade["side"];
  setup: string;
  session: string;
  timeframe: string;
  entryPrice: string;
  exitPrice: string;
  initialRisk: string;
  pnl: string;
  followedPlan?: boolean;
  mood: string;
  tags: string[];
  notes: string;
};

const sampleSeeds: SampleSeed[] = [
  { daysAgo: 1, symbol: "EUR/USD", market: "Forex", side: "Long", setup: "Trend continuation", session: "London", timeframe: "M15", entryPrice: "1.0885", exitPrice: "1.0921", initialRisk: "120.00", pnl: "285.00", followedPlan: true, mood: "Focused", tags: ["A+", "patient"], notes: "Waited for M15 confirmation and followed my plan." },
  { daysAgo: 2, symbol: "BTC/USD", market: "Crypto", side: "Long", setup: "Breakout", session: "Asia", timeframe: "H4", entryPrice: "67400.00", exitPrice: "69250.00", initialRisk: "150.00", pnl: "420.50", followedPlan: true, mood: "Calm", tags: ["breakout", "patient"], notes: "A patient H4 entry after the retest." },
  { daysAgo: 4, symbol: "NAS100", market: "Futures", side: "Short", setup: "Pullback", session: "Overlap", timeframe: "M15", entryPrice: "20310.00", exitPrice: "20355.00", initialRisk: "180.00", pnl: "-180.00", followedPlan: true, mood: "Focused", tags: ["pullback"], notes: "A good setup, even if it didn't work out." },
  { daysAgo: 6, symbol: "XAU/USD", market: "Commodities", side: "Long", setup: "Support bounce", session: "New York", timeframe: "H1", entryPrice: "2608.00", exitPrice: "2625.00", initialRisk: "135.00", pnl: "340.00", followedPlan: true, mood: "Calm", tags: ["A+", "patient"], notes: "Kept risk small and trusted the setup." },
  { daysAgo: 9, symbol: "GBP/USD", market: "Forex", side: "Short", setup: "Trend continuation", session: "London", timeframe: "M15", entryPrice: "1.2980", exitPrice: "1.2952", initialRisk: "100.00", pnl: "165.00", followedPlan: true, mood: "Focused", tags: ["patient"], notes: "A simple, well-planned trade." },
  { daysAgo: 12, symbol: "AAPL", market: "Stocks", side: "Long", setup: "Breakout", session: "New York", timeframe: "M15", entryPrice: "231.50", exitPrice: "229.00", initialRisk: "125.00", pnl: "-125.00", followedPlan: false, mood: "Tired", tags: ["fomo"], notes: "Noticed I was tired. Time for a break." },
  { daysAgo: 16, symbol: "EUR/USD", market: "Forex", side: "Long", setup: "Pullback", session: "Overlap", timeframe: "M15", entryPrice: "1.0915", exitPrice: "1.0942", initialRisk: "110.00", pnl: "215.00", followedPlan: true, mood: "Calm", tags: ["pullback", "patient"], notes: "Good patience on this one." },
  { daysAgo: 20, symbol: "ETH/USD", market: "Crypto", side: "Long", setup: "Support bounce", session: "New York", timeframe: "H4", entryPrice: "2615.00", exitPrice: "2710.00", initialRisk: "130.00", pnl: "310.00", followedPlan: true, mood: "Focused", tags: ["A+"], notes: "Followed the plan from entry to exit." },
  { daysAgo: 24, symbol: "XAU/USD", market: "Commodities", side: "Short", setup: "Reversal", session: "London", timeframe: "H1", entryPrice: "2565.00", exitPrice: "2570.00", initialRisk: "95.00", pnl: "-95.00", followedPlan: true, mood: "Calm", tags: ["patient"], notes: "Stopped out as planned. That's okay." },
  { daysAgo: 29, symbol: "NAS100", market: "Futures", side: "Long", setup: "Breakout", session: "Overlap", timeframe: "M15", entryPrice: "20120.00", exitPrice: "20205.00", initialRisk: "120.00", pnl: "265.00", followedPlan: true, mood: "Focused", tags: ["A+", "breakout"], notes: "Clean setup with clear risk." },
  { daysAgo: 34, symbol: "GBP/USD", market: "Forex", side: "Long", setup: "Pullback", session: "London", timeframe: "H1", entryPrice: "1.2910", exitPrice: "1.2940", initialRisk: "105.00", pnl: "190.00", followedPlan: true, mood: "Calm", tags: ["pullback"], notes: "Took only the trade I planned." },
  { daysAgo: 39, symbol: "BTC/USD", market: "Crypto", side: "Short", setup: "Reversal", session: "New York", timeframe: "M15", entryPrice: "64800.00", exitPrice: "65450.00", initialRisk: "145.00", pnl: "-145.00", followedPlan: false, mood: "Anxious", tags: ["fomo"], notes: "A useful reminder to slow down." },
  { daysAgo: 46, symbol: "NVDA", market: "Stocks", side: "Long", setup: "Trend continuation", session: "New York", timeframe: "H1", entryPrice: "128.40", exitPrice: "133.10", initialRisk: "100.00", pnl: "235.00", followedPlan: true, mood: "Focused", tags: ["A+"], notes: "Clean trend continuation off morning VWAP." },
  { daysAgo: 53, symbol: "EUR/USD", market: "Forex", side: "Short", setup: "Trend continuation", session: "London", timeframe: "M15", entryPrice: "1.1025", exitPrice: "1.0992", initialRisk: "115.00", pnl: "248.00", followedPlan: true, mood: "Calm", tags: ["patient"], notes: "Swept prior high and displaced cleanly downward." },
  { daysAgo: 61, symbol: "USD/JPY", market: "Forex", side: "Long", setup: "Breakout", session: "Asia", timeframe: "M15", entryPrice: "148.20", exitPrice: "148.42", initialRisk: "120.00", pnl: "82.00", followedPlan: false, mood: "Anxious", tags: ["fomo", "early-exit"], notes: "Entered without pullback and closed early — lucky gain, poor process." },
  { daysAgo: 69, symbol: "XAU/USD", market: "Commodities", side: "Long", setup: "Support bounce", session: "Overlap", timeframe: "H1", entryPrice: "2492.00", exitPrice: "2509.00", initialRisk: "130.00", pnl: "325.00", followedPlan: true, mood: "Focused", tags: ["A+", "patient"], notes: "Patient 90-minute wait for H1 demand tap." },
  { daysAgo: 77, symbol: "NAS100", market: "Futures", side: "Long", setup: "Pullback", session: "New York", timeframe: "M15", entryPrice: "19740.00", exitPrice: "19695.00", initialRisk: "115.00", pnl: "-115.00", followedPlan: true, mood: "Calm", tags: ["pullback"], notes: "Textbook setup that didn't follow through; kept loss small." },
  { daysAgo: 86, symbol: "GBP/USD", market: "Forex", side: "Long", setup: "Trend continuation", session: "London", timeframe: "M15", entryPrice: "1.2790", exitPrice: "1.2826", initialRisk: "110.00", pnl: "270.00", followedPlan: true, mood: "Calm", tags: ["A+"], notes: "Clean sweep below Asian session low to start the quarter." },
];

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function createDemoData(): JournalData {
  return {
    trades: sampleSeeds.map((seed, index) => ({
      id: index + 1,
      symbol: seed.symbol,
      market: seed.market,
      side: seed.side,
      setup: seed.setup,
      tradeDate: daysAgo(seed.daysAgo),
      pnl: seed.pnl,
      mood: seed.mood,
      notes: seed.notes,
      isDemo: true,
      session: seed.session,
      timeframe: seed.timeframe,
      entryPrice: seed.entryPrice,
      exitPrice: seed.exitPrice,
      initialRisk: seed.initialRisk,
      tags: [...seed.tags],
      ...(typeof seed.followedPlan === "boolean" ? { followedPlan: seed.followedPlan } : {}),
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
