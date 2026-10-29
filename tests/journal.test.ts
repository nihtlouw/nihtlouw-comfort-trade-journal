import test from "node:test";
import assert from "node:assert/strict";
import { createDemoData } from "@/lib/demo-data";
import { inspectBrowserJournal, saveBrowserJournal, storageKey } from "@/lib/browser-journal";
import { isDate, normalizeJournalData } from "@/lib/journal-data";
import { getStats, todayString, dateFromString } from "@/lib/format";
import { readLimitedBody } from "@/lib/request-body";
import { groupTrades, maxRealizedDrawdown, monthGrid, performanceSeries, previousPeriodTrades } from "@/lib/analytics";
import { csvRowsToTrades, exportTradesCsv, parseCsv } from "@/lib/csv";
import { parseBackup } from "@/lib/backup";
import { validateImage } from "@/lib/attachments";
import type { Trade } from "@/lib/types";

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

