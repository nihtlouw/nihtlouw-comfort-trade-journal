import { z } from "zod";
import { ATTACHMENT_STAGES, DEFAULT_ACCOUNT, MAX_ATTACHMENT_BYTES, MAX_JOURNAL_IMAGE_BYTES, MAX_JOURNAL_PDF_BYTES, MAX_STRATEGY_ITEMS, MAX_STRATEGY_PDF_BYTES, YOUTUBE_VIDEO_CATEGORIES, type JournalData } from "@/lib/types";
import { parseStrategyLinkUrl } from "@/lib/strategy-library";
import { YOUTUBE_ID_REGEX } from "@/lib/youtube";

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
const attachment = z.object({
  id,
  name: z.string().min(1).max(200),
  type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  stage: z.enum(ATTACHMENT_STAGES).optional(),
  caption: z.string().max(180).optional(),
});
const accountSchema = z.object({
  id,
  name: z.string().min(1).max(40),
  startingBalance: z
    .number()
    .finite()
    .min(0)
    .max(99999999999)
    .transform((n) => Math.round(n * 100) / 100)
    .nullable()
    .optional(),
});
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
  followedPlan: z.boolean().nullable().optional(),
  checklist: z.array(z.object({ id, text: z.string().max(160), checked: z.boolean() })).max(100).optional().default([]),
  attachments: z.array(attachment).max(8).optional().default([]),
});
const settings = z.object({
  id: z.literal(1), name: z.string().min(1).max(40), mood: z.string().max(24).nullable(), moodDate: date.nullable(),
  goal: z.string().min(1).max(100), goalProgress: z.number().int().min(0).max(7), goalTarget: z.number().int().min(1).max(7),
  playbook: z.array(rule).max(100),
  accounts: z.array(accountSchema).min(1).max(20).optional(),
  goals: z.array(z.object({ id, text: z.string().min(1).max(100), target: z.number().int().min(1).max(7), progress: z.number().int().min(0).max(7), markedDates: z.array(date).max(1000) })).max(20).optional(),
  moodHistory: z.array(z.object({ date, mood: z.string().min(1).max(24), note: z.string().max(1000) })).max(3660).optional(),
  reflections: z.array(z.object({ id, date, wentWell: z.string().max(2000), learned: z.string().max(2000), nextWeek: z.string().max(2000) })).max(520).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  locale: z.enum(["en", "id"]).optional(),
  reduceMotion: z.boolean().optional(), includeSamples: z.boolean().optional(),
  riskLimits: z.object({ perTrade: z.number().finite().positive().max(99999999999).nullable(), dailyLoss: z.number().finite().positive().max(99999999999).nullable() }).optional(),
  backupReminderDays: z.union([z.literal(0), z.literal(7), z.literal(14), z.literal(30)]).optional(),
  patienceLocale: z.enum(["en", "id"]).optional(),
  patienceMaxTrades: z.number().int().min(1).max(20).optional(),
  walkAwayLogs: z.array(z.object({
    id,
    date,
    accountId: id,
    reason: z.enum(["lock_profit", "stop_giveback", "respect_loss", "protect_focus"]),
    note: z.string().max(240),
  })).max(3660).optional(),
  dayJournals: z.array(z.object({
    date,
    intentionalNoTrade: z.boolean(),
    preMarketPlan: z.string().max(600),
    postSessionNote: z.string().max(1000),
  })).max(3660).optional(),
  setupBlueprints: z.array(z.object({
    id,
    name: z.string().min(1).max(80),
    market: z.string().max(24).optional().default("All"),
    timeframe: z.string().max(40).optional().default(""),
    session: z.string().max(40).optional().default(""),
    entryTrigger: z.string().max(280).optional().default(""),
    invalidation: z.string().max(280).optional().default(""),
    targetPlan: z.string().max(280).optional().default(""),
    notes: z.string().max(400).optional().default(""),
  })).max(30).optional(),
  youtubeLinks: z.array(z.object({
    id,
    videoId: z.string().regex(YOUTUBE_ID_REGEX, "Invalid YouTube video ID"),
    url: z.string().min(1).max(300),
    title: z.string().min(1).max(140),
    category: z.enum(YOUTUBE_VIDEO_CATEGORIES).optional().default("followup"),
    note: z.string().max(400).optional().default(""),
    startSeconds: z.number().int().min(1).max(86400).optional(),
    pinned: z.boolean().optional().default(false),
    addedAt: date,
  })).max(30).optional(),
  strategyLibrary: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        id,
        kind: z.literal("pdf"),
        title: z.string().min(1).max(120),
        fileId: id,
        fileName: z.string().min(1).max(200),
        size: z.number().int().min(1).max(MAX_STRATEGY_PDF_BYTES),
        addedAt: date,
      }),
      z.object({
        id,
        kind: z.literal("link"),
        title: z.string().min(1).max(120),
        url: z.string().min(1).max(500).refine((value) => parseStrategyLinkUrl(value) !== null, "Invalid strategy link URL"),
        addedAt: date,
      }),
    ]),
  ).max(MAX_STRATEGY_ITEMS).optional(),
});
const journal = z.object({ trades: z.array(trade).max(10000), settings }).superRefine((value, ctx) => {
  const ids = value.trades.map((item) => item.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate trade IDs" });
  const accountIds = value.settings.accounts?.map((item) => item.id) ?? [DEFAULT_ACCOUNT.id];
  if (new Set(accountIds).size !== accountIds.length) ctx.addIssue({ code: "custom", message: "Duplicate account IDs" });
  if (value.trades.some((item) => !accountIds.includes(item.accountId))) ctx.addIssue({ code: "custom", message: "A trade references a missing account" });
  const goalIds = value.settings.goals?.map((item) => item.id) ?? [];
  if (new Set(goalIds).size !== goalIds.length) ctx.addIssue({ code: "custom", message: "Duplicate intention IDs" });
  const walkAwayIds = value.settings.walkAwayLogs?.map((item) => item.id) ?? [];
  if (new Set(walkAwayIds).size !== walkAwayIds.length) ctx.addIssue({ code: "custom", message: "Duplicate walk-away log IDs" });
  const dayJournalDates = value.settings.dayJournals?.map((item) => item.date) ?? [];
  if (new Set(dayJournalDates).size !== dayJournalDates.length) ctx.addIssue({ code: "custom", message: "Duplicate day journal dates" });
  const blueprintIds = value.settings.setupBlueprints?.map((item) => item.id) ?? [];
  if (new Set(blueprintIds).size !== blueprintIds.length) ctx.addIssue({ code: "custom", message: "Duplicate setup blueprint IDs" });
  const youtubeIds = value.settings.youtubeLinks?.map((item) => item.id) ?? [];
  if (new Set(youtubeIds).size !== youtubeIds.length) ctx.addIssue({ code: "custom", message: "Duplicate YouTube link IDs" });
  const strategyIds = value.settings.strategyLibrary?.map((item) => item.id) ?? [];
  if (new Set(strategyIds).size !== strategyIds.length) ctx.addIssue({ code: "custom", message: "Duplicate strategy resource IDs" });
  const pdfFiles = new Map<string, { fileName: string; size: number }>();
  for (const item of value.settings.strategyLibrary ?? []) {
    if (item.kind !== "pdf") continue;
    const existing = pdfFiles.get(item.fileId);
    if (existing && (existing.fileName !== item.fileName || existing.size !== item.size)) {
      ctx.addIssue({ code: "custom", message: "Conflicting strategy PDF metadata" });
    }
    pdfFiles.set(item.fileId, { fileName: item.fileName, size: item.size });
  }
  if ([...pdfFiles.values()].reduce((sum, item) => sum + item.size, 0) > MAX_JOURNAL_PDF_BYTES) {
    ctx.addIssue({ code: "custom", message: "Strategy PDF limit exceeded" });
  }
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
  const resolvedLocale = data.settings.locale ?? data.settings.patienceLocale ?? "en";
  return {
    trades: data.trades,
    settings: {
      ...data.settings,
      accounts: (data.settings.accounts ?? [{ ...DEFAULT_ACCOUNT }]).map((account) => ({
        id: account.id,
        name: account.name,
        startingBalance: account.startingBalance ?? null,
      })),
      goals: data.settings.goals ?? [{ id: "original", text: data.settings.goal, target: data.settings.goalTarget, progress: data.settings.goalProgress, markedDates: [] }],
      moodHistory: data.settings.moodHistory ?? legacyMood,
      reflections: data.settings.reflections ?? [],
      theme: data.settings.theme ?? "light",
      locale: resolvedLocale,
      reduceMotion: data.settings.reduceMotion ?? false,
      includeSamples: data.settings.includeSamples ?? true,
      riskLimits: data.settings.riskLimits ?? { perTrade: null, dailyLoss: null },
      backupReminderDays: data.settings.backupReminderDays ?? 7,
      patienceLocale: data.settings.patienceLocale ?? resolvedLocale,
      patienceMaxTrades: data.settings.patienceMaxTrades ?? 3,
      walkAwayLogs: data.settings.walkAwayLogs ?? [],
      dayJournals: data.settings.dayJournals ?? [],
      setupBlueprints: data.settings.setupBlueprints ?? [],
      youtubeLinks: data.settings.youtubeLinks ?? [],
      strategyLibrary: data.settings.strategyLibrary ?? [],
    },
  };
}
