"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CirclePlus, Compass, Download, Filter, Images, Leaf, List, Pencil, Plus, RotateCcw, Search, Sparkles, Target, Trash2, Upload, Wind, X } from "lucide-react";
import type { StorageMode } from "@/lib/attachments";
import { evaluateTradeProcess, getProcessMatrix, getSetupBlueprintStats, groupTrades, groupTradesByTag, maxRealizedDrawdown, previousPeriodTrades } from "@/lib/analytics";
import { currency, filterTrades, formatRMultiple, getAccountBalanceSummary, getStats, shortDate, todayString, type Period } from "@/lib/format";
import { translateAccountName, translateMarket, translateMood, translatePlaybookGroup, translateSide, UI_COPY } from "@/lib/i18n";
import { DEFAULT_ACCOUNT, MARKETS, MOODS, type AppLocale, type DayJournalEntry, type Intention, type JournalSettings, type PlaybookRule, type SetupBlueprint, type Trade, type WeeklyReflection } from "@/lib/types";
import { RiskOverview } from "@/components/journal-review";
import { AccountBalanceCard, CardTitle, GoalCard, MoodCard, PerformanceChart, StatsCards, TradeTable, TradingCalendar } from "@/components/journal-ui";
import { ChartbookGallery, type ChartLightboxSlide, type StageFilterValue } from "@/components/chart-lightbox";

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
  onPreviewCharts?: (trade: Trade) => void;
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
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem("bloom:dismissed-welcome:v1") === "1") setWelcomeDismissed(true);
      } catch { /* Ignore storage errors */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  function dismissWelcome() {
    setWelcomeDismissed(true);
    try { window.localStorage.setItem("bloom:dismissed-welcome:v1", "1"); } catch { /* Ignore storage errors */ }
  }

  return <div className="overview-grid"><div className="overview-main">
    <StatsCards trades={periodTrades} hidden={props.hidden} locale={locale}/>
    <AccountBalanceCard summary={balanceSummary} hidden={props.hidden} locale={locale} onOpenAccounts={props.onAccountsSettings}/>
    <PerformanceChart trades={periodTrades} period={props.period} onPeriodChange={props.onPeriod} hidden={props.hidden} locale={locale}/>
    <TradeTable trades={props.trades.slice(0, 5)} hidden={props.hidden} onEdit={props.onEditTrade} onNew={props.onNewTrade} onViewAll={() => props.onView("Trade journal")} onPreviewCharts={props.onPreviewCharts} compact locale={locale}/>
    <TradingCalendar trades={props.trades} dayJournals={props.settings.dayJournals} hidden={props.hidden} onDay={props.onDay} compact locale={locale}/>
    {!welcomeDismissed && (
      <section className="welcome-banner welcome-banner-compact" style={{ backgroundImage: `linear-gradient(90deg, var(--hero-fade) 0%, var(--hero-fade-soft) 37%, transparent 80%), url('${basePath}/images/bloom-landscape.png')` }}>
        <button type="button" className="icon-button welcome-dismiss-btn" onClick={dismissWelcome} aria-label={copy.dismissBannerAria}><X size={16}/></button>
        <div className="welcome-content"><h2>{copy.heroLine1} <em>{copy.heroLine2}</em></h2><button type="button" onClick={() => props.onView("Trade journal")}>{copy.openJournal} <ArrowRight size={15}/></button></div>
      </section>
    )}
  </div><aside className="overview-side"><MoodCard settings={props.settings} onMood={props.onMood} onOpen={() => props.onView("Mindset")} locale={locale}/><GoalCard settings={props.settings} onMark={props.onMarkGoal} onOpen={() => props.onView("Goals")} locale={locale}/><RiskOverview trades={props.trades} settings={props.settings} hidden={props.hidden} onReview={() => props.onView("Weekly review")} onSettings={props.onRiskSettings}/></aside></div>;
}

