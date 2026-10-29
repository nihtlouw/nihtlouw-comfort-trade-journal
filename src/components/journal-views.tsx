"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookHeart, CalendarDays, Check, CheckCircle2, ChevronDown, CirclePlus, Download, Filter, Plus, RotateCcw, Search, Sparkles, Target, Trash2, Upload, Wind, X } from "lucide-react";
import { groupTrades, maxRealizedDrawdown, previousPeriodTrades } from "@/lib/analytics";
import { currency, filterTrades, getAccountBalanceSummary, getStats, shortDate, todayString, type Period } from "@/lib/format";
import { periodLabel, translateAccountName, translateMarket, translateMood, translatePlaybookGroup, translateSide, UI_COPY } from "@/lib/i18n";
import { DEFAULT_ACCOUNT, MARKETS, MOODS, type AppLocale, type Intention, type JournalSettings, type PlaybookRule, type Trade, type WeeklyReflection } from "@/lib/types";
import { RiskOverview } from "@/components/journal-review";
import { AccountBalanceCard, CardTitle, GoalCard, MoodCard, PerformanceChart, StatsCards, TradeTable, TradingCalendar } from "@/components/journal-ui";

export type View = "Overview" | "Trade journal" | "Analytics" | "Calendar" | "Playbook" | "Mindset" | "Patience" | "Goals" | "Weekly review";
export type CommonProps = {
  trades: Trade[];
  allTrades: Trade[];
  accountFilter: string;
  settings: JournalSettings;
  hidden: boolean;
  onEditTrade: (trade: Trade) => void;
  onNewTrade: () => void;
  onView: (view: View) => void;
  onDay: (date: string) => void;
  onMood: (mood: string) => void;
  onMarkGoal: (id: string) => void;
  onRiskSettings: () => void;
  onAccountsSettings: () => void;
  period: Period;
  onPeriod: (period: Period) => void;
};

export function Overview(props: CommonProps) {
  const locale = props.settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const periodTrades = filterTrades(props.trades, props.period);
  const accounts = (props.settings.accounts ?? [DEFAULT_ACCOUNT]).map((item) => ({
    ...item,
    name: translateAccountName(item.name, locale),
  }));
  const balanceSummary = useMemo(
    () => getAccountBalanceSummary(props.allTrades, accounts, props.accountFilter),
    [props.allTrades, accounts, props.accountFilter],
  );
  const basePath = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true" ? "/nihtlouw-comfort-trade-journal" : "";
  return <div className="overview-grid"><div className="overview-main">
    <section className="welcome-banner" style={{ backgroundImage: `linear-gradient(90deg, var(--hero-fade) 0%, var(--hero-fade-soft) 37%, transparent 80%), url('${basePath}/images/bloom-landscape.png')` }}>
      <div className="welcome-content"><span className="hero-kicker"><Sparkles size={13}/> {copy.heroKicker}</span><h2>{copy.heroLine1}<br/><em>{copy.heroLine2}</em></h2><p>{copy.heroBody}</p><button type="button" onClick={() => props.onView("Trade journal")}>{copy.openJournal} <ArrowRight size={15}/></button></div>
    </section>
    <AccountBalanceCard summary={balanceSummary} hidden={props.hidden} locale={locale} onOpenAccounts={props.onAccountsSettings}/>
    <div className="section-heading"><div><h2>{copy.tradingAtAGlance}</h2></div><div className="range-label"><CalendarDays size={15}/> {periodLabel(props.period, locale)}</div></div>
    <StatsCards trades={periodTrades} hidden={props.hidden} locale={locale}/>
    <PerformanceChart trades={periodTrades} period={props.period} onPeriodChange={props.onPeriod} hidden={props.hidden} locale={locale}/>
    <TradeTable trades={props.trades.slice(0, 5)} hidden={props.hidden} onEdit={props.onEditTrade} onNew={props.onNewTrade} onViewAll={() => props.onView("Trade journal")} compact locale={locale}/>
    <TradingCalendar trades={props.trades} hidden={props.hidden} onDay={props.onDay} compact locale={locale}/>
  </div><aside className="overview-side"><MoodCard settings={props.settings} onMood={props.onMood} onOpen={() => props.onView("Mindset")} locale={locale}/><GoalCard settings={props.settings} onMark={props.onMarkGoal} onOpen={() => props.onView("Goals")} locale={locale}/><RiskOverview trades={props.trades} settings={props.settings} hidden={props.hidden} onReview={() => props.onView("Weekly review")} onSettings={props.onRiskSettings}/></aside></div>;
}

