"use client";

import { useCallback, useEffect, useRef, useState, type ElementType } from "react";
import { BarChart3, BookOpenCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, ClipboardList, CloudDownload, Eye, EyeOff, Heart, Hourglass, LayoutDashboard, Menu, NotebookPen, Plus, Settings2, Smartphone, Sprout, Target, Wind, X } from "lucide-react";
import type { Intention, JournalData, JournalSettings, PlaybookRule, Trade, TradeAttachment, WeeklyReflection } from "@/lib/types";
import { DEFAULT_ACCOUNT, MAX_JOURNAL_IMAGE_BYTES } from "@/lib/types";
import { currency, longToday, todayString, type Period } from "@/lib/format";
import { normalizeJournalData } from "@/lib/journal-data";
import { saveBrowserJournal } from "@/lib/browser-journal";
import { createDemoData } from "@/lib/demo-data";
import { removeAttachment, saveAttachment, type StorageMode } from "@/lib/attachments";
import { createBackup, downloadFile, parseBackup, stageBackupImages } from "@/lib/backup";
import { exportTradesCsv } from "@/lib/csv";
import { parseTradeInput } from "@/lib/trade-validation";
import { isBackupReminderDue, loadBackupReminder, recordBackupDownload, snoozeBackupReminder, writeBackupReminder, type BackupReminderState } from "@/lib/backup-reminder";
import { WeeklyReview } from "@/components/journal-review";
import { PatienceView } from "@/components/journal-patience";
import { LocalPwaStatus } from "@/components/local-pwa";
import { AnalyticsView, CalendarView, GoalsView, JournalView, MindsetView, Overview, PlaybookView, type View } from "@/components/journal-views";
import { BreathingModal, ImportModal, SettingsModal, TradeModal, type SettingsTab, type TradeDraft } from "@/components/journal-dialogs";

type Modal = "trade" | "settings" | "breathing" | "import" | null;
// Keep this in sync with --bloom-dialog-exit in globals.css.
const MODAL_EXIT_MS = 420;
const workspaceNav: { label: View; icon: ElementType }[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Trade journal", icon: NotebookPen }, { label: "Analytics", icon: BarChart3 }, { label: "Weekly review", icon: ClipboardList }, { label: "Calendar", icon: CalendarDays }, { label: "Playbook", icon: BookOpenCheck },
];
const personalNav: { label: View; icon: ElementType }[] = [{ label: "Mindset", icon: Heart }, { label: "Patience", icon: Hourglass }, { label: "Goals", icon: Target }];
const titles: Record<View, { title: string; subtitle: string }> = {
  Overview: { title: "", subtitle: "Your recent trading activity, at a glance." },
  "Trade journal": { title: "Trade journal", subtitle: "Search, filter, and manage your trades." },
  Analytics: { title: "Analytics", subtitle: "Review performance for the selected account and period." },
  "Weekly review": { title: "Weekly review", subtitle: "Trades, risk, and reflections in one thoughtful view." },
  Calendar: { title: "Calendar", subtitle: "Explore your trades by date." },
  Playbook: { title: "Playbook", subtitle: "Build checklists for each stage of a trade." },
  Mindset: { title: "Mindset", subtitle: "Check in and reflect on your trading." },
  Patience: { title: "Patience", subtitle: "Pause emotional urges, protect profit peaks, and let steady compounding work." },
  Goals: { title: "Goals", subtitle: "Track the habits you want to build." },
};
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function sortTrades(trades: Trade[]) { return [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id); }
function id() { return crypto.randomUUID(); }

