/* Bloom's offline cache is deliberately limited to a generic local shell and
 * immutable public assets. Never cache account HTML, APIs, or screenshots. */
const SHELL_CACHE = "bloom-local-shell-v1";
const STATIC_CACHE = "bloom-public-static-v1";
const scopeUrl = new URL(self.registration.scope);
const base = scopeUrl.pathname;
const shellUrl = new URL("local/", scopeUrl).href;
const localPath = `${base}local`;
const publicImages = ["images/bloom-landscape.png", "icons/bloom-192.png", "icons/bloom-512.png", "icons/bloom-maskable-512.png"];
const publicImagePaths = new Set(publicImages.map((path) => new URL(path, scopeUrl).pathname));

function isPublicAsset(url) {
  return url.origin === scopeUrl.origin && !url.search && (publicImagePaths.has(url.pathname) ||
    (url.pathname.startsWith(`${base}_next/static/`) && /\.(?:js|css|woff2?|ttf|otf|svg|png|webp)$/i.test(url.pathname)));
}
async function cacheAsset(url, cache, refresh = false) {
  const parsed = new URL(url, scopeUrl);
  if (!isPublicAsset(parsed)) throw new Error("Not a public app asset");
  let response = refresh ? undefined : await cache.match(parsed.href);
  if (!response) {
    response = await fetch(parsed.href, { credentials: "omit", cache: "no-cache" });
    if (!response.ok || response.type === "opaque") throw new Error(`Could not cache ${parsed.pathname}`);
    await cache.put(parsed.href, response.clone());
  }
  return response;
}
function decodedHeaders(response) {
  const headers = new Headers(response.headers);
  // Fetch exposes decoded bodies. Do not replay network transfer metadata.
  headers.delete("content-encoding"); headers.delete("content-length"); headers.delete("transfer-encoding");
  return headers;
}
async function updateShell(response) {
  if (!response.ok || response.type === "opaque") throw new Error("Could not load the local shell");
  const finalUrl = new URL(response.url || shellUrl);
  if (finalUrl.origin !== scopeUrl.origin || ![localPath, `${localPath}/`].includes(finalUrl.pathname)) throw new Error("Local shell redirected elsewhere");
  const html = await response.text();
  if (!html.includes("<html")) throw new Error("Invalid local shell");
  const shellCache = await caches.open(SHELL_CACHE);
  const previous = await shellCache.match(shellUrl);
  const shellChanged = !previous || await previous.text() !== html;
  const assets = new Set(publicImages.map((path) => new URL(path, scopeUrl).href));
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1].replace(/&amp;/g, "&"), shellUrl);
    if (isPublicAsset(url)) assets.add(url.href);
  }
  // The HTML must identify its own JS and CSS; an incomplete shell is not saved.
  if (![...assets].some((url) => new URL(url).pathname.endsWith(".js")) || ![...assets].some((url) => new URL(url).pathname.endsWith(".css"))) throw new Error("Local shell assets are missing");
  const cache = await caches.open(STATIC_CACHE);
  const css = [];
  await Promise.all([...assets].map(async (url) => {
    const asset = await cacheAsset(url, cache, shellChanged && publicImagePaths.has(new URL(url).pathname));
    if (new URL(url).pathname.endsWith(".css")) css.push({ url, text: await asset.text() });
  }));
  // Fonts referenced by the cached stylesheets are needed on an offline reload.
  await Promise.all(css.flatMap(({ url, text }) => [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(async (match) => {
    const asset = new URL(match[1], url);
    if (isPublicAsset(asset)) await cacheAsset(asset.href, cache);
  })));
  const headers = decodedHeaders(response);
  // Construct a fresh response so a server redirect from /local/ to /local is
  // never replayed when the app is opened without a network.
  const clean = new Response(html, { status: 200, headers });
  await shellCache.put(shellUrl, clean);
}
async function fetchShell() { return fetch(shellUrl, { credentials: "omit", cache: "no-cache", headers: { Accept: "text/html" } }); }

self.addEventListener("install", (event) => {
  event.waitUntil((async () => { await updateShell(await fetchShell()); await self.skipWaiting(); })());
});
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== scopeUrl.origin) return;
  if (request.mode === "navigate" && [localPath, `${localPath}/`].includes(url.pathname)) {
    const network = fetchShell();
    event.waitUntil(network.then((response) => updateShell(response.clone())).catch(() => {}));
    event.respondWith(network.then((response) => {
      if (!response.ok) throw new Error("Local shell unavailable");
      // Node's /local/ can redirect to /local. A navigation request has manual
      // redirect mode, so hand back a clean response rather than a redirected one.
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: decodedHeaders(response) });
    }).catch(async () => (await caches.open(SHELL_CACHE)).match(shellUrl) || new Response("Open Bloom’s browser-only journal once while online to prepare offline access.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
    return;
  }
  if (isPublicAsset(url)) {
    event.respondWith((async () => {
      let cache;
      try { cache = await caches.open(STATIC_CACHE); const cached = await cache.match(url.href); if (cached) return cached; }
      catch { /* A blocked/full cache must not break online public assets. */ }
      const response = await fetch(url.href, { credentials: "omit" });
      if (cache && response.ok && response.type !== "opaque") { try { await cache.put(url.href, response.clone()); } catch { /* Keep the online response usable. */ } }
      return response;
    })());
  }
});
