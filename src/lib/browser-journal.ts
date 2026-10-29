import type { JournalData } from "@/lib/types";
import { normalizeJournalData } from "@/lib/journal-data";

// Continue using the original key so existing browser journals are upgraded in place.
export const storageKey = "nihtlouw-comfort-trade-journal:v1";
type JournalStorage = Pick<Storage, "getItem" | "setItem">;

export function inspectBrowserJournal(storage: JournalStorage, fallback: JournalData): { data: JournalData; damaged: string | null } {
  let saved: string | null = null;
  try {
    saved = storage.getItem(storageKey);
    return { data: saved ? normalizeJournalData(JSON.parse(saved)) : normalizeJournalData(fallback), damaged: null };
  } catch {
    // The original is left untouched and writes are blocked until the user decides what to do.
    return { data: normalizeJournalData(fallback), damaged: saved };
  }
}
export function loadBrowserJournal(storage: JournalStorage, fallback: JournalData): JournalData {
  return inspectBrowserJournal(storage, fallback).data;
}
export function saveBrowserJournal(storage: JournalStorage, data: JournalData, allowReplaceDamaged = false) {
  const normalized = normalizeJournalData(data);
  try {
    const existing = storage.getItem(storageKey);
    if (existing && !allowReplaceDamaged) {
      try { normalizeJournalData(JSON.parse(existing)); } catch { throw new Error("Saved journal needs recovery. Download it or restore a backup before making changes."); }
    }
    storage.setItem(storageKey, JSON.stringify(normalized));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Saved journal needs recovery")) throw error;
    throw new Error("Couldn't save in this browser. Allow site storage or free some space, then try again.");
  }
}
