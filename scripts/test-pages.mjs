import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(project, "out");
const basePath = "/nihtlouw-comfort-trade-journal/";
const browserPath = process.env.CHROME_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
assert.ok(browserPath && existsSync(browserPath), "Set CHROME_PATH to an installed Chrome/Chromium executable.");
assert.ok(existsSync(join(root, "index.html")) || process.env.PAGES_TEST_URL, "Run npm run build:pages first.");
const temp = mkdtempSync(join(tmpdir(), "bloom-ui-test-"));
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (!pathname.startsWith(basePath)) { response.writeHead(404).end(); return; }
    let file = resolve(root, pathname.slice(basePath.length) || "index.html");
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    if (pathname.endsWith("/") && file !== join(root, "index.html")) file = join(file, "index.html");
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".json": "application/json", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" }); response.end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const url = process.env.PAGES_TEST_URL ?? `http://127.0.0.1:${server.address().port}${basePath}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--single-process"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage(); const errors = []; const apiRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (new URL(request.url()).pathname.includes("/api/")) apiRequests.push(request.url()); });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(url, { waitUntil: "networkidle" }); await page.locator(".app-shell").waitFor();
  assert.equal(await page.locator(".trade-row").count(), 5); assert.equal(await page.locator(".sidebar").evaluate((element) => getComputedStyle(element).position), "sticky");
  const imageUrl = await page.locator(".welcome-banner").evaluate((element) => getComputedStyle(element).backgroundImage);
  assert.match(imageUrl, /bloom-landscape\.png/);
  assert.equal((await page.request.get(new URL("images/bloom-landscape.png", url).href)).status(), 200);
  console.log("PASS: redesigned UI and packaged assets load at the Pages base path.");

  await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
  const tradeDate = await page.getByLabel("Trade date").inputValue();
  await page.getByLabel("Asset / symbol").fill("UI-TEST"); await page.getByLabel("Net P&L (USD)").fill("123.45");
  await page.getByLabel("Setup", { exact: true }).fill("Patience"); await page.getByLabel("Notes", { exact: true }).fill("A note worth keeping.");
  await page.getByRole("button", { name: /TRADE DETAILS & REFLECTION/ }).click();
  await page.getByLabel("Initial risk (USD)").fill("100"); await page.getByLabel("Tags").fill("patient, test");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
  await page.locator(".upload-image input").setInputFiles({ name: "chart.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save trade", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" });
  await page.reload({ waitUntil: "networkidle" }); await page.getByLabel("Edit UI-TEST trade").waitFor();
  await page.getByLabel("Edit UI-TEST trade").click(); assert.equal(await page.getByLabel("Initial risk (USD)").inputValue(), "100"); assert.equal(await page.locator(".attachment-thumb").count(), 1); await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Focused", exact: true }).click(); await page.locator(".goal-button").click();
  await page.reload({ waitUntil: "networkidle" }); assert.equal(await page.getByRole("button", { name: "Focused", exact: true }).getAttribute("aria-pressed"), "true"); assert.match(await page.locator(".goal-progress-label").first().innerText(), /1/);
  console.log("PASS: advanced trades, screenshots, mood history, and goal progress persist.");

  await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "Data", exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const backupFile = join(temp, "backup.json"); await download.saveAs(backupFile);
  const backup = JSON.parse(readFileSync(backupFile, "utf8")); assert.equal(backup.format, "bloom-journal-backup"); assert.equal(backup.images.length, 1); assert.ok(backup.journal.trades.some((trade) => trade.symbol === "UI-TEST"));
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Trade journal", exact: true }).click();
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  const csv = `Ticker,Date,Net Profit,Market,Direction,Setup\nCSV-TEST,2026-01-01,-50,Stocks,Short,Pullback\nUI-TEST,${tradeDate},123.45,Forex,Long,Patience\nBAD,not-a-date,15,Stocks,Long,Other`;
  await page.locator(".csv-upload input").setInputFiles({ name: "broker.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByText("1 ready to import").waitFor(); assert.match(await page.locator(".import-summary").innerText(), /1 invalid.*1 possible duplicates/);
  await page.getByRole("button", { name: "Import 1 trade", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" });
  await page.getByLabel("Search trades").fill("CSV-TEST"); assert.equal(await page.locator(".trade-row").count(), 1); await page.getByLabel("Search trades").fill("");
  await page.locator(".sidebar-nav").getByRole("button", { name: "Calendar", exact: true }).click(); await page.locator(".calendar-day.today").click();
  assert.match(await page.locator(".selected-day").innerText(), /Showing/); assert.ok(await page.getByText("UI-TEST").count());
  console.log("PASS: mapped CSV import previews errors and duplicates; search and calendar drill-down work.");

  await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.locator(".file-button input").setInputFiles(backupFile); await page.locator(".modal").waitFor({ state: "detached" });
  await page.locator(".sidebar-nav").getByRole("button", { name: "Trade journal", exact: true }).click();
  if (await page.getByLabel("Clear selected day").count()) await page.getByLabel("Clear selected day").click();
  assert.equal(await page.getByText("CSV-TEST").count(), 0); await page.getByLabel("Edit UI-TEST trade").click(); assert.equal(await page.locator(".attachment-thumb").count(), 1); await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.locator(".sidebar-nav").getByRole("button", { name: "Playbook", exact: true }).click();
  await page.getByRole("button", { name: "Add a rule", exact: true }).first().click(); await page.getByLabel("New playbook rule").fill("Review the context"); await page.getByRole("button", { name: "Add", exact: true }).click();
  assert.ok(await page.getByText("Review the context").count());
  await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "Accounts", exact: true }).click(); await page.getByLabel("New account name").fill("Swing account"); await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.locator(".account-settings").getByText("Swing account").waitFor(); await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Filter by trading account").selectOption({ label: "Swing account" }); await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
  await page.getByLabel("Asset / symbol").fill("SWING-TEST"); await page.getByLabel("Net P&L (USD)").fill("75"); assert.equal(await page.locator(".modal").getByLabel("Trading account").inputValue(), await page.getByLabel("Filter by trading account").inputValue());
  await page.getByRole("button", { name: /TRADE DETAILS & REFLECTION/ }).click(); await page.getByRole("checkbox", { name: "Review the context", exact: true }).check(); await page.getByRole("button", { name: "Save trade", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" });
  await page.getByLabel("Filter by trading account").selectOption("all");
  await page.locator(".sidebar-nav").getByRole("button", { name: "Mindset", exact: true }).click();
  await page.locator(".checkin-note textarea").fill("A steady start."); await page.getByRole("button", { name: /Save today/ }).click();
  await page.getByLabel("What went well?").fill("Waited for confirmation."); await page.getByLabel("What did I learn?").fill("Patience matters."); await page.getByLabel("What will I carry forward?").fill("Keep risk small."); await page.getByRole("button", { name: "Save reflection", exact: true }).click();
  await page.getByText("Waited for confirmation.").waitFor(); assert.ok(await page.getByText("Patience matters.").count()); assert.ok(await page.getByText("Keep risk small.").count());
  await page.locator(".sidebar-nav").getByRole("button", { name: "Goals", exact: true }).click(); await page.getByLabel("Your intention").fill("Stay patient"); await page.getByRole("button", { name: "Add intention", exact: true }).click(); await page.getByText("Stay patient").waitFor();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Analytics", exact: true }).click(); assert.ok(await page.getByText("Average R").count()); await page.getByText("View chart data as a table").click(); assert.ok(await page.locator(".chart-data tbody tr").count());
  await page.reload({ waitUntil: "networkidle" }); await page.locator(".sidebar-nav").getByRole("button", { name: "Goals", exact: true }).click(); assert.ok(await page.getByText("Stay patient").count());
  console.log("PASS: portfolio accounts, per-trade checklists, reflections, multiple intentions, and analytics work.");

  await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "☾ Dark mode", exact: true }).click();
  assert.equal(await page.locator(".app-shell").getAttribute("data-theme"), "dark"); await page.getByRole("button", { name: "Close", exact: true }).click(); await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".app-shell").getAttribute("data-theme"), "dark");
  console.log("PASS: full backup restores trades and images; theme persists.");

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "no page-wide mobile overflow");
  assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), true); await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Goals", exact: true }).click(); assert.equal(await page.locator(".breadcrumbs strong").innerText(), "Goals");
  console.log("PASS: mobile navigation and layout work without horizontal page overflow.");

  const recoveryContext = await browser.newContext(); const recovery = await recoveryContext.newPage(); recovery.on("dialog", (dialog) => dialog.accept());
  await recovery.goto(url, { waitUntil: "networkidle" }); await recovery.evaluate(() => localStorage.setItem("nihtlouw-comfort-trade-journal:v1", "{broken")); await recovery.reload({ waitUntil: "networkidle" });
  assert.equal(await recovery.locator(".recovery-banner").isVisible(), true); await recovery.locator(".goal-button").click(); await recovery.getByText(/Saved journal needs recovery/).waitFor();
  assert.equal(await recovery.evaluate(() => localStorage.getItem("nihtlouw-comfort-trade-journal:v1")), "{broken");
  await recovery.getByRole("button", { name: "Start fresh", exact: true }).click(); await recovery.locator(".recovery-banner").waitFor({ state: "detached" });
  await recovery.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "SecurityError"); }; }); await recovery.locator(".goal-button").click();
  await recovery.getByText(/Couldn't save in this browser/).waitFor(); assert.match(await recovery.locator(".goal-progress-label").first().innerText(), /0/);
  console.log("PASS: damaged data is protected and blocked storage leaves the UI unchanged.");
  assert.deepEqual(errors, [], "no uncaught browser errors"); assert.deepEqual(apiRequests, [], "Pages never calls unavailable server APIs");
  console.log("PASS: no uncaught browser errors or backend calls in the static build.");
} finally { if (browser) await browser.close().catch(() => {}); server.close(); rmSync(temp, { recursive: true, force: true }); }
