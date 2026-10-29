// End-to-end tests must use a disposable local private server and database.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
const supplied = process.env.BLOOM_TEST_URL;
if (!supplied || !["localhost", "127.0.0.1"].includes(new URL(supplied).hostname)) throw new Error("Set BLOOM_TEST_URL to a local server backed by a disposable database.");
const base = new URL(supplied).origin;
const browserPath = process.env.CHROME_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
assert.ok(browserPath && existsSync(browserPath), "Set CHROME_PATH to an installed Chromium executable.");
let browser;
try {
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", (error) => errors.push(error.message)); page.on("dialog", (dialog) => dialog.accept());
  const local = `${base}/local/`;
  await page.goto(local); await page.getByText("Browser journal ready offline", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Log a trade", exact: true }).first().click(); await page.getByLabel("Asset / symbol").fill("LOCAL-ONLY"); await page.getByLabel("Net P&L (USD)").fill("12"); await page.getByRole("button", { name: "Save trade", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" });
  async function signUp(name) {
    await page.goto(base); await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Your name").fill(name); await page.getByLabel("Email address").fill(`${name.toLowerCase()}-${Date.now()}@example.test`); await page.getByLabel("Password").fill("test-password-not-for-production"); await page.getByRole("button", { name: "Create account", exact: true }).click(); await page.locator(".app-shell").waitFor();
  }
  const close = async () => { await page.getByRole("button", { name: "Close", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" }); };
  await signUp("Alpha");
  assert.equal(await page.getByLabel("Edit LOCAL-ONLY trade").count(), 0);
  await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "Risk", exact: true }).click();
  await page.getByLabel("Initial risk per trade (USD)").fill("50"); await page.getByLabel("Daily realized net loss per account (USD)").fill("100"); await page.getByRole("button", { name: "Save limits" }).click(); await page.getByText("Risk limits saved.").waitFor(); await close();
  await page.getByRole("button", { name: "Log a trade", exact: true }).first().click(); await page.getByLabel("Asset / symbol").fill("ALPHA-PRIVATE"); await page.getByLabel("Net P&L (USD)").fill("-110"); await page.getByRole("button", { name: /OPTIONAL DETAILS/ }).click(); await page.getByLabel("Initial risk (USD)").fill("75");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
  await page.locator(".upload-image input").setInputFiles({ name: "alpha-chart.png", mimeType: "image/png", buffer: png });
  assert.match(await page.locator(".draft-risk-notice").innerText(), /daily realized net loss/);
  await page.getByRole("button", { name: "Save trade", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" }); await page.reload({ waitUntil: "networkidle" }); await page.getByLabel("Edit ALPHA-PRIVATE trade").waitFor();
  await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "Data", exact: true }).click(); await page.getByLabel("Backup reminder frequency").selectOption("30");
  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]); await page.getByText(/Last backup download started on this device/).waitFor(); await close();
  await page.getByLabel("Open navigation").click(); await page.locator(".sidebar-nav").getByRole("button", { name: "Patience", exact: true }).click();
  await page.getByLabel("Short note to self (optional)").fill("ALPHA-WALKAWAY-SECRET");
  await page.getByRole("button", { name: "End today’s session", exact: true }).click(); await page.getByText("Session closed for today", { exact: true }).waitFor();
  await page.getByRole("group", { name: "Patience page language" }).getByRole("button", { name: "ID", exact: true }).click(); await page.getByText("Sesi hari ini ditutup", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Open navigation").click(); await page.locator(".sidebar-nav").getByRole("button", { name: "Patience", exact: true }).click();
  await page.getByText("Sesi hari ini ditutup", { exact: true }).waitFor(); assert.match(await page.locator(".patience-view").innerText(), /ALPHA-WALKAWAY-SECRET/);
  await page.getByLabel("Open navigation").click(); await page.locator(".sidebar-nav").getByRole("button", { name: "Weekly review", exact: true }).click();
  assert.match(await page.locator(".risk-review").innerText(), /ALPHA-PRIVATE/); assert.match(await page.locator(".risk-review").innerText(), /\$100\.00/);
  const privateKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("bloom:backup-reminder:v1:private")));
  assert.equal(privateKeys.length, 1); assert.ok(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).lastDownloadAt > 0, privateKeys[0]));
  const urls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) => (await (await caches.open(key)).keys()).map((request) => request.url)))).flat());
  assert.ok(urls.every((url) => !url.includes("/api/") && url !== `${base}/`), "only the local shell is a cached navigation");
  // The single cached navigation is /local/, never the authenticated root.
  assert.ok(!urls.includes(`${base}/`));
  const shell = await page.evaluate(async (url) => (await (await caches.open("bloom-local-shell-v1")).match(url)).text(), local);
  assert.doesNotMatch(shell, /ALPHA-PRIVATE|alpha-chart|ALPHA-WALKAWAY-SECRET/);
  await context.setOffline(true); await page.getByText("Private sync needs a connection.").waitFor();
  await page.getByLabel("Edit ALPHA-PRIVATE trade").click(); await page.getByLabel("Notes", { exact: true }).fill("This must not save offline"); await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.locator(".toast-error").waitFor(); assert.equal(await page.locator(".modal").count(), 1); await close();
  const privateProbe = await context.newPage();
  let privateReloaded = true; try { await privateProbe.goto(base, { waitUntil: "domcontentloaded", timeout: 5000 }); } catch { privateReloaded = false; }
  assert.equal(privateReloaded, false, "private account HTML must not be available offline"); await privateProbe.close();
  await page.goto(local, { waitUntil: "domcontentloaded" }); await page.getByLabel("Edit LOCAL-ONLY trade").waitFor(); assert.equal(await page.getByLabel("Edit ALPHA-PRIVATE trade").count(), 0);
  await context.setOffline(false); await page.goto(base); await page.getByLabel("Edit ALPHA-PRIVATE trade").click(); assert.equal(await page.getByLabel("Notes", { exact: true }).inputValue(), ""); await page.locator(".attachment-editor-card .attachment-preview-btn img").waitFor(); await close();
  await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  await signUp("Beta"); assert.equal(await page.getByLabel("Edit ALPHA-PRIVATE trade").count(), 0);
  await page.getByLabel("Open navigation").click(); await page.locator(".sidebar-nav").getByRole("button", { name: "Patience", exact: true }).click();
  assert.doesNotMatch(await page.locator(".patience-view").innerText(), /ALPHA-WALKAWAY-SECRET/);
  assert.equal(await page.getByText("Slow down before the next click.", { exact: true }).count(), 1);
  await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "Data", exact: true }).click();
  assert.match(await page.locator(".backup-reminder-settings").innerText(), /No backup download started/); assert.equal(await page.getByLabel("Backup reminder frequency").inputValue(), "7");
  const after = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("bloom:backup-reminder:v1:private"))); assert.equal(after.length, 2); assert.notEqual(after[0], after[1]);
  assert.deepEqual(errors, []);
  console.log("PASS: private risk settings, weekly review, per-user backup tracking, offline isolation and public-only service-worker caching.");
} finally { if (browser) await browser.close(); }
