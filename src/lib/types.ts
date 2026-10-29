export type PlaybookRule = {
  id: string;
  text: string;
  checked: boolean;
  group: "Before trading" | "While trading" | "After trading";
};

export const ATTACHMENT_STAGES = ["Before", "Entry", "After", "HTF"] as const;
export type AttachmentStage = (typeof ATTACHMENT_STAGES)[number];

export type TradeAttachment = {
  id: string;
  name: string;
  type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  size: number;
  stage?: AttachmentStage;
  caption?: string;
};

export type AppLocale = "en" | "id";
export type PatienceLocale = AppLocale;
export type RuleSnapshot = { id: string; text: string; checked: boolean };
export type TradingAccount = {
  id: string;
  name: string;
  /** Optional starting capital in USD for realized balance tracking. */
  startingBalance?: number | null;
};
export type MoodEntry = { date: string; mood: string; note: string };
export type Intention = { id: string; text: string; target: number; progress: number; markedDates: string[] };
export type WeeklyReflection = { id: string; date: string; wentWell: string; learned: string; nextWeek: string };
/** Informational thresholds, in USD. A null limit is disabled. */
export type RiskLimits = { perTrade: number | null; dailyLoss: number | null };
export type BackupReminderDays = 0 | 7 | 14 | 30;
export type WalkAwayReason = "lock_profit" | "stop_giveback" | "respect_loss" | "protect_focus";
export type WalkAwayLog = { id: string; date: string; accountId: string; reason: WalkAwayReason; note: string };

export type AudioMimeType =
  | "audio/mpeg"
  | "audio/wav"
  | "audio/ogg"
  | "audio/flac"
  | "audio/mp4"
  | "audio/aac"
  | "audio/webm";

export type AudioTrackMeta = {
  id: string;
  title: string;
  fileName: string;
  mimeType: AudioMimeType;
  size: number;
  durationSec: number | null;
  sortOrder: number;
  createdAt: string;
};

export type Trade = {
  id: number;
  symbol: string;
  market: string;
  side: "Long" | "Short";
  setup: string;
  tradeDate: string;
  /** Manually recorded realized net P&L in USD, after fees. */
  pnl: string;
  mood: string;
  notes: string;
  isDemo: boolean;
  // Optional so existing v1 journals remain readable.
  accountId?: string;
  entryPrice?: string;
  exitPrice?: string;
  positionSize?: string;
  stopLoss?: string;
  takeProfit?: string;
  fees?: string;
  initialRisk?: string;
  timeframe?: string;
  session?: string;
  tags?: string[];
  checklist?: RuleSnapshot[];
  attachments?: TradeAttachment[];
};

export type JournalSettings = {
  id: number;
  name: string;
  mood: string | null;
  moodDate: string | null;
  // Keep these v1 fields to preserve old journals and exports.
  goal: string;
  goalProgress: number;
  goalTarget: number;
  playbook: PlaybookRule[];
  accounts?: TradingAccount[];
  goals?: Intention[];
  moodHistory?: MoodEntry[];
  reflections?: WeeklyReflection[];
  theme?: "light" | "dark";
  /** App-wide interface language (English or Bahasa Indonesia). */
  locale?: AppLocale;
  /** Reduce interface motion regardless of the device preference. */
  reduceMotion?: boolean;
  includeSamples?: boolean;
  riskLimits?: RiskLimits;
  /** Reminder preference; last-download status stays on the current device. */
  backupReminderDays?: BackupReminderDays;
  patienceLocale?: PatienceLocale;
  /** Reference daily trade cap used only inside the Patience mirror (1–20). */
  patienceMaxTrades?: number;
  walkAwayLogs?: WalkAwayLog[];
};

export type JournalData = { trades: Trade[]; settings: JournalSettings };
export const MOODS = ["Calm", "Focused", "Anxious", "Tired"] as const;
export const MARKETS = ["Forex", "Stocks", "Crypto", "Futures", "Commodities"] as const;
export const DEFAULT_ACCOUNT: TradingAccount = { id: "main", name: "Main account", startingBalance: null };
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_JOURNAL_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_AUDIO_TRACKS = 5;
export const MAX_AUDIO_TOTAL_BYTES = 200 * 1024 * 1024;
export const AUDIO_CHUNK_BYTES = 2 * 1024 * 1024;
