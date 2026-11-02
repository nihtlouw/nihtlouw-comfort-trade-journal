import test from "node:test";
import assert from "node:assert/strict";
import { createDemoData } from "@/lib/demo-data";
import { inspectBrowserJournal, saveBrowserJournal, storageKey } from "@/lib/browser-journal";
import { isDate, normalizeJournalData } from "@/lib/journal-data";
import { calendarDayCurrency, getStats, todayString, dateFromString } from "@/lib/format";
import { readLimitedBody } from "@/lib/request-body";
import { groupTrades, maxRealizedDrawdown, monthGrid, performanceSeries, previousPeriodTrades } from "@/lib/analytics";
import { collectNewAccountsFromRows, csvRowsToTrades, exportTradesCsv, parseCsv, parseSpreadsheetMatrix } from "@/lib/csv";
import { createThreeMonthDummyData } from "@/lib/dummy-dataset";
import { exportTradesXlsx, parseXlsxBuffer } from "@/lib/xlsx-report";
import { parseBackup } from "@/lib/backup";
import { validateImage } from "@/lib/attachments";
import { buildRecapSummary } from "@/lib/recap-card";
import { buildSampleStrategyPdfBlob, cleanPdfTitle, parseStrategyLinkUrl, validatePdfBlob } from "@/lib/strategy-library";
import {
  YOUTUBE_PLAYBACK_CACHE_KEY,
  clearYoutubePlaybackPosition,
  formatYoutubeTimestamp,
  parseYoutubePlayerMessage,
  parseYoutubeUrl,
  readYoutubePlaybackCache,
  resolveYoutubeResumeSeconds,
  sortYoutubeVideos,
  updateYoutubePlaybackPosition,
  writeYoutubePlaybackCache,
} from "@/lib/youtube";
import type { SavedYoutubeVideo, StrategyLibraryItem, Trade } from "@/lib/types";

const makeTrade = (id: number, pnl: string, initialRisk = ""): Trade => ({ id, pnl, initialRisk, symbol: `TEST${id}`, market: "Stocks", side: "Long", setup: "Breakout", tradeDate: `2026-01-0${id}`, mood: "Calm", notes: "", isDemo: false });

test("v1 data is upgraded in memory without changing the original", () => {
  const original = createDemoData(); original.settings.goalProgress = 3; original.settings.mood = "Focused"; original.settings.moodDate = "2026-01-01";
  const raw = JSON.stringify(original); const store = new Map([[storageKey, raw]]);
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
  const result = inspectBrowserJournal(storage, createDemoData());
  assert.equal(store.get(storageKey), raw); assert.equal(result.damaged, null);
  assert.equal(result.data.settings.goals?.[0].progress, 3); assert.equal(result.data.settings.moodHistory?.[0].mood, "Focused");
  assert.equal(result.data.trades[0].accountId, "main"); assert.equal(result.data.settings.reduceMotion, false);
  saveBrowserJournal(storage, result.data); assert.equal(JSON.parse(store.get(storageKey)!).trades.length, original.trades.length);
});

test("damaged data is never silently overwritten", () => {
  const store = new Map([[storageKey, "{damaged"]]);
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
  const result = inspectBrowserJournal(storage, createDemoData()); assert.equal(result.damaged, "{damaged");
  assert.throws(() => saveBrowserJournal(storage, result.data), /needs recovery/); assert.equal(store.get(storageKey), "{damaged");
  saveBrowserJournal(storage, result.data, true); assert.doesNotThrow(() => normalizeJournalData(JSON.parse(store.get(storageKey)!)));
});

test("stats handle breakevens, absent risk, no losses, and realized drawdown", () => {
  const trades = [makeTrade(1, "100", "50"), makeTrade(2, "-50", "100"), makeTrade(3, "0")];
  const stats = getStats(trades); assert.equal(stats.net, 50); assert.equal(stats.winRate, 50); assert.equal(stats.breakeven, 1);
  assert.equal(stats.profitFactor, "2.00"); assert.equal(stats.avgR, .75); assert.equal(stats.riskCount, 2); assert.equal(stats.expectancy, 50 / 3);
  assert.equal(maxRealizedDrawdown(trades), 50); assert.equal(getStats([trades[0]]).profitFactor, "∞"); assert.equal(getStats([]).avgR, null);
  assert.equal(groupTrades(trades, (trade) => trade.mood)[0].count, 3);
});

test("date validation and Monday-first month grids handle leap years", () => {
  assert.equal(isDate("2024-02-29"), true); assert.equal(isDate("2025-02-29"), false); assert.equal(isDate("2026-13-01"), false);
  const grid = monthGrid(2024, 1); assert.equal(grid.length, 35); assert.equal(grid[3], "2024-02-01"); assert.equal(grid.filter(Boolean).length, 29);
});

