"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { BarChart3, BookOpenCheck, CalendarDays, CheckCircle2, ChevronDown, CircleAlert, ClipboardList, CloudDownload, Eye, EyeOff, Heart, Hourglass, LayoutDashboard, Menu, NotebookPen, Plus, Search, Settings2, Smartphone, Sparkles, Sprout, Target, X } from "lucide-react";
import type { AppLocale, DayJournalEntry, Intention, JournalData, JournalSettings, PlaybookRule, SavedYoutubeVideo, SetupBlueprint, StrategyLibraryItem, StrategyPdfResource, Trade, TradeAttachment, TradingAccount, WeeklyReflection } from "@/lib/types";
import { DEFAULT_ACCOUNT, MAX_JOURNAL_IMAGE_BYTES, MAX_JOURNAL_PDF_BYTES, MAX_STRATEGY_ITEMS } from "@/lib/types";
import { upsertDayJournal } from "@/lib/analytics";
import type { BillingCycle, BillingProvider, CloudContext } from "@/lib/billing";
import { getLocalDeviceSummary, syncLocalDeviceJournalToCloud } from "@/lib/cloud-migration";
import { todayString, type Period } from "@/lib/format";
import { greetingText, translateAccountName, UI_COPY, writeStoredLocale } from "@/lib/i18n";
import { normalizeJournalData } from "@/lib/journal-data";
import { saveBrowserJournal } from "@/lib/browser-journal";
import { createDemoData } from "@/lib/demo-data";
import { createThreeMonthDummyData, generateDummyChartImages } from "@/lib/dummy-dataset";
import { removeAttachment, saveAttachment, type StorageMode } from "@/lib/attachments";
import { ensurePersistentDeviceStorage } from "@/lib/persistent-storage";
import { buildSampleStrategyPdfBlob, cleanPdfTitle, removeStrategyPdf, saveStrategyPdf, type StoredPdfMeta } from "@/lib/strategy-library";
import { createBackup, downloadFile, parseBackup, stageBackupImages } from "@/lib/backup";
import { exportTradesCsv } from "@/lib/csv";
import { exportTradesXlsx } from "@/lib/xlsx-report";
import { parseTradeInput } from "@/lib/trade-validation";
import { isBackupReminderDue, loadBackupReminder, recordBackupDownload, snoozeBackupReminder, writeBackupReminder, type BackupReminderState } from "@/lib/backup-reminder";
import { WeeklyReview } from "@/components/journal-review";
import { PatienceView } from "@/components/journal-patience";
import { LocalPwaStatus } from "@/components/local-pwa";
import { AnalyticsView, CalendarView, GoalsView, JournalView, MindsetView, Overview, PlaybookView, type JournalFilterPreset, type View } from "@/components/journal-views";
import { BreathingModal, ImportModal, SettingsModal, TradeModal, type PendingAttachmentFile, type SettingsTab, type TradeDraft } from "@/components/journal-dialogs";
import { CassetteDeckModal, CassetteSidebarMini, useCassetteDeck } from "@/components/cassette-player";
import { ChartLightbox, type ChartLightboxSlide } from "@/components/chart-lightbox";
import { RecapCardModal } from "@/components/recap-card-modal";
import { CommandPaletteModal } from "@/components/command-palette";
import { buildStrategyLinkItem } from "@/components/strategy-shelf";

type Modal = "trade" | "settings" | "breathing" | "import" | "cassette" | "recap" | "command" | null;
// Keep this in sync with --bloom-dialog-exit in globals.css.
const MODAL_EXIT_MS = 420;
const workspaceNav: { label: View; icon: ElementType }[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Trade journal", icon: NotebookPen }, { label: "Analytics", icon: BarChart3 }, { label: "Weekly review", icon: ClipboardList }, { label: "Calendar", icon: CalendarDays }, { label: "Playbook", icon: BookOpenCheck },
];
const personalNav: { label: View; icon: ElementType }[] = [{ label: "Mindset", icon: Heart }, { label: "Patience", icon: Hourglass }, { label: "Goals", icon: Target }];

function sortTrades(trades: Trade[]) { return [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id); }
function id() { return crypto.randomUUID(); }