export function JournalView({ trades, hidden, onEditTrade, onNewTrade, onImport, onExport, selectedDay, clearDay, locale = "en" }: { trades: Trade[]; hidden: boolean; onEditTrade: (trade: Trade) => void; onNewTrade: () => void; onImport: () => void; onExport: (trades: Trade[]) => void; selectedDay: string; clearDay: () => void; locale?: AppLocale }) {
  const copy = UI_COPY[locale];
  const [query, setQuery] = useState(""); const [market, setMarket] = useState("All markets"); const [result, setResult] = useState("All results");
  const [side, setSide] = useState("All directions"); const [mood, setMood] = useState("All moods"); const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = [market !== "All markets", result !== "All results", side !== "All directions", mood !== "All moods", !!start, !!end].filter(Boolean).length;
  function clearFilters() { setMarket("All markets"); setResult("All results"); setSide("All directions"); setMood("All moods"); setStart(""); setEnd(""); }
  const filtered = useMemo(() => trades.filter((trade) => {
    const value = Number(trade.pnl); const q = query.toLowerCase().trim();
    const translatedSearch = `${translateMarket(trade.market, locale)} ${translateSide(trade.side, locale)} ${translateMood(trade.mood, locale)}`.toLowerCase();
    return (!q || `${trade.symbol} ${trade.market} ${trade.setup} ${trade.notes} ${(trade.tags ?? []).join(" ")} ${translatedSearch}`.toLowerCase().includes(q))
      && (market === "All markets" || trade.market === market)
      && (side === "All directions" || trade.side === side) && (mood === "All moods" || trade.mood === mood)
      && (result === "All results" || (result === "Wins" && value > 0) || (result === "Losses" && value < 0) || (result === "Breakeven" && value === 0))
      && (!selectedDay || trade.tradeDate === selectedDay) && (!start || trade.tradeDate >= start) && (!end || trade.tradeDate <= end);
  }), [trades, query, market, side, mood, result, selectedDay, start, end, locale]);
  return <div className="view-stack">
    <div className="journal-toolbar card"><div className="toolbar-primary"><label className="search-box"><Search size={17}/><span className="sr-only">{copy.searchTrades}</span><input type="search" enterKeyHint="search" placeholder={copy.searchTrades} value={query} onChange={(event) => setQuery(event.target.value)}/></label><button type="button" className="button-secondary" onClick={onImport}><Upload size={15}/> {copy.importCsv}</button><button type="button" className="button-secondary" onClick={() => onExport(filtered)}><Download size={15}/> {copy.exportCsv}</button></div>
      <button type="button" className="filters-toggle" aria-expanded={filtersOpen} aria-controls="journal-filters" onClick={() => setFiltersOpen(!filtersOpen)}><span><Filter size={16}/> {copy.filters} {activeFilters > 0 && <b>{activeFilters}</b>}</span><ChevronDown size={17} className={filtersOpen ? "rotated" : ""}/></button>
      <div className={`filter-row ${filtersOpen ? "is-open" : ""}`} id="journal-filters"><span className="filter-label"><Filter size={14}/> {copy.filterBy}</span>
        <select aria-label={copy.filterMarketAria} value={market} onChange={(event) => setMarket(event.target.value)}><option value="All markets">{copy.allMarkets}</option>{MARKETS.map((item) => <option key={item} value={item}>{translateMarket(item, locale)}</option>)}</select>
        <select aria-label={copy.filterResultAria} value={result} onChange={(event) => setResult(event.target.value)}><option value="All results">{copy.allResults}</option><option value="Wins">{copy.winsPlural}</option><option value="Losses">{copy.lossesPlural}</option><option value="Breakeven">{copy.breakeven}</option></select>
        <select aria-label={copy.filterDirectionAria} value={side} onChange={(event) => setSide(event.target.value)}><option value="All directions">{copy.anySide}</option><option value="Long">{translateSide("Long", locale)}</option><option value="Short">{translateSide("Short", locale)}</option></select>
        <select aria-label={copy.filterMoodAria} value={mood} onChange={(event) => setMood(event.target.value)}><option value="All moods">{copy.allMoods}</option>{MOODS.map((item) => <option key={item} value={item}>{translateMood(item, locale)}</option>)}</select>
        <label className="date-filter"><span>{copy.from}</span><input aria-label={copy.fromDateAria} type="date" value={start} onChange={(event) => setStart(event.target.value)}/></label><label className="date-filter"><span>{copy.to}</span><input aria-label={copy.toDateAria} type="date" value={end} onChange={(event) => setEnd(event.target.value)}/></label>
        {activeFilters > 0 && <button type="button" className="clear-filters" onClick={clearFilters}>{copy.clearFilters}</button>}
      </div>{selectedDay && <div className="selected-day"><CalendarDays size={14}/> {copy.showingDay} {shortDate(selectedDay, true, locale)} <button type="button" onClick={clearDay} aria-label={copy.clearSelectedDay}><X size={14}/></button></div>}
    </div>
    <TradeTable trades={filtered} hidden={hidden} onEdit={onEditTrade} onNew={onNewTrade} locale={locale}/>
  </div>;
}

