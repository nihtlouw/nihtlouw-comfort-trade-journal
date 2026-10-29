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
const browserPath = process.env.CHROME_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
assert.ok(browserPath && existsSync(browserPath), "Set CHROME_PATH to an installed Chromium executable.");
const external = process.env.BLOOM_FEATURE_URL;
if (!external) assert.ok(existsSync(join(root, "local", "index.html")), "Run npm run build:pages first.");
const temp = mkdtempSync(join(tmpdir(), "bloom-feature-test-"));
let version = 1;
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (!pathname.startsWith(basePath)) { response.writeHead(404).end(); return; }
    const path = pathname.slice(basePath.length);
    if (path === "api/private-test") { response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ secret: "NEVER-CACHE-PRIVATE-API" })); return; }
    let file = resolve(root, path || "index.html");
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    if (pathname.endsWith("/") && file !== join(root, "index.html")) file = join(file, "index.html");
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
    let body = readFileSync(file);
    if (path === "sw.js") body = Buffer.from(`${body}\n// Test update ${version}\n`);
    if (path === "local/") {
      const missing = version === 2 ? `<script src="${basePath}_next/static/chunks/bloom-missing.js"></script>` : "";
      body = Buffer.from(body.toString().replace("</head>", `<meta name="bloom-test-version" content="${version}">${missing}</head>`));
    }
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" }); response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const base = external ?? `http://127.0.0.1:${server.address().port}${basePath}`;
const local = new URL("local/", base).href;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
let browser;
try {
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(local, { waitUntil: "networkidle" });
  await page.getByText("Browser journal ready offline", { exact: true }).waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  const manifest = await (await page.request.get(new URL("manifest.webmanifest", base).href)).json();
  assert.equal(new URL(manifest.start_url, new URL("manifest.webmanifest", base)).href, local);
  assert.equal(manifest.display, "standalone"); assert.ok(manifest.icons.some((item) => item.sizes === "512x512" && item.purpose === "maskable"));
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send("Page.getInstallabilityErrors"); assert.deepEqual(installability.installabilityErrors, []);
  for (const icon of manifest.icons) assert.equal((await page.request.get(new URL(icon.src, new URL("manifest.webmanifest", base)).href)).status(), 200);
  console.log("PASS: installable manifest, base-path icons and generic offline shell are ready.");

  const navigate = async (view) => {
    const direct = { Overview: "Overview", "Trade journal": "Journal", Calendar: "Calendar" }[view];
    if (direct) await page.locator(".mobile-bottom-nav").getByRole("button", { name: direct, exact: true }).click();
    else { await page.locator(".mobile-bottom-nav").getByRole("button", { name: "More", exact: true }).click(); await page.locator(".sidebar-nav").getByRole("button", { name: view, exact: true }).click(); }
    await page.locator(`.view-motion[data-view="${view}"]`).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360, `${view} fits the Android viewport`);
  };
  const openSettings = async (tab) => { await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: tab, exact: true }).click(); };
  const close = async () => { await page.getByRole("button", { name: "Close", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" }); };
  await openSettings("Risk");
  await page.getByLabel("Initial risk per trade (USD)").fill("50"); await page.getByLabel("Daily realized net loss per account (USD)").fill("100");
  await page.getByRole("button", { name: "Save limits" }).click(); await page.getByText("Risk limits saved.").waitFor();
  await page.getByRole("button", { name: "Accounts", exact: true }).click(); await page.getByLabel("New account name").fill("Swing account"); await page.getByRole("button", { name: "Add account" }).click(); await page.locator(".account-settings").getByText("Swing account").waitFor(); await close();
  if (await page.getByRole("button", { name: /Samples included/ }).count()) await page.getByRole("button", { name: /Samples included/ }).click();
  await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
  await page.getByLabel("Asset / symbol").fill("RISK-ONE"); await page.getByLabel("Net P&L (USD)").fill("-110"); await page.getByLabel("Setup", { exact: true }).fill("My breakout"); await page.getByLabel("Notes", { exact: true }).fill("I waited for confirmation.");
  await page.getByRole("button", { name: /OPTIONAL DETAILS/ }).click(); await page.getByLabel("Initial risk (USD)").fill("75");
  await page.locator(".upload-image input").setInputFiles({ name: "offline-chart.png", mimeType: "image/png", buffer: png });
  assert.match(await page.locator(".draft-risk-notice").innerText(), /Initial risk.*\$75\.00.*\$50\.00/s);
  assert.match(await page.locator(".draft-risk-notice").innerText(), /daily realized net loss.*\$110\.00.*\$100\.00/s);
  await page.getByRole("button", { name: "Save trade", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
  await page.getByLabel("Asset / symbol").fill("SWING-TWO"); await page.getByLabel("Net P&L (USD)").fill("-60"); await page.locator(".modal").getByLabel("Trading account").selectOption({ label: "Swing account" });
  assert.equal(await page.locator(".draft-risk-notice").count(), 0, "daily losses from different accounts must not be combined");
  await page.getByRole("button", { name: "Save trade", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" });
  await navigate("Mindset"); await page.getByLabel("What went well?").fill("Protected my focus."); await page.getByLabel("What did I learn?").fill("Respect the plan."); await page.getByRole("button", { name: "Save reflection" }).click(); await page.getByText("Protected my focus.").waitFor();
  await navigate("Weekly review");
  assert.match(await page.locator(".weekly-review").innerText(), /My breakout/); assert.match(await page.locator(".weekly-review").innerText(), /I waited for confirmation/);
  assert.match(await page.locator(".weekly-review").innerText(), /Protected my focus/); assert.match(await page.locator(".risk-review").innerText(), /1 \/ 2 trades/);
  assert.equal(await page.locator(".risk-review .risk-alert-list li").count(), 2);
  await page.getByLabel("Filter by trading account").selectOption({ label: "Swing account" });
  assert.doesNotMatch(await page.locator(".weekly-review").innerText(), /I waited for confirmation/);
  assert.match(await page.locator(".weekly-review").innerText(), /Protected my focus/);
  assert.equal(await page.locator(".risk-review .risk-alert-list li").count(), 0);
  await page.getByLabel("Filter by trading account").selectOption("all");
  await page.getByLabel("Hide amounts").click(); assert.doesNotMatch(await page.locator(".weekly-review").innerText(), /\$110\.00|\$75\.00/); assert.match(await page.locator(".weekly-review").innerText(), /••••••/);
  await page.getByLabel("Show amounts").click(); await page.getByLabel("Previous week").click(); assert.doesNotMatch(await page.locator(".weekly-review").innerText(), /Protected my focus/);
  await page.getByLabel("Next week").click(); assert.match(await page.locator(".weekly-review").innerText(), /Protected my focus/);
  await page.reload({ waitUntil: "networkidle" }); await navigate("Weekly review"); assert.match(await page.locator(".risk-review").innerText(), /\$100\.00/);
  console.log("PASS: weekly review, account/sample filters, reflections, risk warnings, privacy and navigation.");

  await openSettings("Data"); await page.getByLabel("Backup reminder frequency").selectOption("14");
  assert.match(await page.locator(".backup-reminder-settings").innerText(), /No backup download started/);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const backupFile = join(temp, "bloom.json"); await download.saveAs(backupFile);
  const backup = JSON.parse(readFileSync(backupFile, "utf8"));
  assert.equal(backup.images.length, 1); assert.equal(backup.journal.settings.backupReminderDays, 14); assert.equal(backup.journal.settings.riskLimits.dailyLoss, 100);
  await page.getByText(/Last backup download started on this device/).waitFor(); await close();
  const reminderKey = "bloom:backup-reminder:v1:browser";
  await page.evaluate((key) => { const state = JSON.parse(localStorage.getItem(key)); state.lastDownloadAt = Date.now() - 15 * 86400000; localStorage.setItem(key, JSON.stringify(state)); window.dispatchEvent(new Event("focus")); }, reminderKey);
  await page.getByRole("region", { name: "Backup reminder" }).waitFor(); // Also appears outside Overview.
  await page.getByRole("button", { name: "Remind me in 7 days" }).click(); assert.equal(await page.getByRole("region", { name: "Backup reminder" }).count(), 0);
  await navigate("Overview"); await page.reload({ waitUntil: "networkidle" }); assert.equal(await page.getByRole("region", { name: "Backup reminder" }).count(), 0);
  await openSettings("Data");
  const previous = await page.evaluate((key) => localStorage.getItem(key), reminderKey);
  await page.evaluate(() => { window.__oldCreateObjectURL = URL.createObjectURL; URL.createObjectURL = () => { throw new Error("download blocked for test"); }; });
  await page.getByRole("button", { name: "Download", exact: true }).click(); await page.getByText("download blocked for test").waitFor();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), reminderKey), previous, "failed download must not reset reminder history");
  await page.evaluate(() => { URL.createObjectURL = window.__oldCreateObjectURL; window.__oldAnchorClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = () => { throw new Error("download click failed for test"); }; });
  await page.getByRole("button", { name: "Download", exact: true }).click(); await page.getByText("download click failed for test").waitFor();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), reminderKey), previous, "failed click must not record a backup");
  assert.equal(await page.locator('a[download^="bloom-backup-"]').count(), 0, "failed download cleans up its link");
  await page.evaluate(() => { HTMLAnchorElement.prototype.click = window.__oldAnchorClick; }); await close();
  console.log("PASS: backup frequency, honest download status, snooze and failed-download handling.");

  if (!external) {
    const secret = await page.evaluate((url) => fetch(url).then((response) => response.json()), new URL("api/private-test", base).href);
    assert.equal(secret.secret, "NEVER-CACHE-PRIVATE-API");
    version = 2; // A missing public chunk must not replace the working shell.
    const failedUpdate = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); const worker = registration.installing;
      if (!worker) return "already-finished";
      if (worker.state === "redundant") return worker.state;
      return new Promise((resolve) => { worker.addEventListener("statechange", () => { if (["activated", "redundant"].includes(worker.state)) resolve(worker.state); }); setTimeout(() => resolve("timeout"), 10000); });
    });
    assert.ok(["redundant", "already-finished"].includes(failedUpdate), `failed update did not settle: ${failedUpdate}`);
    const oldShell = await page.evaluate(async (shell) => (await (await caches.open("bloom-local-shell-v1")).match(shell)).text(), local);
    assert.match(oldShell, /name="bloom-test-version" content="1"/);
    version = 3;
    const successfulUpdate = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); const worker = registration.installing;
      if (!worker) return "already-finished";
      if (["activated", "redundant"].includes(worker.state)) return worker.state;
      return new Promise((resolve) => { worker.addEventListener("statechange", () => { if (["activated", "redundant"].includes(worker.state)) resolve(worker.state); }); setTimeout(() => resolve("timeout"), 10000); });
    });
    assert.ok(["activated", "already-finished"].includes(successfulUpdate), `successful update did not activate: ${successfulUpdate}`);
    await page.waitForFunction(async (shell) => { const cache = await caches.open("bloom-local-shell-v1"); const response = await cache.match(shell); return response && (await response.text()).includes('name="bloom-test-version" content="3"'); }, local, { timeout: 30_000 });
    console.log("PASS: failed and successful service-worker updates preserve a usable public shell and journal data.");
  }
  const cacheEntries = await page.evaluate(async () => Promise.all((await caches.keys()).map(async (name) => ({ name, urls: (await (await caches.open(name)).keys()).map((request) => request.url) }))));
  const allUrls = cacheEntries.flatMap((item) => item.urls);
  assert.ok(allUrls.some((url) => url === local));
  const rootPath = new URL(base).pathname;
  assert.ok(allUrls.every((url) => { const entry = new URL(url); const path = entry.pathname; return url === local || path.startsWith(`${rootPath}_next/static/`) || path === `${rootPath}images/bloom-landscape.png` || path.startsWith(`${rootPath}icons/`); }), "cache contains only the generic local shell and public assets");
  const cachedHtml = await page.evaluate(async (url) => (await (await caches.open("bloom-local-shell-v1")).match(url)).text(), local);
  assert.doesNotMatch(cachedHtml, /RISK-ONE|Protected my focus|NEVER-CACHE-PRIVATE-API/);
  await context.setOffline(true); await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Browser journal ready offline", { exact: true }).waitFor({ timeout: 20_000 });
  if (!external) assert.equal(await page.locator('meta[name="bloom-test-version"]').getAttribute("content"), "3");
  await page.getByLabel("Edit RISK-ONE trade").click(); await page.locator(".attachment-editor-card .attachment-preview-btn img").waitFor(); assert.equal(await page.locator(".attachment-editor-card").count(), 1); await close();
  await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
  await page.getByLabel("Asset / symbol").fill("OFFLINE-NEW"); await page.getByLabel("Net P&L (USD)").fill("25"); await page.getByRole("button", { name: /OPTIONAL DETAILS/ }).click();
  await page.locator(".upload-image input").setInputFiles({ name: "new-offline.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save trade", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" });
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByLabel("Edit OFFLINE-NEW trade").waitFor();
  await openSettings("Data");
  const [offlineDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const offlineFile = join(temp, "offline.json"); await offlineDownload.saveAs(offlineFile);
  const offlineBackup = JSON.parse(readFileSync(offlineFile, "utf8")); assert.equal(offlineBackup.images.length, 2); assert.ok(offlineBackup.journal.trades.some((trade) => trade.symbol === "OFFLINE-NEW"));
  await page.locator(".file-button input").setInputFiles(backupFile); await page.locator(".modal").waitFor({ state: "detached" });
  await page.reload({ waitUntil: "domcontentloaded" }); assert.equal(await page.getByLabel("Edit OFFLINE-NEW trade").count(), 0); await page.getByLabel("Edit RISK-ONE trade").click(); await page.locator(".attachment-editor-card .attachment-preview-btn img").waitFor(); await close();
  await openSettings("Data"); assert.match(await page.locator(".backup-reminder-settings").innerText(), /No backup download started/); await close();
  // Exercise Patience offline: green-to-red giveback mirror, walk-away session log, privacy, simulator, and EN/ID toggle.
  await page.getByLabel("Filter by trading account").selectOption({ label: "Swing account" });
  for (const [symbol, pnl] of [["SWING-PEAK", "250"], ["SWING-TILT", "-220"]]) {
    await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
    await page.getByLabel("Asset / symbol").fill(symbol); await page.getByLabel("Net P&L (USD)").fill(pnl);
    await page.getByRole("button", { name: "Save trade", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" });
  }
  await navigate("Patience");
  assert.match(await page.locator(".patience-today-strip").innerText(), /\+\$190\.00/);
  assert.match(await page.locator(".patience-today-strip").innerText(), /[−-]\$30\.00/);
  await page.getByLabel("Comfort trades / day").selectOption("2");
  assert.match(await page.locator(".patience-view").innerText(), /reduced net P&L by \$220\.00/);
  assert.match(await page.locator(".patience-giveback-list").innerText(), /Green → Red/);
  await page.getByLabel("Hide amounts").click();
  assert.doesNotMatch(await page.locator(".patience-today-strip").innerText(), /\$190\.00|\$30\.00/);
  assert.match(await page.locator(".patience-today-strip").innerText(), /••••••/);
  await page.getByLabel("Show amounts").click();
  await page.getByRole("button", { name: "Use my journal stats", exact: true }).click();
  assert.match(await page.locator(".patience-preset-note").innerText(), /Applied from your visible trades/);
  await page.getByLabel("Short note to self (optional)").fill("Stepped back to protect tomorrow.");
  await page.getByRole("button", { name: "End today’s session", exact: true }).click();
  await page.getByText("Session closed for today", { exact: true }).waitFor();
  await page.getByRole("group", { name: "Patience page language" }).getByRole("button", { name: "ID", exact: true }).click();
  await page.getByText("Tenangkan diri sebelum klik berikutnya.", { exact: true }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await navigate("Patience");
  await page.getByText("Tenangkan diri sebelum klik berikutnya.", { exact: true }).waitFor();
  await page.getByText("Sesi hari ini ditutup", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Lihat hari/ }).first().click();
  await page.locator('.view-motion[data-view="Trade journal"]').waitFor();
  assert.match(await page.locator(".selected-day").innerText(), /Showing/);
  console.log("PASS: Patience reset, green-to-red giveback mirror, walk-away log, simulator, and EN/ID toggle work offline.");

  // Exercise Account Starting Balance & Realized Balance (excluding sample trades).
  await navigate("Overview");
  await page.getByLabel("Filter by trading account").selectOption({ label: "Swing account" });
  await openSettings("Accounts");
  const swingCard = page.locator(".account-card-item").filter({ hasText: "Swing account" });
  await swingCard.getByRole("button", { name: /Set \/ Edit|Edit/ }).click();
  await swingCard.getByLabel("Starting balance (USD, optional)").fill("5000");
  await swingCard.getByRole("button", { name: "Save", exact: true }).click();
  await swingCard.getByText(/Start \$5,000\.00/).waitFor();
  await close();
  // Swing account has -60 + 250 - 220 = -30.00 realized net on real trades -> $4,970.00 current balance!
  assert.match(await page.locator(".balance-banner").innerText(), /\$5,000\.00/);
  assert.match(await page.locator(".balance-banner").innerText(), /\$4,970\.00/);
  await page.getByLabel("Hide amounts").click();
  assert.doesNotMatch(await page.locator(".balance-banner").innerText(), /\$5,000\.00|\$4,970\.00/);
  assert.match(await page.locator(".balance-banner").innerText(), /••••••/);
  await page.getByLabel("Show amounts").click();
  console.log("PASS: Account starting balance, realized current balance (excluding samples), and privacy work.");

  // Exercise Full App Bilingual Mode (EN <-> ID) across views at 360px offline.
  await openSettings("General");
  await page.locator(".settings-lang-switch").getByRole("button", { name: "Indonesia", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.lang), "id");
  await page.getByRole("heading", { name: "Pengaturan" }).waitFor();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.locator(".modal").waitFor({ state: "detached" });
  assert.match(await page.locator(".balance-banner").innerText(), /Saldo awal/i);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360, "Overview ID fits 360px");
  await page.locator(".mobile-bottom-nav").getByRole("button", { name: "Jurnal", exact: true }).click();
  await page.locator('.view-motion[data-view="Trade journal"]').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360, "Journal ID fits 360px");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), "id");
  // Switch back to English via the mobile drawer language switcher.
  await page.locator(".mobile-bottom-nav").getByRole("button", { name: "Lainnya", exact: true }).click();
  await page.locator(".sidebar-mobile-lang").getByRole("button", { name: "English", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
  await page.getByLabel("Close navigation").first().click();
  console.log("PASS: Full app bilingual EN/ID localization persists and fits 360px without overflow.");

  // Exercise Spinning Cassette Music Player: 5-song quota, persistent playback across views, and Stop reset.
  function makePlayableWavBuffer(durationSec = 1.5) {
    const sampleRate = 8000;
    const numSamples = Math.floor(sampleRate * durationSec);
    const dataBytes = numSamples * 2;
    const buf = Buffer.alloc(44 + dataBytes);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + dataBytes, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(1, 22); // Mono
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(dataBytes, 40);
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 4000);
      buf.writeInt16LE(sample, 44 + i * 2);
    }
    return buf;
  }
  const wavBuf = makePlayableWavBuffer(1.8);
  await page.locator(".cassette-top-btn").click();
  await page.getByRole("heading", { name: "Cassette player" }).waitFor();
  for (let i = 1; i <= 5; i++) {
    await page.locator(".cassette-add-btn input").setInputFiles({
      name: `calm-session-${i}.wav`,
      mimeType: "audio/wav",
      buffer: wavBuf,
    });
    await page.getByText(`${i} / 5 songs`, { exact: false }).waitFor();
  }
  assert.equal(await page.locator(".cassette-tracklist > li").count(), 5);
  assert.equal(await page.locator(".cassette-add-btn input").isDisabled(), true, "6th song upload disabled at 5/5 cap");
  await page.getByLabel("Remove calm session 5").click();
  await page.getByText("4 / 5 songs", { exact: false }).waitFor();
  assert.equal(await page.locator(".cassette-tracklist > li").count(), 4);
  assert.equal(await page.locator(".cassette-add-btn input").isDisabled(), false);

  await page.locator(".cassette-play-btn").click();
  await page.locator(".cassette-shell.status-playing").waitFor();
  assert.equal(await page.locator(".cassette-reel-svg.is-spinning").count(), 2);
  await close();
  // Navigate across views and verify audio element stays mounted & playing!
  await navigate("Calendar");
  await navigate("Overview");
  assert.equal(await page.locator(".cassette-top-btn.is-playing").count(), 1, "playback persists across view changes");
  await page.locator(".cassette-top-btn").click();
  await page.locator(".modal").getByLabel("Stop", { exact: true }).click();
  assert.equal(await page.locator(".cassette-reel-svg.is-spinning").count(), 0, "Stop halts cassette reel spin");
  assert.equal(await page.locator(".cassette-timeline > span").first().innerText(), "0:00");
  await close();
  console.log("PASS: Spinning cassette deck enforces 5-song cap, persists audio across views, and stops cleanly.");

  // Exercise Visual Chartbook, In-App Zoom Lightbox & Before/After Stage Tags + Backup/Restore preservation.
  await page.getByLabel("Filter by trading account").selectOption("all");
  await navigate("Trade journal");
  if (await page.locator(".selected-day").count()) {
    await page.getByLabel("Clear selected day").click();
  }
  await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
  await page.getByLabel("Asset / symbol").fill("CHART-PAIR");
  await page.getByLabel("Net P&L (USD)").fill("180");
  await page.getByLabel("Setup", { exact: true }).fill("London Sweep");
  await page.getByLabel("Notes", { exact: true }).fill("Waited calmly for liquidity sweep.");
  await page.getByRole("button", { name: /OPTIONAL DETAILS/ }).click();
  await page.getByLabel("Initial risk (USD)").fill("60");
  await page.locator(".upload-image input").setInputFiles([
    { name: "before-setup.png", mimeType: "image/png", buffer: png },
    { name: "after-exit.png", mimeType: "image/png", buffer: png },
  ]);
  await page.getByRole("group", { name: "Chart stage for before-setup.png" }).getByRole("button", { name: "Before", exact: true }).click();
  await page.getByLabel("Caption for before-setup.png").fill("Clean H4 sweep before London open");
  await page.getByRole("group", { name: "Chart stage for after-exit.png" }).getByRole("button", { name: "After", exact: true }).click();
  await page.getByLabel("Caption for after-exit.png").fill("Target hit cleanly at HTF resistance");

  // Preview inside TradeModal via in-app Lightbox; Escape must close ONLY Lightbox, keeping TradeModal open!
  await page.getByLabel("Zoom before-setup.png").click();
  await page.getByRole("dialog", { name: "Chart viewer" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Chart viewer" }).waitFor({ state: "detached" });
  assert.equal(await page.locator(".modal").count(), 1, "Escape inside nested Lightbox keeps TradeModal open");
  await page.getByRole("button", { name: "Save trade", exact: true }).click();
  await page.locator(".modal").waitFor({ state: "detached" });

  // Open Lightbox directly from TradeTable screenshot pill
  await page.getByLabel("View 2 chart screenshots for CHART-PAIR").click();
  const viewer = page.getByRole("dialog", { name: "Chart viewer" });
  await viewer.waitFor();
  assert.match(await viewer.innerText(), /1 of 2/);
  assert.match(await viewer.innerText(), /\+\$180\.00/);
  assert.match(await viewer.innerText(), /\+3\.00R/);
  assert.match(await viewer.innerText(), /Clean H4 sweep before London open/);
  await viewer.getByRole("button", { name: "2 · After", exact: true }).click();
  assert.match(await viewer.innerText(), /2 of 2/);
  assert.match(await viewer.innerText(), /Target hit cleanly at HTF resistance/);
  await viewer.getByRole("button", { name: "1.75×", exact: true }).click();
  assert.equal(await viewer.locator(".chart-lightbox-viewport.is-zoomed").count(), 1);
  await page.keyboard.press("Escape");
  await viewer.waitFor({ state: "detached" });

  // Switch Trade journal to Chartbook gallery, filter stages, check privacy & 360px layout
  await page.getByRole("group", { name: "Journal view mode" }).getByRole("button", { name: /Chartbook/ }).click();
  await page.locator(".chartbook-section").waitFor();
  assert.equal(await page.locator(".chartbook-card").count(), 3, "2 tagged on CHART-PAIR + 1 untagged on RISK-ONE");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360, "Chartbook fits 360px cleanly");
  await page.getByRole("group", { name: "Filter by chart stage" }).getByRole("button", { name: /^Before/ }).click();
  assert.equal(await page.locator(".chartbook-card").count(), 1);
  await page.getByLabel("Hide amounts").click();
  assert.doesNotMatch(await page.locator(".chartbook-section").innerText(), /\$180\.00/);
  assert.match(await page.locator(".chartbook-section").innerText(), /••••••/);
  assert.match(await page.locator(".chartbook-section").innerText(), /\+3\.00R/);
  await page.getByLabel("Show amounts").click();

  // Verify stage & caption survive full JSON Backup + Restore (stageBackupImages)
  await openSettings("Data");
  const [chartBackupDl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  const chartBackupPath = join(temp, "chartbook-backup.json");
  await chartBackupDl.saveAs(chartBackupPath);
  await page.locator(".file-button input").setInputFiles(chartBackupPath);
  await page.locator(".modal").waitFor({ state: "detached" });
  await page.getByRole("group", { name: "Filter by chart stage" }).getByRole("button", { name: /^After/ }).click();
  assert.equal(await page.locator(".chartbook-card").count(), 1, "After stage preserved across backup restore");
  assert.match(await page.locator(".chartbook-card").innerText(), /Target hit cleanly at HTF resistance/);
  console.log("PASS: Visual Chartbook, In-App Zoom Lightbox, Before/After stage tags & captions, and backup/restore metadata preservation work offline.");

  // Exercise Tahap B: Smart Entry Chips, 1-Click Plan Adherence, Good Loss vs Bad Win Matrix & Session/Tag/Playbook Breakdown.
  // 1) Log a Bad Win (+90, risk 45 -> +2.00R) using quick-pick symbol chip, Off-plan pill, M15, New York, and #fomo + #early-exit tag chips
  await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
  await page.getByRole("group", { name: "Recent tickers" }).getByRole("button", { name: "CHART-PAIR", exact: true }).click();
  assert.equal(await page.getByLabel("Asset / symbol").inputValue(), "CHART-PAIR");
  await page.getByLabel("Net P&L (USD)").fill("90");
  await page.getByRole("group", { name: "Did this trade follow your plan?" }).getByRole("button", { name: "Off-plan", exact: true }).click();
  await page.getByRole("button", { name: /OPTIONAL DETAILS/ }).click();
  await page.getByLabel("Initial risk (USD)").fill("45");
  await page.getByRole("group", { name: "Chart intervals" }).getByRole("button", { name: "M15", exact: true }).click();
  await page.getByRole("group", { name: "Market hours" }).getByRole("button", { name: "New York", exact: true }).click();
  await page.getByRole("group", { name: "Keyword chips" }).getByRole("button", { name: "#fomo", exact: true }).click();
  await page.getByRole("group", { name: "Keyword chips" }).getByRole("button", { name: "#early-exit", exact: true }).click();
  assert.match(await page.getByLabel("Tags").inputValue(), /fomo.*early-exit/);
  await page.getByRole("button", { name: "Save trade", exact: true }).click();
  await page.locator(".modal").waitFor({ state: "detached" });

  // 2) Log a Good Loss (-50, risk 50 -> -1.00R) using Playbook Checklist "Check all" helper & London session
  await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
  await page.getByLabel("Asset / symbol").fill("GOOD-LOSS-ONE");
  await page.getByLabel("Net P&L (USD)").fill("-50");
  await page.getByRole("button", { name: /OPTIONAL DETAILS/ }).click();
  await page.getByLabel("Initial risk (USD)").fill("50");
  await page.getByRole("group", { name: "Market hours" }).getByRole("button", { name: "London", exact: true }).click();
  await page.getByRole("button", { name: "Check all", exact: true }).click();
  assert.match(await page.locator(".checklist-live-count").innerText(), /\(7\/7\)/);
  await page.getByRole("button", { name: "Save trade", exact: true }).click();
  await page.locator(".modal").waitFor({ state: "detached" });

  // 3) Inspect Analytics: Good Loss vs Bad Win 2x2 matrix + Session / Tag / Playbook breakdown tabs + 360px fit + Privacy
  await navigate("Analytics");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360, "Analytics with 2x2 Matrix & 7 breakdown tabs fits 360px");
  assert.match(await page.locator(".process-score-pill").innerText(), /50% plan followed/);
  assert.match(await page.locator(".process-quadrant.good-loss").innerText(), /[−-]\$50\.00/);
  assert.match(await page.locator(".process-quadrant.good-loss").innerText(), /[−-]1\.00R avg/);
  assert.match(await page.locator(".process-quadrant.bad-win").innerText(), /\+\$90\.00/);
  assert.match(await page.locator(".process-quadrant.bad-win").innerText(), /\+2\.00R avg/);

  await page.locator(".breakdown-tabs").getByRole("button", { name: "Session", exact: true }).click();
  assert.match(await page.locator(".breakdown-list").innerText(), /New York/);
  assert.match(await page.locator(".breakdown-list").innerText(), /London/);

  await page.locator(".breakdown-tabs").getByRole("button", { name: "Tag", exact: true }).click();
  assert.match(await page.locator(".breakdown-list").innerText(), /#fomo/);
  assert.match(await page.locator(".breakdown-list").innerText(), /#early-exit/);

  await page.locator(".breakdown-tabs").getByRole("button", { name: "Playbook", exact: true }).click();
  assert.match(await page.locator(".breakdown-list").innerText(), /Followed plan/);
  assert.match(await page.locator(".breakdown-list").innerText(), /Off-plan/);

  await page.getByLabel("Hide amounts").click();
  assert.doesNotMatch(await page.locator(".process-matrix-card").innerText(), /\$50\.00|\$90\.00/);
  assert.match(await page.locator(".process-matrix-card").innerText(), /••••••/);
  assert.match(await page.locator(".process-matrix-card").innerText(), /\+2\.00R avg/);
  await page.getByLabel("Show amounts").click();
  console.log("PASS: Smart Entry Chips, 1-Click Plan Adherence, Good Loss vs Bad Win 2x2 Matrix, and Session/Tag/Playbook analytics work offline.");
  if (!external) {
    const didFetch = await page.evaluate((url) => fetch(url).then(() => true).catch(() => false), new URL("api/private-test", base).href); assert.equal(didFetch, false, "API responses must not be cached");
  }
  assert.deepEqual(errors, []);
  console.log("PASS: offline reload, trades, screenshots, backup/restore and cache privacy on Android-sized Chromium.");
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done)); rmSync(temp, { recursive: true, force: true });
}