export function JournalApp({
  initialData,
  storage = "browser",
  initialRevision = 0,
  initialDamaged = null,
  backupScope = "browser",
  cloudContext,
  initialOpenCloud = false,
  initialBillingSuccess = false,
}: {
  initialData: JournalData;
  storage?: StorageMode;
  initialRevision?: number;
  initialDamaged?: string | null;
  backupScope?: string;
  cloudContext?: CloudContext;
  initialOpenCloud?: boolean;
  initialBillingSuccess?: boolean;
}) {
  const [data, setData] = useState(() => normalizeJournalData(initialData));
  const dataRef = useRef(data); const revision = useRef(initialRevision); const busyRef = useRef(false);
  const [view, setView] = useState<View>("Overview"); const [period, setPeriod] = useState<Period>("1M"); const [modal, setModal] = useState<Modal>(() => initialOpenCloud ? "settings" : null); const [modalClosing, setModalClosing] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null); const [hidden, setHidden] = useState(false); const [accountFilter, setAccountFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState(""); const [mobileMenu, setMobileMenu] = useState(false); const [saving, setSaving] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(() => initialOpenCloud ? "Cloud" : "General");
  const [migrationNonce, setMigrationNonce] = useState(0);
  const [backupTracking, setBackupTracking] = useState<{ state: BackupReminderState; available: boolean } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false); const backupBusyRef = useRef(false);
  const [online, setOnline] = useState(true); const [reminderClock, setReminderClock] = useState(0);
  const [damaged, setDamaged] = useState(initialDamaged); const [toast, setToast] = useState<{ message: string; error: boolean; breath: boolean } | null>(null);
  const [lightbox, setLightbox] = useState<{ slides: ChartLightboxSlide[]; index: number } | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [ytKeepAlive, setYtKeepAlive] = useState(false);
  const [syncBannerDismissed, setSyncBannerDismissed] = useState(false);
  const [recapWeekStart, setRecapWeekStart] = useState<string | undefined>(undefined);
  const [newTradeDate, setNewTradeDate] = useState<string>("");
  const [calendarFocus, setCalendarFocus] = useState<{ nonce: number; date: string }>({ nonce: 0, date: "" });
  const [journalPresetState, setJournalPresetState] = useState<{ nonce: number; preset: JournalFilterPreset } | null>(null);
  const toastTimer = useRef<number | null>(null); const modalCloseTimer = useRef<number | null>(null); const modalLayer = useRef<HTMLDivElement>(null); const mobileClose = useRef<HTMLButtonElement>(null);

  const locale: AppLocale = data.settings.locale ?? "en";
  const copy = UI_COPY[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    writeStoredLocale(locale);
  }, [locale]);

  const prefersReducedMotion = useCallback(() => dataRef.current.settings.reduceMotion === true || window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const notify = useCallback((message: string, error = false, breath = false) => {
    setToast({ message, error, breath });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 6500 : 4000);
  }, []);

  const cassetteMode: StorageMode = cloudContext?.saasMode ? "browser" : storage;
  const cassetteDeck = useCassetteDeck({
    mode: cassetteMode,
    locale,
    reduceMotion: data.settings.reduceMotion === true,
    onNotify: (msg, isErr) => notify(msg, Boolean(isErr)),
  });

  useEffect(() => {
    void ensurePersistentDeviceStorage();
  }, []);

  useEffect(() => {
    if (!initialBillingSuccess) return;
    const timer = window.setTimeout(() => {
      notify(copy.cloudBillingSuccessToast);
      if (window.history?.replaceState) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("billing");
        window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [copy.cloudBillingSuccessToast, initialBillingSuccess, notify]);

  const openModal = useCallback((next: Exclude<Modal, null>) => {
    if (modalCloseTimer.current !== null) window.clearTimeout(modalCloseTimer.current);
    modalCloseTimer.current = null; setModalClosing(false); setModal(next);
  }, []);
  const openSettings = useCallback((tab: SettingsTab = "General") => { setSettingsTab(tab); openModal("settings"); }, [openModal]);
  const openRecap = useCallback((weekStart?: string) => {
    setRecapWeekStart(weekStart);
    openModal("recap");
  }, [openModal]);
  const closeModal = useCallback(() => {
    if (modalCloseTimer.current !== null) return;
    if (prefersReducedMotion()) { setModal(null); setModalClosing(false); return; }
    const layer = modalLayer.current;
    const panel = layer?.querySelector<HTMLElement>(".modal");
    const backdrop = layer?.querySelector<HTMLElement>(".modal-backdrop");
    if (layer && panel && backdrop) {
      const panelStyle = window.getComputedStyle(panel);
      layer.style.setProperty("--bloom-exit-opacity", panelStyle.opacity);
      layer.style.setProperty("--bloom-exit-transform", panelStyle.transform);
      layer.style.setProperty("--bloom-backdrop-opacity", window.getComputedStyle(backdrop).opacity);
    }
    setModalClosing(true);
    modalCloseTimer.current = window.setTimeout(() => { modalCloseTimer.current = null; setModal(null); setModalClosing(false); }, MODAL_EXIT_MS);
  }, [prefersReducedMotion]);
  useEffect(() => () => { if (modalCloseTimer.current !== null) window.clearTimeout(modalCloseTimer.current); if (toastTimer.current !== null) window.clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    if (!mobileMenu) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => mobileClose.current?.focus(), 40);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobileMenu(false); }
      if (event.key === "Tab") {
        const sidebar = mobileClose.current?.closest("aside");
        const focusable = Array.from(sidebar?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? []).filter((item) => item.offsetParent !== null);
        if (!focusable.length) return;
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
      }
    };
    window.addEventListener("keydown", key);
    return () => { window.clearTimeout(focusTimer); window.removeEventListener("keydown", key); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [mobileMenu]);
  useEffect(() => {
    function refresh() {
      try { setBackupTracking(loadBackupReminder(window.localStorage, backupScope, Date.now())); }
      catch { setBackupTracking({ state: { firstSeenAt: Date.now(), lastDownloadAt: null, snoozedUntil: null }, available: false }); }
      setOnline(window.navigator.onLine); setReminderClock(Date.now());
    }
    const first = window.setTimeout(refresh, 0); const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh); window.addEventListener("offline", refresh); window.addEventListener("storage", refresh);
    return () => { window.clearTimeout(first); window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); window.removeEventListener("storage", refresh); };
  }, [backupScope]);
  useEffect(() => {
    const onGlobalKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMobileMenu(false);
        if (modal === "command") closeModal();
        else openModal("command");
      }
    };
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [closeModal, modal, openModal]);

  const accounts = data.settings.accounts ?? [DEFAULT_ACCOUNT];
  const sampleCount = data.trades.filter((trade) => trade.isDemo).length;
  const visibleTrades = sortTrades(data.trades.filter((trade) => (data.settings.includeSamples !== false || !trade.isDemo) && (accountFilter === "all" || (trade.accountId ?? DEFAULT_ACCOUNT.id) === accountFilter)));
  const defaultAccount = accountFilter === "all" ? accounts[0]?.id ?? DEFAULT_ACCOUNT.id : accountFilter;

  const cloudCacheKey = `bloom.cloudCache.${cloudContext?.user?.id ?? backupScope}`;
  const cloudDirtyKey = `bloom.cloudDirty.${cloudContext?.user?.id ?? backupScope}`;

  useEffect(() => {
    if (storage !== "server") return;
    try {
      window.localStorage.setItem(cloudCacheKey, JSON.stringify(dataRef.current));
    } catch {
      // Ignore quota errors on local cache mirror
    }
    const flushOfflineChanges = async () => {
      if (busyRef.current || !window.navigator.onLine) return;
      try {
        if (window.localStorage.getItem(cloudDirtyKey) !== "1") return;
        const cachedRaw = window.localStorage.getItem(cloudCacheKey);
        if (!cachedRaw) return;
        const cachedData = normalizeJournalData(JSON.parse(cachedRaw));
        busyRef.current = true;
        setSaving(true);
        const response = await fetch("/api/journal", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: revision.current, data: cachedData }),
        });
        if (response.ok) {
          const result = (await response.json()) as { revision: number };
          revision.current = result.revision;
          window.localStorage.removeItem(cloudDirtyKey);
        }
      } catch {
        // Keep dirty flag for next reconnect
      } finally {
        busyRef.current = false;
        setSaving(false);
      }
    };
    window.addEventListener("online", flushOfflineChanges);
    return () => window.removeEventListener("online", flushOfflineChanges);
  }, [cloudCacheKey, cloudDirtyKey, storage]);

  async function commit(next: JournalData, success?: string, allowReplaceDamaged = false) {
    if (busyRef.current) { notify(locale === "id" ? "Sedang menyelesaikan penyimpanan sebelumnya. Coba sesaat lagi." : "Finishing the last save. Please try again in a moment.", true); return false; }
    busyRef.current = true; setSaving(true);
    try {
      const normalized = normalizeJournalData(next);
      if (storage === "browser") saveBrowserJournal(window.localStorage, normalized, allowReplaceDamaged);
      else if (!window.navigator.onLine) {
        try {
          window.localStorage.setItem(cloudCacheKey, JSON.stringify(normalized));
          window.localStorage.setItem(cloudDirtyKey, "1");
        } catch {
          throw new Error("Offline cache storage is full.");
        }
      } else {
        const response = await fetch("/api/journal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: revision.current, data: normalized }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Couldn’t save your journal.");
        revision.current = result.revision;
        try {
          window.localStorage.setItem(cloudCacheKey, JSON.stringify(normalized));
          window.localStorage.removeItem(cloudDirtyKey);
        } catch {
          // Non-fatal offline mirror write
        }
      }
      dataRef.current = normalized; setData(normalized); if (allowReplaceDamaged) setDamaged(null); if (success) notify(success); return true;
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn’t save your journal.", true); return false; }
    finally { busyRef.current = false; setSaving(false); }
  }
  async function updateSettings(patch: Partial<JournalSettings>, message?: string) { return commit({ ...dataRef.current, settings: { ...dataRef.current.settings, ...patch } }, message); }
  async function removeUnusedImages(images: TradeAttachment[]) {
    const used = new Set(dataRef.current.trades.flatMap((trade) => (trade.attachments ?? []).map((item) => item.id)));
    await Promise.allSettled(images.filter((item) => !used.has(item.id)).map((item) => removeAttachment(item.id, storage)));
  }
  async function removeUnusedPdfs(docs: StrategyPdfResource[]) {
    const used = new Set(
      (dataRef.current.settings.strategyLibrary ?? [])
        .filter((item): item is StrategyPdfResource => item.kind === "pdf")
        .map((item) => item.fileId),
    );
    await Promise.allSettled(
      docs.filter((doc) => !used.has(doc.fileId)).map((doc) => removeStrategyPdf(doc.fileId, storage)),
    );
  }
  async function addStrategyPdf(file: File, customTitle: string) {
    const currentList = dataRef.current.settings.strategyLibrary ?? [];
    if (currentList.length >= MAX_STRATEGY_ITEMS) {
      throw new Error(copy.libLimitError);
    }
    const existingPdfBytes = currentList
      .filter((item): item is StrategyPdfResource => item.kind === "pdf")
      .reduce((sum, item) => sum + item.size, 0);
    if (existingPdfBytes + file.size > MAX_JOURNAL_PDF_BYTES) {
      throw new Error(locale === "id" ? "Batas penyimpanan PDF strategi tercapai (40 MB)." : "Strategy PDF storage quota reached (40 MB).");
    }
    const stored = await saveStrategyPdf(file, file.name, storage);
    const nextItem: StrategyPdfResource = {
      id: id(),
      kind: "pdf",
      title: (customTitle.trim() || cleanPdfTitle(file.name)).slice(0, 120),
      fileId: stored.fileId,
      fileName: stored.fileName,
      size: stored.size,
      addedAt: todayString(),
    };
    const ok = await updateSettings({ strategyLibrary: [nextItem, ...currentList] }, copy.libSavedToast);
    if (!ok) {
      await Promise.allSettled([removeStrategyPdf(stored.fileId, storage)]);
      return false;
    }
    return true;
  }
  async function addStrategyLink(url: string, title: string) {
    const currentList = dataRef.current.settings.strategyLibrary ?? [];
    if (currentList.length >= MAX_STRATEGY_ITEMS) {
      throw new Error(copy.libLimitError);
    }
    const nextItem = buildStrategyLinkItem(url, title);
    return updateSettings({ strategyLibrary: [nextItem, ...currentList] }, copy.libSavedToast);
  }
  async function removeStrategyItem(target: StrategyLibraryItem) {
    const currentList = dataRef.current.settings.strategyLibrary ?? [];
    const nextList = currentList.filter((item) => item.id !== target.id);
    const ok = await updateSettings({ strategyLibrary: nextList }, copy.libRemovedToast);
    if (ok && target.kind === "pdf") {
      await removeUnusedPdfs([target]);
    }
    return ok;
  }
  async function saveTrade(draft: TradeDraft, files: PendingAttachmentFile[], removed: TradeAttachment[], tradeId?: number) {
    const staged: TradeAttachment[] = [];
    try {
      const removedIds = new Set(removed.map((item) => item.id));
      const existingImages = new Map(dataRef.current.trades.flatMap((trade) => (trade.attachments ?? []).filter((image) => trade.id !== tradeId || !removedIds.has(image.id))).map((image) => [image.id, image]));
      const totalBytes = [...existingImages.values()].reduce((sum, image) => sum + image.size, 0) + files.reduce((sum, entry) => sum + entry.file.size, 0);
      if (totalBytes > MAX_JOURNAL_IMAGE_BYTES) throw new Error(locale === "id" ? "Jurnal dapat menyimpan hingga 30 MB screenshot. Hapus beberapa gambar terlebih dahulu." : "Your journal can store up to 30 MB of screenshots. Remove some images before adding more.");
      for (const pending of files) {
        const saved = await saveAttachment(pending.file, pending.file.name, storage);
        staged.push({
          ...saved,
          ...(pending.stage ? { stage: pending.stage } : {}),
          ...(pending.caption?.trim() ? { caption: pending.caption.trim().slice(0, 180) } : {}),
        });
      }
      const parsed = parseTradeInput({ ...draft, attachments: [...draft.attachments, ...staged] });
      const current = dataRef.current; const existing = current.trades.find((trade) => trade.id === tradeId);
      const nextTrade: Trade = { ...parsed, id: tradeId ?? Math.max(0, ...current.trades.map((trade) => trade.id)) + 1, isDemo: existing?.isDemo ?? false };
      const nextTrades = tradeId ? current.trades.map((trade) => trade.id === tradeId ? nextTrade : trade) : [nextTrade, ...current.trades];
      const ok = await commit({ ...current, trades: sortTrades(nextTrades) }, tradeId ? (locale === "id" ? "Trade diperbarui." : "Trade updated.") : (locale === "id" ? "Trade tersimpan." : "Trade saved."));
      if (!ok) { await Promise.allSettled(staged.map((item) => removeAttachment(item.id, storage))); return false; }
      await removeUnusedImages(removed); if (!tradeId && Number(parsed.pnl) < 0) notify(locale === "id" ? "Trade tersimpan. Ambil jeda tenang bila perlu." : "Trade saved. Take a moment if you need one.", false, true); return true;
    } catch (error) { await Promise.allSettled(staged.map((item) => removeAttachment(item.id, storage))); notify(error instanceof Error ? error.message : "Couldn’t save this trade.", true); return false; }
  }
  async function deleteTrade(tradeId: number) {
    const current = dataRef.current; const old = current.trades.find((trade) => trade.id === tradeId);
    const ok = await commit({ ...current, trades: current.trades.filter((trade) => trade.id !== tradeId) }, locale === "id" ? "Trade dihapus dari jurnal." : "Trade removed from your journal.");
    if (ok && old) await removeUnusedImages(old.attachments ?? []);
    return ok;
  }
  async function clearSamples() { const current = dataRef.current; const samples = current.trades.filter((trade) => trade.isDemo); const ok = await commit({ ...current, trades: current.trades.filter((trade) => !trade.isDemo) }, locale === "id" ? "Trade contoh dihapus." : "Sample trades cleared."); if (ok) await removeUnusedImages(samples.flatMap((trade) => trade.attachments ?? [])); return ok; }
  function newTrade(explicitDate?: unknown) {
    const prefill = typeof explicitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)
      ? explicitDate
      : view === "Trade journal" && selectedDay
        ? selectedDay
        : "";
    setNewTradeDate(prefill);
    setEditing(null);
    openModal("trade");
  }
  function editTrade(trade: Trade) { setEditing(trade); openModal("trade"); }
  function openTradeCharts(trade: Trade, startIndex = 0) {
    const shots = trade.attachments ?? [];
    if (!shots.length) return;
    setLightbox({
      slides: shots.map((att) => ({
        key: `${trade.id}-${att.id}`,
        attachment: att,
        name: att.name,
        stage: att.stage,
        caption: att.caption,
        trade,
      })),
      index: startIndex,
    });
  }
  function scrollToTop() { window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" }); }
  function navigate(next: View) {
    setView(next);
    setMobileMenu(false);
    if (next !== "Trade journal") {
      setSelectedDay("");
      setJournalPresetState(null);
    }
    if (next === "Calendar") {
      setCalendarFocus({ nonce: 0, date: "" });
    }
    scrollToTop();
  }
  function day(date: string) { setJournalPresetState(null); setSelectedDay(date); setView("Trade journal"); scrollToTop(); }
  function openCalendarDay(date: string) {
    setMobileMenu(false);
    setSelectedDay("");
    setCalendarFocus((prev) => ({ nonce: prev.nonce + 1, date }));
    setView("Calendar");
    scrollToTop();
  }
  function filterJournal(preset: JournalFilterPreset) {
    setMobileMenu(false);
    setSelectedDay("");
    setJournalPresetState((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, preset }));
    setView("Trade journal");
    scrollToTop();
  }
  function selectMood(mood: string) { const today = todayString(); const previous = dataRef.current.settings.moodHistory ?? []; const note = previous.find((item) => item.date === today)?.note ?? ""; void updateSettings({ mood, moodDate: today, moodHistory: [...previous.filter((item) => item.date !== today), { date: today, mood, note }] }, locale === "id" ? "Kondisi hari ini tersimpan." : "Check-in saved."); }
  function saveMoodNote(note: string) {
    const today = todayString();
    const trimmed = note.trim().slice(0, 1000);
    const previous = dataRef.current.settings.moodHistory ?? [];
    const exists = previous.some((item) => item.date === today);
    const fallbackMood = dataRef.current.settings.mood || "Calm";
    const nextHistory = exists
      ? previous.map((item) => item.date === today ? { ...item, note: trimmed } : item)
      : [...previous, { date: today, mood: fallbackMood, note: trimmed }];
    void updateSettings(
      { ...(exists ? {} : { mood: fallbackMood, moodDate: today }), moodHistory: nextHistory },
      locale === "id" ? "Catatan kondisi tersimpan." : "Check-in note saved.",
    );
  }
  function saveDayJournal(entry: DayJournalEntry) {
    const next = upsertDayJournal(dataRef.current.settings.dayJournals ?? [], entry);
    return updateSettings({ dayJournals: next }, copy.dayJournalSavedToast);
  }
  function updateGoals(goals: Intention[], message?: string) { const first = goals[0]; return updateSettings({ goals, ...(first ? { goal: first.text, goalTarget: first.target, goalProgress: first.progress } : {}) }, message); }
  function markGoal(goalId: string) { const goals = dataRef.current.settings.goals ?? []; const today = todayString(); void updateGoals(goals.map((goal) => goal.id === goalId && goal.progress < goal.target && !goal.markedDates.includes(today) ? { ...goal, progress: goal.progress + 1, markedDates: [...goal.markedDates, today] } : goal), locale === "id" ? "Progres tersimpan." : "Progress saved."); }
  function undoGoal(goalId: string) { const goals = dataRef.current.settings.goals ?? []; void updateGoals(goals.map((goal) => goal.id === goalId && goal.progress > 0 ? { ...goal, progress: goal.progress - 1, markedDates: goal.markedDates.slice(0, -1) } : goal)); }
  function resetGoal(goalId: string) { void updateGoals((dataRef.current.settings.goals ?? []).map((goal) => goal.id === goalId ? { ...goal, progress: 0, markedDates: [] } : goal)); }
  function deleteGoal(goalId: string) { if (window.confirm(locale === "id" ? "Hapus target kebiasaan ini?" : "Remove this intention?")) void updateGoals((dataRef.current.settings.goals ?? []).filter((goal) => goal.id !== goalId), locale === "id" ? "Target dihapus." : "Intention removed."); }
  async function addGoal(goal: Intention) { const goals = dataRef.current.settings.goals ?? []; if (goals.length >= 20) { notify(locale === "id" ? "Maksimal 20 target kebiasaan." : "You can have up to 20 intentions.", true); return false; } return updateGoals([...goals, goal], locale === "id" ? "Target ditambahkan." : "Intention added."); }
  async function addAccount(name: string, startingBalance: number | null) {
    const current = dataRef.current.settings.accounts ?? [DEFAULT_ACCOUNT];
    if (current.length >= 20 || current.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      notify(locale === "id" ? "Gunakan nama akun yang unik (maksimal 20 akun)." : "Choose a unique account name (up to 20 accounts).", true);
      return false;
    }
    return updateSettings(
      { accounts: [...current, { id: id(), name: name.slice(0, 40), startingBalance }] },
      locale === "id" ? "Akun ditambahkan." : "Account added.",
    );
  }
  async function updateAccount(accountId: string, patch: { name: string; startingBalance: number | null }) {
    const current = dataRef.current.settings.accounts ?? [DEFAULT_ACCOUNT];
    const trimmed = patch.name.trim().slice(0, 40);
    if (!trimmed || current.some((item) => item.id !== accountId && item.name.toLowerCase() === trimmed.toLowerCase())) {
      notify(locale === "id" ? "Gunakan nama akun yang unik." : "Choose a unique account name.", true);
      return false;
    }
    return updateSettings(
      {
        accounts: current.map((item) =>
          item.id === accountId ? { ...item, name: trimmed, startingBalance: patch.startingBalance } : item,
        ),
      },
      locale === "id" ? "Akun & saldo awal diperbarui." : "Account updated.",
    );
  }
  async function removeAccount(accountId: string) { const current = dataRef.current; if (current.trades.some((trade) => (trade.accountId ?? DEFAULT_ACCOUNT.id) === accountId)) { notify(locale === "id" ? "Pindahkan atau hapus trade pada akun ini sebelum menghapusnya." : "Move or delete this account’s trades before removing it.", true); return false; } const next = (current.settings.accounts ?? []).filter((account) => account.id !== accountId); if (!next.length) return false; const ok = await updateSettings({ accounts: next }, locale === "id" ? "Akun dihapus." : "Account removed."); if (ok && accountFilter === accountId) setAccountFilter("all"); return ok; }
  function saveBackupTracking(state: BackupReminderState) {
    let available = false; try { available = writeBackupReminder(window.localStorage, backupScope, state); } catch { /* Device storage is unavailable. */ }
    setBackupTracking({ state, available }); setReminderClock(Date.now()); return available;
  }
  function resetBackupTracking() { saveBackupTracking({ firstSeenAt: Date.now(), lastDownloadAt: null, snoozedUntil: null }); }
  async function backup() {
    if (backupBusyRef.current) return;
    if (damaged !== null) { notify(locale === "id" ? "Jurnal memerlukan pemulihan. Unduh file asli terlebih dahulu." : "Your saved journal needs recovery. Download the original from the recovery notice first.", true); return; }
    if (busyRef.current) { notify(locale === "id" ? "Tunggu penyimpanan selesai sebelum membuat cadangan." : "Wait for the current save to finish before creating a backup.", true); return; }
    backupBusyRef.current = true; setBackupBusy(true);
    try {
      const content = await createBackup(dataRef.current, storage);
      downloadFile(`bloom-backup-${todayString()}.json`, content, "application/json");
      let state = backupTracking?.state;
      if (!state) { try { state = loadBackupReminder(window.localStorage, backupScope, Date.now()).state; } catch { state = { firstSeenAt: Date.now(), lastDownloadAt: null, snoozedUntil: null }; } }
      const remembered = saveBackupTracking(recordBackupDownload(state, Date.now()));
      notify(remembered ? (locale === "id" ? "Unduhan cadangan dimulai. Simpan file yang tidak terenkripsi ini di tempat aman." : "Backup download started. Keep the unencrypted file somewhere private.") : (locale === "id" ? "Unduhan dimulai, namun riwayat pengingat tidak dapat disimpan di perangkat ini." : "Download started, but reminder history couldn’t be saved on this device."), !remembered);
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn’t create a backup.", true); }
    finally { backupBusyRef.current = false; setBackupBusy(false); }
  }
  function snoozeBackup() { if (!backupTracking) return; const ok = saveBackupTracking(snoozeBackupReminder(backupTracking.state, Date.now())); if (!ok) notify("Couldn’t save reminder history on this device.", true); }
  function exportCsv(trades: Trade[]) {
    downloadFile(
      `bloom-trades-${todayString()}.csv`,
      exportTradesCsv(trades, dataRef.current.settings.accounts ?? [DEFAULT_ACCOUNT], locale),
      "text/csv;charset=utf-8",
    );
    notify(locale === "id" ? "Laporan CSV diunduh." : "CSV report downloaded.");
  }
  function exportXlsx(trades: Trade[]) {
    try {
      const bytes = exportTradesXlsx(trades, dataRef.current.settings.accounts ?? [DEFAULT_ACCOUNT], locale);
      downloadFile(
        `bloom-trades-${todayString()}.xlsx`,
        bytes.slice(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      notify(locale === "id" ? "Laporan Excel (.xlsx) diunduh." : "Excel (.xlsx) report downloaded.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn’t export Excel report.", true);
    }
  }
  async function restore(file: File) {
    let staged: TradeAttachment[] = [];
    let stagedDocs: StoredPdfMeta[] = [];
    try {
      if (file.size > 50_000_000) throw new Error("Backup files must be under 50 MB.");
      const parsed = await parseBackup(await file.text()); const result = await stageBackupImages(parsed, storage); staged = result.staged; stagedDocs = result.stagedDocs;
      const oldImages = dataRef.current.trades.flatMap((trade) => trade.attachments ?? []);
      const oldDocs = (dataRef.current.settings.strategyLibrary ?? []).filter((item): item is StrategyPdfResource => item.kind === "pdf");
      const ok = await commit(result.journal, locale === "id" ? "Cadangan berhasil dipulihkan." : "Backup restored successfully.", true);
      if (!ok) {
        await Promise.allSettled(staged.map((image) => removeAttachment(image.id, storage)));
        await Promise.allSettled(stagedDocs.map((doc) => removeStrategyPdf(doc.fileId, storage)));
        return false;
      }
      await removeUnusedImages(oldImages); await removeUnusedPdfs(oldDocs); setAccountFilter("all"); resetBackupTracking(); return true;
    } catch (error) {
      await Promise.allSettled(staged.map((image) => removeAttachment(image.id, storage)));
      await Promise.allSettled(stagedDocs.map((doc) => removeStrategyPdf(doc.fileId, storage)));
      notify(error instanceof Error ? error.message : "Couldn’t restore this backup.", true);
      return false;
    }
  }
  async function loadThreeMonthDummy() {
    let staged: TradeAttachment[] = [];
    let stagedDocs: StoredPdfMeta[] = [];
    try {
      const dummy = createThreeMonthDummyData(locale);
      dummy.settings.theme = dataRef.current.settings.theme ?? "light";
      dummy.settings.darkVariant = dataRef.current.settings.darkVariant ?? "forest";
      dummy.settings.reduceMotion = dataRef.current.settings.reduceMotion ?? false;
      const charts = await generateDummyChartImages();
      for (const spec of charts) {
        let targetIdx = -1;
        for (let i = dummy.trades.length - 1; i >= 0; i--) {
          if (dummy.trades[i].symbol === spec.targetSymbol) {
            targetIdx = i;
            break;
          }
        }
        if (targetIdx < 0) continue;
        const saved = await saveAttachment(spec.blob, spec.fileName, storage);
        const withMeta: TradeAttachment = {
          ...saved,
          stage: spec.stage,
          caption: locale === "id" ? spec.captionId : spec.captionEn,
        };
        staged.push(withMeta);
        dummy.trades[targetIdx].attachments = [...(dummy.trades[targetIdx].attachments ?? []), withMeta];
      }
      const samplePdfName = locale === "id" ? "Ringkasan_Buku_Strategi_A+.pdf" : "A+_Strategy_Playbook_Notes.pdf";
      const savedPdf = await saveStrategyPdf(buildSampleStrategyPdfBlob(locale), samplePdfName, storage);
      stagedDocs.push(savedPdf);
      const samplePdfItem: StrategyPdfResource = {
        id: "strat-pdf-sample",
        kind: "pdf",
        title: locale === "id" ? "Ringkasan Buku Strategi A+" : "A+ Strategy Playbook Notes",
        fileId: savedPdf.fileId,
        fileName: savedPdf.fileName,
        size: savedPdf.size,
        addedAt: todayString(),
      };
      dummy.settings.strategyLibrary = [samplePdfItem, ...(dummy.settings.strategyLibrary ?? [])];
      dummy.trades = sortTrades(dummy.trades);
      const oldImages = dataRef.current.trades.flatMap((trade) => trade.attachments ?? []);
      const oldDocs = (dataRef.current.settings.strategyLibrary ?? []).filter((item): item is StrategyPdfResource => item.kind === "pdf");
      const ok = await commit(
        dummy,
        locale === "id"
          ? `Data uji 3 bulan dimuat (${dummy.trades.length} trade, 2 akun, & ${staged.length} chart).`
          : `3-month test data loaded (${dummy.trades.length} trades, 2 accounts, & ${staged.length} charts).`,
        true,
      );
      if (!ok) {
        await Promise.allSettled(staged.map((image) => removeAttachment(image.id, storage)));
        await Promise.allSettled(stagedDocs.map((doc) => removeStrategyPdf(doc.fileId, storage)));
        return false;
      }
      await removeUnusedImages(oldImages);
      await removeUnusedPdfs(oldDocs);
      setAccountFilter("all");
      setPeriod("3M");
      return true;
    } catch (error) {
      await Promise.allSettled(staged.map((image) => removeAttachment(image.id, storage)));
      await Promise.allSettled(stagedDocs.map((doc) => removeStrategyPdf(doc.fileId, storage)));
      notify(error instanceof Error ? error.message : "Couldn’t load 3-month test data.", true);
      return false;
    }
  }
  async function importTrades(trades: Trade[], newAccounts: TradingAccount[] = []) {
    const current = dataRef.current;
    const currentAccounts = current.settings.accounts ?? [DEFAULT_ACCOUNT];
    const mergedAccounts = newAccounts.length ? [...currentAccounts, ...newAccounts] : currentAccounts;
    return commit(
      {
        ...current,
        trades: sortTrades([...trades, ...current.trades]),
        settings: { ...current.settings, accounts: mergedAccounts },
      },
      locale === "id"
        ? `${trades.length} trade berhasil diimpor.`
        : `${trades.length} ${trades.length === 1 ? "trade" : "trades"} imported.`,
    );
  }
  async function signOut() {
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Couldn’t sign out.");
      window.location.replace("/");
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn’t sign out.", true); }
  }
  async function startCheckout(provider: BillingProvider, cycle: BillingCycle) {
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, cycle }),
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Couldn’t start checkout.");
      }
      window.location.assign(result.url);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn’t start checkout.", true);
    }
  }
  async function migrateLocalToCloud() {
    if (storage !== "server") return;
    try {
      const { addedTrades, uploadedImages, uploadedPdfs, mergedData, revision: nextRevision } =
        await syncLocalDeviceJournalToCloud();
      revision.current = nextRevision;
      dataRef.current = mergedData;
      setData(mergedData);
      try {
        window.localStorage.setItem(cloudCacheKey, JSON.stringify(mergedData));
        window.localStorage.removeItem(cloudDirtyKey);
      } catch {
        // Non-fatal offline mirror write
      }
      notify(copy.cloudMigratedToast(addedTrades, uploadedImages + uploadedPdfs));
      setMigrationNonce((n) => n + 1);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn’t sync local data to Cloud.", true);
    }
  }

  const localSummary = useMemo(() => {
    void migrationNonce;
    void data;
    if (storage !== "server" || typeof window === "undefined") return null;
    try {
      return getLocalDeviceSummary();
    } catch {
      return null;
    }
  }, [data, migrationNonce, storage]);

  const displayPersonName = locale === "id" && data.settings.name === "friend" ? "kawan" : data.settings.name;
  const common = {
    trades: visibleTrades,
    allTrades: data.trades,
    accountFilter,
    settings: data.settings,
    hidden,
    mode: storage,
    onEditTrade: editTrade,
    onNewTrade: newTrade,
    onView: navigate,
    onDay: day,
    onMood: selectMood,
    onMarkGoal: markGoal,
    onRiskSettings: () => openSettings("Risk"),
    onAccountsSettings: () => openSettings("Accounts"),
    onPreviewCharts: openTradeCharts,
    onUpdateYoutubeLinks: (youtubeLinks: SavedYoutubeVideo[], message?: string) => updateSettings({ youtubeLinks }, message),
    onAddStrategyPdf: addStrategyPdf,
    onAddStrategyLink: addStrategyLink,
    onRemoveStrategyItem: removeStrategyItem,
    onNotifyError: (msg: string) => notify(msg, true),
    period,
    onPeriod: setPeriod,
  };
  const title = view === "Overview" ? `${greetingText(locale)}, ${displayPersonName}` : copy.views[view].title;
  const showTradeControls = view !== "Playbook" && view !== "Goals";
  const showAmountsControl = view !== "Goals" && view !== "Mindset";
  const activeAccountLabel =
    accountFilter === "all"
      ? copy.allAccounts
      : translateAccountName(accounts.find((a) => a.id === accountFilter)?.name ?? DEFAULT_ACCOUNT.name, locale);

  return <div className="app-shell" data-theme={data.settings.theme ?? "light"} data-dark-variant={data.settings.darkVariant ?? "forest"} data-motion={data.settings.reduceMotion ? "reduced" : "system"} data-zen={zenMode ? "true" : undefined}>
    {cassetteDeck.audioElement}
    <aside id="primary-sidebar" className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}><button type="button" className="brand" onClick={() => navigate("Overview")} aria-label={copy.bloomHome}><span className="brand-mark"><Sprout size={25} strokeWidth={1.6}/></span><span className="brand-word"><strong>bloom<span>.</span></strong><small>{copy.brandSub}</small></span></button><button type="button" ref={mobileClose} className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label={copy.closeNav}><X size={20}/></button>
      <div className="sidebar-scroll"><div className="nav-label">{copy.navWorkspace} <span>✳</span></div><nav className="sidebar-nav" aria-label={copy.navLabelWorkspace}>{workspaceNav.map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} aria-current={view === label ? "page" : undefined} onClick={() => navigate(label)}><Icon size={18} strokeWidth={1.7}/><span>{copy.views[label].nav}</span>{view === label && <span className="nav-active-dot"/>}</button>)}</nav><div className="nav-label personal-label">{copy.navWellbeing} <span>✳</span></div><nav className="sidebar-nav" aria-label={copy.navLabelWellbeing}>{personalNav.map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} aria-current={view === label ? "page" : undefined} onClick={() => navigate(label)}><Icon size={18} strokeWidth={1.7}/><span>{copy.views[label].nav}</span>{view === label && <span className="nav-active-dot"/>}</button>)}</nav>
      <div className="sidebar-mobile-tools">
        <button type="button" className="sidebar-tool-btn" onClick={() => { setMobileMenu(false); openModal("command"); }} aria-label={copy.cmdTriggerAria}><Search size={15}/> <span>{copy.cmdTriggerLabel}</span><kbd className="sidebar-tool-kbd">⌘K</kbd></button>
        <button type="button" className={`sidebar-tool-btn ${zenMode ? "active" : ""}`} aria-pressed={zenMode} onClick={() => { setMobileMenu(false); setZenMode((z) => !z); }}><Sparkles size={15}/> <span>{zenMode ? copy.zenExitBtn : copy.zenModeBtn}</span></button>
      </div>
      <div className="sidebar-mobile-lang"><div className="segment-control" role="group" aria-label={copy.languageToggleAria}><button type="button" className={locale === "en" ? "selected" : ""} aria-pressed={locale === "en"} onClick={() => void updateSettings({ locale: "en", patienceLocale: "en" })}>English</button><button type="button" className={locale === "id" ? "selected" : ""} aria-pressed={locale === "id"} onClick={() => void updateSettings({ locale: "id", patienceLocale: "id" })}>Indonesia</button></div></div></div>
      <div className="sidebar-bottom">
        <CassetteSidebarMini deck={cassetteDeck} locale={locale} onOpen={() => { setMobileMenu(false); openModal("cassette"); }}/>
        <button type="button" className="profile-button" aria-label={copy.openSettings} onClick={() => { setMobileMenu(false); openSettings(); }}><span className="avatar">{data.settings.name.charAt(0).toUpperCase()}</span><span><strong>{data.settings.name === "friend" ? copy.mySpace : data.settings.name}</strong><small>{copy.settings} · {storage === "browser" ? copy.personalJournal : copy.syncedJournal}</small></span><Settings2 size={16}/></button>
      </div>
    </aside><button type="button" className={`mobile-scrim ${mobileMenu ? "is-visible" : ""}`} onClick={() => setMobileMenu(false)} aria-label={copy.closeNav} aria-hidden={!mobileMenu} tabIndex={-1}/>
    <main className="main-shell">
      <div className="page-content"><div className="page-heading"><div className="page-heading-copy" key={view}><h1>{title}{view === "Overview" && <span className="greeting-sun"> ☀</span>}</h1></div><div className="heading-actions">{showAmountsControl && <button type="button" className="privacy-button" onClick={() => setHidden(!hidden)} aria-label={hidden ? copy.showAmounts : copy.hideAmounts} title={hidden ? copy.showAmounts : copy.hideAmounts}>{hidden ? <EyeOff size={17}/> : <Eye size={17}/>}</button>}<button type="button" className="button-primary new-trade-button" onClick={newTrade}><Plus size={18}/> {copy.logATrade}</button></div></div>
        {damaged !== null && <div className="recovery-banner" role="alert"><CircleAlert size={20}/><div><strong>{copy.recoveryTitle}</strong><p>{copy.recoveryBody}</p><div><button type="button" onClick={() => downloadFile("bloom-damaged-journal.txt", damaged, "text/plain")}>{copy.downloadOriginal}</button><button type="button" onClick={() => openSettings()}>{copy.restoreInSettings}</button><button type="button" onClick={() => { if (window.confirm(copy.confirmStartFresh)) void commit(createDemoData(), locale === "id" ? "Jurnal baru telah siap." : "A fresh journal is ready.", true).then((ok) => { if (ok) resetBackupTracking(); }); }}>{copy.startFresh}</button></div></div></div>}
        {storage === "browser" && view === "Overview" && <LocalPwaStatus locale={locale}/>}
        {storage === "server" && online && view === "Overview" && !syncBannerDismissed && <section className="local-pwa-status local-pwa-compact" aria-label="Private and browser journal information"><span className="local-pwa-icon"><Smartphone size={15}/></span><div><strong>{copy.privateSyncBannerTitle}</strong></div><a className="button-secondary" href="/local/">{copy.openBrowserJournal}</a><button type="button" className="icon-button banner-dismiss-btn" onClick={() => setSyncBannerDismissed(true)} aria-label={copy.dismissBannerAria}><X size={15}/></button></section>}
        {storage === "server" && !online && <div className="offline-notice" role="status"><CircleAlert size={19}/><div><strong>{copy.offlineTitle}</strong><p>{copy.offlineBody}</p><a href="/local/">{copy.openBrowserOnlyJournal}</a></div></div>}
        {damaged === null && backupTracking?.available && isBackupReminderDue(backupTracking.state, data.settings.backupReminderDays ?? 7, reminderClock) && <section className="backup-reminder" aria-label="Backup reminder"><span className="backup-reminder-icon"><CloudDownload size={20}/></span><div><strong>{copy.backupDueTitle}</strong><p>{backupTracking.state.lastDownloadAt ? copy.backupDueSince : copy.backupDueNever} {copy.backupUnencrypted}</p></div><div className="backup-reminder-actions"><button type="button" className="button-secondary" disabled={backupBusy} onClick={() => void backup()}>{backupBusy ? copy.preparing : copy.backUpNow}</button><button type="button" className="button-quiet" onClick={snoozeBackup}>{copy.remind7Days}</button><button type="button" className="button-quiet" onClick={() => openSettings("Data")}>{copy.settings}</button></div></section>}
        {showTradeControls && <div className="workspace-controls"><div className="account-select-wrap"><span className="account-select-icon">✳</span><label><span>{copy.accountLabel}</span><select aria-label={copy.filterByAccount} value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">{copy.allAccounts}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{translateAccountName(account.name, locale)}</option>)}</select></label><ChevronDown size={14}/></div><div className="workspace-control-right">{sampleCount > 0 && <button type="button" className={`sample-toggle ${data.settings.includeSamples !== false ? "on" : ""}`} onClick={() => void updateSettings({ includeSamples: data.settings.includeSamples === false }, data.settings.includeSamples === false ? (locale === "id" ? "Trade contoh disertakan." : "Sample trades included.") : (locale === "id" ? "Trade contoh disembunyikan." : "Sample trades hidden."))} aria-pressed={data.settings.includeSamples !== false}><span className="sample-indicator-dot"/> {data.settings.includeSamples === false ? copy.samplesHidden : copy.samplesIncluded}<span className="switch"><i/></span></button>}<span className="save-indicator"><span/>{saving ? copy.saving : storage === "browser" ? copy.savedOnDevice : copy.privateSynced}</span></div></div>}
        <div className="view-motion" data-view={view}>
        {(view === "Overview" || ytKeepAlive) && <Overview {...common} active={view === "Overview"} onYoutubePlayerMountChange={setYtKeepAlive}/>}
        {view === "Trade journal" && <JournalView key={journalPresetState ? `preset-${journalPresetState.nonce}` : "journal"} trades={visibleTrades} dayJournals={data.settings.dayJournals} hidden={hidden} mode={storage} onEditTrade={editTrade} onNewTrade={() => newTrade()} onImport={() => openModal("import")} onExport={exportCsv} onExportXlsx={exportXlsx} onPreviewCharts={openTradeCharts} onOpenSlides={(slides, index) => setLightbox({ slides, index })} selectedDay={selectedDay} clearDay={() => setSelectedDay("")} onOpenCalendarDay={openCalendarDay} initialPreset={journalPresetState?.preset ?? null} locale={locale}/>}
        {view === "Analytics" && <AnalyticsView trades={visibleTrades} allTrades={data.trades} accountFilter={accountFilter} settings={data.settings} hidden={hidden} period={period} onPeriod={setPeriod} onAccountsSettings={() => openSettings("Accounts")} onFilterJournal={filterJournal} onDay={day}/>}
        {view === "Weekly review" && <WeeklyReview trades={visibleTrades} settings={data.settings} hidden={hidden} onMindset={() => navigate("Mindset")} onSettings={() => openSettings("Risk")} onEditTrade={editTrade} onNewTrade={() => newTrade()} onJournal={() => navigate("Trade journal")} onPreviewCharts={openTradeCharts} onOpenRecap={(ws) => openRecap(ws)}/>}
        {view === "Calendar" && <CalendarView key={calendarFocus.nonce ? `cal-${calendarFocus.nonce}` : "cal"} trades={visibleTrades} allTrades={data.trades} accountFilter={accountFilter} settings={data.settings} hidden={hidden} onDay={day} onAccountsSettings={() => openSettings("Accounts")} onSaveDayJournal={saveDayJournal} initialFocusDate={calendarFocus.date || undefined} onLogTradeForDate={(targetDate) => newTrade(targetDate)}/>}
        {view === "Playbook" && <PlaybookView settings={data.settings} trades={visibleTrades} hidden={hidden} onUpdate={(playbook: PlaybookRule[]) => void updateSettings({ playbook })} onUpdateBlueprints={(setupBlueprints: SetupBlueprint[], msg?: string) => void updateSettings({ setupBlueprints }, msg)}/>}
        {view === "Mindset" && <MindsetView settings={data.settings} trades={visibleTrades} onMood={selectMood} onSaveMoodNote={saveMoodNote} onBreath={() => openModal("breathing")} onPatience={() => navigate("Patience")} onFilterMood={(mood) => filterJournal({ mood })} onSaveReflection={(reflection: WeeklyReflection) => updateSettings({ reflections: [...(dataRef.current.settings.reflections ?? []), reflection] }, locale === "id" ? "Refleksi tersimpan." : "Reflection saved.")} onDeleteReflection={(reflectionId) => { if (window.confirm(locale === "id" ? "Hapus refleksi ini?" : "Delete this reflection?")) void updateSettings({ reflections: (dataRef.current.settings.reflections ?? []).filter((item) => item.id !== reflectionId) }, locale === "id" ? "Refleksi dihapus." : "Reflection removed."); }}/>}
        {view === "Patience" && <PatienceView trades={visibleTrades} settings={data.settings} accountFilter={accountFilter} hidden={hidden} onDay={day} onUpdateSettings={updateSettings}/>}
        {view === "Goals" && <GoalsView settings={data.settings} onMark={markGoal} onUndo={undoGoal} onReset={resetGoal} onDelete={deleteGoal} onAdd={addGoal}/>}
        </div>
      </div><footer className="app-footer"><span>{storage === "browser" ? copy.footerBrowser : copy.footerServer}</span></footer></main>
    <nav className="mobile-bottom-nav" aria-label={copy.navLabelMobile}>
      <button type="button" className={!["Overview", "Trade journal", "Calendar"].includes(view) ? "active" : ""} onClick={() => setMobileMenu((open) => !open)} aria-expanded={mobileMenu} aria-controls="primary-sidebar"><span className="mobile-more-icon"><Menu size={19}/>{cassetteDeck.status === "playing" && <i className="mobile-audio-dot" aria-hidden="true"/>}</span><span>{copy.more}</span></button>
      <button type="button" className={view === "Trade journal" ? "active" : ""} aria-current={view === "Trade journal" ? "page" : undefined} onClick={() => navigate("Trade journal")}><NotebookPen size={19}/><span>{copy.journalShort}</span></button>
      <button type="button" className="mobile-nav-add" onClick={() => newTrade()} aria-label={copy.logATrade}><Plus size={20} strokeWidth={2.4}/></button>
      <button type="button" className={view === "Calendar" ? "active" : ""} aria-current={view === "Calendar" ? "page" : undefined} onClick={() => navigate("Calendar")}><CalendarDays size={19}/><span>{copy.views["Calendar"].nav}</span></button>
      <button type="button" className={view === "Overview" ? "active" : ""} aria-current={view === "Overview" ? "page" : undefined} onClick={() => navigate("Overview")}><LayoutDashboard size={19}/><span>{copy.views["Overview"].nav}</span></button>
    </nav>
    {modal && <div ref={modalLayer} className={`modal-layer ${modalClosing ? "is-closing" : ""}`}
      onClickCapture={(event) => { if (modalClosing) { event.preventDefault(); event.stopPropagation(); } }}
      onSubmitCapture={(event) => { if (modalClosing) { event.preventDefault(); event.stopPropagation(); } }}>
    {modal === "trade" && <TradeModal key={editing ? `edit-${editing.id}` : `new-${newTradeDate}`} trade={editing} trades={data.trades} limits={data.settings.riskLimits ?? { perTrade: null, dailyLoss: null }} hidden={hidden} accounts={accounts} playbook={data.settings.playbook} setupBlueprints={data.settings.setupBlueprints} defaultAccount={defaultAccount} initialDate={editing ? undefined : (newTradeDate || undefined)} mode={storage} locale={locale} onClose={closeModal} onSave={saveTrade} onDelete={deleteTrade}/>}
    {modal === "settings" && <SettingsModal data={data} mode={storage} sampleCount={sampleCount} initialTab={settingsTab} backupState={backupTracking?.state ?? null} backupAvailable={backupTracking?.available ?? false} backupEnabled={damaged === null} hidden={hidden} cloudContext={cloudContext} localSummary={localSummary} onStartCheckout={startCheckout} onMigrateLocalToCloud={migrateLocalToCloud} onClose={closeModal} onUpdate={updateSettings} onClearSamples={clearSamples} onBackup={backup} onRestore={restore} onExportCsv={() => exportCsv(dataRef.current.trades)} onExportXlsx={() => exportXlsx(dataRef.current.trades)} onImportCsv={() => openModal("import")} onLoadDummyData={loadThreeMonthDummy} onAddAccount={addAccount} onUpdateAccount={updateAccount} onRemoveAccount={removeAccount} onSignOut={(storage === "server" || cloudContext?.signedIn) ? signOut : undefined}/>}
    {modal === "import" && <ImportModal trades={data.trades} accounts={accounts} defaultAccount={defaultAccount} locale={locale} onClose={closeModal} onImport={importTrades}/>}
    {modal === "breathing" && <BreathingModal onClose={closeModal} locale={locale}/>}
    {modal === "cassette" && <CassetteDeckModal deck={cassetteDeck} mode={cassetteMode} locale={locale} onClose={closeModal}/>}
    {modal === "recap" && <RecapCardModal trades={visibleTrades} dayJournals={data.settings.dayJournals} reflections={data.settings.reflections} accountLabel={activeAccountLabel} defaultTheme={data.settings.theme ?? "light"} initialWeekStart={recapWeekStart} locale={locale} onNotify={(msg, err) => notify(msg, Boolean(err))} onClose={closeModal}/>}
    {modal === "command" && <CommandPaletteModal trades={visibleTrades} settings={data.settings} hidden={hidden} zenMode={zenMode} locale={locale} onClose={closeModal} onNavigate={navigate} onNewTrade={newTrade} onOpenRecap={() => openRecap()} onToggleZen={() => setZenMode((z) => !z)} onOpenBreathing={() => openModal("breathing")} onOpenCassette={() => openModal("cassette")} onPlaySoftRain={() => void cassetteDeck.selectAmbient("soft_rain")} onTogglePrivacy={() => setHidden((h) => !h)} onToggleTheme={() => void updateSettings({ theme: (data.settings.theme ?? "light") === "dark" ? "light" : "dark" })} onSelectDarkVariant={(darkVariant) => void updateSettings({ theme: "dark", darkVariant })} onToggleLocale={() => { const next = locale === "en" ? "id" : "en"; void updateSettings({ locale: next, patienceLocale: next }); }} onDownloadBackup={() => void backup()} onOpenSettings={() => openSettings()} onOpenCloudSync={() => openSettings("Cloud")} onEditTrade={editTrade}/>}
    </div>}
    {zenMode && (
      <div className="zen-floating-bar" role="region" aria-label={copy.zenModeActiveBadge}>
        <span className="zen-badge"><Sparkles size={13}/> {copy.zenModeActiveBadge}</span>
        <button type="button" className="zen-bar-btn" onClick={() => openModal("command")} aria-label={copy.cmdTriggerAria}><Search size={14}/> <span>{copy.cmdTriggerLabel}</span></button>
        <button type="button" className="zen-bar-btn" onClick={() => setHidden((h) => !h)} aria-label={hidden ? copy.showAmounts : copy.hideAmounts}>{hidden ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
        <button type="button" className="zen-bar-exit" onClick={() => setZenMode(false)}>{copy.zenExitBtn}</button>
      </div>
    )}
    {lightbox && (
      <ChartLightbox
        slides={lightbox.slides}
        index={lightbox.index}
        onIndexChange={(next) => setLightbox((current) => (current ? { ...current, index: next } : null))}
        onClose={() => setLightbox(null)}
        mode={storage}
        hidden={hidden}
        locale={locale}
        onEditTrade={editTrade}
      />
    )}
    {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <CircleAlert size={18}/> : <CheckCircle2 size={18}/>} <span>{toast.message}</span>{toast.breath && <><button type="button" onClick={() => { setToast(null); openModal("breathing"); }}>{copy.takeABreath}</button><button type="button" onClick={() => { setToast(null); navigate("Patience"); }}>Patience</button></>}<button type="button" className="toast-dismiss" onClick={() => setToast(null)} aria-label={copy.dismissToastAria}><X size={14}/></button></div>}
  </div>;
}