export function AnalyticsView({ trades, allTrades, accountFilter, settings, hidden, period, onPeriod, onAccountsSettings }: { trades: Trade[]; allTrades: Trade[]; accountFilter: string; settings: JournalSettings; hidden: boolean; period: Period; onPeriod: (period: Period) => void; onAccountsSettings: () => void }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const selected = filterTrades(trades, period); const stats = getStats(selected); const previous = getStats(previousPeriodTrades(trades, period)); const [group, setGroup] = useState<"Market" | "Setup" | "Mood" | "Day">("Market");
  const intlTag = locale === "id" ? "id-ID" : "en-US";
  const accounts = (settings.accounts ?? [DEFAULT_ACCOUNT]).map((item) => ({
    ...item,
    name: translateAccountName(item.name, locale),
  }));
  const balanceSummary = useMemo(
    () => getAccountBalanceSummary(allTrades, accounts, accountFilter),
    [allTrades, accounts, accountFilter],
  );
  const groups = groupTrades(
    selected,
    (trade) =>
      group === "Market"
        ? translateMarket(trade.market, locale)
        : group === "Setup"
          ? trade.setup
          : group === "Mood"
            ? translateMood(trade.mood, locale)
            : new Date(`${trade.tradeDate}T12:00:00Z`).toLocaleDateString(intlTag, { weekday: "long", timeZone: "UTC" }),
    copy.notSpecified,
  );
  const metrics = [
    { name: copy.expectancy, value: stats.expectancy === null ? "—" : currency(stats.expectancy, stats.expectancy > 0, hidden), note: copy.expectancyNote },
    { name: copy.avgWinner, value: stats.avgWin === null ? "—" : currency(stats.avgWin, true, hidden), note: copy.winningTradesNote(stats.wins) },
    { name: copy.avgLoser, value: stats.avgLoss === null ? "—" : currency(stats.avgLoss, false, hidden), note: copy.losingTradesNote(stats.losses) },
    { name: copy.avgR, value: stats.avgR === null ? "—" : `${stats.avgR.toFixed(2)}R`, note: copy.riskRecordedNote(stats.riskCount) },
    { name: copy.realizedDrawdown, value: selected.length ? currency(maxRealizedDrawdown(selected), false, hidden) : "—", note: copy.drawdownNote },
    { name: copy.breakeven, value: String(stats.breakeven), note: copy.breakevenExcludedNote },
  ];
  return <div className="view-stack"><AccountBalanceCard summary={balanceSummary} hidden={hidden} locale={locale} onOpenAccounts={onAccountsSettings}/><StatsCards trades={selected} hidden={hidden} locale={locale}/><PerformanceChart trades={selected} period={period} onPeriodChange={onPeriod} hidden={hidden} locale={locale}/>
    <section className="card comparison-card"><div><span className="card-eyebrow">{copy.periodComparisonEyebrow}</span><h2>{copy.comparedPrevTitle}</h2><p>{period === "ALL" ? copy.chooseRangeCompare : previous.count ? copy.precedingDaysCount(previous.count, period === "1W" ? "7" : period === "1M" ? "30" : "90") : copy.noTradesPrevPeriod}</p></div>{period !== "ALL" && previous.count > 0 && <div className="comparison-metrics"><div><small>{copy.netPnlChange}</small><strong>{currency(stats.net - previous.net, stats.net - previous.net > 0, hidden)}</strong></div><div><small>{copy.winRateChange}</small><strong>{stats.wins + stats.losses && previous.wins + previous.losses ? `${stats.winRate - previous.winRate > 0 ? "+" : ""}${stats.winRate - previous.winRate} pts` : "—"}</strong></div><div><small>{copy.tradesChange}</small><strong>{stats.count - previous.count > 0 ? "+" : ""}{stats.count - previous.count}</strong></div></div>}</section>
    <div className="insight-grid">{metrics.map((item) => <div className="card insight-card" key={item.name}><span>{item.name}</span><strong>{item.value}</strong><small>{item.note}</small></div>)}</div>
    <div className="analytics-grid"><section className="card breakdown-card"><CardTitle eyebrow={copy.groupByEyebrow} title={copy.perfBreakdownTitle} description={copy.perfBreakdownDesc}/><div className="segment-control">{(["Market", "Setup", "Mood", "Day"] as const).map((item) => <button type="button" className={group === item ? "selected" : ""} aria-pressed={group === item} key={item} onClick={() => setGroup(item)}>{copy.groupTabs[item]}</button>)}</div>
      {groups.length ? <div className="breakdown-list">{groups.map((item) => <div className="breakdown-row" key={item.name}><div className="breakdown-line"><div><strong>{item.name}</strong><small>{copy.breakdownSub(item.count, item.wins + item.losses ? `${Math.round(item.wins / (item.wins + item.losses) * 100)}%` : "—")}</small></div><b className={item.pnl < 0 ? "loss-text" : "positive-text"}>{currency(item.pnl, item.pnl > 0, hidden)}</b></div><div className="breakdown-track"><span style={{ width: `${item.count / Math.max(...groups.map((value) => value.count)) * 100}%` }}/></div></div>)}</div> : <div className="simple-empty">{copy.breakdownEmpty}</div>}
      <p className="metric-disclaimer">{copy.patternDisclaimer}</p></section>
      <section className="card methodology-card"><div className="widget-icon green"><BookHeart size={18}/></div><span className="card-eyebrow">{copy.calcNotesEyebrow}</span><h2>{copy.howNumbersWork}</h2><p>{copy.howNumbersBody}</p><div className="method-item"><CheckCircle2 size={16}/><span>{copy.method1}</span></div><div className="method-item"><CheckCircle2 size={16}/><span>{copy.method2}</span></div><div className="method-item"><CheckCircle2 size={16}/><span>{copy.method3}</span></div><div className="method-sparkle">✳</div></section></div>
  </div>;
}

