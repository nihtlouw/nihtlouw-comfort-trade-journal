import { z } from "zod";
import { DEFAULT_ACCOUNT, MAX_ATTACHMENT_BYTES, MAX_JOURNAL_IMAGE_BYTES, type JournalData } from "@/lib/types";

export function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const date = z.string().refine(isDate, "Invalid date");
const id = z.string().min(1).max(100);
const numberText = z.string().max(40).refine((value) => value === "" || (Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 99999999999), "Invalid number");
const optionalNumber = numberText.optional().default("");
const rule = z.object({ id, text: z.string().max(160), checked: z.boolean(), group: z.enum(["Before trading", "While trading", "After trading"]) });
const attachment = z.object({ id, name: z.string().min(1).max(200), type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]), size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES) });
const trade = z.object({
  id: z.number().int().positive().safe(),
  symbol: z.string().min(1).max(24), market: z.string().min(1).max(24), side: z.enum(["Long", "Short"]),
  setup: z.string().max(80), tradeDate: date,
  pnl: numberText.refine((value) => value.trim() !== "", "P&L is required"),
  mood: z.string().min(1).max(24), notes: z.string().max(5000), isDemo: z.boolean(),
  accountId: id.optional().default(DEFAULT_ACCOUNT.id),
  entryPrice: optionalNumber, exitPrice: optionalNumber, positionSize: optionalNumber, stopLoss: optionalNumber,
  takeProfit: optionalNumber, fees: optionalNumber, initialRisk: optionalNumber,
  timeframe: z.string().max(40).optional().default(""), session: z.string().max(40).optional().default(""),
  tags: z.array(z.string().min(1).max(30)).max(20).optional().default([]),
  checklist: z.array(z.object({ id, text: z.string().max(160), checked: z.boolean() })).max(100).optional().default([]),
  attachments: z.array(attachment).max(8).optional().default([]),
});
const settings = z.object({
  id: z.literal(1), name: z.string().min(1).max(40), mood: z.string().max(24).nullable(), moodDate: date.nullable(),
  goal: z.string().min(1).max(100), goalProgress: z.number().int().min(0).max(7), goalTarget: z.number().int().min(1).max(7),
  playbook: z.array(rule).max(100),
  accounts: z.array(z.object({ id, name: z.string().min(1).max(40) })).min(1).max(20).optional(),
  goals: z.array(z.object({ id, text: z.string().min(1).max(100), target: z.number().int().min(1).max(7), progress: z.number().int().min(0).max(7), markedDates: z.array(date).max(1000) })).max(20).optional(),
  moodHistory: z.array(z.object({ date, mood: z.string().min(1).max(24), note: z.string().max(1000) })).max(3660).optional(),
  reflections: z.array(z.object({ id, date, wentWell: z.string().max(2000), learned: z.string().max(2000), nextWeek: z.string().max(2000) })).max(520).optional(),
  theme: z.enum(["light", "dark"]).optional(), reduceMotion: z.boolean().optional(), includeSamples: z.boolean().optional(),
  riskLimits: z.object({ perTrade: z.number().finite().positive().max(99999999999).nullable(), dailyLoss: z.number().finite().positive().max(99999999999).nullable() }).optional(),
  backupReminderDays: z.union([z.literal(0), z.literal(7), z.literal(14), z.literal(30)]).optional(),
});
const journal = z.object({ trades: z.array(trade).max(10000), settings }).superRefine((value, ctx) => {
  const ids = value.trades.map((item) => item.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate trade IDs" });
  const accountIds = value.settings.accounts?.map((item) => item.id) ?? [DEFAULT_ACCOUNT.id];
  if (new Set(accountIds).size !== accountIds.length) ctx.addIssue({ code: "custom", message: "Duplicate account IDs" });
  if (value.trades.some((item) => !accountIds.includes(item.accountId))) ctx.addIssue({ code: "custom", message: "A trade references a missing account" });
  const goalIds = value.settings.goals?.map((item) => item.id) ?? [];
  if (new Set(goalIds).size !== goalIds.length) ctx.addIssue({ code: "custom", message: "Duplicate intention IDs" });
  const images = new Map<string, { name: string; type: string; size: number }>();
  for (const item of value.trades.flatMap((entry) => entry.attachments)) {
    const existing = images.get(item.id);
    if (existing && (existing.name !== item.name || existing.type !== item.type || existing.size !== item.size)) ctx.addIssue({ code: "custom", message: "Conflicting screenshot metadata" });
    images.set(item.id, item);
  }
  if ([...images.values()].reduce((sum, item) => sum + item.size, 0) > MAX_JOURNAL_IMAGE_BYTES) ctx.addIssue({ code: "custom", message: "Screenshot limit exceeded" });
});

/** Validates and upgrades v1 data in memory, without changing the saved original. */
export function normalizeJournalData(input: unknown): JournalData {
  const result = journal.safeParse(input);
  if (!result.success) throw new Error("This journal file is invalid or uses an unsupported format.");
  const data = result.data;
  const legacyMood = data.settings.mood && data.settings.moodDate
    ? [{ date: data.settings.moodDate, mood: data.settings.mood, note: "" }] : [];
  return {
    trades: data.trades,
    settings: {
      ...data.settings,
      accounts: data.settings.accounts ?? [{ ...DEFAULT_ACCOUNT }],
      goals: data.settings.goals ?? [{ id: "original", text: data.settings.goal, target: data.settings.goalTarget, progress: data.settings.goalProgress, markedDates: [] }],
      moodHistory: data.settings.moodHistory ?? legacyMood,
      reflections: data.settings.reflections ?? [],
      theme: data.settings.theme ?? "light",
      reduceMotion: data.settings.reduceMotion ?? false,
      includeSamples: data.settings.includeSamples ?? true,
      riskLimits: data.settings.riskLimits ?? { perTrade: null, dailyLoss: null },
      backupReminderDays: data.settings.backupReminderDays ?? 7,
    },
  };
}