test("CSV mapping validates rows and flags possible duplicates before import", () => {
  const text = 'Ticker,Date,Net Profit,Market,Direction,Setup\nAAPL,2026-01-01,100,Stocks,BUY,Breakout\nAAPL,2026-01-01,100,Stocks,BUY,Breakout\nBAD,not-a-date,5,Stocks,BUY,Other';
  const preview = parseCsv(text); const rows = csvRowsToTrades(preview, preview.mapping, [{ id: "main", name: "Main account" }], "main", []);
  assert.equal(rows.length, 3); assert.equal(rows[0].trade?.side, "Long"); assert.equal(rows[0].duplicate, false); assert.equal(rows[1].duplicate, true); assert.match(rows[2].error!, /valid trade date/);
  const output = exportTradesCsv([{ ...makeTrade(1, "-50"), notes: '=HYPERLINK("bad")' }], [{ id: "main", name: "Main account" }]);
  assert.match(output, /-50/); assert.match(output, /'=HYPERLINK/);
});

test("backup validates image integrity and rejects incomplete or malformed files", async () => {
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
  const blob = new Blob([bytes], { type: "image/png" }); assert.equal(await validateImage(blob), "image/png");
  await assert.rejects(validateImage(new Blob(["not png"], { type: "image/png" })), /does not match/);
  const journal = normalizeJournalData(createDemoData()); journal.trades[0].attachments = [{ id: "image-1", name: "chart.png", type: "image/png", size: bytes.length }];
  const wrapper = { format: "bloom-journal-backup", version: 2, journal, images: [{ ...journal.trades[0].attachments[0], base64: bytes.toString("base64") }] };
  assert.equal((await parseBackup(JSON.stringify(wrapper))).images.length, 1);
  await assert.rejects(parseBackup(JSON.stringify({ ...wrapper, images: [] })), /missing/);
  await assert.rejects(parseBackup("{bad"), /valid JSON/);
});


test("performance uses proportional dates and compares equal-length previous periods", () => {
  const today = todayString(); const previousDate = new Date(dateFromString(today).getTime() - 8 * 86_400_000).toISOString().slice(0, 10);
  const trades = [{ ...makeTrade(1, "20"), tradeDate: today }, { ...makeTrade(2, "-10"), tradeDate: previousDate }];
  assert.equal(previousPeriodTrades(trades, "1W").length, 1); assert.equal(previousPeriodTrades(trades, "ALL").length, 0);
  const points = performanceSeries(trades, "ALL"); const left = points.find((item) => item.date === previousDate)!; const right = points.find((item) => item.date === today)!;
  assert.equal(right.time - left.time, 8 * 86_400_000); assert.equal(right.pnl, 10);
});

test("request body limits apply even when content-length is absent", async () => {
  const small = new Request("http://localhost/test", { method: "POST", body: "1234" });
  assert.equal(new TextDecoder().decode(await readLimitedBody(small, 4)), "1234");
  const large = new Request("http://localhost/test", { method: "POST", body: "12345" });
  await assert.rejects(readLimitedBody(large, 4), /too large/);
});


test("motion preference survives normalization, storage, and backup", async () => {
  const data = createDemoData(); data.settings.reduceMotion = true;
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
  saveBrowserJournal(storage, data);
  assert.equal(inspectBrowserJournal(storage, createDemoData()).data.settings.reduceMotion, true);
  const backup = JSON.stringify({ format: "bloom-journal-backup", version: 2, journal: data, images: [] });
  assert.equal((await parseBackup(backup)).journal.settings.reduceMotion, true);
});

test("weekly review follows Monday–Sunday across years and keeps reflection scope explicit", async () => {
  const { getWeeklyReview, shiftWeek, weekBounds } = await import("@/lib/review");
  assert.deepEqual(weekBounds("2026-01-01"), { start: "2025-12-29", end: "2026-01-04" });
  assert.deepEqual(weekBounds("2026-01-04"), { start: "2025-12-29", end: "2026-01-04" });
  assert.equal(shiftWeek("2025-12-29", 1), "2026-01-05");
  const trades = [
    { ...makeTrade(1, "100", "50"), tradeDate: "2025-12-29", notes: "A good setup" },
    { ...makeTrade(2, "-20"), tradeDate: "2026-01-04", setup: "Pullback" },
    { ...makeTrade(3, "50", "10"), tradeDate: "2026-01-05" },
  ];
  const reflections = [
    { id: "a", date: "2026-01-04", wentWell: "Patience", learned: "", nextWeek: "" },
    { id: "b", date: "2026-01-05", wentWell: "Next week", learned: "", nextWeek: "" },
  ];
  const review = getWeeklyReview(trades, reflections, "2025-12-29");
  assert.equal(review.trades.length, 2); assert.equal(review.stats.net, 80); assert.equal(review.riskCount, 1);
  assert.equal(review.averageRisk, 50); assert.equal(review.setups.length, 2); assert.equal(review.tradeNotes[0].notes, "A good setup");
  assert.deepEqual(review.reflections.map((item) => item.id), ["a"]);
  assert.equal(getWeeklyReview([], [], "2025-12-29").averageRisk, null);
});

test("risk limits are informational, account/date-specific, exclude samples, and do not double-count edits", async () => {
  const { getRiskAlerts, getDraftRiskAlerts } = await import("@/lib/risk");
  const day = "2026-01-01";
  const trades: Trade[] = [
    { ...makeTrade(1, "-80", "51"), tradeDate: day, accountId: "main" },
    { ...makeTrade(2, "-40", "50"), tradeDate: day, accountId: "main" },
    { ...makeTrade(3, "30", ""), tradeDate: day, accountId: "main" },
    { ...makeTrade(4, "-150", "100"), tradeDate: day, accountId: "other" },
    { ...makeTrade(5, "-1000", "500"), tradeDate: day, accountId: "main", isDemo: true },
  ];
  const limits = { perTrade: 50, dailyLoss: 100 };
  let alerts = getRiskAlerts(trades, limits);
  assert.equal(alerts.filter((alert) => alert.kind === "trade").length, 2); // equal risk is not a breach
  assert.deepEqual(alerts.filter((alert) => alert.kind === "daily").map((alert) => alert.accountId), ["other"]); // gains offset losses
  const edit = { ...trades[0], pnl: "-100" };
  alerts = getDraftRiskAlerts(trades, edit, limits, edit.id);
  assert.equal(alerts.filter((alert) => alert.kind === "daily").length, 1);
  assert.equal((alerts.find((alert) => alert.kind === "daily")?.amount), 110);
  assert.equal(getDraftRiskAlerts(trades, trades[4], limits, trades[4].id).length, 0);
  assert.equal(getRiskAlerts(trades, { perTrade: null, dailyLoss: null }).length, 0);
  assert.equal(getRiskAlerts([{ ...makeTrade(1, "-0.10"), tradeDate: day }, { ...makeTrade(2, "-0.20"), tradeDate: day }], { perTrade: null, dailyLoss: .30 }).length, 0);
  // Exact cent accumulation remains reliable even when large totals cancel out.
  const large = [...Array.from({ length: 1000 }, (_, i) => ({ ...makeTrade(i + 1, "-99999999999.99"), tradeDate: day })), ...Array.from({ length: 1000 }, (_, i) => ({ ...makeTrade(i + 1001, "99999999999.99"), tradeDate: day })), { ...makeTrade(2001, "-100.01"), tradeDate: day }];
  assert.equal(getRiskAlerts(large, { perTrade: null, dailyLoss: 100 })[0]?.amount, 100.01);
});

test("new preferences survive normalization and backups while old journals get safe defaults", async () => {
  const old = createDemoData();
  const upgraded = normalizeJournalData(old);
  assert.deepEqual(upgraded.settings.riskLimits, { perTrade: null, dailyLoss: null }); assert.equal(upgraded.settings.backupReminderDays, 7);
  assert.equal(upgraded.settings.patienceLocale, "en"); assert.equal(upgraded.settings.patienceMaxTrades, 3);
  assert.deepEqual(upgraded.settings.walkAwayLogs, []);
  upgraded.settings.riskLimits = { perTrade: 125.5, dailyLoss: 300 }; upgraded.settings.backupReminderDays = 30;
  upgraded.settings.patienceLocale = "id"; upgraded.settings.patienceMaxTrades = 2;
  upgraded.settings.walkAwayLogs = [{ id: "w1", date: "2026-10-29", accountId: "main", reason: "stop_giveback", note: "Kept remaining green day." }];
  const parsed = await parseBackup(JSON.stringify({ format: "bloom-journal-backup", version: 2, journal: upgraded, images: [] }));
  assert.deepEqual(parsed.journal.settings.riskLimits, { perTrade: 125.5, dailyLoss: 300 }); assert.equal(parsed.journal.settings.backupReminderDays, 30);
  assert.equal(parsed.journal.settings.patienceLocale, "id"); assert.equal(parsed.journal.settings.patienceMaxTrades, 2);
  assert.equal(parsed.journal.settings.walkAwayLogs?.length, 1);
  assert.throws(() => normalizeJournalData({ ...upgraded, settings: { ...upgraded.settings, riskLimits: { perTrade: -1, dailyLoss: null } } }));
  assert.throws(() => normalizeJournalData({ ...upgraded, settings: { ...upgraded.settings, patienceMaxTrades: 0 } }));
  assert.throws(() => normalizeJournalData({ ...upgraded, settings: { ...upgraded.settings, walkAwayLogs: [upgraded.settings.walkAwayLogs![0], upgraded.settings.walkAwayLogs![0]] } }));
});

test("patience mirror detects green-to-red giveback, separates accounts, and models realistic compounding", async () => {
  const { getDrawdownRecoveryRows, getJournalSimPreset, getPatienceMirror, getTodaySessionPulse, simulateCompoundingComparison } = await import("@/lib/patience");
  const day1 = "2026-10-28"; const day2 = "2026-10-29";
  const rows: Trade[] = [
    // day1 on main: +300 -> +350 (peak at #2) -> +100 -> -80 (green-to-red; overtrade after #2 cost -430)
    { ...makeTrade(1, "300", "100"), tradeDate: day1, accountId: "main" },
    { ...makeTrade(2, "50", "100"), tradeDate: day1, accountId: "main" },
    { ...makeTrade(3, "-250", "100"), tradeDate: day1, accountId: "main" },
    { ...makeTrade(4, "-180", "100"), tradeDate: day1, accountId: "main" },
    // day2 on main: +200 -> +80 (60% heavy giveback, still green)
    { ...makeTrade(5, "200", "100"), tradeDate: day2, accountId: "main" },
    { ...makeTrade(6, "-120", "100"), tradeDate: day2, accountId: "main" },
    // day1 on swing: 2 calm trades, must not mix into main's trade count
    { ...makeTrade(7, "120", "60"), tradeDate: day1, accountId: "swing" },
    { ...makeTrade(8, "90", "60"), tradeDate: day1, accountId: "swing" },
  ];
  const pulseRed = getTodaySessionPulse(rows.filter((t) => t.accountId === "main"), day1, 2);
  assert.equal(pulseRed.statusKind, "green_to_red"); assert.equal(pulseRed.intradayPeak, 350); assert.equal(pulseRed.currentNet, -80);
  const pulseGiveback = getTodaySessionPulse(rows.filter((t) => t.accountId === "main"), day2, 2);
  assert.equal(pulseGiveback.statusKind, "heavy_giveback"); assert.equal(pulseGiveback.givebackPct, 60);

  const mirror = getPatienceMirror(rows, 2);
  assert.equal(mirror.totalSessions, 3);
  assert.equal(mirror.withinCap.count, 6); assert.equal(mirror.overCap.count, 2);
  assert.equal(mirror.stoppedAtCapNet, 640); assert.equal(mirror.overCapNet, -430); assert.equal(mirror.actualNet, 210);
  assert.equal(mirror.greenToRedCount, 1); assert.equal(mirror.heavyGivebackCount, 1);
  assert.equal(mirror.givebackDays[0]?.date, day2); assert.equal(mirror.givebackDays[1]?.kind, "green_to_red");

  const preset = getJournalSimPreset(rows);
  assert.ok(preset); assert.equal(preset.source, "r_multiple"); assert.equal(preset.winRate, 63);

  const sim50 = simulateCompoundingComparison({ startingBalance: 5000, riskPercent: 1, winRate: 50, rewardRisk: 1.8, totalTrades: 100, revengeDaysPer20: 2 });
  const sim60 = simulateCompoundingComparison({ startingBalance: 5000, riskPercent: 1, winRate: 60, rewardRisk: 1.8, totalTrades: 100, revengeDaysPer20: 2 });
  assert.equal(sim50.wins, 50); assert.ok(sim50.patientFinal > sim50.flatFinal, "proportional compounding beats flat risk with positive expectancy");
  assert.ok(sim50.patientFinal > sim50.revengeFinal && sim50.impatienceCost > 0, "revenge blowup days erode compounded equity");
  assert.ok(sim60.patientFinal > sim50.patientFinal, "higher win rate monotonically improves simulated equity");

  const dd = getDrawdownRecoveryRows(1, 2);
  assert.equal(dd.find((r) => r.lossPct === 2)?.recoveryPct, 2.04);
  assert.equal(dd.find((r) => r.lossPct === 20)?.recoveryPct, 25);
  assert.equal(dd.find((r) => r.lossPct === 50)?.recoveryPct, 100);
  assert.ok((dd.find((r) => r.lossPct === 50)?.winsToRecover ?? 0) > (dd.find((r) => r.lossPct === 5)?.winsToRecover ?? 0));
});

test("backup reminders are periodic, snoozable, and isolated by journal on this device", async () => {
  const { backupReminderKey, isBackupReminderDue, loadBackupReminder, recordBackupDownload, snoozeBackupReminder, writeBackupReminder } = await import("@/lib/backup-reminder");
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
  const start = Date.UTC(2026, 0, 1); const day = 86_400_000;
  const local = loadBackupReminder(storage, "browser", start);
  assert.equal(local.available, true); assert.equal(isBackupReminderDue(local.state, 7, start + 7 * day - 1), false);
  assert.equal(isBackupReminderDue(local.state, 7, start + 7 * day), true); assert.equal(isBackupReminderDue(local.state, 0, start + 300 * day), false);
  const snoozed = snoozeBackupReminder(local.state, start + 7 * day); assert.equal(isBackupReminderDue(snoozed, 7, start + 13 * day), false); assert.equal(isBackupReminderDue(snoozed, 7, start + 14 * day), true);
  const downloaded = recordBackupDownload(snoozed, start + 14 * day); assert.equal(writeBackupReminder(storage, "browser", downloaded), true);
  assert.equal(loadBackupReminder(storage, "browser", start).state.lastDownloadAt, start + 14 * day);
  assert.equal(loadBackupReminder(storage, "private:user-1", start).state.lastDownloadAt, null);
  assert.notEqual(backupReminderKey("private:user-1"), backupReminderKey("private:user-2"));
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(loadBackupReminder(blocked, "browser", start).available, false); assert.equal(writeBackupReminder(blocked, "browser", downloaded), false);
});

test("account starting balance normalizes cleanly, persists in backups, and computes realized balance excluding sample trades", async () => {
  const { getAccountBalanceSummary } = await import("@/lib/format");
  const journal = normalizeJournalData(createDemoData());
  assert.equal(journal.settings.accounts?.[0]?.startingBalance ?? null, null);
  assert.equal(journal.settings.locale, "en");

  journal.settings.locale = "id";
  journal.settings.accounts = [
    { id: "main", name: "Main account", startingBalance: 10_000.456 },
    { id: "swing", name: "Swing account", startingBalance: null },
  ];
  const normalized = normalizeJournalData(journal);
  assert.equal(normalized.settings.locale, "id");
  assert.equal(normalized.settings.accounts?.[0]?.startingBalance, 10_000.46);
  assert.equal(normalized.settings.accounts?.[1]?.startingBalance, null);

  const trades: Trade[] = [
    { ...makeTrade(1, "450.25"), accountId: "main", isDemo: false },
    { ...makeTrade(2, "-150.25"), accountId: "main", isDemo: false },
    { ...makeTrade(3, "9999"), accountId: "main", isDemo: true }, // sample trade MUST be excluded
    { ...makeTrade(4, "200"), accountId: "swing", isDemo: false },
  ];

  const mainSummary = getAccountBalanceSummary(trades, normalized.settings.accounts!, "main");
  assert.equal(mainSummary.configuredCount, 1);
  assert.equal(mainSummary.startingBalance, 10_000.46);
  assert.equal(mainSummary.realizedNet, 300);
  assert.equal(mainSummary.currentBalance, 10_300.46);
  assert.equal(mainSummary.realTradeCount, 2);
  assert.ok(mainSummary.returnPct !== null && Math.abs(mainSummary.returnPct - (300 / 10_000.46) * 100) < 1e-6);

  const swingSummary = getAccountBalanceSummary(trades, normalized.settings.accounts!, "swing");
  assert.equal(swingSummary.configuredCount, 0);
  assert.equal(swingSummary.startingBalance, null);
  assert.equal(swingSummary.currentBalance, null);
  assert.equal(swingSummary.realizedNet, 200);

  const allPartial = getAccountBalanceSummary(trades, normalized.settings.accounts!, "all");
  assert.equal(allPartial.configuredCount, 1);
  assert.equal(allPartial.totalAccounts, 2);
  assert.equal(allPartial.startingBalance, 10_000.46);
  assert.equal(allPartial.realizedNet, 300); // only configured accounts summed into combined starting + realized balance
  assert.equal(allPartial.currentBalance, 10_300.46);

  const zeroBalSummary = getAccountBalanceSummary(trades, [{ id: "main", name: "Main account", startingBalance: 0 }], "main");
  assert.equal(zeroBalSummary.configuredCount, 1);
  assert.equal(zeroBalSummary.currentBalance, 300);
  assert.equal(zeroBalSummary.returnPct, null);

  const backup = await parseBackup(JSON.stringify({ format: "bloom-journal-backup", version: 2, journal: normalized, images: [] }));
  assert.equal(backup.journal.settings.accounts?.[0]?.startingBalance, 10_000.46);
  assert.equal(backup.journal.settings.locale, "id");
  assert.throws(() => normalizeJournalData({ ...normalized, settings: { ...normalized.settings, accounts: [{ id: "main", name: "Main", startingBalance: -5 }] } }));
});

test("bilingual EN/ID copy maintains key parity and translates canonical enums & dates without mutating stored values", async () => {
  const { UI_COPY, translateAccountName, translateMarket, translateMood, translatePlaybookGroup, translateSide } = await import("@/lib/i18n");
  const { shortDate, longToday } = await import("@/lib/format");
  const { monthTitle } = await import("@/lib/analytics");

  assert.deepEqual(Object.keys(UI_COPY.en).sort(), Object.keys(UI_COPY.id).sort());
  assert.deepEqual(Object.keys(UI_COPY.en.views).sort(), Object.keys(UI_COPY.id.views).sort());
  assert.equal(translateMarket("Stocks", "id"), "Saham");
  assert.equal(translateMarket("Stocks", "en"), "Stocks");
  assert.equal(translateSide("Long", "id"), "Long (Beli)");
  assert.equal(translateMood("Calm", "id"), "Tenang");
  assert.equal(translatePlaybookGroup("Before trading", "id"), "Sebelum trading");
  assert.equal(translateAccountName("Main account", "id"), "Akun utama");
  assert.equal(translateAccountName("Custom Prop", "id"), "Custom Prop");

  assert.match(shortDate("2026-10-29", false, "en"), /Oct/i);
  assert.match(shortDate("2026-10-29", false, "id"), /29/);
  assert.ok(longToday("en").length > 4 && longToday("id").length > 4);
  assert.match(monthTitle(2026, 0, "id"), /Januari/i);
});

test("cassette audio library validates real magic bytes and enforces 5-song & 200 MB limits", async () => {
  const { cleanTrackTitle, inferAudioMimeType, validateAudioHeader, validateNewAudioTrack } = await import("@/lib/audio");
  const { MAX_AUDIO_TOTAL_BYTES, MAX_AUDIO_TRACKS } = await import("@/lib/types");

  const mp3Id3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const mp3Sync = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
  const ogg = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const flac = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22, 0x00, 0x00, 0x00, 0x00]);
  const m4a = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]);
  const fakeHtml = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

  assert.equal(inferAudioMimeType("track.mp3", ""), "audio/mpeg");
  assert.equal(inferAudioMimeType("track.m4a", "audio/x-m4a"), "audio/mp4");
  assert.equal(inferAudioMimeType("script.exe", "application/octet-stream"), null);

  assert.equal(validateAudioHeader(mp3Id3, "audio/mpeg"), true);
  assert.equal(validateAudioHeader(mp3Sync, "audio/mpeg"), true);
  assert.equal(validateAudioHeader(wav, "audio/wav"), true);
  assert.equal(validateAudioHeader(ogg, "audio/ogg"), true);
  assert.equal(validateAudioHeader(flac, "audio/flac"), true);
  assert.equal(validateAudioHeader(m4a, "audio/mp4"), true);
  assert.equal(validateAudioHeader(webm, "audio/webm"), true);
  assert.equal(validateAudioHeader(fakeHtml, "audio/mpeg"), false);

  assert.equal(cleanTrackTitle("lofi_rain-session.mp3"), "lofi rain session");

  assert.equal(
    validateNewAudioTrack({ size: 2048, fileName: "calm.wav", rawType: "audio/wav", existingCount: 0, existingBytes: 0, headerBytes: wav, locale: "en" }),
    "audio/wav",
  );

  // Reject 6th song in both EN and ID
  assert.throws(
    () => validateNewAudioTrack({ size: 2048, fileName: "calm.wav", rawType: "audio/wav", existingCount: MAX_AUDIO_TRACKS, existingBytes: 1024, headerBytes: wav, locale: "en" }),
    /up to 5 songs/i,
  );
  assert.throws(
    () => validateNewAudioTrack({ size: 2048, fileName: "calm.wav", rawType: "audio/wav", existingCount: MAX_AUDIO_TRACKS, existingBytes: 1024, headerBytes: wav, locale: "id" }),
    /Maksimal 5 lagu/i,
  );

  // Allow exact 200 MB total, reject 200 MB + 1 byte in both EN and ID
  assert.equal(
    validateNewAudioTrack({ size: 2048, fileName: "calm.wav", rawType: "audio/wav", existingCount: 1, existingBytes: MAX_AUDIO_TOTAL_BYTES - 2048, headerBytes: wav, locale: "en" }),
    "audio/wav",
  );
  assert.throws(
    () => validateNewAudioTrack({ size: 2048, fileName: "calm.wav", rawType: "audio/wav", existingCount: 1, existingBytes: MAX_AUDIO_TOTAL_BYTES - 2048 + 1, headerBytes: wav, locale: "en" }),
    /200 MB/i,
  );
  assert.throws(
    () => validateNewAudioTrack({ size: 2048, fileName: "calm.wav", rawType: "audio/wav", existingCount: 1, existingBytes: MAX_AUDIO_TOTAL_BYTES - 2048 + 1, headerBytes: wav, locale: "id" }),
    /200 MB/i,
  );

  // Reject non-audio payload disguised with .mp3
  assert.throws(
    () => validateNewAudioTrack({ size: fakeHtml.byteLength, fileName: "fake.mp3", rawType: "audio/mpeg", existingCount: 0, existingBytes: 0, headerBytes: fakeHtml, locale: "en" }),
    /does not match/i,
  );
});