export function CalendarView({ trades, allTrades, accountFilter, settings, hidden, onDay, onAccountsSettings }: { trades: Trade[]; allTrades: Trade[]; accountFilter: string; settings: JournalSettings; hidden: boolean; onDay: (date: string) => void; onAccountsSettings: () => void }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const stats = getStats(trades);
  const accounts = (settings.accounts ?? [DEFAULT_ACCOUNT]).map((item) => ({
    ...item,
    name: translateAccountName(item.name, locale),
  }));
  const balanceSummary = useMemo(
    () => getAccountBalanceSummary(allTrades, accounts, accountFilter),
    [allTrades, accounts, accountFilter],
  );
  return <div className="calendar-layout"><TradingCalendar trades={trades} hidden={hidden} onDay={onDay} locale={locale}/><aside className="calendar-side"><section className="card calendar-summary"><span className="widget-icon green"><CalendarDays size={18}/></span><h2>{copy.allTimeSummary}</h2><p>{copy.forSelectedAccount}</p><div><span>{copy.colTrades}</span><strong>{stats.count}</strong></div><div><span>{copy.colNetPnl}</span><strong>{currency(stats.net, stats.net > 0, hidden)}</strong></div>{balanceSummary.currentBalance !== null && <div><span>{copy.balanceTitle}</span><strong>{currency(balanceSummary.currentBalance, false, hidden)}</strong></div>}<button type="button" className="widget-link calendar-balance-link" onClick={onAccountsSettings}>{balanceSummary.currentBalance === null ? copy.balanceSetAction : copy.balanceManageAction} <ArrowRight size={14}/></button></section></aside></div>;
}

