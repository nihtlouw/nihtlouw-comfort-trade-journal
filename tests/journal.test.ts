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
  assert.equal(result.data.trades[0].accountId, "main");
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