test("chart attachment stage tags, captions, and R-multiple helpers normalize backward-compatibly and survive backups", async () => {
  const { parseTradeInput } = await import("@/lib/trade-validation");
  const { formatRMultiple, tradeRMultiple } = await import("@/lib/format");
  const { translateAttachmentStage } = await import("@/lib/i18n");

  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
    "base64",
  );

  // R-multiple helper honors positive initialRisk only
  assert.equal(tradeRMultiple(makeTrade(1, "150", "50")), 3);
  assert.equal(formatRMultiple(tradeRMultiple(makeTrade(1, "150", "50"))), "+3.00R");
  assert.equal(formatRMultiple(tradeRMultiple(makeTrade(2, "-75", "50"))), "−1.50R");
  assert.equal(tradeRMultiple(makeTrade(3, "100", "")), null);
  assert.equal(tradeRMultiple(makeTrade(4, "100", "0")), null);
  assert.equal(formatRMultiple(null), "—");

  // Stage translation EN & ID
  assert.equal(translateAttachmentStage("Before", "en"), "Before");
  assert.equal(translateAttachmentStage("Before", "id"), "Sebelum");
  assert.equal(translateAttachmentStage("Entry", "id"), "Entri");
  assert.equal(translateAttachmentStage("After", "id"), "Sesudah");
  assert.equal(translateAttachmentStage("HTF", "id"), "HTF");

  // parseTradeInput sanitizes stage and trims/caps caption
  const parsedTrade = parseTradeInput({
    symbol: "eurusd",
    market: "Forex",
    side: "Long",
    setup: "London sweep",
    tradeDate: "2026-04-10",
    pnl: "180",
    initialRisk: "60",
    mood: "Calm",
    notes: "Clean execution",
    attachments: [
      { id: "shot-1", name: "before.png", type: "image/png", size: bytes.length, stage: "Before", caption: "  Sweep of Asia low  " },
      { id: "shot-2", name: "after.png", type: "image/png", size: bytes.length, stage: "InvalidStage", caption: "   " },
      { id: "shot-3", name: "htf.png", type: "image/png", size: bytes.length, stage: "HTF", caption: "x".repeat(220) },
    ],
  });
  assert.equal(parsedTrade.attachments[0].stage, "Before");
  assert.equal(parsedTrade.attachments[0].caption, "Sweep of Asia low");
  assert.equal(parsedTrade.attachments[1].stage, undefined);
  assert.equal(parsedTrade.attachments[1].caption, undefined);
  assert.equal(parsedTrade.attachments[2].stage, "HTF");
  assert.equal(parsedTrade.attachments[2].caption?.length, 180);

  // Backup v2 preserves stage & caption while legacy untagged attachments remain valid
  const journal = normalizeJournalData(createDemoData());
  journal.trades[0].attachments = [
    { id: "img-before", name: "before.png", type: "image/png", size: bytes.length, stage: "Before", caption: "Pre-entry H1 structure" },
    { id: "img-legacy", name: "legacy.png", type: "image/png", size: bytes.length },
  ];
  const backupJson = JSON.stringify({
    format: "bloom-journal-backup",
    version: 2,
    journal,
    images: [
      { id: "img-before", name: "before.png", type: "image/png", size: bytes.length, base64: bytes.toString("base64") },
      { id: "img-legacy", name: "legacy.png", type: "image/png", size: bytes.length, base64: bytes.toString("base64") },
    ],
  });
  const parsedBackup = await parseBackup(backupJson);
  assert.equal(parsedBackup.images.length, 2);
  assert.equal(parsedBackup.journal.trades[0].attachments?.[0].stage, "Before");
  assert.equal(parsedBackup.journal.trades[0].attachments?.[0].caption, "Pre-entry H1 structure");
  assert.equal(parsedBackup.journal.trades[0].attachments?.[1].stage, undefined);
});

