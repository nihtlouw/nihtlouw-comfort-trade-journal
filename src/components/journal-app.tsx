"use client";

import { useCallback, useEffect, useRef, useState, type ElementType } from "react";
import { ArrowRight, BarChart3, BookOpenCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Eye, EyeOff, Heart, LayoutDashboard, Leaf, Menu, NotebookPen, Plus, Settings2, Sparkles, Sprout, Target, Wind, X } from "lucide-react";
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
import { AnalyticsView, CalendarView, GoalsView, JournalView, MindsetView, Overview, PlaybookView, type View } from "@/components/journal-views";
import { BreathingModal, ImportModal, SettingsModal, TradeModal, type TradeDraft } from "@/components/journal-dialogs";

type Modal = "trade" | "settings" | "breathing" | "import" | null;
const workspaceNav: { label: View; icon: ElementType }[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Trade journal", icon: NotebookPen }, { label: "Analytics", icon: BarChart3 }, { label: "Calendar", icon: CalendarDays }, { label: "Playbook", icon: BookOpenCheck },
];
const personalNav: { label: View; icon: ElementType }[] = [{ label: "Mindset", icon: Heart }, { label: "Goals", icon: Target }];
const titles: Record<View, { eyebrow: string; title: string; subtitle: string }> = {
  Overview: { eyebrow: "YOUR JOURNEY, YOUR PACE", title: "", subtitle: "Here’s to showing up for yourself, one trade at a time." },
  "Trade journal": { eyebrow: "A SPACE TO REFLECT", title: "Your trade journal", subtitle: "Every trade has something to teach you. Let’s write it down." },
  Analytics: { eyebrow: "GROWTH IN PERSPECTIVE", title: "Your progress", subtitle: "Let the numbers inform you, not define you." },
  Calendar: { eyebrow: "ONE DAY AT A TIME", title: "Your trading calendar", subtitle: "Every day is another page in your story." },
  Playbook: { eyebrow: "YOUR PROCESS, YOUR POWER", title: "Your trading playbook", subtitle: "A little structure makes room for a lot of clarity." },
  Mindset: { eyebrow: "A MOMENT FOR YOU", title: "A calmer state of mind", subtitle: "Take a breath, check in, and meet yourself where you are." },
  Goals: { eyebrow: "LITTLE STEPS, BIG GROWTH", title: "Your intentions", subtitle: "A gentle reminder to focus on the things within your control." },
};
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function sortTrades(trades: Trade[]) { return [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id); }
function id() { return crypto.randomUUID(); }