export function PlaybookView({ settings, onUpdate }: { settings: JournalSettings; onUpdate: (rules: PlaybookRule[]) => void }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const [adding, setAdding] = useState<PlaybookRule["group"] | null>(null); const [text, setText] = useState("");
  const completed = settings.playbook.filter((rule) => rule.checked).length;
  function add(group: PlaybookRule["group"]) { if (!text.trim()) return; if (settings.playbook.length >= 100) return; onUpdate([...settings.playbook, { id: crypto.randomUUID(), group, text: text.trim().slice(0, 160), checked: false }]); setText(""); setAdding(null); }
  return <div className="view-stack"><div className="playbook-summary card"><div><strong>{copy.rulesCheckedSummary(completed, settings.playbook.length)}</strong><p>{copy.playbookSavedDesc}</p></div><button type="button" className="button-secondary" disabled={!completed} onClick={() => onUpdate(settings.playbook.map((rule) => ({ ...rule, checked: false })))}><RotateCcw size={15}/> {copy.resetChecks}</button></div>
    <div className="playbook-grid">{(["Before trading", "While trading", "After trading"] as const).map((group, index) => { const rules = settings.playbook.filter((rule) => rule.group === group); return <section className="card playbook-card" key={group}><div className="playbook-top"><span>0{index + 1}</span><small>{rules.filter((rule) => rule.checked).length}/{rules.length} {copy.checkedUpper}</small></div><h2>{translatePlaybookGroup(group, locale)}</h2><div className="rule-list">{rules.length ? rules.map((rule) => <div className="rule-row" key={rule.id}><button type="button" className={`rule-toggle ${rule.checked ? "checked" : ""}`} onClick={() => onUpdate(settings.playbook.map((item) => item.id === rule.id ? { ...item, checked: !item.checked } : item))} aria-pressed={rule.checked}><span>{rule.checked && <Check size={13}/>}</span>{rule.text}</button><button type="button" className="icon-button delete-rule" onClick={() => { if (window.confirm(copy.confirmRemoveRule(rule.text))) onUpdate(settings.playbook.filter((item) => item.id !== rule.id)); }} aria-label={`Remove ${rule.text}`}><X size={14}/></button></div>) : <p className="no-rules">{copy.noRulesYet}</p>}</div>
      {adding === group ? <form className="add-rule-form" onSubmit={(event) => { event.preventDefault(); add(group); }}><input autoFocus maxLength={160} value={text} onChange={(event) => setText(event.target.value)} placeholder={copy.writeARule} aria-label={copy.newPlaybookRuleAria}/><button type="submit">{copy.add}</button><button type="button" onClick={() => { setAdding(null); setText(""); }} aria-label={copy.cancel}><X size={14}/></button></form> : <button type="button" className="add-rule" onClick={() => setAdding(group)}><Plus size={15}/> {copy.addARule}</button>}</section>; })}</div>
  </div>;
}

