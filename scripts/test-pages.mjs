import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(project, "out");
const basePath = "/nihtlouw-comfort-trade-journal/";
const browserPath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
assert.ok(existsSync(browserPath), "Set CHROME_PATH to an installed Chrome/Chromium executable.");
assert.ok(existsSync(join(root, "index.html")), "Run npm run build:pages first.");
const profile = mkdtempSync(join(tmpdir(), "bloom-ui-test-"));
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (!pathname.startsWith(basePath)) { response.writeHead(404).end(); return; }
    let file = resolve(root, pathname.slice(basePath.length) || "index.html");
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    if (pathname.endsWith("/") && file !== join(root, "index.html")) file = join(file, "index.html");
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".json": "application/json" };
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let socket;
const delay = (ms) => new Promise((ready) => setTimeout(ready, ms));
async function waitFor(check, label) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}

try {
  const activePortFile = join(profile, "DevToolsActivePort");
  await waitFor(() => existsSync(activePortFile), "Chrome startup");
  const port = readFileSync(activePortFile, "utf8").split("\n")[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await once(socket, "open");
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  const apiRequests = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const promise = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) promise?.reject(new Error(message.error.message));
      else promise?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent" && new URL(message.params.request.url).pathname.includes("/api/")) apiRequests.push(message.params.request.url);
    if (message.method === "Page.javascriptDialogOpening") void command("Page.handleJavaScriptDialog", { accept: true });
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  const ready = () => waitFor(() => evaluate('!!document.querySelector(".app-shell")'), "journal UI");
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command("Page.navigate", { url: process.env.PAGES_TEST_URL ?? origin + basePath });
  await ready();
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".sidebar")).position'), "sticky", "CSS loads");
  assert.equal(await evaluate('document.querySelectorAll(".trade-row").length'), 4);
  console.log("PASS: UI, CSS, JavaScript and sample trades load at the repository base path.");

  await evaluate('document.querySelector(".new-trade-button").click()');
  await waitFor(() => evaluate('!!document.querySelector(".modal-form")'), "trade modal");
  await evaluate(`(() => {
    const set = (selector, value) => {
      const input = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set('input[placeholder="e.g. EUR/USD"]', 'UI-TEST');
    set('input[type="number"]', '123.45');
  })()`);
  await evaluate('document.querySelector(".modal-form").requestSubmit()');
  await waitFor(() => evaluate('!document.querySelector(".modal") && document.body.innerText.includes("UI-TEST")'), "save trade");
  await command("Page.reload");
  await ready();
  assert.ok(await evaluate('document.body.innerText.includes("UI-TEST")'), "trade persists after reload");
  await evaluate('document.querySelector(".goal-button").click()');
  await waitFor(() => evaluate('JSON.parse(localStorage.getItem("nihtlouw-comfort-trade-journal:v1")).settings.goalProgress === 1'), "goal persistence");
  await command("Page.reload");
  await ready();
  assert.ok(await evaluate('document.querySelector(".goal-progress-label").innerText.includes("1")'));
  console.log("PASS: trade creation and goal changes persist across reloads.");

  await evaluate('document.querySelector(\'[aria-label="Edit UI-TEST trade"]\').click()');
  await waitFor(() => evaluate('!!document.querySelector(".delete-link")'), "edit trade modal");
  await evaluate('document.querySelector(".delete-link").click()');
  await waitFor(() => evaluate('!document.querySelector(".modal") && !document.body.innerText.includes("UI-TEST")'), "delete trade");
  await evaluate('localStorage.setItem("nihtlouw-comfort-trade-journal:v1", "{broken")');
  await command("Page.reload");
  await ready();
  assert.equal(await evaluate('document.querySelectorAll(".trade-row").length'), 4);
  await evaluate('localStorage.setItem("nihtlouw-comfort-trade-journal:v1", JSON.stringify({trades: [], settings: {}}))');
  await command("Page.reload");
  await ready();
  assert.equal(await evaluate('document.querySelectorAll(".trade-row").length'), 4);
  console.log("PASS: deletion works; corrupt and invalid saved data recover safely.");

  await evaluate('Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "SecurityError"); }; document.querySelector(".goal-button").click()');
  await waitFor(() => evaluate('document.body.innerText.includes("Couldn\\\'t save in this browser")'), "blocked storage error");
  assert.ok(await evaluate('document.querySelector(".goal-progress-label").innerText.includes("0")'), "failed save rolls back UI");
  console.log("PASS: blocked browser storage reports an error and rolls back the change.");

  for (const label of ["Trade journal", "Analytics", "Playbook", "Mindset", "Goals", "Overview"]) {
    await evaluate(`Array.from(document.querySelectorAll(".sidebar-nav button")).find(button => button.innerText === ${JSON.stringify(label)}).click()`);
    await waitFor(() => evaluate(`document.querySelector(".breadcrumbs strong").innerText === ${JSON.stringify(label)}`), label);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".sidebar")).position'), "relative");
  console.log("PASS: all journal views and mobile CSS work.");
  assert.deepEqual(errors, [], "no uncaught browser errors");
  assert.deepEqual(apiRequests, [], "Pages must not call unavailable server APIs");
  console.log("PASS: no uncaught browser errors or backend API requests.");
} finally {
  socket?.close();
  browser.kill();
  server.close();
  await delay(1000);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}