export function JournalApp({ initialData, storage = "browser", initialRevision = 0, initialDamaged = null, backupScope = "browser" }: { initialData: JournalData; storage?: StorageMode; initialRevision?: number; initialDamaged?: string | null; backupScope?: string }) {
  const [data, setData] = useState(() => normalizeJournalData(initialData));
  const dataRef = useRef(data); const revision = useRef(initialRevision); const busyRef = useRef(false);
  const [view, setView] = useState<View>("Overview"); const [period, setPeriod] = useState<Period>("1M"); const [modal, setModal] = useState<Modal>(null); const [modalClosing, setModalClosing] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null); const [hidden, setHidden] = useState(false); const [accountFilter, setAccountFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState(""); const [mobileMenu, setMobileMenu] = useState(false); const [saving, setSaving] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("General");
  const [backupTracking, setBackupTracking] = useState<{ state: BackupReminderState; available: boolean } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false); const backupBusyRef = useRef(false);
  const [online, setOnline] = useState(true); const [reminderClock, setReminderClock] = useState(0);
  const [damaged, setDamaged] = useState(initialDamaged); const [toast, setToast] = useState<{ message: string; error: boolean; breath: boolean } | null>(null);
  const toastTimer = useRef<number | null>(null); const modalCloseTimer = useRef<number | null>(null); const modalLayer = useRef<HTMLDivElement>(null); const mobileClose = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useCallback(() => dataRef.current.settings.reduceMotion === true || window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const openModal = useCallback((next: Exclude<Modal, null>) => {
    if (modalCloseTimer.current !== null) window.clearTimeout(modalCloseTimer.current);
    modalCloseTimer.current = null; setModalClosing(false); setModal(next);
  }, []);
  const openSettings = useCallback((tab: SettingsTab = "General") => { setSettingsTab(tab); openModal("settings"); }, [openModal]);
  const closeModal = useCallback(() => {
    if (modalCloseTimer.current !== null) return;
    if (prefersReducedMotion()) { setModal(null); setModalClosing(false); return; }
    // A quick Escape/close can interrupt the entrance. Start the exit from the
    // actual on-screen frame instead of jumping to the fully-open position.
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
    // Wait until the drawer is visible before moving keyboard focus into it.
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
    // Run after hydration and refresh while the journal is open or brought back into focus.
    const first = window.setTimeout(refresh, 0); const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh); window.addEventListener("offline", refresh); window.addEventListener("storage", refresh);
    return () => { window.clearTimeout(first); window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); window.removeEventListener("storage", refresh); };
  }, [backupScope]);
  const accounts = data.settings.accounts ?? [DEFAULT_ACCOUNT];
  const sampleCount = data.trades.filter((trade) => trade.isDemo).length;
  const visibleTrades = sortTrades(data.trades.filter((trade) => (data.settings.includeSamples !== false || !trade.isDemo) && (accountFilter === "all" || (trade.accountId ?? DEFAULT_ACCOUNT.id) === accountFilter)));
  const defaultAccount = accountFilter === "all" ? accounts[0]?.id ?? DEFAULT_ACCOUNT.id : accountFilter;
  function notify(message: string, error = false, breath = false) { setToast({ message, error, breath }); if (toastTimer.current) window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), error ? 6500 : 4000); }
  async function commit(next: JournalData, success?: string, allowReplaceDamaged = false) {
    if (busyRef.current) { notify("Finishing the last save. Please try again in a moment.", true); return false; }
    busyRef.current = true; setSaving(true);
    try {
      const normalized = normalizeJournalData(next);
      if (storage === "browser") saveBrowserJournal(window.localStorage, normalized, allowReplaceDamaged);
      else {
        const response = await fetch("/api/journal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: revision.current, data: normalized }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Couldn’t save your journal.");
        revision.current = result.revision;
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
  async function saveTrade(draft: TradeDraft, files: File[], removed: TradeAttachment[], tradeId?: number) {
    const staged: TradeAttachment[] = [];
    try {
      const removedIds = new Set(removed.map((item) => item.id));
      const existingImages = new Map(dataRef.current.trades.flatMap((trade) => (trade.attachments ?? []).filter((image) => trade.id !== tradeId || !removedIds.has(image.id))).map((image) => [image.id, image]));
      const totalBytes = [...existingImages.values()].reduce((sum, image) => sum + image.size, 0) + files.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_JOURNAL_IMAGE_BYTES) throw new Error("Your journal can store up to 30 MB of screenshots. Remove some images before adding more.");
      for (const file of files) staged.push(await saveAttachment(file, file.name, storage));
      const parsed = parseTradeInput({ ...draft, attachments: [...draft.attachments, ...staged] });
      const current = dataRef.current; const existing = current.trades.find((trade) => trade.id === tradeId);
      const nextTrade: Trade = { ...parsed, id: tradeId ?? Math.max(0, ...current.trades.map((trade) => trade.id)) + 1, isDemo: existing?.isDemo ?? false };
      const nextTrades = tradeId ? current.trades.map((trade) => trade.id === tradeId ? nextTrade : trade) : [nextTrade, ...current.trades];
      const ok = await commit({ ...current, trades: sortTrades(nextTrades) }, tradeId ? "Trade updated." : "Trade saved.");
      if (!ok) { await Promise.allSettled(staged.map((item) => removeAttachment(item.id, storage))); return false; }
      await removeUnusedImages(removed); if (!tradeId && Number(parsed.pnl) < 0) notify("Trade saved. Take a moment if you need one.", false, true); return true;
    } catch (error) { await Promise.allSettled(staged.map((item) => removeAttachment(item.id, storage))); notify(error instanceof Error ? error.message : "Couldn’t save this trade.", true); return false; }
  }
  async function deleteTrade(tradeId: number) {
    const current = dataRef.current; const old = current.trades.find((trade) => trade.id === tradeId);
    const ok = await commit({ ...current, trades: current.trades.filter((trade) => trade.id !== tradeId) }, "Trade removed from your journal.");
    if (ok && old) await removeUnusedImages(old.attachments ?? []);
    return ok;
  }
  async function clearSamples() { const current = dataRef.current; const samples = current.trades.filter((trade) => trade.isDemo); const ok = await commit({ ...current, trades: current.trades.filter((trade) => !trade.isDemo) }, "Sample trades cleared."); if (ok) await removeUnusedImages(samples.flatMap((trade) => trade.attachments ?? [])); return ok; }
  function newTrade() { setEditing(null); openModal("trade"); }
  function editTrade(trade: Trade) { setEditing(trade); openModal("trade"); }
  function scrollToTop() { window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" }); }
  function navigate(next: View) { setView(next); setMobileMenu(false); if (next !== "Trade journal") setSelectedDay(""); scrollToTop(); }
  function day(date: string) { setSelectedDay(date); setView("Trade journal"); scrollToTop(); }
  function selectMood(mood: string) { const today = todayString(); const previous = dataRef.current.settings.moodHistory ?? []; const note = previous.find((item) => item.date === today)?.note ?? ""; void updateSettings({ mood, moodDate: today, moodHistory: [...previous.filter((item) => item.date !== today), { date: today, mood, note }] }, "Check-in saved."); }
  function saveMoodNote(note: string) { const today = todayString(); const previous = dataRef.current.settings.moodHistory ?? []; void updateSettings({ moodHistory: previous.map((item) => item.date === today ? { ...item, note: note.trim().slice(0, 1000) } : item) }, "Check-in note saved."); }
  function updateGoals(goals: Intention[], message?: string) { const first = goals[0]; return updateSettings({ goals, ...(first ? { goal: first.text, goalTarget: first.target, goalProgress: first.progress } : {}) }, message); }
  function markGoal(goalId: string) { const goals = dataRef.current.settings.goals ?? []; const today = todayString(); void updateGoals(goals.map((goal) => goal.id === goalId && goal.progress < goal.target && !goal.markedDates.includes(today) ? { ...goal, progress: goal.progress + 1, markedDates: [...goal.markedDates, today] } : goal), "Progress saved."); }
  function undoGoal(goalId: string) { const goals = dataRef.current.settings.goals ?? []; void updateGoals(goals.map((goal) => goal.id === goalId && goal.progress > 0 ? { ...goal, progress: goal.progress - 1, markedDates: goal.markedDates.slice(0, -1) } : goal)); }
  function resetGoal(goalId: string) { void updateGoals((dataRef.current.settings.goals ?? []).map((goal) => goal.id === goalId ? { ...goal, progress: 0, markedDates: [] } : goal)); }
  function deleteGoal(goalId: string) { if (window.confirm("Remove this intention?")) void updateGoals((dataRef.current.settings.goals ?? []).filter((goal) => goal.id !== goalId), "Intention removed."); }
  async function addGoal(goal: Intention) { const goals = dataRef.current.settings.goals ?? []; if (goals.length >= 20) { notify("You can have up to 20 intentions.", true); return false; } return updateGoals([...goals, goal], "Intention added."); }
  async function addAccount(name: string) { const current = dataRef.current.settings.accounts ?? [DEFAULT_ACCOUNT]; if (current.length >= 20 || current.some((item) => item.name.toLowerCase() === name.toLowerCase())) { notify("Choose a unique account name (up to 20 accounts).", true); return false; } return updateSettings({ accounts: [...current, { id: id(), name: name.slice(0, 40) }] }, "Account added."); }
  async function removeAccount(accountId: string) { const current = dataRef.current; if (current.trades.some((trade) => (trade.accountId ?? DEFAULT_ACCOUNT.id) === accountId)) { notify("Move or delete this account’s trades before removing it.", true); return false; } const next = (current.settings.accounts ?? []).filter((account) => account.id !== accountId); if (!next.length) return false; const ok = await updateSettings({ accounts: next }, "Account removed."); if (ok && accountFilter === accountId) setAccountFilter("all"); return ok; }
  function saveBackupTracking(state: BackupReminderState) {
    let available = false; try { available = writeBackupReminder(window.localStorage, backupScope, state); } catch { /* Device storage is unavailable. */ }
    setBackupTracking({ state, available }); setReminderClock(Date.now()); return available;
  }
  function resetBackupTracking() { saveBackupTracking({ firstSeenAt: Date.now(), lastDownloadAt: null, snoozedUntil: null }); }
  async function backup() {
    if (backupBusyRef.current) return;
    if (damaged !== null) { notify("Your saved journal needs recovery. Download the original from the recovery notice first.", true); return; }
    if (busyRef.current) { notify("Wait for the current save to finish before creating a backup.", true); return; }
    backupBusyRef.current = true; setBackupBusy(true);
    try {
      const content = await createBackup(dataRef.current, storage);
      downloadFile(`bloom-backup-${todayString()}.json`, content, "application/json");
      let state = backupTracking?.state;
      if (!state) { try { state = loadBackupReminder(window.localStorage, backupScope, Date.now()).state; } catch { state = { firstSeenAt: Date.now(), lastDownloadAt: null, snoozedUntil: null }; } }
      const remembered = saveBackupTracking(recordBackupDownload(state, Date.now()));
      notify(remembered ? "Backup download started. Keep the unencrypted file somewhere private." : "Download started, but reminder history couldn’t be saved on this device.", !remembered);
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn’t create a backup.", true); }
    finally { backupBusyRef.current = false; setBackupBusy(false); }
  }
  function snoozeBackup() { if (!backupTracking) return; const ok = saveBackupTracking(snoozeBackupReminder(backupTracking.state, Date.now())); if (!ok) notify("Couldn’t save reminder history on this device.", true); }
  function exportCsv(trades: Trade[]) { downloadFile(`bloom-trades-${todayString()}.csv`, exportTradesCsv(trades, dataRef.current.settings.accounts ?? [DEFAULT_ACCOUNT]), "text/csv;charset=utf-8"); notify("CSV downloaded."); }
  async function restore(file: File) {
    let staged: TradeAttachment[] = [];
    try {
      if (file.size > 50_000_000) throw new Error("Backup files must be under 50 MB.");
      const parsed = await parseBackup(await file.text()); const result = await stageBackupImages(parsed, storage); staged = result.staged;
      const oldImages = dataRef.current.trades.flatMap((trade) => trade.attachments ?? []);
      const ok = await commit(result.journal, "Backup restored successfully.", true);
      if (!ok) { await Promise.allSettled(staged.map((image) => removeAttachment(image.id, storage))); return false; }
      await removeUnusedImages(oldImages); setAccountFilter("all"); resetBackupTracking(); return true;
    } catch (error) { await Promise.allSettled(staged.map((image) => removeAttachment(image.id, storage))); notify(error instanceof Error ? error.message : "Couldn’t restore this backup.", true); return false; }
  }
  async function importTrades(trades: Trade[]) { const current = dataRef.current; return commit({ ...current, trades: sortTrades([...trades, ...current.trades]) }, `${trades.length} ${trades.length === 1 ? "trade" : "trades"} imported.`); }
  async function signOut() {
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Couldn’t sign out.");
      // Clear the in-memory private journal and re-read the session on the server.
      window.location.replace("/");
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn’t sign out.", true); }
  }
  const common = { trades: visibleTrades, settings: data.settings, hidden, onEditTrade: editTrade, onNewTrade: newTrade, onView: navigate, onDay: day, onMood: selectMood, onMarkGoal: markGoal, onRiskSettings: () => openSettings("Risk"), period, onPeriod: setPeriod };
  const title = view === "Overview" ? `${greeting()}, ${data.settings.name}` : titles[view].title;
  const showTradeControls = view !== "Playbook" && view !== "Goals";
  const showAmountsControl = showTradeControls && view !== "Mindset";
  return <div className="app-shell" data-theme={data.settings.theme ?? "light"} data-motion={data.settings.reduceMotion ? "reduced" : "system"}>
    <aside id="primary-sidebar" className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}><button type="button" className="brand" onClick={() => navigate("Overview")} aria-label="Bloom home"><span className="brand-mark"><Sprout size={25} strokeWidth={1.6}/></span><span className="brand-word"><strong>bloom<span>.</span></strong><small>TRADING JOURNAL</small></span></button><button type="button" ref={mobileClose} className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><X size={20}/></button>
      <div className="sidebar-scroll"><div className="nav-label">WORKSPACE <span>✳</span></div><nav className="sidebar-nav" aria-label="Workspace">{workspaceNav.map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} aria-current={view === label ? "page" : undefined} onClick={() => navigate(label)}><Icon size={18} strokeWidth={1.7}/><span>{label}</span>{view === label && <span className="nav-active-dot"/>}</button>)}</nav><div className="nav-label personal-label">YOUR WELLBEING <span>✳</span></div><nav className="sidebar-nav" aria-label="Your wellbeing">{personalNav.map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} aria-current={view === label ? "page" : undefined} onClick={() => navigate(label)}><Icon size={18} strokeWidth={1.7}/><span>{label}</span>{view === label && <span className="nav-active-dot"/>}</button>)}</nav>
      <button type="button" className="sidebar-settings" onClick={() => { setMobileMenu(false); openSettings(); }}><Settings2 size={18}/> Settings</button></div>
      <div className="sidebar-bottom"><div className="sidebar-storage"><span className="storage-dot"/>{storage === "browser" ? "SAVED IN THIS BROWSER" : "PRIVATE ACCOUNT"}</div><button type="button" className="profile-button" onClick={() => openSettings()}><span className="avatar">{data.settings.name.charAt(0).toUpperCase()}</span><span><strong>{data.settings.name === "friend" ? "My space" : data.settings.name}</strong><small>{storage === "browser" ? "Personal journal" : "Synced journal"}</small></span><Settings2 size={16}/></button></div>
    </aside><button type="button" className={`mobile-scrim ${mobileMenu ? "is-visible" : ""}`} onClick={() => setMobileMenu(false)} aria-label="Close navigation" aria-hidden={!mobileMenu} tabIndex={-1}/>
    <main className="main-shell"><header className="topbar"><div className="topbar-left"><button type="button" className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation" aria-expanded={mobileMenu} aria-controls="primary-sidebar"><Menu size={21}/></button><div className="breadcrumbs"><span>My workspace</span><ChevronRight size={14}/><strong>{view}</strong></div><span className="mobile-top-brand" aria-hidden="true">bloom<span>.</span></span></div><div className="topbar-actions"><span className="top-date"><CalendarDays size={15}/> {longToday()}</span><span className="top-divider"/><button type="button" className="breath-link" onClick={() => openModal("breathing")} aria-label="Take a breath"><Wind size={17}/><span> Take a breath</span></button><button type="button" className="top-avatar" onClick={() => openSettings()} aria-label="Open settings">{data.settings.name.charAt(0).toUpperCase()}</button></div></header>
      <div className="page-content"><div className="page-heading"><div className="page-heading-copy" key={view}><h1>{title}{view === "Overview" && <span className="greeting-sun"> ☀</span>}</h1><p>{titles[view].subtitle}</p></div><div className="heading-actions">{showAmountsControl && <button type="button" className="privacy-button" onClick={() => setHidden(!hidden)} aria-label={hidden ? "Show amounts" : "Hide amounts"} title={hidden ? "Show amounts" : "Hide amounts"}>{hidden ? <EyeOff size={17}/> : <Eye size={17}/>}</button>}<button type="button" className="button-primary new-trade-button" onClick={newTrade}><Plus size={18}/> Log a trade</button></div></div>
        {damaged !== null && <div className="recovery-banner" role="alert"><CircleAlert size={20}/><div><strong>Your saved journal needs recovery.</strong><p>We haven’t overwritten it. Download the original, then restore a valid Bloom backup or start fresh.</p><div><button type="button" onClick={() => downloadFile("bloom-damaged-journal.txt", damaged, "text/plain")}>Download original</button><button type="button" onClick={() => openSettings()}>Restore backup in settings</button><button type="button" onClick={() => { if (window.confirm("Replace the damaged journal with a fresh sample journal? Download the original first.")) void commit(createDemoData(), "A fresh journal is ready.", true).then((ok) => { if (ok) resetBackupTracking(); }); }}>Start fresh</button></div></div></div>}
        {storage === "browser" && view === "Overview" && <LocalPwaStatus/>}
        {storage === "server" && online && view === "Overview" && <section className="local-pwa-status" aria-label="Private and browser journal information"><span className="local-pwa-icon"><Smartphone size={18}/></span><div><strong>Private account · online sync</strong><p>The installable offline app opens a separate browser-only journal, not this private account.</p></div><a className="button-secondary" href="/local/">Open browser journal</a></section>}
        {storage === "server" && !online && <div className="offline-notice" role="status"><CircleAlert size={19}/><div><strong>Private sync needs a connection.</strong><p>Changes to this account can’t be saved while offline. The separate browser-only journal can be used offline after it has been opened online.</p><a href="/local/">Open browser-only journal</a></div></div>}
        {damaged === null && backupTracking?.available && isBackupReminderDue(backupTracking.state, data.settings.backupReminderDays ?? 7, reminderClock) && <section className="backup-reminder" aria-label="Backup reminder"><span className="backup-reminder-icon"><CloudDownload size={20}/></span><div><strong>Time for a backup?</strong><p>{backupTracking.state.lastDownloadAt ? "It’s been a while since a backup download was started on this device." : "Keep an independent copy of your journal and screenshots."} Backup files are not encrypted.</p></div><div className="backup-reminder-actions"><button type="button" className="button-secondary" disabled={backupBusy} onClick={() => void backup()}>{backupBusy ? "Preparing..." : "Back up now"}</button><button type="button" className="button-quiet" onClick={snoozeBackup}>Remind me in 7 days</button><button type="button" className="button-quiet" onClick={() => openSettings("Data")}>Settings</button></div></section>}
        {showTradeControls && <div className="workspace-controls"><div className="account-select-wrap"><span className="account-select-icon">✳</span><label><span>ACCOUNT</span><select aria-label="Filter by trading account" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><ChevronDown size={14}/></div><div className="workspace-control-right">{sampleCount > 0 && <button type="button" className={`sample-toggle ${data.settings.includeSamples !== false ? "on" : ""}`} onClick={() => void updateSettings({ includeSamples: data.settings.includeSamples === false }, data.settings.includeSamples === false ? "Sample trades included." : "Sample trades hidden.")} aria-pressed={data.settings.includeSamples !== false}><span className="sample-indicator-dot"/> {data.settings.includeSamples === false ? "Samples hidden" : "Samples included"}<span className="switch"><i/></span></button>}<span className="save-indicator"><span/>{saving ? "Saving..." : storage === "browser" ? "Saved on this device" : "Private & synced"}</span></div></div>}
        <div className="view-motion" data-view={view} key={view}>
        {view === "Overview" && <Overview {...common}/>}
        {view === "Trade journal" && <JournalView trades={visibleTrades} hidden={hidden} onEditTrade={editTrade} onNewTrade={newTrade} onImport={() => openModal("import")} onExport={exportCsv} selectedDay={selectedDay} clearDay={() => setSelectedDay("")}/>}
        {view === "Analytics" && <AnalyticsView trades={visibleTrades} hidden={hidden} period={period} onPeriod={setPeriod}/>}
        {view === "Weekly review" && <WeeklyReview trades={visibleTrades} settings={data.settings} hidden={hidden} onMindset={() => navigate("Mindset")} onSettings={() => openSettings("Risk")} onEditTrade={editTrade} onNewTrade={newTrade} onJournal={() => navigate("Trade journal")}/>}
        {view === "Calendar" && <CalendarView trades={visibleTrades} hidden={hidden} onDay={day}/>}
        {view === "Playbook" && <PlaybookView settings={data.settings} onUpdate={(playbook: PlaybookRule[]) => void updateSettings({ playbook })}/>}
        {view === "Mindset" && <MindsetView settings={data.settings} trades={visibleTrades} onMood={selectMood} onSaveMoodNote={saveMoodNote} onBreath={() => openModal("breathing")} onPatience={() => navigate("Patience")} onSaveReflection={(reflection: WeeklyReflection) => updateSettings({ reflections: [...(dataRef.current.settings.reflections ?? []), reflection] }, "Reflection saved.")} onDeleteReflection={(reflectionId) => { if (window.confirm("Delete this reflection?")) void updateSettings({ reflections: (dataRef.current.settings.reflections ?? []).filter((item) => item.id !== reflectionId) }, "Reflection removed."); }}/>}
        {view === "Patience" && <PatienceView trades={visibleTrades} settings={data.settings} accountFilter={accountFilter} hidden={hidden} onBreath={() => openModal("breathing")} onDay={day} onUpdateSettings={updateSettings}/>}
        {view === "Goals" && <GoalsView settings={data.settings} onMark={markGoal} onUndo={undoGoal} onReset={resetGoal} onDelete={deleteGoal} onAdd={addGoal}/>}
        </div>
      </div><footer className="app-footer"><span>{storage === "browser" ? "Stored on this device · Back up in Settings." : "Private account · Keep an independent backup."}</span></footer></main>
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{([{ label: "Overview", icon: LayoutDashboard }, { label: "Trade journal", icon: NotebookPen }, { label: "Calendar", icon: CalendarDays }] as const).map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} aria-current={view === label ? "page" : undefined} onClick={() => navigate(label)}><Icon size={19}/><span>{label === "Trade journal" ? "Journal" : label}</span></button>)}<button type="button" className={!["Overview", "Trade journal", "Calendar"].includes(view) ? "active" : ""} onClick={() => setMobileMenu(true)} aria-expanded={mobileMenu} aria-controls="primary-sidebar"><Menu size={19}/><span>More</span></button></nav>
    {modal && <div ref={modalLayer} className={`modal-layer ${modalClosing ? "is-closing" : ""}`}
      onClickCapture={(event) => { if (modalClosing) { event.preventDefault(); event.stopPropagation(); } }}
      onSubmitCapture={(event) => { if (modalClosing) { event.preventDefault(); event.stopPropagation(); } }}>
    {modal === "trade" && <TradeModal key={editing?.id ?? "new"} trade={editing} trades={data.trades} limits={data.settings.riskLimits ?? { perTrade: null, dailyLoss: null }} hidden={hidden} accounts={accounts} playbook={data.settings.playbook} defaultAccount={defaultAccount} mode={storage} onClose={closeModal} onSave={saveTrade} onDelete={deleteTrade}/>}
    {modal === "settings" && <SettingsModal data={data} mode={storage} sampleCount={sampleCount} initialTab={settingsTab} backupState={backupTracking?.state ?? null} backupAvailable={backupTracking?.available ?? false} backupEnabled={damaged === null} onClose={closeModal} onUpdate={updateSettings} onClearSamples={clearSamples} onBackup={backup} onRestore={restore} onExportCsv={() => exportCsv(dataRef.current.trades)} onImportCsv={() => openModal("import")} onAddAccount={addAccount} onRemoveAccount={removeAccount} onSignOut={storage === "server" ? signOut : undefined}/>}
    {modal === "import" && <ImportModal trades={data.trades} accounts={accounts} defaultAccount={defaultAccount} onClose={closeModal} onImport={importTrades}/>}
    {modal === "breathing" && <BreathingModal onClose={closeModal}/>}
    </div>}
    {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <CircleAlert size={18}/> : <CheckCircle2 size={18}/>} {toast.message}{toast.breath && <><button type="button" onClick={() => { setToast(null); openModal("breathing"); }}>Take a breath</button><button type="button" onClick={() => { setToast(null); navigate("Patience"); }}>Patience</button></>}</div>}
  </div>;
}