export function MindsetView({ settings, trades, onMood, onSaveMoodNote, onBreath, onPatience, onSaveReflection, onDeleteReflection }: { settings: JournalSettings; trades: Trade[]; onMood: (mood: string) => void; onSaveMoodNote: (note: string) => void; onBreath: () => void; onPatience?: () => void; onSaveReflection: (reflection: WeeklyReflection) => Promise<boolean>; onDeleteReflection: (id: string) => void }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const today = todayString(); const todayMood = settings.moodHistory?.find((item) => item.date === today);
  const [note, setNote] = useState(todayMood?.note ?? ""); const [wentWell, setWentWell] = useState(""); const [learned, setLearned] = useState(""); const [nextWeek, setNextWeek] = useState(""); const [saving, setSaving] = useState(false);
  const moodGroups = groupTrades(trades, (trade) => translateMood(trade.mood, locale), copy.notSpecified);
  async function saveReflection(event: React.FormEvent) { event.preventDefault(); if (!wentWell.trim() && !learned.trim() && !nextWeek.trim()) return; setSaving(true); const ok = await onSaveReflection({ id: crypto.randomUUID(), date: today, wentWell: wentWell.trim(), learned: learned.trim(), nextWeek: nextWeek.trim() }); setSaving(false); if (ok) { setWentWell(""); setLearned(""); setNextWeek(""); } }
  return <div className="view-stack"><section className="mindset-hero"><div><h2>{copy.breathingHeroTitle}</h2><p>{copy.breathingHeroDesc}</p><div className="mindset-hero-actions"><button type="button" className="button-primary" onClick={onBreath}><Wind size={16}/> {copy.startBreathing}</button>{onPatience && <button type="button" className="button-secondary" onClick={onPatience}>{copy.openPatience} <ArrowRight size={14}/></button>}</div></div><div className="mindset-orbit" aria-hidden="true"><span>✳</span></div></section>
    <div className="mindset-grid"><MoodCard settings={settings} onMood={onMood} locale={locale}/><section className="card checkin-note"><CardTitle title={copy.todaysNoteTitle} description={copy.todaysNoteDesc}/><label className="sr-only" htmlFor="daily-checkin-note">{copy.todaysNoteAria}</label><textarea id="daily-checkin-note" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={copy.todaysNotePlaceholder}/><button type="button" className="button-secondary" disabled={!todayMood} onClick={() => onSaveMoodNote(note)}>{copy.saveTodaysNote} <ArrowRight size={14}/></button>{!todayMood && <small>{copy.chooseFeelingFirst}</small>}</section><section className="card mood-history"><CardTitle title={copy.recentCheckinsTitle} description={copy.recentCheckinsDesc}/>{settings.moodHistory?.length ? [...settings.moodHistory].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((entry) => <div className="history-row" key={entry.date}><span className="history-dot"/><div><strong>{translateMood(entry.mood, locale)}</strong><small>{shortDate(entry.date, true, locale)}{entry.note ? ` · ${entry.note}` : ""}</small></div></div>) : <div className="simple-empty">{copy.noCheckinsYet}</div>}</section></div>
    <div className="reflection-grid"><section className="card reflection-form"><CardTitle title={copy.weeklyReflectionTitle} description={copy.weeklyReflectionDesc}/><form onSubmit={saveReflection}><label>{copy.qWentWell}<textarea maxLength={2000} value={wentWell} onChange={(event) => setWentWell(event.target.value)} placeholder={copy.pWentWell}/></label><label>{copy.qLearned}<textarea maxLength={2000} value={learned} onChange={(event) => setLearned(event.target.value)} placeholder={copy.pLearned}/></label><label>{copy.qCarryForward}<textarea maxLength={2000} value={nextWeek} onChange={(event) => setNextWeek(event.target.value)} placeholder={copy.pCarryForward}/></label><button type="submit" className="button-primary" disabled={saving}>{saving ? copy.saving : copy.saveReflection} <ArrowRight size={15}/></button></form></section>
      <div className="reflection-side"><section className="card mood-pattern"><CardTitle title={copy.tradesByMoodTitle} description={copy.tradesByMoodDesc}/>{moodGroups.length ? moodGroups.map((group) => <div className="mood-pattern-row" key={group.name}><span>{group.name}</span><small>{group.count} {locale === "id" ? "trade" : group.count === 1 ? "trade" : "trades"}</small><strong>{group.wins + group.losses ? `${Math.round(group.wins / (group.wins + itemCount(group.wins, group.losses)) * 100)}%` : "—"} {copy.winsPctSuffix}</strong></div>) : <div className="simple-empty">{copy.addTradeForMoods}</div>}<p className="metric-disclaimer">{copy.moodDisclaimer}</p></section><section className="card reflection-history"><CardTitle title={copy.pastReflectionsTitle}/>{settings.reflections?.length ? [...settings.reflections].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((item) => <article key={item.id}><div><strong>{shortDate(item.date, true, locale)}</strong><button type="button" className="icon-button" onClick={() => onDeleteReflection(item.id)} aria-label={`Delete reflection from ${shortDate(item.date, true, locale)}`}><Trash2 size={14}/></button></div><div className="reflection-answers">{item.wentWell && <p><strong>{copy.wentWellLabel}:</strong> {item.wentWell}</p>}{item.learned && <p><strong>{copy.learnedLabel}:</strong> {item.learned}</p>}{item.nextWeek && <p><strong>{copy.carryForwardLabel}:</strong> {item.nextWeek}</p>}</div></article>) : <div className="simple-empty">{copy.noReflectionsYet}</div>}</section></div></div>
  </div>;
}