export function JournalApp({ initialData, storage = "browser", initialRevision = 0, initialDamaged = null }: { initialData: JournalData; storage?: StorageMode; initialRevision?: number; initialDamaged?: string | null }) {
  const [data, setData] = useState(() => normalizeJournalData(initialData));
  const dataRef = useRef(data); const revision = useRef(initialRevision); const busyRef = useRef(false);
  const [view, setView] = useState<View>("Overview"); const [period, setPeriod] = useState<Period>("1M"); const [modal, setModal] = useState<Modal>(null); const [modalClosing, setModalClosing] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null); const [hidden, setHidden] = useState(false); const [accountFilter, setAccountFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState(""); const [mobileMenu, setMobileMenu] = useState(false); const [saving, setSaving] = useState(false);
  const [damaged, setDamaged] = useState(initialDamaged); const [toast, setToast] = useState<{ message: string; error: boolean; breath: boolean } | null>(null);
  const toastTimer = useRef<number | null>(null); const modalCloseTimer = useRef<number | null>(null); const mobileClose = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useCallback(() => dataRef.current.settings.reduceMotion === true || window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const openModal = useCallback((next: Exclude<Modal, null>) => {
    if (modalCloseTimer.current !== null) window.clearTimeout(modalCloseTimer.current);
    modalCloseTimer.current = null; setModalClosing(false); setModal(next);
  }, []);
  const closeModal = useCallback(() => {
    if (modalCloseTimer.current !== null) return;
    if (prefersReducedMotion()) { setModal(null); setModalClosing(false); return; }
    setModalClosing(true);
    modalCloseTimer.current = window.setTimeout(() => { modalCloseTimer.current = null; setModal(null); setModalClosing(false); }, 180);
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
      const ok = await commit({ ...current, trades: sortTrades(nextTrades) }, tradeId ? "Trade updated. Keep growing." : "Trade saved. Proud of you for showing up.");
      if (!ok) { await Promise.allSettled(staged.map((item) => removeAttachment(item.id, storage))); return false; }
      await removeUnusedImages(removed); if (!tradeId && Number(parsed.pnl) < 0) notify("Trade saved. A pause is always an option.", false, true); return true;
    } catch (error) { await Promise.allSettled(staged.map((item) => removeAttachment(item.id, storage))); notify(error instanceof Error ? error.message : "Couldn’t save this trade.", true); return false; }
  }
  async function deleteTrade(tradeId: number) {
    const current = dataRef.current; const old = current.trades.find((trade) => trade.id === tradeId);
    const ok = await commit({ ...current, trades: current.trades.filter((trade) => trade.id !== tradeId) }, "Trade removed from your journal.");
    if (ok && old) await removeUnusedImages(old.attachments ?? []);
    return ok;
  }
  async function clearSamples() { const current = dataRef.current; const samples = current.trades.filter((trade) => trade.isDemo); const ok = await commit({ ...current, trades: current.trades.filter((trade) => !trade.isDemo) }, "Sample trades cleared. This space is yours."); if (ok) await removeUnusedImages(samples.flatMap((trade) => trade.attachments ?? [])); return ok; }
  function newTrade() { setEditing(null); openModal("trade"); }
  function editTrade(trade: Trade) { setEditing(trade); openModal("trade"); }
  function scrollToTop() { window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" }); }
  function navigate(next: View) { setView(next); setMobileMenu(false); if (next !== "Trade journal") setSelectedDay(""); scrollToTop(); }
  function day(date: string) { setSelectedDay(date); setView("Trade journal"); scrollToTop(); }
  function selectMood(mood: string) { const today = todayString(); const previous = dataRef.current.settings.moodHistory ?? []; const note = previous.find((item) => item.date === today)?.note ?? ""; void updateSettings({ mood, moodDate: today, moodHistory: [...previous.filter((item) => item.date !== today), { date: today, mood, note }] }, "Check-in saved. Thank you for taking a moment."); }
  function saveMoodNote(note: string) { const today = todayString(); const previous = dataRef.current.settings.moodHistory ?? []; void updateSettings({ moodHistory: previous.map((item) => item.date === today ? { ...item, note: note.trim().slice(0, 1000) } : item) }, "Your check-in note is saved."); }
  function updateGoals(goals: Intention[], message?: string) { const first = goals[0]; return updateSettings({ goals, ...(first ? { goal: first.text, goalTarget: first.target, goalProgress: first.progress } : {}) }, message); }
  function markGoal(goalId: string) { const goals = dataRef.current.settings.goals ?? []; const today = todayString(); void updateGoals(goals.map((goal) => goal.id === goalId && goal.progress < goal.target && !goal.markedDates.includes(today) ? { ...goal, progress: goal.progress + 1, markedDates: [...goal.markedDates, today] } : goal), "A little win worth celebrating."); }
  function undoGoal(goalId: string) { const goals = dataRef.current.settings.goals ?? []; void updateGoals(goals.map((goal) => goal.id === goalId && goal.progress > 0 ? { ...goal, progress: goal.progress - 1, markedDates: goal.markedDates.slice(0, -1) } : goal)); }
  function resetGoal(goalId: string) { void updateGoals((dataRef.current.settings.goals ?? []).map((goal) => goal.id === goalId ? { ...goal, progress: 0, markedDates: [] } : goal)); }
  function deleteGoal(goalId: string) { if (window.confirm("Remove this intention?")) void updateGoals((dataRef.current.settings.goals ?? []).filter((goal) => goal.id !== goalId), "Intention removed."); }
  async function addGoal(goal: Intention) { const goals = dataRef.current.settings.goals ?? []; if (goals.length >= 20) { notify("You can have up to 20 intentions.", true); return false; } return updateGoals([...goals, goal], "Your intention is ready."); }
  async function addAccount(name: string) { const current = dataRef.current.settings.accounts ?? [DEFAULT_ACCOUNT]; if (current.length >= 20 || current.some((item) => item.name.toLowerCase() === name.toLowerCase())) { notify("Choose a unique account name (up to 20 accounts).", true); return false; } return updateSettings({ accounts: [...current, { id: id(), name: name.slice(0, 40) }] }, "Account added."); }
  async function removeAccount(accountId: string) { const current = dataRef.current; if (current.trades.some((trade) => (trade.accountId ?? DEFAULT_ACCOUNT.id) === accountId)) { notify("Move or delete this account’s trades before removing it.", true); return false; } const next = (current.settings.accounts ?? []).filter((account) => account.id !== accountId); if (!next.length) return false; const ok = await updateSettings({ accounts: next }, "Account removed."); if (ok && accountFilter === accountId) setAccountFilter("all"); return ok; }
  async function backup() { try { const content = await createBackup(dataRef.current, storage); downloadFile(`bloom-backup-${todayString()}.json`, content, "application/json"); notify("Backup downloaded. Keep it somewhere private."); } catch (error) { notify(error instanceof Error ? error.message : "Couldn’t create a backup.", true); } }
  function exportCsv(trades: Trade[]) { downloadFile(`bloom-trades-${todayString()}.csv`, exportTradesCsv(trades, dataRef.current.settings.accounts ?? [DEFAULT_ACCOUNT]), "text/csv;charset=utf-8"); notify("CSV downloaded."); }
  async function restore(file: File) {
    let staged: TradeAttachment[] = [];
    try {
      if (file.size > 50_000_000) throw new Error("Backup files must be under 50 MB.");
      const parsed = await parseBackup(await file.text()); const result = await stageBackupImages(parsed, storage); staged = result.staged;
      const oldImages = dataRef.current.trades.flatMap((trade) => trade.attachments ?? []);
      const ok = await commit(result.journal, "Backup restored successfully.", true);
      if (!ok) { await Promise.allSettled(staged.map((image) => removeAttachment(image.id, storage))); return false; }
      await removeUnusedImages(oldImages); setAccountFilter("all"); return true;
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
  const common = { trades: visibleTrades, settings: data.settings, hidden, onEditTrade: editTrade, onNewTrade: newTrade, onView: navigate, onDay: day, onMood: selectMood, onMarkGoal: markGoal, period, onPeriod: setPeriod };
  const title = view === "Overview" ? `${greeting()}, ${data.settings.name}` : titles[view].title;
  return <div className="app-shell" data-theme={data.settings.theme ?? "light"} data-motion={data.settings.reduceMotion ? "reduced" : "system"}>
    <aside id="primary-sidebar" className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}><button type="button" className="brand" onClick={() => navigate("Overview")} aria-label="Bloom home"><span className="brand-mark"><Sprout size={25} strokeWidth={1.6}/></span><span className="brand-word"><strong>bloom<span>.</span></strong><small>TRADING JOURNAL</small></span></button><button type="button" ref={mobileClose} className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><X size={20}/></button>
      <div className="sidebar-scroll"><div className="nav-label">WORKSPACE <span>✳</span></div><nav className="sidebar-nav" aria-label="Workspace">{workspaceNav.map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} onClick={() => navigate(label)}><Icon size={18} strokeWidth={1.7}/><span>{label}</span>{view === label && <span className="nav-active-dot"/>}</button>)}</nav><div className="nav-label personal-label">YOUR WELLBEING <span>✳</span></div><nav className="sidebar-nav" aria-label="Your wellbeing">{personalNav.map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} onClick={() => navigate(label)}><Icon size={18} strokeWidth={1.7}/><span>{label}</span>{view === label && <span className="nav-active-dot"/>}</button>)}</nav>
      <button type="button" className="sidebar-settings" onClick={() => { setMobileMenu(false); openModal("settings"); }}><Settings2 size={18}/> Settings</button></div>
      <div className="sidebar-bottom"><button type="button" className="sidebar-encouragement" onClick={() => navigate("Mindset")}><span className="encouragement-icon"><Sparkles size={16}/></span><strong>You’re right where<br/>you need to be.</strong><small>A little progress each day adds up to something big.</small><span className="encouragement-link">A moment for you <ArrowRight size={13}/></span><span className="encouragement-flower">✳</span></button><div className="sidebar-storage"><span className="storage-dot"/>{storage === "browser" ? "SAVED IN THIS BROWSER" : "PRIVATE ACCOUNT"}</div><button type="button" className="profile-button" onClick={() => openModal("settings")}><span className="avatar">{data.settings.name.charAt(0).toUpperCase()}</span><span><strong>{data.settings.name === "friend" ? "My space" : data.settings.name}</strong><small>{storage === "browser" ? "Personal journal" : "Synced journal"}</small></span><Settings2 size={16}/></button></div>
    </aside><button type="button" className={`mobile-scrim ${mobileMenu ? "is-visible" : ""}`} onClick={() => setMobileMenu(false)} aria-label="Close navigation" aria-hidden={!mobileMenu} tabIndex={-1}/>
    <main className="main-shell"><header className="topbar"><div className="topbar-left"><button type="button" className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation" aria-expanded={mobileMenu} aria-controls="primary-sidebar"><Menu size={21}/></button><div className="breadcrumbs"><span>My workspace</span><ChevronRight size={14}/><strong>{view}</strong></div></div><div className="topbar-actions"><span className="top-date"><CalendarDays size={15}/> {longToday()}</span><span className="top-divider"/><button type="button" className="breath-link" onClick={() => openModal("breathing")}><Wind size={17}/><span> Take a breath</span></button><button type="button" className="top-avatar" onClick={() => openModal("settings")} aria-label="Open settings">{data.settings.name.charAt(0).toUpperCase()}</button></div></header>
      <div className="page-content"><div className="page-heading"><div className="page-heading-copy" key={view}><div className="page-eyebrow"><Sparkles size={13}/> {titles[view].eyebrow}</div><h1>{title}{view === "Overview" && <span className="greeting-sun"> ☀</span>}</h1><p>{titles[view].subtitle}</p></div><div className="heading-actions"><button type="button" className="privacy-button" onClick={() => setHidden(!hidden)} aria-label={hidden ? "Show amounts" : "Hide amounts"} title={hidden ? "Show amounts" : "Hide amounts"}>{hidden ? <EyeOff size={17}/> : <Eye size={17}/>}</button><button type="button" className="button-primary new-trade-button" onClick={newTrade}><Plus size={18}/> Log a trade</button></div></div>
        {damaged !== null && <div className="recovery-banner" role="alert"><CircleAlert size={20}/><div><strong>Your saved journal needs recovery.</strong><p>We haven’t overwritten it. Download the original, then restore a valid Bloom backup or start fresh.</p><div><button type="button" onClick={() => downloadFile("bloom-damaged-journal.txt", damaged, "text/plain")}>Download original</button><button type="button" onClick={() => openModal("settings")}>Restore backup in settings</button><button type="button" onClick={() => { if (window.confirm("Replace the damaged journal with a fresh sample journal? Download the original first.")) void commit(createDemoData(), "A fresh journal is ready.", true); }}>Start fresh</button></div></div></div>}
        <div className="workspace-controls"><div className="account-select-wrap"><span className="account-select-icon">✳</span><label><span>ACCOUNT</span><select aria-label="Filter by trading account" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><ChevronDown size={14}/></div><div className="workspace-control-right">{sampleCount > 0 && <button type="button" className={`sample-toggle ${data.settings.includeSamples !== false ? "on" : ""}`} onClick={() => void updateSettings({ includeSamples: data.settings.includeSamples === false }, data.settings.includeSamples === false ? "Sample trades included." : "Sample trades hidden.")} aria-pressed={data.settings.includeSamples !== false}><span className="sample-indicator-dot"/> {data.settings.includeSamples === false ? "Samples hidden" : "Sample data included"}<span className="switch"><i/></span></button>}<span className="save-indicator"><span/>{saving ? "Saving..." : storage === "browser" ? "Saved on this device" : "Private & synced"}</span></div></div>
        <div className="view-motion" data-view={view} key={view}>
        {view === "Overview" && <Overview {...common}/>}
        {view === "Trade journal" && <JournalView trades={visibleTrades} hidden={hidden} onEditTrade={editTrade} onNewTrade={newTrade} onImport={() => openModal("import")} onExport={exportCsv} selectedDay={selectedDay} clearDay={() => setSelectedDay("")}/>}
        {view === "Analytics" && <AnalyticsView trades={visibleTrades} hidden={hidden} period={period} onPeriod={setPeriod}/>}
        {view === "Calendar" && <CalendarView trades={visibleTrades} hidden={hidden} onDay={day}/>}
        {view === "Playbook" && <PlaybookView settings={data.settings} onUpdate={(playbook: PlaybookRule[]) => void updateSettings({ playbook })}/>}
        {view === "Mindset" && <MindsetView settings={data.settings} trades={visibleTrades} onMood={selectMood} onSaveMoodNote={saveMoodNote} onBreath={() => openModal("breathing")} onSaveReflection={(reflection: WeeklyReflection) => updateSettings({ reflections: [...(dataRef.current.settings.reflections ?? []), reflection] }, "Reflection saved. Thank you for taking the time.")} onDeleteReflection={(reflectionId) => { if (window.confirm("Delete this reflection?")) void updateSettings({ reflections: (dataRef.current.settings.reflections ?? []).filter((item) => item.id !== reflectionId) }, "Reflection removed."); }}/>}
        {view === "Goals" && <GoalsView settings={data.settings} onMark={markGoal} onUndo={undoGoal} onReset={resetGoal} onDelete={deleteGoal} onAdd={addGoal}/>}
        </div>
      </div><footer className="app-footer"><span>Made with care for your trading journey <span>♥</span></span><span>{storage === "browser" ? "Browser-only journal · Remember to back up your data." : "Progress looks good on you."}</span></footer></main>
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{([{ label: "Overview", icon: LayoutDashboard }, { label: "Trade journal", icon: NotebookPen }, { label: "Calendar", icon: CalendarDays }] as const).map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} onClick={() => navigate(label)}><Icon size={19}/><span>{label === "Trade journal" ? "Journal" : label}</span></button>)}<button type="button" onClick={() => setMobileMenu(true)} aria-expanded={mobileMenu} aria-controls="primary-sidebar"><Menu size={19}/><span>More</span></button></nav>
    {modal && <div className={`modal-layer ${modalClosing ? "is-closing" : ""}`}>
    {modal === "trade" && <TradeModal key={editing?.id ?? "new"} trade={editing} accounts={accounts} playbook={data.settings.playbook} defaultAccount={defaultAccount} mode={storage} onClose={closeModal} onSave={saveTrade} onDelete={deleteTrade}/>}
    {modal === "settings" && <SettingsModal data={data} mode={storage} sampleCount={sampleCount} onClose={closeModal} onUpdate={updateSettings} onClearSamples={clearSamples} onBackup={backup} onRestore={restore} onExportCsv={() => exportCsv(dataRef.current.trades)} onImportCsv={() => openModal("import")} onAddAccount={addAccount} onRemoveAccount={removeAccount} onSignOut={storage === "server" ? signOut : undefined}/>}
    {modal === "import" && <ImportModal trades={data.trades} accounts={accounts} defaultAccount={defaultAccount} onClose={closeModal} onImport={importTrades}/>}
    {modal === "breathing" && <BreathingModal onClose={closeModal}/>}
    </div>}
    {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <CircleAlert size={18}/> : <CheckCircle2 size={18}/>} {toast.message}{toast.breath && <button type="button" onClick={() => { setToast(null); openModal("breathing"); }}>Take a breath</button>}</div>}
  </div>;
}
