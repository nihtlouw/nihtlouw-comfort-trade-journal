"use client";

import { useCallback, useState, type ElementType } from "react";
import {
  ArrowRight, BarChart3, BookOpenCheck, CalendarDays, Check, ChevronDown, ChevronRight,
  CircleCheck, Heart, LayoutDashboard, Leaf, LogOut, NotebookPen, Plus, RotateCcw,
  Settings2, Sparkles, Sprout, Target, TrendingUp, Wind, X,
} from "lucide-react";
import type { JournalData, JournalSettings, PlaybookRule, Trade } from "@/lib/types";
import { currency, filterTrades, getStats, longToday, todayString, type Period } from "@/lib/format";
import { GoalCard, MiniInsight, MoodCard, ProgressChart, ReminderCard, REMINDERS, StatsRow, TradesTable } from "@/components/journal-parts";
import { BreathingModal, GoalModal, SettingsModal, TradeModal, type TradeDraft } from "@/components/journal-modals";
import { saveBrowserJournal } from "@/lib/browser-journal";
import { parseTradeInput } from "@/lib/trade-validation";

type View = "Overview" | "Trade journal" | "Analytics" | "Playbook" | "Mindset" | "Goals";
type Modal = "trade" | "goal" | "settings" | "breathing" | null;

function saveStaticData(trades: Trade[], settings: JournalSettings) {
  try {
    saveBrowserJournal(window.localStorage, { trades, settings });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Couldn't save")) throw error;
    throw new Error("Couldn't save in this browser. Allow site storage, then try again.");
  }
}

const workspaceNav: { label: View; icon: ElementType }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Trade journal", icon: NotebookPen },
  { label: "Analytics", icon: BarChart3 },
  { label: "Playbook", icon: BookOpenCheck },
];
const personalNav: { label: View; icon: ElementType }[] = [
  { label: "Mindset", icon: Heart },
  { label: "Goals", icon: Target },
];