export function JournalView({
  trades,
  dayJournals = [],
  hidden,
  mode = "browser",
  onEditTrade,
  onNewTrade,
  onImport,
  onExport,
  onPreviewCharts,
  onOpenSlides,
  selectedDay,
  clearDay,
  locale = "en",
}: {
  trades: Trade[];
  dayJournals?: DayJournalEntry[];
  hidden: boolean;
  mode?: StorageMode;
  onEditTrade: (trade: Trade) => void;
  onNewTrade: () => void;
  onImport: () => void;
  onExport: (trades: Trade[]) => void;
  onPreviewCharts?: (trade: Trade) => void;
  onOpenSlides?: (slides: ChartLightboxSlide[], index: number) => void;
  selectedDay: string;
  clearDay: () => void;
  locale?: AppLocale;
}) {
  const copy = UI_COPY[locale];
  const [query, setQuery] = useState(""); const [market, setMarket] = useState("All markets"); const [result, setResult] = useState("All results");
  const [side, setSide] = useState("All directions"); const [mood, setMood] = useState("All moods"); const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "chartbook">("table");
  const [stageFilter, setStageFilter] = useState<StageFilterValue>("All");
  const activeFilters = [market !== "All markets", result !== "All results", side !== "All directions", mood !== "All moods", !!start, !!end].filter(Boolean).length;
  function clearFilters() { setMarket("All markets"); setResult("All results"); setSide("All directions"); setMood("All moods"); setStart(""); setEnd(""); }
  const filtered = useMemo(() => trades.filter((trade) => {
    const value = Number(trade.pnl); const q = query.toLowerCase().trim();
    const translatedSearch = `${translateMarket(trade.market, locale)} ${translateSide(trade.side, locale)} ${translateMood(trade.mood, locale)}`.toLowerCase();
    const attachmentCaptions = (trade.attachments ?? []).map((att) => `${att.stage ?? ""} ${att.caption ?? ""}`).join(" ");
    return (!q || `${trade.symbol} ${trade.market} ${trade.setup} ${trade.notes} ${(trade.tags ?? []).join(" ")} ${attachmentCaptions} ${translatedSearch}`.toLowerCase().includes(q))
      && (market === "All markets" || trade.market === market)
      && (side === "All directions" || trade.side === side) && (mood === "All moods" || trade.mood === mood)
      && (result === "All results" || (result === "Wins" && value > 0) || (result === "Losses" && value < 0) || (result === "Breakeven" && value === 0))
      && (!selectedDay || trade.tradeDate === selectedDay) && (!start || trade.tradeDate >= start) && (!end || trade.tradeDate <= end);
  }), [trades, query, market, side, mood, result, selectedDay, start, end, locale]);
  const chartCount = useMemo(() => filtered.reduce((sum, trade) => sum + (trade.attachments?.length ?? 0), 0), [filtered]);
  const selectedDayNote = selectedDay ? dayJournals.find((entry) => entry.date === selectedDay) : undefined;
  return <div className="view-stack">
    <div className="journal-toolbar card"><div className="toolbar-primary"><label className="search-box"><Search size={17}/><span className="sr-only">{copy.searchTrades}</span><input type="search" enterKeyHint="search" placeholder={copy.searchTrades} value={query} onChange={(event) => setQuery(event.target.value)}/></label><div className="segment-control journal-view-switch" role="group" aria-label={copy.journalViewModeAria}><button type="button" className={viewMode === "table" ? "selected" : ""} aria-pressed={viewMode === "table"} onClick={() => setViewMode("table")}><List size={14}/><span>{copy.journalViewTable}</span></button><button type="button" className={viewMode === "chartbook" ? "selected" : ""} aria-pressed={viewMode === "chartbook"} onClick={() => setViewMode("chartbook")}><Images size={14}/><span>{copy.journalViewChartbook}</span>{chartCount > 0 && <b className="chart-switch-count">{chartCount}</b>}</button></div><button type="button" className="button-secondary" onClick={onImport}><Upload size={15}/> {copy.importCsv}</button><button type="button" className="button-secondary" onClick={() => onExport(filtered)}><Download size={15}/> {copy.exportCsv}</button></div>
      <button type="button" className="filters-toggle" aria-expanded={filtersOpen} aria-controls="journal-filters" onClick={() => setFiltersOpen(!filtersOpen)}><span><Filter size={16}/> {copy.filters} {activeFilters > 0 && <b>{activeFilters}</b>}</span><ChevronDown size={17} className={filtersOpen ? "rotated" : ""}/></button>
      <div className={`filter-row ${filtersOpen ? "is-open" : ""}`} id="journal-filters"><span className="filter-label"><Filter size={14}/> {copy.filterBy}</span>
        <select aria-label={copy.filterMarketAria} value={market} onChange={(event) => setMarket(event.target.value)}><option value="All markets">{copy.allMarkets}</option>{MARKETS.map((item) => <option key={item} value={item}>{translateMarket(item, locale)}</option>)}</select>
        <select aria-label={copy.filterResultAria} value={result} onChange={(event) => setResult(event.target.value)}><option value="All results">{copy.allResults}</option><option value="Wins">{copy.winsPlural}</option><option value="Losses">{copy.lossesPlural}</option><option value="Breakeven">{copy.breakeven}</option></select>
        <select aria-label={copy.filterDirectionAria} value={side} onChange={(event) => setSide(event.target.value)}><option value="All directions">{copy.anySide}</option><option value="Long">{translateSide("Long", locale)}</option><option value="Short">{translateSide("Short", locale)}</option></select>
        <select aria-label={copy.filterMoodAria} value={mood} onChange={(event) => setMood(event.target.value)}><option value="All moods">{copy.allMoods}</option>{MOODS.map((item) => <option key={item} value={item}>{translateMood(item, locale)}</option>)}</select>
        <label className="date-filter"><span>{copy.from}</span><input aria-label={copy.fromDateAria} type="date" value={start} onChange={(event) => setStart(event.target.value)}/></label><label className="date-filter"><span>{copy.to}</span><input aria-label={copy.toDateAria} type="date" value={end} onChange={(event) => setEnd(event.target.value)}/></label>
        {activeFilters > 0 && <button type="button" className="clear-filters" onClick={clearFilters}>{copy.clearFilters}</button>}
      </div>{selectedDay && <div className="selected-day"><CalendarDays size={14}/> {copy.showingDay} {shortDate(selectedDay, true, locale)} <button type="button" onClick={clearDay} aria-label={copy.clearSelectedDay}><X size={14}/></button></div>}
      {selectedDayNote && (selectedDayNote.intentionalNoTrade || selectedDayNote.preMarketPlan || selectedDayNote.postSessionNote) && (
        <div className="selected-day-journal">
          {selectedDayNote.intentionalNoTrade && <span className="rest-day-pill"><Leaf size={12} aria-hidden="true" /> {copy.noTradeToggleTitle}</span>}
          {selectedDayNote.preMarketPlan && <p><strong>{copy.preMarketPlanLabel}:</strong> {selectedDayNote.preMarketPlan}</p>}
          {selectedDayNote.postSessionNote && <p><strong>{copy.postSessionNoteLabel}:</strong> {selectedDayNote.postSessionNote}</p>}
        </div>
      )}
    </div>
    {viewMode === "table" ? (
      <TradeTable trades={filtered} hidden={hidden} onEdit={onEditTrade} onNew={onNewTrade} onPreviewCharts={onPreviewCharts} locale={locale}/>
    ) : (
      <ChartbookGallery
        trades={filtered}
        stageFilter={stageFilter}
        onStageFilterChange={setStageFilter}
        mode={mode}
        hidden={hidden}
        locale={locale}
        onOpenSlide={(slides, index) => onOpenSlides?.(slides, index)}
        onNewTrade={onNewTrade}
      />
    )}
  </div>;
}

const BREAKDOWN_TABS = ["Market", "Setup", "Session", "Tag", "Playbook", "Mood", "Day"] as const;
type BreakdownGroup = (typeof BREAKDOWN_TABS)[number];