test("process matrix, multi-tag breakdown, playbook compliance, and smart entry chips maintain exact accounting", async () => {
  const { evaluateTradeProcess, getProcessMatrix, getSmartEntrySuggestions, groupTradesByTag } = await import("@/lib/analytics");
  const { parseTradeInput } = await import("@/lib/trade-validation");

  // Untouched checklist (0 checked) without explicit followedPlan stays honestly "unrated"
  const unratedWithChecklist: Trade = {
    ...makeTrade(1, "120", "60"),
    checklist: [
      { id: "r1", text: "Rule 1", checked: false },
      { id: "r2", text: "Rule 2", checked: false },
    ],
  };
  assert.equal(evaluateTradeProcess(unratedWithChecklist).status, "unrated");

  // >= 70% checked rules -> followed; >0 and <70% checked -> broken
  const modelWinTrade: Trade = {
    ...makeTrade(2, "200", "100"), // +2.00R
    tags: ["A+", "patient"],
    checklist: [
      { id: "r1", text: "Rule 1", checked: true },
      { id: "r2", text: "Rule 2", checked: true },
      { id: "r3", text: "Rule 3", checked: true },
      { id: "r4", text: "Rule 4", checked: false },
    ], // 75% >= 70%
  };
  const goodLossTrade: Trade = {
    ...makeTrade(3, "-50", "50"), // -1.00R
    followedPlan: true,
    tags: ["patient"],
  };
  const badWinTrade: Trade = {
    ...makeTrade(4, "90", "45"), // +2.00R
    followedPlan: false,
    tags: ["fomo", "early-exit", "FOMO"],
  };
  const unforcedLossTrade: Trade = {
    ...makeTrade(5, "-120", "60"), // -2.00R
    checklist: [
      { id: "r1", text: "Rule 1", checked: true },
      { id: "r2", text: "Rule 2", checked: false },
      { id: "r3", text: "Rule 3", checked: false },
    ], // 33% < 70%
    tags: ["fomo", "revenge"],
  };
  const ratedBreakevenTrade: Trade = {
    ...makeTrade(6, "0", "50"),
    followedPlan: true,
  };

  const sample = [
    unratedWithChecklist,
    modelWinTrade,
    goodLossTrade,
    badWinTrade,
    unforcedLossTrade,
    ratedBreakevenTrade,
  ];
  const matrix = getProcessMatrix(sample);
  assert.equal(matrix.modelWin.count, 1);
  assert.equal(matrix.modelWin.pnl, 200);
  assert.equal(matrix.modelWin.avgR, 2);
  assert.equal(matrix.goodLoss.count, 1);
  assert.equal(matrix.goodLoss.pnl, -50);
  assert.equal(matrix.goodLoss.avgR, -1);
  assert.equal(matrix.badWin.count, 1);
  assert.equal(matrix.badWin.pnl, 90);
  assert.equal(matrix.badWin.avgR, 2);
  assert.equal(matrix.unforcedLoss.count, 1);
  assert.equal(matrix.unforcedLoss.pnl, -120);
  assert.equal(matrix.unforcedLoss.avgR, -2);
  assert.equal(matrix.ratedBreakevens, 1);
  assert.equal(matrix.unratedCount, 1);
  assert.equal(matrix.ratedCount, 5);
  assert.equal(matrix.followedCount, 3);
  assert.equal(matrix.processScorePct, 60);
  assert.equal(
    matrix.modelWin.count + matrix.goodLoss.count + matrix.badWin.count + matrix.unforcedLoss.count + matrix.ratedBreakevens + matrix.unratedCount,
    sample.length,
  );

  // Multi-tag breakdown deduplicates case-insensitively per trade & computes per-tag avgR
  const byTag = groupTradesByTag(sample, "No tags");
  const fomoRow = byTag.find((row) => row.name.toLowerCase() === "#fomo")!;
  assert.equal(fomoRow.count, 2);
  assert.equal(fomoRow.pnl, -30); // +90 + -120
  assert.equal(fomoRow.avgR, 0); // (+2R + -2R) / 2
  const untaggedRow = byTag.find((row) => row.name === "No tags")!;
  assert.equal(untaggedRow.count, 2);

  // followedPlan survives parseTradeInput and normalization
  const parsed = parseTradeInput({
    symbol: "xauusd",
    market: "Commodities",
    side: "Long",
    setup: "Sweep",
    tradeDate: "2026-04-12",
    pnl: "-40",
    mood: "Calm",
    notes: "Good loss",
    followedPlan: true,
  });
  assert.equal(parsed.followedPlan, true);
  const normalized = normalizeJournalData({
    ...createDemoData(),
    trades: [{ ...parsed, id: 99, isDemo: false }],
  });
  assert.equal(normalized.trades[0].followedPlan, true);

  // Smart entry suggestions rank real trades first and include starter tags
  const suggestions = getSmartEntrySuggestions(sample);
  assert.ok(suggestions.symbols.includes("TEST2"));
  assert.ok(suggestions.tags.some((t) => t.toLowerCase() === "fomo"));
});