function itemCount(_wins: number, losses: number) { return losses; }

export function GoalsView({ settings, onMark, onUndo, onReset, onDelete, onAdd }: { settings: JournalSettings; onMark: (id: string) => void; onUndo: (id: string) => void; onReset: (id: string) => void; onDelete: (id: string) => void; onAdd: (goal: Intention) => Promise<boolean> }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const [text, setText] = useState(""); const [target, setTarget] = useState(5); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!text.trim()) return; setBusy(true); const ok = await onAdd({ id: crypto.randomUUID(), text: text.trim().slice(0, 100), target, progress: 0, markedDates: [] }); setBusy(false); if (ok) setText(""); }
  return <div className="goals-page"><div className="goals-list"><div className="section-heading tight"><div><h2>{copy.activeIntentionsTitle}</h2></div></div>{settings.goals?.length ? settings.goals.map((goal, index) => <section className="card goal-detail" key={goal.id}><div className="goal-detail-top"><span className="widget-icon green"><Target size={18}/></span><small>{copy.intentionIndex(String(index + 1).padStart(2, "0"))}</small><button type="button" className="icon-button" onClick={() => onDelete(goal.id)} aria-label={`Delete ${goal.text}`}><Trash2 size={15}/></button></div><h2 id={`goal-${index}`}>{goal.text}</h2><div className="goal-progress-label"><span>{copy.daysCompleted}</span><b>{goal.progress} <span>/ {goal.target}</span></b></div><div className="progress-track"><span style={{ width: `${Math.min(goal.progress / goal.target * 100, 100)}%` }}/></div><div className="goal-detail-actions"><button type="button" className="button-primary" aria-describedby={`goal-${index}`} disabled={goal.progress >= goal.target || goal.markedDates.includes(todayString())} onClick={() => onMark(goal.id)}><Check size={15}/> {goal.markedDates.includes(todayString()) ? copy.todayMarked : goal.progress >= goal.target ? copy.completeShort : copy.markToday}</button><button type="button" className="button-quiet" aria-describedby={`goal-${index}`} disabled={!goal.progress} onClick={() => onUndo(goal.id)}>{copy.undo}</button><button type="button" className="button-quiet" aria-describedby={`goal-${index}`} disabled={!goal.progress} onClick={() => { if (window.confirm(copy.confirmResetGoal(goal.text))) onReset(goal.id); }}>{copy.reset}</button></div></section>) : <div className="card simple-empty">{copy.addIntentionEmpty}</div>}</div>
    <aside><section className="card add-goal-card"><span className="widget-icon blush"><CirclePlus size={19}/></span><h2>{copy.addIntentionCardTitle}</h2><p>{copy.addIntentionCardDesc}</p><form onSubmit={submit}><label>{copy.yourIntentionLabel}<input maxLength={100} required value={text} onChange={(event) => setText(event.target.value)} placeholder={copy.yourIntentionPlaceholder}/></label><label>{copy.targetDaysLabel}<select value={target} onChange={(event) => setTarget(Number(event.target.value))}>{[1,2,3,4,5,6,7].map((day) => <option value={day} key={day}>{day} {day === 1 ? copy.dayUnit : copy.daysUnit}</option>)}</select></label><button type="submit" className="button-primary" disabled={busy}><Plus size={16}/> {copy.addIntentionBtn}</button></form></section></aside></div>;
}