export function AnalyticsView({ trades, allTrades, accountFilter, settings, hidden, period, onPeriod, onAccountsSettings }: { trades: Trade[]; allTrades: Trade[]; accountFilter: string; settings: JournalSettings; hidden: boolean; period: Period; onPeriod: (period: Period) => void; onAccountsSettings: () => void }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const selected = filterTrades(trades, period); const stats = getStats(selected); const previous = getStats(previousPeriodTrades(trades, period)); const [group, setGroup] = useState<BreakdownGroup>("Market");
  const intlTag = locale === "id" ? "id-ID" : "en-US";
  const accounts = (settings.accounts ?? [DEFAULT_ACCOUNT]).map((item) => ({
    ...item,
    name: translateAccountName(item.name, locale),
  }));
  const balanceSummary = useMemo(
    () => getAccountBalanceSummary(allTrades, accounts, accountFilter),
    [allTrades, accounts, accountFilter],
  );
  const processMatrix = getProcessMatrix(selected);
  const groups =
    group === "Tag"
      ? groupTradesByTag(selected, copy.noTagsBucket)
      : group === "Playbook"
        ? groupTrades(
            selected,
            (trade) => {
              const status = evaluateTradeProcess(trade).status;
              if (status === "followed") return copy.complianceFollowed;
              if (status === "broken") return copy.complianceBroken;
              return copy.complianceUnrated;
            },
            copy.complianceUnrated,
          )
        : groupTrades(
            selected,
            (trade) =>
              group === "Market"
                ? translateMarket(trade.market, locale)
                : group === "Setup"
                  ? trade.setup
                  : group === "Session"
                    ? trade.session ?? ""
                    : group === "Mood"
                      ? translateMood(trade.mood, locale)
                      : new Date(`${trade.tradeDate}T12:00:00Z`).toLocaleDateString(intlTag, { weekday: "long", timeZone: "UTC" }),
            copy.notSpecified,
          );
  const quadrants = [
    { key: "model-win", title: copy.quadModelWinTitle, sub: copy.quadModelWinSub, hint: copy.quadModelWinHint, data: processMatrix.modelWin, signed: true },
    { key: "good-loss", title: copy.quadGoodLossTitle, sub: copy.quadGoodLossSub, hint: copy.quadGoodLossHint, data: processMatrix.goodLoss, signed: false },
    { key: "bad-win", title: copy.quadBadWinTitle, sub: copy.quadBadWinSub, hint: copy.quadBadWinHint, data: processMatrix.badWin, signed: true },
    { key: "unforced-loss", title: copy.quadUnforcedLossTitle, sub: copy.quadUnforcedLossSub, hint: copy.quadUnforcedLossHint, data: processMatrix.unforcedLoss, signed: false },
  ] as const;
  const metrics = [
    { name: copy.expectancy, value: stats.expectancy === null ? "—" : currency(stats.expectancy, stats.expectancy > 0, hidden), note: null },
    { name: copy.avgWinner, value: stats.avgWin === null ? "—" : currency(stats.avgWin, true, hidden), note: stats.wins ? copy.winningTradesNote(stats.wins) : null },
    { name: copy.avgLoser, value: stats.avgLoss === null ? "—" : currency(stats.avgLoss, false, hidden), note: stats.losses ? copy.losingTradesNote(stats.losses) : null },
    { name: copy.avgR, value: stats.avgR === null ? "—" : `${stats.avgR.toFixed(2)}R`, note: stats.riskCount ? copy.riskRecordedNote(stats.riskCount) : null },
    { name: copy.realizedDrawdown, value: selected.length ? currency(maxRealizedDrawdown(selected), false, hidden) : "—", note: null },
    { name: copy.breakeven, value: String(stats.breakeven), note: null },
  ];
  return <div className="view-stack"><AccountBalanceCard summary={balanceSummary} hidden={hidden} locale={locale} onOpenAccounts={onAccountsSettings}/><StatsCards trades={selected} hidden={hidden} locale={locale}/><PerformanceChart trades={selected} period={period} onPeriodChange={onPeriod} hidden={hidden} locale={locale}/>
    <section className="card comparison-card"><div><h2>{copy.comparedPrevTitle}</h2><p>{period === "ALL" ? copy.chooseRangeCompare : previous.count ? copy.precedingDaysCount(previous.count, period === "1W" ? "7" : period === "1M" ? "30" : "90") : copy.noTradesPrevPeriod}</p></div>{period !== "ALL" && previous.count > 0 && <div className="comparison-metrics"><div><small>{copy.netPnlChange}</small><strong>{currency(stats.net - previous.net, stats.net - previous.net > 0, hidden)}</strong></div><div><small>{copy.winRateChange}</small><strong>{stats.wins + stats.losses && previous.wins + previous.losses ? `${stats.winRate - previous.winRate > 0 ? "+" : ""}${stats.winRate - previous.winRate} pts` : "—"}</strong></div><div><small>{copy.tradesChange}</small><strong>{stats.count - previous.count > 0 ? "+" : ""}{stats.count - previous.count}</strong></div></div>}</section>
    <div className="insight-grid">{metrics.map((item) => <div className="card insight-card" key={item.name}><span>{item.name}</span><strong>{item.value}</strong>{item.note && <small>{item.note}</small>}</div>)}</div>
    <section className="card process-matrix-card">
      <CardTitle
        title={copy.processMatrixTitle}
        action={
          processMatrix.processScorePct !== null ? (
            <span className="process-score-pill">{copy.processScoreBadge(processMatrix.processScorePct)}</span>
          ) : (
            <span className="process-score-pill is-empty">{copy.processScoreEmpty}</span>
          )
        }
      />
      <div className="process-matrix-grid">
        {quadrants.map((quad) => (
          <article className={`process-quadrant ${quad.key}`} key={quad.key}>
            <div className="process-quadrant-top">
              <div>
                <strong>{quad.title}</strong>
                <small>{quad.sub}</small>
              </div>
              <span className="process-quadrant-count">{quad.data.count}</span>
            </div>
            <div className="process-quadrant-stats">
              <b className={quad.data.pnl > 0 ? "positive-text" : quad.data.pnl < 0 ? "loss-text" : ""}>
                {quad.data.count ? currency(quad.data.pnl, quad.signed && quad.data.pnl > 0, hidden) : "—"}
              </b>
              {quad.data.avgR !== null && (
                <span className="process-quadrant-r">{formatRMultiple(quad.data.avgR)} avg</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
    <div className="analytics-grid analytics-grid-single"><section className="card breakdown-card"><CardTitle title={copy.perfBreakdownTitle}/><div className="segment-control breakdown-tabs">{BREAKDOWN_TABS.map((item) => <button type="button" className={group === item ? "selected" : ""} aria-pressed={group === item} key={item} onClick={() => setGroup(item)}>{copy.groupTabs[item]}</button>)}</div>
      {groups.length ? <div className="breakdown-list">{groups.map((item) => <div className="breakdown-row" key={item.name}><div className="breakdown-line"><div><strong>{item.name}</strong><small>{copy.breakdownSub(item.count, item.wins + item.losses ? `${Math.round(item.wins / (item.wins + item.losses) * 100)}%` : "—")}{item.avgR !== null ? ` · ${formatRMultiple(item.avgR)}` : ""}</small></div><b className={item.pnl < 0 ? "loss-text" : item.pnl > 0 ? "positive-text" : ""}>{currency(item.pnl, item.pnl > 0, hidden)}</b></div><div className="breakdown-track"><span style={{ width: `${item.count / Math.max(...groups.map((value) => value.count)) * 100}%` }}/></div></div>)}</div> : <div className="simple-empty">{copy.breakdownEmpty}</div>}</section></div>
  </div>;
}

function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return todayString();
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function CalendarView({
  trades,
  allTrades,
  accountFilter,
  settings,
  hidden,
  onDay,
  onAccountsSettings,
  onSaveDayJournal,
}: {
  trades: Trade[];
  allTrades: Trade[];
  accountFilter: string;
  settings: JournalSettings;
  hidden: boolean;
  onDay: (date: string) => void;
  onAccountsSettings: () => void;
  onSaveDayJournal?: (entry: DayJournalEntry) => Promise<boolean> | void;
}) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const stats = getStats(trades);
  const dayJournals = settings.dayJournals ?? [];
  const today = todayString();
  const initialEntry = dayJournals.find((entry) => entry.date === today);

  const [noteDate, setNoteDate] = useState(today);
  const [intentionalNoTrade, setIntentionalNoTrade] = useState(initialEntry?.intentionalNoTrade ?? false);
  const [preMarketPlan, setPreMarketPlan] = useState(initialEntry?.preMarketPlan ?? "");
  const [postSessionNote, setPostSessionNote] = useState(initialEntry?.postSessionNote ?? "");

  const loadForDate = (targetDate: string) => {
    setNoteDate(targetDate);
    const found = dayJournals.find((entry) => entry.date === targetDate);
    setIntentionalNoTrade(found?.intentionalNoTrade ?? false);
    setPreMarketPlan(found?.preMarketPlan ?? "");
    setPostSessionNote(found?.postSessionNote ?? "");
  };

  const toggleNoTrade = () => {
    const nextVal = !intentionalNoTrade;
    setIntentionalNoTrade(nextVal);
    void onSaveDayJournal?.({
      date: noteDate,
      intentionalNoTrade: nextVal,
      preMarketPlan,
      postSessionNote,
    });
  };

  const saveDayForm = (event: React.FormEvent) => {
    event.preventDefault();
    void onSaveDayJournal?.({
      date: noteDate,
      intentionalNoTrade,
      preMarketPlan,
      postSessionNote,
    });
  };

  const clearDayForm = () => {
    setIntentionalNoTrade(false);
    setPreMarketPlan("");
    setPostSessionNote("");
    void onSaveDayJournal?.({
      date: noteDate,
      intentionalNoTrade: false,
      preMarketPlan: "",
      postSessionNote: "",
    });
  };

  const restDaysCount = dayJournals.filter((entry) => entry.intentionalNoTrade).length;
  const accounts = (settings.accounts ?? [DEFAULT_ACCOUNT]).map((item) => ({
    ...item,
    name: translateAccountName(item.name, locale),
  }));
  const balanceSummary = useMemo(
    () => getAccountBalanceSummary(allTrades, accounts, accountFilter),
    [allTrades, accounts, accountFilter],
  );
  return (
    <div className="calendar-layout">
      <TradingCalendar trades={trades} dayJournals={dayJournals} hidden={hidden} onDay={onDay} locale={locale} />
      <aside className="calendar-side">
        <section className="card calendar-summary">
          <span className="widget-icon green"><CalendarDays size={18} /></span>
          <h2>{copy.allTimeSummary}</h2>
          <div><span>{copy.colTrades}</span><strong>{stats.count}</strong></div>
          <div><span>{copy.colNetPnl}</span><strong>{currency(stats.net, stats.net > 0, hidden)}</strong></div>
          <div><span className="summary-rest-label"><Leaf size={12} aria-hidden="true" /> {copy.restDaysSummaryLabel}</span><strong>{restDaysCount}</strong></div>
          {balanceSummary.currentBalance !== null && (
            <div><span>{copy.balanceTitle}</span><strong>{currency(balanceSummary.currentBalance, false, hidden)}</strong></div>
          )}
          <button type="button" className="widget-link calendar-balance-link" onClick={onAccountsSettings}>
            {balanceSummary.currentBalance === null ? copy.balanceSetAction : copy.balanceManageAction} <ArrowRight size={14} />
          </button>
        </section>

        <section className="card day-journal-card">
          <div className="day-journal-eyebrow-row">
            <h2>{copy.dayJournalTitle}</h2>
            {noteDate !== today && (
              <button type="button" className="day-journal-today-btn" onClick={() => loadForDate(today)}>
                {copy.dayJournalTodayBtn}
              </button>
            )}
          </div>

          <div className="day-journal-date-bar">
            <button type="button" className="icon-button" onClick={() => loadForDate(shiftIsoDate(noteDate, -1))} aria-label={copy.dayJournalPrevDay}>
              <ChevronLeft size={15} />
            </button>
            <input
              type="date"
              aria-label={copy.dayJournalDateAria}
              value={noteDate}
              onChange={(event) => {
                if (event.target.value) loadForDate(event.target.value);
              }}
            />
            <button type="button" className="icon-button" onClick={() => loadForDate(shiftIsoDate(noteDate, 1))} aria-label={copy.dayJournalNextDay}>
              <ChevronRight size={15} />
            </button>
          </div>

          <button
            type="button"
            className={`no-trade-toggle ${intentionalNoTrade ? "selected" : ""}`}
            aria-pressed={intentionalNoTrade}
            onClick={toggleNoTrade}
          >
            <span className="no-trade-leaf" aria-hidden="true"><Leaf size={15} /></span>
            <span className="no-trade-copy">
              <strong>{copy.noTradeToggleTitle}</strong>
            </span>
            <span className="no-trade-check" aria-hidden="true">{intentionalNoTrade && <Check size={13} />}</span>
          </button>

          <form className="day-journal-form" onSubmit={saveDayForm}>
            <label>
              <span>{copy.preMarketPlanLabel}</span>
              <textarea
                maxLength={600}
                rows={2}
                value={preMarketPlan}
                onChange={(event) => setPreMarketPlan(event.target.value)}
                placeholder={copy.preMarketPlanPlaceholder}
              />
            </label>
            <label>
              <span>{copy.postSessionNoteLabel}</span>
              <textarea
                maxLength={1000}
                rows={3}
                value={postSessionNote}
                onChange={(event) => setPostSessionNote(event.target.value)}
                placeholder={copy.postSessionNotePlaceholder}
              />
            </label>
            <div className="day-journal-actions">
              <button type="submit" className="button-primary">{copy.saveDayJournalBtn}</button>
              {(intentionalNoTrade || preMarketPlan.trim() || postSessionNote.trim()) && (
                <button type="button" className="button-quiet" onClick={clearDayForm}>{copy.clearDayJournalBtn}</button>
              )}
            </div>
          </form>

          {dayJournals.length > 0 && (
            <div className="day-journal-recent">
              <small>{copy.recentDayNotesLabel}</small>
              <div className="smart-chips">
                {dayJournals.slice(0, 5).map((item) => (
                  <button
                    type="button"
                    key={item.date}
                    className={`smart-chip ${item.date === noteDate ? "selected" : ""}`}
                    onClick={() => loadForDate(item.date)}
                  >
                    {item.intentionalNoTrade && <Leaf size={10} aria-hidden="true" />} {shortDate(item.date, false, locale)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

const STARTER_BLUEPRINTS_EN: Omit<SetupBlueprint, "id">[] = [
  {
    name: "Trend continuation",
    market: "Forex",
    timeframe: "M15 / H1",
    session: "London · New York",
    entryTrigger: "HTF impulse leg + clean pullback into key structure or FVG with calm candle close.",
    invalidation: "Hard stop beyond pullback swing low/high. Never widen if momentum stalls.",
    targetPlan: "Scale 50% at +2R, trail remainder beneath structure toward HTF liquidity.",
    notes: "Skip if price already extended >2x ADR before session open.",
  },
  {
    name: "Breakout",
    market: "All",
    timeframe: "M15 / H4",
    session: "London · NY Open",
    entryTrigger: "Multi-touch consolidation break + patient retest hold without immediate rejection wick.",
    invalidation: "Close back inside prior range invalidates the breakout thesis.",
    targetPlan: "Measured range projection or opposing HTF level (minimum 2R).",
    notes: "Wait for candle close—never chase the initial spike.",
  },
];

const STARTER_BLUEPRINTS_ID: Omit<SetupBlueprint, "id">[] = [
  {
    name: "Trend continuation",
    market: "Forex",
    timeframe: "M15 / H1",
    session: "London · New York",
    entryTrigger: "Impuls searah tren HTF + koreksi rapi ke area struktur/FVG dengan penutupan candle tenang.",
    invalidation: "Stop tegas di balik swing koreksi. Jangan pernah geser stop bila harga melambat.",
    targetPlan: "Ambil 50% di +2R, kawal sisanya mengikuti struktur menuju likuiditas HTF.",
    notes: "Lewati bila rentang harian sudah terlalu jauh sebelum sesi buka.",
  },
  {
    name: "Breakout",
    market: "All",
    timeframe: "M15 / H4",
    session: "London · Pembukaan NY",
    entryTrigger: "Penembusan area konsolidasi jelas + bertahan saat retest tanpa ekor penolakan tajam.",
    invalidation: "Penutupan candle kembali ke dalam area konsolidasi membatalkan skenario.",
    targetPlan: "Target proyeksi rentang konsolidasi atau level HTF seberang (minimal 2R).",
    notes: "Tunggu candle tutup—jangan kejar lonjakan pertama.",
  },
];

export function PlaybookView({
  settings,
  trades = [],
  hidden = false,
  onUpdate,
  onUpdateBlueprints,
}: {
  settings: JournalSettings;
  trades?: Trade[];
  hidden?: boolean;
  onUpdate: (rules: PlaybookRule[]) => void;
  onUpdateBlueprints?: (blueprints: SetupBlueprint[], toastMessage?: string) => void;
}) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const [adding, setAdding] = useState<PlaybookRule["group"] | null>(null);
  const [text, setText] = useState("");

  const blueprints = settings.setupBlueprints ?? [];
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bpName, setBpName] = useState("");
  const [bpMarket, setBpMarket] = useState("All");
  const [bpTimeframe, setBpTimeframe] = useState("");
  const [bpSession, setBpSession] = useState("");
  const [bpEntry, setBpEntry] = useState("");
  const [bpInvalidation, setBpInvalidation] = useState("");
  const [bpTarget, setBpTarget] = useState("");
  const [bpNotes, setBpNotes] = useState("");

  const completed = settings.playbook.filter((rule) => rule.checked).length;
  function add(group: PlaybookRule["group"]) {
    if (!text.trim()) return;
    if (settings.playbook.length >= 100) return;
    onUpdate([...settings.playbook, { id: crypto.randomUUID(), group, text: text.trim().slice(0, 160), checked: false }]);
    setText("");
    setAdding(null);
  }

  function openNewBlueprint() {
    setEditingId(null);
    setBpName("");
    setBpMarket("All");
    setBpTimeframe("");
    setBpSession("");
    setBpEntry("");
    setBpInvalidation("");
    setBpTarget("");
    setBpNotes("");
    setFormOpen(true);
  }

  function openEditBlueprint(bp: SetupBlueprint) {
    setEditingId(bp.id);
    setBpName(bp.name);
    setBpMarket(bp.market || "All");
    setBpTimeframe(bp.timeframe);
    setBpSession(bp.session);
    setBpEntry(bp.entryTrigger);
    setBpInvalidation(bp.invalidation);
    setBpTarget(bp.targetPlan);
    setBpNotes(bp.notes);
    setFormOpen(true);
  }

  function submitBlueprint(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = bpName.trim().slice(0, 80);
    if (!trimmedName) return;
    if (!editingId && blueprints.length >= 30) return;
    const item: SetupBlueprint = {
      id: editingId ?? crypto.randomUUID(),
      name: trimmedName,
      market: bpMarket || "All",
      timeframe: bpTimeframe.trim().slice(0, 40),
      session: bpSession.trim().slice(0, 40),
      entryTrigger: bpEntry.trim().slice(0, 280),
      invalidation: bpInvalidation.trim().slice(0, 280),
      targetPlan: bpTarget.trim().slice(0, 280),
      notes: bpNotes.trim().slice(0, 400),
    };
    const next = editingId
      ? blueprints.map((existing) => (existing.id === editingId ? item : existing))
      : [...blueprints, item];
    onUpdateBlueprints?.(next, copy.bpSavedToast);
    setFormOpen(false);
    setEditingId(null);
  }

  function deleteBlueprint(bp: SetupBlueprint) {
    if (!window.confirm(copy.bpConfirmDelete(bp.name))) return;
    onUpdateBlueprints?.(
      blueprints.filter((item) => item.id !== bp.id),
      copy.bpDeletedToast,
    );
  }

  function loadStarters() {
    const templates = locale === "id" ? STARTER_BLUEPRINTS_ID : STARTER_BLUEPRINTS_EN;
    const created: SetupBlueprint[] = templates.map((tpl) => ({
      ...tpl,
      id: crypto.randomUUID(),
    }));
    onUpdateBlueprints?.([...blueprints, ...created].slice(0, 30), copy.bpSavedToast);
  }

  return (
    <div className="view-stack">
      <div className="playbook-summary card">
        <div>
          <strong>{copy.rulesCheckedSummary(completed, settings.playbook.length)}</strong>
        </div>
        <button
          type="button"
          className="button-secondary"
          disabled={!completed}
          onClick={() => onUpdate(settings.playbook.map((rule) => ({ ...rule, checked: false })))}
        >
          <RotateCcw size={15} /> {copy.resetChecks}
        </button>
      </div>

      <div className="playbook-grid">
        {(["Before trading", "While trading", "After trading"] as const).map((group, index) => {
          const rules = settings.playbook.filter((rule) => rule.group === group);
          return (
            <section className="card playbook-card" key={group}>
              <div className="playbook-top">
                <span>0{index + 1}</span>
                <small>{rules.filter((rule) => rule.checked).length}/{rules.length} {copy.checkedUpper}</small>
              </div>
              <h2>{translatePlaybookGroup(group, locale)}</h2>
              <div className="rule-list">
                {rules.length ? rules.map((rule) => (
                  <div className="rule-row" key={rule.id}>
                    <button
                      type="button"
                      className={`rule-toggle ${rule.checked ? "checked" : ""}`}
                      onClick={() => onUpdate(settings.playbook.map((item) => (item.id === rule.id ? { ...item, checked: !item.checked } : item)))}
                      aria-pressed={rule.checked}
                    >
                      <span>{rule.checked && <Check size={13} />}</span>{rule.text}
                    </button>
                    <button
                      type="button"
                      className="icon-button delete-rule"
                      onClick={() => {
                        if (window.confirm(copy.confirmRemoveRule(rule.text))) {
                          onUpdate(settings.playbook.filter((item) => item.id !== rule.id));
                        }
                      }}
                      aria-label={`Remove ${rule.text}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )) : <p className="no-rules">{copy.noRulesYet}</p>}
              </div>
              {adding === group ? (
                <form className="add-rule-form" onSubmit={(event) => { event.preventDefault(); add(group); }}>
                  <input
                    autoFocus
                    maxLength={160}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={copy.writeARule}
                    aria-label={copy.newPlaybookRuleAria}
                  />
                  <button type="submit">{copy.add}</button>
                  <button type="button" onClick={() => { setAdding(null); setText(""); }} aria-label={copy.cancel}>
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <button type="button" className="add-rule" onClick={() => setAdding(group)}>
                  <Plus size={15} /> {copy.addARule}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {/* Tahap C (#10): Visual Setup Blueprints */}
      <section className="card setup-blueprints-section">
        <CardTitle
          eyebrow={copy.blueprintsEyebrow}
          title={copy.blueprintsTitle}
          description={copy.blueprintsDesc}
          action={
            !formOpen && blueprints.length < 30 ? (
              <button type="button" className="button-secondary" onClick={openNewBlueprint}>
                <Plus size={15} /> {copy.newBlueprintBtn}
              </button>
            ) : undefined
          }
        />

        {formOpen && (
          <form className="blueprint-form" onSubmit={submitBlueprint}>
            <div className="blueprint-form-grid">
              <label>
                <span>{copy.bpNameLabel}</span>
                <input
                  required
                  maxLength={80}
                  value={bpName}
                  onChange={(event) => setBpName(event.target.value)}
                  placeholder={copy.bpNamePlaceholder}
                />
              </label>
              <label>
                <span>{copy.bpMarketLabel}</span>
                <select value={bpMarket} onChange={(event) => setBpMarket(event.target.value)}>
                  <option value="All">{copy.bpMarketAll}</option>
                  {MARKETS.map((m) => (
                    <option key={m} value={m}>{translateMarket(m, locale)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{copy.bpTimeframeLabel}</span>
                <input
                  maxLength={40}
                  value={bpTimeframe}
                  onChange={(event) => setBpTimeframe(event.target.value)}
                  placeholder={copy.bpTimeframePlaceholder}
                />
              </label>
              <label>
                <span>{copy.bpSessionLabel}</span>
                <input
                  maxLength={40}
                  value={bpSession}
                  onChange={(event) => setBpSession(event.target.value)}
                  placeholder={copy.bpSessionPlaceholder}
                />
              </label>
            </div>

            <div className="blueprint-rules-inputs">
              <label>
                <span>{copy.bpEntryLabel}</span>
                <textarea
                  rows={2}
                  maxLength={280}
                  value={bpEntry}
                  onChange={(event) => setBpEntry(event.target.value)}
                  placeholder={copy.bpEntryPlaceholder}
                />
              </label>
              <label>
                <span>{copy.bpInvalidationLabel}</span>
                <textarea
                  rows={2}
                  maxLength={280}
                  value={bpInvalidation}
                  onChange={(event) => setBpInvalidation(event.target.value)}
                  placeholder={copy.bpInvalidationPlaceholder}
                />
              </label>
              <label>
                <span>{copy.bpTargetLabel}</span>
                <textarea
                  rows={2}
                  maxLength={280}
                  value={bpTarget}
                  onChange={(event) => setBpTarget(event.target.value)}
                  placeholder={copy.bpTargetPlaceholder}
                />
              </label>
            </div>

            <label>
              <span>{copy.bpNotesLabel}</span>
              <input
                maxLength={400}
                value={bpNotes}
                onChange={(event) => setBpNotes(event.target.value)}
                placeholder={copy.bpNotesPlaceholder}
              />
            </label>

            <div className="blueprint-form-actions">
              <button type="button" className="button-secondary" onClick={() => { setFormOpen(false); setEditingId(null); }}>
                {copy.cancel}
              </button>
              <button type="submit" className="button-primary">
                <Check size={15} /> {editingId ? copy.bpUpdateBtn : copy.bpSaveBtn}
              </button>
            </div>
          </form>
        )}

        {blueprints.length > 0 ? (
          <div className="blueprint-grid">
            {blueprints.map((bp) => {
              const bpStats = getSetupBlueprintStats(trades, bp.name);
              return (
                <article className="blueprint-card" key={bp.id}>
                  <div className="blueprint-card-head">
                    <div>
                      <h3>{bp.name}</h3>
                      <div className="blueprint-tags">
                        <span>{bp.market === "All" || !bp.market ? copy.bpMarketAll : translateMarket(bp.market, locale)}</span>
                        {bp.timeframe && <span>{bp.timeframe}</span>}
                        {bp.session && <span>{bp.session}</span>}
                      </div>
                    </div>
                    <div className="blueprint-card-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => openEditBlueprint(bp)}
                        aria-label={copy.bpEditAria(bp.name)}
                        title={copy.bpEditAria(bp.name)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => deleteBlueprint(bp)}
                        aria-label={copy.bpDeleteAria(bp.name)}
                        title={copy.bpDeleteAria(bp.name)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="blueprint-criteria">
                    {bp.entryTrigger && (
                      <div className="bp-criterion entry">
                        <small>{copy.bpEntryLabel}</small>
                        <p>{bp.entryTrigger}</p>
                      </div>
                    )}
                    {bp.invalidation && (
                      <div className="bp-criterion invalidation">
                        <small>{copy.bpInvalidationLabel}</small>
                        <p>{bp.invalidation}</p>
                      </div>
                    )}
                    {bp.targetPlan && (
                      <div className="bp-criterion target">
                        <small>{copy.bpTargetLabel}</small>
                        <p>{bp.targetPlan}</p>
                      </div>
                    )}
                    {bp.notes && <p className="bp-cue">“{bp.notes}”</p>}
                  </div>

                  <div className="blueprint-metrics">
                    <div>
                      <small>{copy.bpStatTrades}</small>
                      <strong>{bpStats.count}</strong>
                    </div>
                    <div>
                      <small>{copy.bpStatWinRate}</small>
                      <strong>{bpStats.winRate !== null ? `${bpStats.winRate}%` : "—"}</strong>
                    </div>
                    <div>
                      <small>{copy.bpStatAvgR}</small>
                      <strong>{bpStats.avgR !== null ? formatRMultiple(bpStats.avgR) : "—"}</strong>
                    </div>
                    <div>
                      <small>{copy.bpStatNetPnl}</small>
                      <strong className={bpStats.net > 0 ? "positive-text" : bpStats.net < 0 ? "loss-text" : ""}>
                        {bpStats.count ? currency(bpStats.net, bpStats.net > 0, hidden) : "—"}
                      </strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : !formOpen ? (
          <div className="blueprint-empty">
            <span className="widget-icon green"><Compass size={19} /></span>
            <strong>{copy.blueprintsEmptyTitle}</strong>
            <div className="blueprint-empty-actions">
              <button type="button" className="button-primary" onClick={openNewBlueprint}>
                <Plus size={15} /> {copy.newBlueprintBtn}
              </button>
              <button type="button" className="button-secondary" onClick={loadStarters}>
                <Sparkles size={15} /> {copy.loadStarterBlueprintsBtn}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function MindsetView({ settings, trades, onMood, onSaveMoodNote, onBreath, onPatience, onSaveReflection, onDeleteReflection }: { settings: JournalSettings; trades: Trade[]; onMood: (mood: string) => void; onSaveMoodNote: (note: string) => void; onBreath: () => void; onPatience?: () => void; onSaveReflection: (reflection: WeeklyReflection) => Promise<boolean>; onDeleteReflection: (id: string) => void }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const today = todayString(); const todayMood = settings.moodHistory?.find((item) => item.date === today);
  const [note, setNote] = useState(todayMood?.note ?? ""); const [wentWell, setWentWell] = useState(""); const [learned, setLearned] = useState(""); const [nextWeek, setNextWeek] = useState(""); const [saving, setSaving] = useState(false);
  const moodGroups = groupTrades(trades, (trade) => translateMood(trade.mood, locale), copy.notSpecified);
  async function saveReflection(event: React.FormEvent) { event.preventDefault(); if (!wentWell.trim() && !learned.trim() && !nextWeek.trim()) return; setSaving(true); const ok = await onSaveReflection({ id: crypto.randomUUID(), date: today, wentWell: wentWell.trim(), learned: learned.trim(), nextWeek: nextWeek.trim() }); setSaving(false); if (ok) { setWentWell(""); setLearned(""); setNextWeek(""); } }
  return <div className="view-stack"><section className="mindset-hero mindset-hero-compact"><div><h2>{copy.breathingHeroTitle}</h2><div className="mindset-hero-actions"><button type="button" className="button-primary" onClick={onBreath}><Wind size={16}/> {copy.startBreathing}</button>{onPatience && <button type="button" className="button-secondary" onClick={onPatience}>{copy.openPatience} <ArrowRight size={14}/></button>}</div></div><div className="mindset-orbit" aria-hidden="true"><span>✳</span></div></section>
    <div className="mindset-grid"><MoodCard settings={settings} onMood={onMood} locale={locale}/><section className="card checkin-note"><CardTitle title={copy.todaysNoteTitle}/><label className="sr-only" htmlFor="daily-checkin-note">{copy.todaysNoteAria}</label><textarea id="daily-checkin-note" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={copy.todaysNotePlaceholder}/><button type="button" className="button-secondary" disabled={!todayMood} onClick={() => onSaveMoodNote(note)}>{copy.saveTodaysNote} <ArrowRight size={14}/></button>{!todayMood && <small>{copy.chooseFeelingFirst}</small>}</section><section className="card mood-history"><CardTitle title={copy.recentCheckinsTitle}/>{settings.moodHistory?.length ? [...settings.moodHistory].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((entry) => <div className="history-row" key={entry.date}><span className="history-dot"/><div><strong>{translateMood(entry.mood, locale)}</strong><small>{shortDate(entry.date, true, locale)}{entry.note ? ` · ${entry.note}` : ""}</small></div></div>) : <div className="simple-empty">{copy.noCheckinsYet}</div>}</section></div>
    <div className="reflection-grid"><section className="card reflection-form"><CardTitle title={copy.weeklyReflectionTitle}/><form onSubmit={saveReflection}><label>{copy.qWentWell}<textarea maxLength={2000} value={wentWell} onChange={(event) => setWentWell(event.target.value)} placeholder={copy.pWentWell}/></label><label>{copy.qLearned}<textarea maxLength={2000} value={learned} onChange={(event) => setLearned(event.target.value)} placeholder={copy.pLearned}/></label><label>{copy.qCarryForward}<textarea maxLength={2000} value={nextWeek} onChange={(event) => setNextWeek(event.target.value)} placeholder={copy.pCarryForward}/></label><button type="submit" className="button-primary" disabled={saving}>{saving ? copy.saving : copy.saveReflection} <ArrowRight size={15}/></button></form></section>
      <div className="reflection-side"><section className="card mood-pattern"><CardTitle title={copy.tradesByMoodTitle}/>{moodGroups.length ? moodGroups.map((group) => <div className="mood-pattern-row" key={group.name}><span>{group.name}</span><small>{group.count} {locale === "id" ? "trade" : group.count === 1 ? "trade" : "trades"}</small><strong>{group.wins + group.losses ? `${Math.round(group.wins / (group.wins + itemCount(group.wins, group.losses)) * 100)}%` : "—"} {copy.winsPctSuffix}</strong></div>) : <div className="simple-empty">{copy.addTradeForMoods}</div>}</section><section className="card reflection-history"><CardTitle title={copy.pastReflectionsTitle}/>{settings.reflections?.length ? [...settings.reflections].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((item) => <article key={item.id}><div><strong>{shortDate(item.date, true, locale)}</strong><button type="button" className="icon-button" onClick={() => onDeleteReflection(item.id)} aria-label={`Delete reflection from ${shortDate(item.date, true, locale)}`}><Trash2 size={14}/></button></div><div className="reflection-answers">{item.wentWell && <p><strong>{copy.wentWellLabel}:</strong> {item.wentWell}</p>}{item.learned && <p><strong>{copy.learnedLabel}:</strong> {item.learned}</p>}{item.nextWeek && <p><strong>{copy.carryForwardLabel}:</strong> {item.nextWeek}</p>}</div></article>) : <div className="simple-empty">{copy.noReflectionsYet}</div>}</section></div></div>
  </div>;
}

function itemCount(_wins: number, losses: number) { return losses; }

export function GoalsView({ settings, onMark, onUndo, onReset, onDelete, onAdd }: { settings: JournalSettings; onMark: (id: string) => void; onUndo: (id: string) => void; onReset: (id: string) => void; onDelete: (id: string) => void; onAdd: (goal: Intention) => Promise<boolean> }) {
  const locale = settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const [text, setText] = useState(""); const [target, setTarget] = useState(5); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!text.trim()) return; setBusy(true); const ok = await onAdd({ id: crypto.randomUUID(), text: text.trim().slice(0, 100), target, progress: 0, markedDates: [] }); setBusy(false); if (ok) setText(""); }
  return <div className="goals-page"><div className="goals-list"><div className="section-heading tight"><div><h2>{copy.activeIntentionsTitle}</h2></div></div>{settings.goals?.length ? settings.goals.map((goal, index) => <section className="card goal-detail" key={goal.id}><div className="goal-detail-top"><span className="widget-icon green"><Target size={18}/></span><small>{copy.intentionIndex(String(index + 1).padStart(2, "0"))}</small><button type="button" className="icon-button" onClick={() => onDelete(goal.id)} aria-label={`Delete ${goal.text}`}><Trash2 size={15}/></button></div><h2 id={`goal-${index}`}>{goal.text}</h2><div className="goal-progress-label"><span>{copy.daysCompleted}</span><b>{goal.progress} <span>/ {goal.target}</span></b></div><div className="progress-track"><span style={{ width: `${Math.min(goal.progress / goal.target * 100, 100)}%` }}/></div><div className="goal-detail-actions"><button type="button" className="button-primary" aria-describedby={`goal-${index}`} disabled={goal.progress >= goal.target || goal.markedDates.includes(todayString())} onClick={() => onMark(goal.id)}><Check size={15}/> {goal.markedDates.includes(todayString()) ? copy.todayMarked : goal.progress >= goal.target ? copy.completeShort : copy.markToday}</button><button type="button" className="button-quiet" aria-describedby={`goal-${index}`} disabled={!goal.progress} onClick={() => onUndo(goal.id)}>{copy.undo}</button><button type="button" className="button-quiet" aria-describedby={`goal-${index}`} disabled={!goal.progress} onClick={() => { if (window.confirm(copy.confirmResetGoal(goal.text))) onReset(goal.id); }}>{copy.reset}</button></div></section>) : <div className="card simple-empty">{copy.addIntentionEmpty}</div>}</div>
    <aside><section className="card add-goal-card"><span className="widget-icon blush"><CirclePlus size={19}/></span><h2>{copy.addIntentionCardTitle}</h2><form onSubmit={submit}><label>{copy.yourIntentionLabel}<input maxLength={100} required value={text} onChange={(event) => setText(event.target.value)} placeholder={copy.yourIntentionPlaceholder}/></label><label>{copy.targetDaysLabel}<select value={target} onChange={(event) => setTarget(Number(event.target.value))}>{[1,2,3,4,5,6,7].map((day) => <option value={day} key={day}>{day} {day === 1 ? copy.dayUnit : copy.daysUnit}</option>)}</select></label><button type="submit" className="button-primary" disabled={busy}><Plus size={16}/> {copy.addIntentionBtn}</button></form></section></aside></div>;
}