test("ambient presets, calendar intentional no-trade day notes, and setup blueprints persist and link accurately", async () => {
  const { getSetupBlueprintStats, getSmartEntrySuggestions, upsertDayJournal } = await import("@/lib/analytics");
  const { getAmbientPresets } = await import("@/lib/ambient-synth");

  // 1) 4 zero-storage Web Audio presets in both EN and ID
  const presetsEn = getAmbientPresets("en");
  const presetsId = getAmbientPresets("id");
  assert.equal(presetsEn.length, 4);
  assert.equal(presetsId.length, 4);
  assert.deepEqual(presetsEn.map((p) => p.id), presetsId.map((p) => p.id));

  // 2) DayJournal upsert sorts newest-first, deduplicates by date, and prunes empty entries
  let entries = upsertDayJournal([], {
    date: "2026-10-10",
    intentionalNoTrade: true,
    preMarketPlan: "  Wait for London sweep  ",
    postSessionNote: "  Stayed flat cleanly. ",
  });
  entries = upsertDayJournal(entries, {
    date: "2026-10-12",
    intentionalNoTrade: false,
    preMarketPlan: "Watch CPI volatility",
    postSessionNote: "",
  });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-10-12");
  assert.equal(entries[1].preMarketPlan, "Wait for London sweep");
  // Pruning when cleared
  entries = upsertDayJournal(entries, {
    date: "2026-10-12",
    intentionalNoTrade: false,
    preMarketPlan: "   ",
    postSessionNote: "",
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, "2026-10-10");

  // 3) SetupBlueprint stats match case-insensitively, exclude breakevens from winRate, and feed Smart Entry Chips
  const blueprintTrades: Trade[] = [
    { ...makeTrade(1, "180", "90"), setup: "London Sweep" }, // +2R win
    { ...makeTrade(2, "-60", "60"), setup: "london sweep" }, // -1R loss
    { ...makeTrade(3, "0", "50"), setup: "LONDON SWEEP" },   // 0R breakeven
    { ...makeTrade(4, "100", "50"), setup: "Other Setup" },
  ];
  const bpStats = getSetupBlueprintStats(blueprintTrades, "London Sweep");
  assert.equal(bpStats.count, 3);
  assert.equal(bpStats.wins, 1);
  assert.equal(bpStats.losses, 1);
  assert.equal(bpStats.winRate, 50); // excludes breakeven
  assert.equal(bpStats.net, 120);
  assert.ok(bpStats.avgR !== null && Math.abs(bpStats.avgR - 1 / 3) < 1e-9); // (2 + -1 + 0) / 3

  const blueprints = [
    {
      id: "bp-1",
      name: "Asia Range Fade",
      market: "Forex",
      timeframe: "M15",
      session: "London",
      entryTrigger: "Sweep + displacement",
      invalidation: "Above sweep high",
      targetPlan: "Midpoint & opposing low",
      notes: "Calm execution",
    },
  ];
  const smart = getSmartEntrySuggestions(blueprintTrades, blueprints);
  assert.ok(smart.setups.includes("Asia Range Fade"));

  // 4) Normalization + Backup v2 round-trip + duplicate rejection
  const upgraded = normalizeJournalData(createDemoData());
  assert.deepEqual(upgraded.settings.dayJournals, []);
  assert.deepEqual(upgraded.settings.setupBlueprints, []);

  upgraded.settings.dayJournals = entries;
  upgraded.settings.setupBlueprints = blueprints;
  const parsed = await parseBackup(JSON.stringify({
    format: "bloom-journal-backup",
    version: 2,
    journal: upgraded,
    images: [],
  }));
  assert.equal(parsed.journal.settings.dayJournals?.length, 1);
  assert.equal(parsed.journal.settings.dayJournals?.[0].intentionalNoTrade, true);
  assert.equal(parsed.journal.settings.setupBlueprints?.length, 1);
  assert.equal(parsed.journal.settings.setupBlueprints?.[0].name, "Asia Range Fade");

  assert.throws(() =>
    normalizeJournalData({
      ...upgraded,
      settings: { ...upgraded.settings, dayJournals: [entries[0], entries[0]] },
    }),
  );
  assert.throws(() =>
    normalizeJournalData({
      ...upgraded,
      settings: { ...upgraded.settings, setupBlueprints: [blueprints[0], blueprints[0]] },
    }),
  );
});

test("Tahap D: buildRecapSummary guarantees zero $ leakage in r_only and process_only modes while preserving exact full P&L", () => {
  const trades: Trade[] = [
    { ...makeTrade(1, "300", "100"), tradeDate: "2026-10-27", setup: "ORB", followedPlan: true },
    { ...makeTrade(2, "-80", "80"), tradeDate: "2026-10-28", setup: "ORB", followedPlan: true },
    { ...makeTrade(3, "120", "60"), tradeDate: "2026-10-29", setup: "Pullback", followedPlan: false },
  ];
  const dayJournals = [
    { date: "2026-10-30", intentionalNoTrade: true, preMarketPlan: "Choppy day", postSessionNote: "Stayed flat" },
  ];

  const rOnly = buildRecapSummary({
    trades,
    dayJournals,
    range: "week",
    weekStart: "2026-10-26",
    privacyMode: "r_only",
    locale: "en",
  });
  assert.equal(rOnly.headlineValue, "+4.00R");
  assert.ok(!rOnly.headlineValue.includes("$"), "r_only headline must never leak $");
  for (const tile of rOnly.tiles) {
    assert.ok(!tile.value.includes("$"), `r_only tile ${tile.label} must never leak $`);
  }
  assert.equal(rOnly.winRate, 67);
  assert.equal(rOnly.processScorePct, 67);
  assert.equal(rOnly.modelWins, 1);
  assert.equal(rOnly.goodLosses, 1);
  assert.equal(rOnly.restDays, 1);
  assert.equal(rOnly.topSetup, "ORB");

  const processOnly = buildRecapSummary({
    trades,
    dayJournals,
    range: "week",
    weekStart: "2026-10-26",
    privacyMode: "process_only",
    locale: "id",
  });
  assert.equal(processOnly.headlineValue, "67%");
  assert.ok(!processOnly.headlineValue.includes("$"));
  for (const tile of processOnly.tiles) {
    assert.ok(!tile.value.includes("$"));
  }

  const full = buildRecapSummary({
    trades,
    dayJournals,
    range: "week",
    weekStart: "2026-10-26",
    privacyMode: "full",
    locale: "en",
  });
  assert.equal(full.headlineValue, "+$340.00");
  assert.equal(full.netPnl, 340);
});

test("calendarDayCurrency formats compact signed daily total P&L cleanly for narrow Android calendar cells", () => {
  assert.equal(calendarDayCurrency(285), "+$285");
  assert.equal(calendarDayCurrency(420.5), "+$421");
  assert.equal(calendarDayCurrency(-180), "−$180");
  assert.equal(calendarDayCurrency(-95), "−$95");
  assert.equal(calendarDayCurrency(0), "$0");
  assert.equal(calendarDayCurrency(0.5), "+$0.5");
  assert.equal(calendarDayCurrency(-0.25), "−$0.25");
  assert.equal(calendarDayCurrency(1645.5), "+$1.6k");
  assert.equal(calendarDayCurrency(123456.78), "+$123k");
  assert.equal(calendarDayCurrency(-98765.43), "−$99k");
  assert.equal(calendarDayCurrency(1250000), "+$1.3M");
  assert.equal(calendarDayCurrency(285, true), "•••");
  assert.equal(calendarDayCurrency(-180, true), "•••");
});

test("3-month dummy dataset covers 90-day span, all 5 markets, 2 accounts, 2x2 process quadrants, blueprints, rest days, and patience giveback", async () => {
  const { getProcessMatrix } = await import("@/lib/analytics");
  const { getPatienceMirror } = await import("@/lib/patience");

  for (const locale of ["en", "id"] as const) {
    const raw = createThreeMonthDummyData(locale, new Date("2026-11-02T12:00:00Z"));
    const normalized = normalizeJournalData(raw);
    assert.ok(normalized.trades.length >= 40);
    assert.ok(normalized.trades.every((t) => !t.isDemo));

    const dates = normalized.trades.map((t) => t.tradeDate).sort();
    assert.equal(dates[dates.length - 1], "2026-11-02");
    assert.ok(dates[0] <= "2026-08-10", `Expected earliest trade <= 2026-08-10, got ${dates[0]}`);

    const markets = new Set(normalized.trades.map((t) => t.market));
    assert.deepEqual(
      [...markets].sort(),
      ["Commodities", "Crypto", "Forex", "Futures", "Stocks"],
    );

    assert.equal(normalized.settings.accounts?.length, 2);
    assert.equal(normalized.settings.accounts?.[0].startingBalance, 10000);
    assert.equal(normalized.settings.accounts?.[1].startingBalance, 5000);

    const matrix = getProcessMatrix(normalized.trades);
    assert.ok(matrix.modelWin.count > 0);
    assert.ok(matrix.goodLoss.count > 0);
    assert.ok(matrix.badWin.count > 0);
    assert.ok(matrix.unforcedLoss.count > 0);
    assert.ok(matrix.unratedCount > 0);

    const mainTrades = normalized.trades.filter((t) => t.accountId === "main");
    const patience = getPatienceMirror(mainTrades, normalized.settings.patienceMaxTrades ?? 3);
    assert.ok(patience.greenToRedCount >= 2, "Expected >= 2 green-to-red giveback days");
    assert.ok(patience.overCap.count >= 1, "Expected >= 1 over-cap trade");

    assert.ok((normalized.settings.setupBlueprints?.length ?? 0) >= 4);
    assert.ok((normalized.settings.dayJournals?.filter((d) => d.intentionalNoTrade).length ?? 0) >= 6);
    assert.ok((normalized.settings.reflections?.length ?? 0) >= 6);
    assert.ok((normalized.settings.walkAwayLogs?.length ?? 0) >= 6);
    assert.ok((normalized.settings.goals?.length ?? 0) >= 3);
  }
});

test("report-grade CSV export & import round-trips exact trade structure losslessly in EN and ID", () => {
  for (const locale of ["en", "id"] as const) {
    const dummy = normalizeJournalData(createThreeMonthDummyData(locale, new Date("2026-11-02T12:00:00Z")));
    // Inject an edge-case formula-like note on one trade to test injection-safe lossless round-trip
    dummy.trades[0] = { ...dummy.trades[0], notes: "=2+2 plan note, with commas | and quotes \"ok\"" };
    const accounts = dummy.settings.accounts!;

    const csvReport = exportTradesCsv(dummy.trades, accounts, locale);
    assert.ok(csvReport.startsWith("\uFEFF"), "Expected UTF-8 BOM for Excel");
    assert.match(csvReport, /BLOOM TRADING JOURNAL/);
    assert.match(csvReport, /TOTAL/);
    assert.match(csvReport, /'=2\+2 plan note/);

    // Import into a brand-new journal that only has Main account -> should auto-discover Swing & Crypto!
    const preview = parseCsv(csvReport);
    const freshAccounts = [{ id: "main", name: "Main account", startingBalance: null }];
    const parsedRows = csvRowsToTrades(preview, preview.mapping, freshAccounts, "main", []);
    const errors = parsedRows.filter((r) => r.error);
    assert.equal(errors.length, 0, `Expected 0 import errors in ${locale}, got: ${JSON.stringify(errors)}`);
    assert.equal(parsedRows.length, dummy.trades.length);

    const newAccounts = collectNewAccountsFromRows(parsedRows, freshAccounts);
    assert.equal(newAccounts.length, 1);
    assert.equal(newAccounts[0].name, "Swing & Crypto");
    const allAccounts = [...freshAccounts, ...newAccounts];

    const sortedOriginal = [...dummy.trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id);
    parsedRows.forEach((row, idx) => {
      const orig = sortedOriginal[idx];
      const imp = row.trade!;
      assert.equal(imp.symbol, orig.symbol);
      assert.equal(imp.tradeDate, orig.tradeDate);
      assert.equal(Number(imp.pnl).toFixed(2), Number(orig.pnl).toFixed(2));
      assert.equal(imp.market, orig.market);
      assert.equal(imp.side, orig.side);
      assert.equal(imp.setup, orig.setup);
      assert.equal(imp.session ?? "", orig.session ?? "");
      assert.equal(imp.timeframe ?? "", orig.timeframe ?? "");
      assert.equal(Number(imp.entryPrice), Number(orig.entryPrice));
      assert.equal(Number(imp.exitPrice), Number(orig.exitPrice));
      assert.equal(Number(imp.stopLoss), Number(orig.stopLoss));
      assert.equal(Number(imp.takeProfit), Number(orig.takeProfit));
      assert.equal(Number(imp.positionSize), Number(orig.positionSize));
      assert.equal(Number(imp.initialRisk), Number(orig.initialRisk));
      assert.equal(Number(imp.fees || "0"), Number(orig.fees || "0"));
      assert.equal(imp.followedPlan, orig.followedPlan);
      assert.equal((imp.checklist ?? []).length, (orig.checklist ?? []).length);
      (orig.checklist ?? []).forEach((item, cIdx) => {
        assert.equal(imp.checklist![cIdx].checked, item.checked);
        assert.equal(imp.checklist![cIdx].text, item.text);
      });
      assert.equal(imp.mood, orig.mood);
      assert.deepEqual(imp.tags ?? [], orig.tags ?? []);
      assert.equal(imp.notes, orig.notes);

      const origAccName = accounts.find((a) => a.id === orig.accountId)?.name;
      const impAccName = allAccounts.find((a) => a.id === imp.accountId)?.name;
      assert.equal(impAccName, origAccName);
    });
  }
});

test("styled OpenXML .xlsx report export & import round-trips losslessly in EN, ID, and DEFLATE-recompressed Excel archives", async () => {
  const { deflateRawSync } = await import("node:zlib");

  function repackAsDeflateZip(storeZip: Uint8Array): Uint8Array {
    const view = new DataView(storeZip.buffer, storeZip.byteOffset, storeZip.byteLength);
    let eocd = -1;
    for (let i = storeZip.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    assert.ok(eocd >= 0);
    const count = view.getUint16(eocd + 10, true);
    let cd = view.getUint32(eocd + 16, true);
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (let i = 0; i < count; i++) {
      const size = view.getUint32(cd + 20, true);
      const nameLen = view.getUint16(cd + 28, true);
      const extraLen = view.getUint16(cd + 30, true);
      const commentLen = view.getUint16(cd + 32, true);
      const lOff = view.getUint32(cd + 42, true);
      const dosTime = view.getUint16(cd + 12, true);
      const dosDate = view.getUint16(cd + 14, true);
      // Assert valid MS-DOS calendar date (never Day=0 or Month=0)
      const day = dosDate & 0x1f;
      const month = (dosDate >> 5) & 0x0f;
      assert.ok(day >= 1 && day <= 31, `Invalid DOS day ${day}`);
      assert.ok(month >= 1 && month <= 12, `Invalid DOS month ${month}`);

      const crc = view.getUint32(cd + 16, true);
      const nameBytes = storeZip.subarray(cd + 46, cd + 46 + nameLen);
      const lNameLen = view.getUint16(lOff + 26, true);
      const lExtraLen = view.getUint16(lOff + 28, true);
      const rawData = storeZip.subarray(lOff + 30 + lNameLen + lExtraLen, lOff + 30 + lNameLen + lExtraLen + size);
      const deflated = deflateRawSync(rawData);

      const local = new Uint8Array(30 + nameLen + deflated.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(8, 8, true); // DEFLATE method 8
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, deflated.length, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameLen, true);
      local.set(nameBytes, 30);
      local.set(deflated, 30 + nameLen);
      localParts.push(local);

      const central = new Uint8Array(46 + nameLen);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(10, 8, true); // DEFLATE method 8
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, deflated.length, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameLen, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);

      offset += local.length;
      cd += 46 + nameLen + extraLen + commentLen;
    }

    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const outEocd = new Uint8Array(22);
    const ev = new DataView(outEocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, count, true);
    ev.setUint16(10, count, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const out = new Uint8Array(offset + centralSize + 22);
    let pos = 0;
    for (const p of localParts) { out.set(p, pos); pos += p.length; }
    for (const p of centralParts) { out.set(p, pos); pos += p.length; }
    out.set(outEocd, pos);
    return out;
  }

  for (const locale of ["en", "id"] as const) {
    const dummy = normalizeJournalData(createThreeMonthDummyData(locale, new Date("2026-11-02T12:00:00Z")));
    const accounts = dummy.settings.accounts!;

    const xlsxBytes = exportTradesXlsx(dummy.trades, accounts, locale);
    assert.equal(xlsxBytes[0], 0x50);
    assert.equal(xlsxBytes[1], 0x4b);
    assert.equal(xlsxBytes[2], 0x03);
    assert.equal(xlsxBytes[3], 0x04);

    const asciiDump = new TextDecoder("utf-8", { fatal: false }).decode(xlsxBytes);
    assert.match(asciiDump, /<bookViews>/);
    assert.match(asciiDump, /<cellStyles count="1">/);
    assert.match(asciiDump, /xl\/sharedStrings\.xml/);
    assert.match(asciiDump, /<autoFilter ref="A4:Z58"\/>/);
    assert.match(asciiDump, /SUM\(Q5:Q58\)/);

    const deflatedXlsx = repackAsDeflateZip(xlsxBytes);

    for (const candidate of [xlsxBytes, deflatedXlsx]) {
      const matrix = await parseXlsxBuffer(
        candidate.buffer.slice(candidate.byteOffset, candidate.byteOffset + candidate.byteLength) as ArrayBuffer,
      );
      const preview = parseSpreadsheetMatrix(matrix);
      const parsedRows = csvRowsToTrades(preview, preview.mapping, accounts, "main", []);
      assert.equal(parsedRows.filter((r) => r.error).length, 0);
      assert.equal(parsedRows.length, dummy.trades.length);

      const sortedOriginal = [...dummy.trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id);
      parsedRows.forEach((row, idx) => {
        const orig = sortedOriginal[idx];
        const imp = row.trade!;
        assert.equal(imp.symbol, orig.symbol);
        assert.equal(imp.tradeDate, orig.tradeDate);
        assert.equal(Number(imp.pnl).toFixed(2), Number(orig.pnl).toFixed(2));
        assert.equal(imp.market, orig.market);
        assert.equal(imp.mood, orig.mood);
        assert.equal(imp.accountId, orig.accountId);
        assert.equal(imp.followedPlan, orig.followedPlan);
        assert.equal((imp.checklist ?? []).length, (orig.checklist ?? []).length);
        assert.deepEqual(imp.tags ?? [], orig.tags ?? []);
        assert.equal(imp.notes, orig.notes);
      });
    }
  }
});

test("YouTube watch & reminder links parse all standard URL formats, reject untrusted hosts, and persist across backups", async () => {
  const watch = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2m15s");
  assert.ok(watch);
  assert.equal(watch.videoId, "dQw4w9WgXcQ");
  assert.equal(watch.startSeconds, 135);
  assert.equal(watch.thumbnailUrl, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.match(watch.embedUrl, /https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=135/);
  assert.equal(formatYoutubeTimestamp(135), "2:15");
  assert.equal(formatYoutubeTimestamp(3725), "1:02:05");

  assert.equal(parseYoutubeUrl("youtu.be/Q6ms3xJ2c1k?si=abc&t=45")?.videoId, "Q6ms3xJ2c1k");
  assert.equal(parseYoutubeUrl("youtu.be/Q6ms3xJ2c1k?si=abc&t=45")?.startSeconds, 45);
  assert.equal(parseYoutubeUrl("https://m.youtube.com/shorts/hR2A8vX5wP0")?.videoId, "hR2A8vX5wP0");
  assert.equal(parseYoutubeUrl("https://www.youtube.com/live/9zL7mN4kR1v?feature=share")?.videoId, "9zL7mN4kR1v");
  assert.equal(parseYoutubeUrl("https://www.youtube-nocookie.com/embed/9zL7mN4kR1v?start=90")?.startSeconds, 90);

  // Reject untrusted or malformed URLs
  assert.equal(parseYoutubeUrl("https://evil-youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseYoutubeUrl("javascript:alert(1)"), null);
  assert.equal(parseYoutubeUrl("https://www.youtube.com/watch?v=short"), null);

  const items: SavedYoutubeVideo[] = [
    {
      id: "v1",
      videoId: "Q6ms3xJ2c1k",
      url: "https://www.youtube.com/watch?v=Q6ms3xJ2c1k",
      title: "Follow-up Study",
      category: "followup",
      note: "Check M15 structure",
      pinned: false,
      addedAt: "2026-11-01",
    },
    {
      id: "v2",
      videoId: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Morning Discipline Reminder",
      category: "reminder",
      note: "Wait for A+ setup",
      pinned: true,
      addedAt: "2026-11-02",
    },
  ];
  assert.equal(sortYoutubeVideos(items)[0].id, "v2");

  const upgraded = normalizeJournalData(createDemoData());
  assert.deepEqual(upgraded.settings.youtubeLinks, []);

  upgraded.settings.youtubeLinks = items;
  const parsed = await parseBackup(
    JSON.stringify({
      format: "bloom-journal-backup",
      version: 2,
      journal: upgraded,
      images: [],
    }),
  );
  assert.equal(parsed.journal.settings.youtubeLinks?.length, 2);
  assert.equal(parsed.journal.settings.youtubeLinks?.[1].note, "Wait for A+ setup");

  const dummy3m = normalizeJournalData(createThreeMonthDummyData("id"));
  assert.equal(dummy3m.settings.youtubeLinks?.length, 3);

  assert.throws(() =>
    normalizeJournalData({
      ...upgraded,
      settings: { ...upgraded.settings, youtubeLinks: [items[0], items[0]] },
    }),
  );
  assert.throws(() =>
    normalizeJournalData({
      ...upgraded,
      settings: {
        ...upgraded.settings,
        youtubeLinks: [{ ...items[0], id: "bad-vid", videoId: "<script>bad" }],
      },
    }),
  );

  // Minimal YouTube video entries (without category or note) validate cleanly
  const minimalVideo: SavedYoutubeVideo = {
    id: "v-min",
    videoId: "Q6ms3xJ2c1k",
    url: "https://www.youtube.com/watch?v=Q6ms3xJ2c1k",
    title: "Simple Strategy Study",
    addedAt: "2026-11-02",
  };
  const minimalNormalized = normalizeJournalData({
    ...upgraded,
    settings: { ...upgraded.settings, youtubeLinks: [minimalVideo] },
  });
  assert.equal(minimalNormalized.settings.youtubeLinks?.length, 1);
  assert.equal(minimalNormalized.settings.youtubeLinks?.[0].title, "Simple Strategy Study");
});

test("Strategy books (PDF) & idea links validate URLs, %PDF- magic bytes, and v2 backups", async () => {
  const samplePdf = buildSampleStrategyPdfBlob("en");
  await validatePdfBlob(samplePdf);
  assert.equal(cleanPdfTitle("Price_Action_Playbook_v2.pdf"), "Price Action Playbook v2");

  await assert.rejects(() => validatePdfBlob(new Blob(["not a pdf"], { type: "application/pdf" })), /valid PDF/);
  await assert.rejects(() => validatePdfBlob(new Blob([], { type: "application/pdf" })), /empty/);

  const parsedLink = parseStrategyLinkUrl("tradingview.com/chart/abc_setup");
  assert.ok(parsedLink);
  assert.equal(parsedLink.url, "https://tradingview.com/chart/abc_setup");
  assert.equal(parsedLink.hostLabel, "tradingview.com");

  assert.equal(parseStrategyLinkUrl("javascript:alert(1)"), null);
  assert.equal(parseStrategyLinkUrl("data:text/html,<h1>x</h1>"), null);
  assert.equal(parseStrategyLinkUrl("not a domain"), null);

  const pdfBytes = new Uint8Array(await samplePdf.arrayBuffer());
  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
  const baseJournal = normalizeJournalData(createDemoData());
  assert.deepEqual(baseJournal.settings.strategyLibrary, []);

  const library: StrategyLibraryItem[] = [
    {
      id: "lib-pdf-1",
      kind: "pdf",
      title: "A+ Strategy Playbook",
      fileId: "file-pdf-1",
      fileName: "A+_Strategy_Playbook.pdf",
      size: pdfBytes.length,
      addedAt: "2026-11-02",
    },
    {
      id: "lib-link-1",
      kind: "link",
      title: "Session Liquidity Notes",
      url: "https://www.tradingview.com/chart/",
      addedAt: "2026-11-02",
    },
  ];
  baseJournal.settings.strategyLibrary = library;
  const validated = normalizeJournalData(baseJournal);
  assert.equal(validated.settings.strategyLibrary?.length, 2);

  const parsedBackup = await parseBackup(
    JSON.stringify({
      format: "bloom-journal-backup",
      version: 2,
      journal: validated,
      images: [],
      documents: [
        {
          fileId: "file-pdf-1",
          fileName: "A+_Strategy_Playbook.pdf",
          size: pdfBytes.length,
          base64: pdfBase64,
        },
      ],
    }),
  );
  assert.equal(parsedBackup.documents.length, 1);
  assert.equal(parsedBackup.documents[0].blob.size, pdfBytes.length);

  // Missing document payload in backup must be rejected
  await assert.rejects(() =>
    parseBackup(
      JSON.stringify({
        format: "bloom-journal-backup",
        version: 2,
        journal: validated,
        images: [],
      }),
    ),
  );
});

test("YouTube playback cache parses player postMessages, persists paused timestamps, and clears completed videos", () => {
  const msg = parseYoutubePlayerMessage(
    JSON.stringify({
      event: "infoDelivery",
      info: { currentTime: 185.7, duration: 620, playerState: 2 },
    }),
  );
  assert.deepEqual(msg, { currentTime: 185.7, duration: 620, playerState: 2 });
  assert.deepEqual(
    parseYoutubePlayerMessage(JSON.stringify({ event: "onStateChange", info: 0 })),
    { playerState: 0 },
  );
  assert.equal(parseYoutubePlayerMessage("not-json"), null);

  const mem = new Map<string, string>();
  const storage = {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, val: string) => {
      mem.set(key, val);
    },
  };

  let cache = readYoutubePlaybackCache(storage);
  assert.deepEqual(cache, { positions: {} });

  cache = updateYoutubePlaybackPosition(cache, "dQw4w9WgXcQ", 185.7, 620, 1_700_000_000_000);
  cache = { ...cache, selectedId: "vid-1" };
  assert.equal(writeYoutubePlaybackCache(storage, cache), true);
  assert.ok(mem.has(YOUTUBE_PLAYBACK_CACHE_KEY));

  const reloaded = readYoutubePlaybackCache(storage);
  assert.equal(reloaded.selectedId, "vid-1");
  assert.equal(reloaded.positions.dQw4w9WgXcQ?.seconds, 185);
  assert.equal(
    resolveYoutubeResumeSeconds({ videoId: "dQw4w9WgXcQ", startSeconds: 45 }, reloaded),
    185,
  );
  assert.equal(
    resolveYoutubeResumeSeconds({ videoId: "Q6ms3xJ2c1k", startSeconds: 45 }, reloaded),
    45,
  );

  // Near-end completion clears resume position so next watch starts fresh
  const nearEnd = updateYoutubePlaybackPosition(reloaded, "dQw4w9WgXcQ", 618.5, 620, 1_700_000_005_000);
  assert.equal(nearEnd.positions.dQw4w9WgXcQ, undefined);

  // Manual restart clears cached position
  const manuallyCleared = clearYoutubePlaybackPosition(reloaded, "dQw4w9WgXcQ");
  assert.equal(manuallyCleared.positions.dQw4w9WgXcQ, undefined);
});







