import type { JournalData, JournalSettings, PlaybookRule, Trade } from "@/lib/types";

const storageKey = "nihtlouw-comfort-trade-journal:v1";

type JournalStorage = Pick<Storage, "getItem" | "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRule(value: unknown): value is PlaybookRule {
  return isRecord(value) && typeof value.id === "string" && typeof value.text === "string"
    && typeof value.checked === "boolean" && typeof value.group === "string"
    && ["Before trading", "While trading", "After trading"].includes(value.group);
}

function isTrade(value: unknown): value is Trade {
  return isRecord(value) && Number.isSafeInteger(value.id) && Number(value.id) > 0
    && ["symbol", "market", "setup", "tradeDate", "pnl", "mood", "notes"].every((key) => typeof value[key] === "string")
    && (value.side === "Long" || value.side === "Short") && typeof value.isDemo === "boolean"
    && value.pnl !== "" && Number.isFinite(Number(value.pnl))
    && /^\d{4}-\d{2}-\d{2}$/.test(String(value.tradeDate));
}

function isSettings(value: unknown): value is JournalSettings {
  return isRecord(value) && value.id === 1 && typeof value.name === "string" && value.name.length > 0
    && (value.mood === null || typeof value.mood === "string")
    && (value.moodDate === null || typeof value.moodDate === "string")
    && typeof value.goal === "string" && Number.isInteger(value.goalProgress)
    && Number(value.goalProgress) >= 0 && Number(value.goalProgress) <= 7
    && Number.isInteger(value.goalTarget) && Number(value.goalTarget) >= 1 && Number(value.goalTarget) <= 7
    && Array.isArray(value.playbook) && value.playbook.every(isRule);
}

export function loadBrowserJournal(storage: JournalStorage, fallback: JournalData): JournalData {
  try {
    const saved = storage.getItem(storageKey);
    if (!saved) return fallback;
    const data: unknown = JSON.parse(saved);
    if (isRecord(data) && Array.isArray(data.trades) && data.trades.every(isTrade) && isSettings(data.settings)) {
      return { trades: data.trades, settings: data.settings };
    }
  } catch {
    // Unavailable storage or damaged data must not stop the UI from loading.
  }
  return fallback;
}

export function saveBrowserJournal(storage: JournalStorage, data: JournalData) {
  try {
    storage.setItem(storageKey, JSON.stringify(data));
  } catch {
    throw new Error("Couldn't save in this browser. Allow site storage or free some space, then try again.");
  }
}