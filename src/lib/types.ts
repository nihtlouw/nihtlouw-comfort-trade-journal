export type PlaybookRule = {
  id: string;
  text: string;
  checked: boolean;
  group: "Before trading" | "While trading" | "After trading";
};

export type Trade = {
  id: number;
  symbol: string;
  market: string;
  side: "Long" | "Short";
  setup: string;
  tradeDate: string;
  pnl: string;
  mood: string;
  notes: string;
  isDemo: boolean;
};

export type JournalSettings = {
  id: number;
  name: string;
  mood: string | null;
  moodDate: string | null;
  goal: string;
  goalProgress: number;
  goalTarget: number;
  playbook: PlaybookRule[];
};

export type JournalData = {
  trades: Trade[];
  settings: JournalSettings;
};

export const MOODS = ["Calm", "Focused", "Anxious", "Tired"] as const;
export const MARKETS = ["Forex", "Stocks", "Crypto", "Futures", "Commodities"] as const;
