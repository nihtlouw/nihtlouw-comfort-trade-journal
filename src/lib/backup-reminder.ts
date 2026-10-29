import type { BackupReminderDays } from "@/lib/types";

export type BackupReminderState = { firstSeenAt: number; lastDownloadAt: number | null; snoozedUntil: number | null };
type DeviceStorage = Pick<Storage, "getItem" | "setItem">;
export const backupReminderKey = (scope: string) => `bloom:backup-reminder:v1:${encodeURIComponent(scope)}`;
const DAY_MS = 86_400_000;
const validTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Device-local bookkeeping only; it is deliberately not part of the journal backup. */
export function loadBackupReminder(storage: DeviceStorage, scope: string, now: number): { state: BackupReminderState; available: boolean } {
  const fresh = { firstSeenAt: now, lastDownloadAt: null, snoozedUntil: null };
  try {
    const raw = storage.getItem(backupReminderKey(scope));
    if (!raw) { storage.setItem(backupReminderKey(scope), JSON.stringify(fresh)); return { state: fresh, available: true }; }
    const parsed = JSON.parse(raw) as Partial<BackupReminderState>;
    if (!validTime(parsed.firstSeenAt) || !(parsed.lastDownloadAt === null || validTime(parsed.lastDownloadAt)) || !(parsed.snoozedUntil === null || validTime(parsed.snoozedUntil))) throw new Error("Invalid reminder state");
    return { state: { firstSeenAt: parsed.firstSeenAt, lastDownloadAt: parsed.lastDownloadAt, snoozedUntil: parsed.snoozedUntil }, available: true };
  } catch { return { state: fresh, available: false }; }
}
export function writeBackupReminder(storage: DeviceStorage, scope: string, state: BackupReminderState) {
  try { storage.setItem(backupReminderKey(scope), JSON.stringify(state)); return true; } catch { return false; }
}
export function isBackupReminderDue(state: BackupReminderState, days: BackupReminderDays, now: number) {
  if (!days || (state.snoozedUntil !== null && now < state.snoozedUntil)) return false;
  return now - (state.lastDownloadAt ?? state.firstSeenAt) >= days * DAY_MS;
}
export function snoozeBackupReminder(state: BackupReminderState, now: number) { return { ...state, snoozedUntil: now + 7 * DAY_MS }; }
export function recordBackupDownload(state: BackupReminderState, now: number) { return { ...state, lastDownloadAt: now, snoozedUntil: null }; }