function greeting() {
  const hour = new Date().getUTCHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function sortedTrades(trades: Trade[]) {
  return [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id);
}

export function JournalApp({ initialData, storage = "server" }: { initialData: JournalData; storage?: "server" | "browser" }) {
  const isStaticExport = storage === "browser";
  const [trades, setTrades] = useState(initialData.trades);
  const [settings, setSettings] = useState(initialData.settings);
  const [view, setView] = useState<View>("Overview");
  const [period, setPeriod] = useState<Period>("1M");
  const [modal, setModal] = useState<Modal>(null);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [reminder, setReminder] = useState(0);
  const [toast, setToast] = useState("");
  const closeModal = useCallback(() => setModal(null), []);
  const sampleCount = trades.filter((trade) => trade.isDemo).length;
  const periodTrades = filterTrades(trades, period);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }

  async function updateSettings(patch: Partial<JournalSettings>): Promise<boolean> {
    const previous = settings;
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    try {
      if (isStaticExport) {
        saveStaticData(trades, nextSettings);
        notify("Saved in this browser. Keep growing!");
        return true;
      }
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Couldn't save your changes.");
      setSettings(result as JournalSettings);
      return true;
    } catch (error) {
      setSettings(previous);
      notify(error instanceof Error ? error.message : "Couldn't save your changes.");
      return false;
    }
  }

  async function saveTrade(draft: TradeDraft, id?: number): Promise<boolean> {
    try {
      if (isStaticExport) {
        const nextTrade: Trade = {
          ...parseTradeInput(draft),
          id: id ?? Math.max(0, ...trades.map((trade) => trade.id)) + 1,
          isDemo: id ? trades.find((trade) => trade.id === id)?.isDemo ?? false : false,
        };
        const nextTrades = sortedTrades(id ? trades.map((trade) => trade.id === id ? nextTrade : trade) : [nextTrade, ...trades]);
        saveStaticData(nextTrades, settings);
        setTrades(nextTrades);
        notify(id ? "Trade updated. Keep growing!" : "Trade saved. Proud of you for showing up!");
        return true;
      }
      const response = await fetch(id ? `/api/trades/${id}` : "/api/trades", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Couldn't save this trade.");
      setTrades((current) => sortedTrades(id ? current.map((trade) => trade.id === id ? result as Trade : trade) : [result as Trade, ...current]));
      notify(id ? "Trade updated. Keep growing!" : "Trade saved. Proud of you for showing up!");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn't save this trade."); return false;
    }
  }

  async function deleteTrade(id: number): Promise<boolean> {
    try {
      if (isStaticExport) {
        const nextTrades = trades.filter((trade) => trade.id !== id);
        saveStaticData(nextTrades, settings);
        setTrades(nextTrades);
        notify("Trade removed from your journal.");
        return true;
      }
      const response = await fetch(`/api/trades/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Couldn't delete this trade.");
      setTrades((current) => current.filter((trade) => trade.id !== id));
      notify("Trade removed from your journal."); return true;
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn't delete this trade."); return false; }
  }

  async function clearSamples(): Promise<boolean> {
    try {
      if (isStaticExport) {
        const nextTrades = trades.filter((trade) => !trade.isDemo);
        saveStaticData(nextTrades, settings);
        setTrades(nextTrades);
        notify("Sample trades cleared. This space is yours.");
        return true;
      }
      const response = await fetch("/api/trades", { method: "DELETE" });
      if (!response.ok) throw new Error("Couldn't clear sample trades.");
      setTrades((current) => current.filter((trade) => !trade.isDemo));
      notify("Sample trades cleared. This space is yours."); return true;
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn't clear sample trades."); return false; }
  }

  function newTrade() { setEditingTrade(null); setModal("trade"); }
  function editTrade(trade: Trade) { setEditingTrade(trade); setModal("trade"); }
  function selectMood(mood: string) { void updateSettings({ mood, moodDate: todayString() }); }
  function markGoal() { if (settings.goalProgress < settings.goalTarget) void updateSettings({ goalProgress: settings.goalProgress + 1 }); }
  function undoGoal() { if (settings.goalProgress > 0) void updateSettings({ goalProgress: settings.goalProgress - 1 }); }
  function nextReminder() { setReminder((current) => (current + 1) % REMINDERS.length); }
  function toggleRule(id: string) { void updateSettings({ playbook: settings.playbook.map((rule) => rule.id === id ? { ...rule, checked: !rule.checked } : rule) }); }
  function removeRule(id: string) { void updateSettings({ playbook: settings.playbook.filter((rule) => rule.id !== id) }); }
  function addRule(group: PlaybookRule["group"]) {
    const text = window.prompt("Add a gentle rule to your playbook:");
    if (!text?.trim()) return;
    if (settings.playbook.length >= 30) { notify("Your playbook can have up to 30 rules."); return; }
    void updateSettings({ playbook: [...settings.playbook, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, group, text: text.trim().slice(0, 160), checked: false }] });
  }

  const titles: Record<View, { eyebrow: string; title: string; subtitle: string }> = {
    Overview: { eyebrow: "YOUR JOURNEY, YOUR PACE", title: `${greeting()}, ${settings.name}`, subtitle: "Here's to showing up for yourself, one trade at a time." },
    "Trade journal": { eyebrow: "A SPACE TO REFLECT", title: "Your trade journal", subtitle: "Every trade has something to teach you. Let's write it down." },
    Analytics: { eyebrow: "GROWTH IN PERSPECTIVE", title: "Your progress", subtitle: "Look at the bigger picture, and celebrate how far you've come." },
    Playbook: { eyebrow: "YOUR PROCESS, YOUR POWER", title: "Your trading playbook", subtitle: "A little structure can make room for a lot of clarity." },
    Mindset: { eyebrow: "A MOMENT FOR YOU", title: "A calmer state of mind", subtitle: "Take a breath, check in, and meet yourself where you are." },
    Goals: { eyebrow: "LITTLE STEPS, BIG GROWTH", title: "Your intentions", subtitle: "Focus on what you can control. The rest will follow." },
  };

  const moodCard = <MoodCard settings={settings} onMood={selectMood} />;
  const goalCard = <GoalCard settings={settings} onMark={markGoal} onUndo={undoGoal} onEdit={() => setModal("goal")} />;
  const reminderCard = <ReminderCard index={reminder} onNext={nextReminder} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <button type="button" className="brand" onClick={() => setView("Overview")} aria-label="Bloom home"><span className="brand-mark"><Sprout size={24} strokeWidth={1.8} /></span><span className="brand-word"><strong>bloom<span>.</span></strong><small>TRADING JOURNAL</small></span></button>
      <div className="sidebar-scroll"><div className="nav-label">WORKSPACE</div><nav className="sidebar-nav" aria-label="Workspace">{workspaceNav.map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} onClick={() => setView(label)}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{view === label && <span className="nav-active-dot" />}</button>)}</nav><div className="nav-label personal-label">YOUR WELLBEING</div><nav className="sidebar-nav" aria-label="Your wellbeing">{personalNav.map(({ label, icon: Icon }) => <button type="button" key={label} className={view === label ? "active" : ""} onClick={() => setView(label)}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{view === label && <span className="nav-active-dot" />}</button>)}</nav></div>
      <div className="sidebar-bottom"><button type="button" className="sidebar-encouragement" onClick={() => setView("Mindset")}><span className="encouragement-sparkle"><Sparkles size={16} /></span><strong>You&apos;re right where<br />you need to be.</strong><small>A little progress each day<br />adds up to something big.</small><span className="encouragement-link">A moment for you <ArrowRight size={13} /></span><span className="encouragement-leaf">✳</span></button>{sampleCount > 0 && <button type="button" className="sample-indicator" onClick={() => setModal("settings")}><span /> Sample data included <ChevronRight size={13} /></button>}<button type="button" className="profile-button" onClick={() => setModal("settings")}><span className="avatar">{settings.name.charAt(0).toUpperCase()}</span><span><strong>{settings.name === "friend" ? "My space" : settings.name}</strong><small>Personal journal</small></span><Settings2 size={16} /></button></div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><span>My workspace</span><ChevronRight size={14} /><strong>{view}</strong></div><div className="topbar-actions"><span className="top-date"><CalendarDays size={15} /> {longToday()}</span><span className="top-divider" /><button type="button" className="breath-link" onClick={() => setModal("breathing")}><Wind size={17} /> <span>Take a breath</span></button><button type="button" className="top-avatar" onClick={() => setModal("settings")} aria-label="Personalize your space">{settings.name.charAt(0).toUpperCase()}</button></div></header>
      <div className="page-content"><div className="page-heading"><div><div className="page-eyebrow"><Sparkles size={13} /> {titles[view].eyebrow}</div><h1>{titles[view].title}{view === "Overview" && <span className="greeting-sun"> ☀</span>}</h1><p>{titles[view].subtitle}</p></div><button type="button" className="button-primary new-trade-button" onClick={newTrade}><Plus size={18} /> Log a trade</button></div>
        {view === "Overview" && <div className="dashboard-grid"><div className="dashboard-main"><section className="welcome-banner"><div className="welcome-content"><div className="welcome-kicker"><Sparkles size={13} /> A LITTLE REMINDER FOR YOU</div><h2>Progress, not perfection.</h2><p>Every trade is a chance to learn.<br />You&apos;re growing with every step you take.</p><button type="button" onClick={() => setView("Mindset")}>Take a mindful moment <ArrowRight size={14} /></button></div><div className="banner-stamp"><span>✳</span> GROW AT YOUR OWN PACE</div></section><div className="section-line"><div><h2>Your trading at a glance</h2><p>A little perspective on your progress.</p></div><span><CalendarDays size={14} /> {period === "ALL" ? "All time" : period === "1W" ? "Last 7 days" : period === "1M" ? "Last 30 days" : "Last 90 days"}</span></div><StatsRow trades={periodTrades} /><ProgressChart allTrades={trades} period={period} onPeriodChange={setPeriod} /><TradesTable trades={trades} onViewAll={() => setView("Trade journal")} onEdit={editTrade} onNew={newTrade} /></div><aside className="dashboard-side">{moodCard}{goalCard}{reminderCard}<div className="side-footer"><Leaf size={14} /> Made for the journey, not just the destination.</div></aside></div>}
        {view === "Trade journal" && <div className="single-view"><div className="view-intro"><div><h2>All the details, all in one place.</h2><p>Your journal is a judgment-free zone. Wins, losses, and lessons all belong here.</p></div><span className="view-intro-icon"><NotebookPen size={25} /></span></div><StatsRow trades={trades} /><TradesTable all trades={trades} onEdit={editTrade} onNew={newTrade} /><MiniInsight trades={trades} /></div>}
        {view === "Analytics" && <div className="single-view"><div className="section-line first-line"><div><h2>The bigger picture</h2><p>Let the numbers inform you, not define you.</p></div><span><CalendarDays size={14} /> {period === "ALL" ? "All time" : period === "1W" ? "Last 7 days" : period === "1M" ? "Last 30 days" : "Last 90 days"}</span></div><StatsRow trades={periodTrades} /><ProgressChart allTrades={trades} period={period} onPeriodChange={setPeriod} /><AnalyticsDetails trades={periodTrades} /></div>}
        {view === "Playbook" && <div className="single-view"><div className="view-intro"><div><h2>Trade with intention.</h2><p>Your playbook is a promise to yourself, not a demand for perfection.</p></div><button type="button" className="button-secondary" onClick={() => void updateSettings({ playbook: settings.playbook.map((rule) => ({ ...rule, checked: false })) })}><RotateCcw size={15} /> Reset checks</button></div><div className="playbook-grid">{(["Before trading", "While trading", "After trading"] as PlaybookRule["group"][]).map((group, groupIndex) => { const rules = settings.playbook.filter((rule) => rule.group === group); return <section className="card playbook-card" key={group}><div className="playbook-card-top"><span className={`playbook-icon playbook-${groupIndex}`}><span>{["01", "02", "03"][groupIndex]}</span></span><span>{rules.filter((rule) => rule.checked).length}/{rules.length} COMPLETE</span></div><h2>{group}</h2><p>{["Set yourself up for a thoughtful start.", "Stay present, patient, and true to your plan.", "Reflect, learn, and give yourself room to rest."][groupIndex]}</p><div className="rule-list">{rules.map((rule) => <div className="rule-row" key={rule.id}><button type="button" className={`rule-toggle ${rule.checked ? "checked" : ""}`} onClick={() => toggleRule(rule.id)} aria-pressed={rule.checked}><span className="rule-checkbox">{rule.checked && <Check size={13} />}</span><span>{rule.text}</span></button><button type="button" className="remove-rule" onClick={() => removeRule(rule.id)} aria-label={`Remove ${rule.text}`}><X size={14} /></button></div>)}</div><button type="button" className="add-rule" onClick={() => addRule(group)}><Plus size={15} /> Add a rule</button></section>; })}</div><div className="gentle-banner"><Sparkles size={19} /><div><strong>Consistency over perfection, always.</strong><p>It&apos;s okay to begin again as many times as you need.</p></div></div></div>}
        {view === "Mindset" && <div className="single-view"><div className="mindset-hero"><div><span><Sparkles size={14} /> YOUR MIND MATTERS</span><h2>A good trade starts<br />with a gentle pause.</h2><p>You don&apos;t need to have it all figured out. Take this moment to slow down and come back to yourself.</p><button type="button" className="button-primary" onClick={() => setModal("breathing")}><Wind size={17} /> Take a breathing break</button></div><div className="mindset-orbit"><span>✳</span></div></div><div className="wellbeing-grid">{moodCard}{reminderCard}<div className="card wellbeing-note"><span className="side-icon green"><Leaf size={16} /></span><h2>Permission to pause.</h2><p>The market will be there tomorrow. Your wellbeing matters more than any opportunity.</p><button type="button" className="text-link" onClick={() => setView("Playbook")}>Visit your playbook <ArrowRight size={14} /></button></div></div></div>}
        {view === "Goals" && <div className="single-view"><div className="goals-layout">{goalCard}<div className="card goals-explanation"><span className="side-icon green"><Sprout size={18} /></span><h2>Small intentions.<br />Meaningful growth.</h2><p>Instead of chasing an outcome, celebrate the habits that support you. Mark a day whenever you feel you showed up for your intention.</p><div className="goal-tip"><Sparkles size={16} /><span>Progress is personal. There&apos;s no perfect pace.</span></div><button type="button" className="button-secondary" onClick={() => setModal("goal")}>Make this intention yours <ArrowRight size={15} /></button></div></div><div className="gentle-banner"><Heart size={19} /><div><strong>You are more than your results.</strong><p>Keep choosing the process, and be kind to yourself along the way.</p></div></div></div>}
      </div><footer className="app-footer"><span>Made with care for your trading journey <span>♥</span></span><span>{isStaticExport ? "Browser-only journal · Saved on this device, not synced to Neon." : "Progress looks good on you."}</span></footer>
    </main>
    {modal === "trade" && <TradeModal key={editingTrade?.id ?? "new"} trade={editingTrade} onClose={closeModal} onSave={saveTrade} onDelete={deleteTrade} />}
    {modal === "goal" && <GoalModal settings={settings} onClose={closeModal} onSave={updateSettings} />}
    {modal === "settings" && <SettingsModal settings={settings} sampleCount={sampleCount} onClose={closeModal} onSave={updateSettings} onClearSamples={clearSamples} />}
    {modal === "breathing" && <BreathingModal onClose={closeModal} />}
    {toast && <div className="toast" role="status"><CircleCheck size={17} /> {toast}</div>}
  </div>;
}

function AnalyticsDetails({ trades }: { trades: Trade[] }) {
  const stats = getStats(trades);
  const markets = Array.from(new Set(trades.map((trade) => trade.market))).map((market) => ({ market, count: trades.filter((trade) => trade.market === market).length, net: trades.filter((trade) => trade.market === market).reduce((sum, trade) => sum + Number(trade.pnl), 0) })).sort((a, b) => b.count - a.count);
  return <div className="analytics-details"><section className="card analytics-card"><div className="heading-with-icon"><span className="heading-icon"><BarChart3 size={16} /></span><h2>Markets you trade</h2></div><p>A little look at where you spend your time.</p>{markets.length ? <div className="market-list">{markets.map((item) => <div className="market-item" key={item.market}><div><strong>{item.market}</strong><span>{item.count} {item.count === 1 ? "trade" : "trades"} <b className={item.net < 0 ? "negative" : "positive"}>{currency(item.net, item.net > 0)}</b></span></div><div className="progress-track"><div style={{ width: `${item.count / Math.max(trades.length, 1) * 100}%` }} /></div></div>)}</div> : <p className="analytics-empty">Your market breakdown will appear when you log a trade.</p>}</section><section className="card analytics-card"><div className="heading-with-icon"><span className="heading-icon"><TrendingUp size={16} /></span><h2>Wins &amp; lessons</h2></div><p>Both are valuable parts of your story.</p><div className="win-breakdown"><div className="win-circle" style={{ background: `conic-gradient(#78b48c ${stats.winRate}%, #f0d1c5 0)` }}><div><strong>{stats.winRate}%</strong><span>win rate</span></div></div><div className="win-legend"><span><i className="legend-win" /> Wins <b>{stats.wins}</b></span><span><i className="legend-loss" /> Losses <b>{stats.losses}</b></span><span><i className="legend-even" /> Breakeven <b>{stats.count - stats.wins - stats.losses}</b></span></div></div></section></div>;
}
