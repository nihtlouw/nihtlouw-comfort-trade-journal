/**
 * Route-boundary tests.
 *
 * These cover the gate that the scorecard called the single biggest coverage gap:
 * every private API route must refuse anonymous callers, refuse cross-origin
 * mutations, refuse oversized bodies, and gate paid surface behind the Pro
 * entitlement — before it touches the database.
 *
 * Each route module imports `@/lib/auth`, `@/db` and `@/lib/server-billing` lazily
 * inside the handler, which lets us stub those modules here and exercise the HTTP
 * contract without a live PostgreSQL instance. Nothing is mocked that the test is
 * asserting: status codes, guards and ordering are the real implementation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { statSync } from "node:fs";

const ROOT = new URL("../", import.meta.url).href;

// ── Stub table ──────────────────────────────────────────────────────────────
// `session` is null to simulate an anonymous caller. `pro` controls entitlement.
const state = { session: null as null | { user: { id: string; name: string; email: string } }, pro: false, dbCalls: 0 };

const stubSources: Record<string, string> = {
  "@/lib/auth": `
    export const auth = {
      api: {
        getSession: async () => globalThis.__bloomTestState.session,
      },
    };
    export function isAllowedMutation(request) {
      const origin = request.headers.get("origin");
      const allowed = globalThis.__bloomTestAllowedOrigin;
      return !!origin && origin === allowed;
    }
  `,
  "@/lib/server-billing": `
    export async function hasCloudSyncAccess() {
      return globalThis.__bloomTestState.pro;
    }
  `,
  "@/db": `
    const boom = () => { globalThis.__bloomTestState.dbCalls++; throw new Error("database must not be reached"); };
    export const db = { select: boom, insert: boom, update: boom, delete: boom, execute: boom, transaction: boom };
    export const pool = {};
  `,
  "@/db/schema": `
    const tbl = (name) => new Proxy({ __table: name }, { get: (_t, prop) => ({ __col: String(prop), __table: name }) });
    export const user = tbl("user"); export const session = tbl("session"); export const account = tbl("account");
    export const verification = tbl("verification"); export const rateLimit = tbl("rateLimit");
    export const privateJournals = tbl("privateJournals"); export const journalImages = tbl("journalImages");
    export const audioTracks = tbl("audioTracks"); export const audioChunks = tbl("audioChunks");
    export const strategyDocuments = tbl("strategyDocuments"); export const subscriptions = tbl("subscriptions");
    export const billingEvents = tbl("billingEvents"); export const trades = tbl("trades");
    export const journalSettings = tbl("journalSettings");
  `,
  "@/lib/journal-data": `
    export function normalizeJournalData(data) { return data; }
    export function isDate() { return true; }
  `,
  "@/lib/server-journal": `
    export async function getPrivateJournal() { return { data: {}, revision: 0 }; }
    export async function updatePrivateJournal() { return { revision: 1 }; }
  `,
  "@/lib/demo-data": `export function createDemoData() { return { settings: { name: "test" } }; }`,
  "@/lib/audio": `
    export const ALLOWED_AUDIO_MIMES = ["audio/mpeg"];
    export function audioErrorMessage() { return "invalid audio"; }
    export function validateAudioHeader() { return true; }
    export function cleanTrackTitle(n) { return String(n); }
  `,
  "@/lib/attachments": `export async function validateImage() { return "image/png"; }`,
  "@/lib/object-storage": `
    export function getObjectStorageConfig() { return null; }
    export async function putCloudObject() {}
    export async function deleteCloudObject() {}
    export async function getCloudObject() { return new Uint8Array(); }
    export function signS3Request() { return {}; }
  `,
  "@/lib/strategy-library": `export async function validatePdfBlob() { return 1; }`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in stubSources) {
      return { url: `bloom-stub:${specifier}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      // Mirror the tsconfig "@/*" -> "./src/*" alias, resolving extensionless imports.
      const base = specifier.replace("@/", "src/");
      for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
        try {
          statSync(new URL(candidate, ROOT));
          return { url: new URL(candidate, ROOT).href, shortCircuit: true };
        } catch {
          /* try the next extension */
        }
      }
      return { url: new URL(base, ROOT).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("bloom-stub:")) {
      return { format: "module", source: stubSources[url.slice("bloom-stub:".length)], shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

(globalThis as unknown as { __bloomTestState: typeof state }).__bloomTestState = state;
(globalThis as unknown as { __bloomTestAllowedOrigin: string }).__bloomTestAllowedOrigin = "https://bloom.test";

// Provide the env the routes assert on before importing them.
process.env.DATABASE_URL = "postgres://stub/stub";
process.env.BETTER_AUTH_URL = "https://bloom.test";
process.env.MIDTRANS_SERVER_KEY = "server-key";
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "whsec_test";

const ORIGIN = "https://bloom.test";

function jsonRequest(url: string, init: RequestInit & { body?: string } = {}) {
  return new Request(url, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
}

const SESSION = { user: { id: "user-1", name: "Ada", email: "ada@example.com" } };

async function load(module: string) {
  return import(/* @vite-ignore */ new URL(`src/app/api/${module}/route.ts`, ROOT).href);
}

// ── /api/journal ────────────────────────────────────────────────────────────

test("GET /api/journal rejects anonymous callers with 401", async () => {
  state.session = null;
  const { GET } = await load("journal");
  const response = await GET(jsonRequest(`${ORIGIN}/api/journal`));
  assert.equal(response.status, 401);
});

test("GET /api/journal rejects signed-in users without Pro with 402", async () => {
  state.session = SESSION;
  state.pro = false;
  const { GET } = await load("journal");
  const response = await GET(jsonRequest(`${ORIGIN}/api/journal`));
  assert.equal(response.status, 402);
  assert.match((await response.json()).error, /Pro subscription/);
});

test("PUT /api/journal rejects a cross-origin mutation with 403 before auth", async () => {
  state.session = SESSION;
  state.pro = true;
  const { PUT } = await load("journal");
  const response = await PUT(jsonRequest(`${ORIGIN}/api/journal`, {
    method: "PUT",
    headers: { origin: "https://evil.example" },
    body: JSON.stringify({ revision: 0, data: {} }),
  }));
  assert.equal(response.status, 403);
});

test("PUT /api/journal rejects an oversized body with 413", async () => {
  state.session = SESSION;
  state.pro = true;
  const { PUT } = await load("journal");
  const huge = "_".repeat(5_000_001);
  const response = await PUT(jsonRequest(`${ORIGIN}/api/journal`, {
    method: "PUT",
    headers: { origin: ORIGIN },
    body: JSON.stringify({ revision: 0, data: { name: huge } }),
  }));
  assert.equal(response.status, 413);
});

test("PUT /api/journal rejects a non-integer revision with 400", async () => {
  state.session = SESSION;
  state.pro = true;
  const before = state.dbCalls;
  const { PUT } = await load("journal");
  const response = await PUT(jsonRequest(`${ORIGIN}/api/journal`, {
    method: "PUT",
    headers: { origin: ORIGIN },
    body: JSON.stringify({ revision: "nope", data: {} }),
  }));
  assert.equal(response.status, 400);
  assert.equal(state.dbCalls, before, "invalid input must be rejected before the database is touched");
});

test("PUT /api/journal accepts a valid same-origin write and returns the new revision", async () => {
  state.session = SESSION;
  state.pro = true;
  const { PUT } = await load("journal");
  const response = await PUT(jsonRequest(`${ORIGIN}/api/journal`, {
    method: "PUT",
    headers: { origin: ORIGIN },
    body: JSON.stringify({ revision: 0, data: {} }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 1);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

// ── /api/audio (paid surface) ───────────────────────────────────────────────

test("POST /api/audio requires sign-in (401)", async () => {
  state.session = null;
  const { POST } = await load("audio");
  const response = await POST(jsonRequest(`${ORIGIN}/api/audio`, { method: "POST", headers: { origin: ORIGIN }, body: "{}" }));
  assert.equal(response.status, 401);
});

test("POST /api/audio requires the Pro entitlement (402)", async () => {
  state.session = SESSION;
  state.pro = false;
  const { POST } = await load("audio");
  const response = await POST(jsonRequest(`${ORIGIN}/api/audio`, { method: "POST", headers: { origin: ORIGIN }, body: "{}" }));
  assert.equal(response.status, 402, "audio upload must honour the same entitlement as the journal it syncs into");
});

test("PUT /api/audio/[id]/chunk requires the Pro entitlement (402)", async () => {
  state.session = SESSION;
  state.pro = false;
  const { PUT } = await load("audio/[id]/chunk");
  const response = await PUT(
    jsonRequest(`${ORIGIN}/api/audio/a1/chunk?index=0`, {
      method: "PUT",
      headers: { origin: ORIGIN },
      body: new Uint8Array([1, 2, 3]) as unknown as string,
    }),
    { params: Promise.resolve({ id: "a1" }) },
  );
  assert.equal(response.status, 402);
});

test("POST /api/audio/[id]/complete requires the Pro entitlement (402)", async () => {
  state.session = SESSION;
  state.pro = false;
  const { POST } = await load("audio/[id]/complete");
  const response = await POST(jsonRequest(`${ORIGIN}/api/audio/a1/complete`, { method: "POST", headers: { origin: ORIGIN } }), {
    params: Promise.resolve({ id: "a1" }),
  });
  assert.equal(response.status, 402);
});

// ── /api/attachments ────────────────────────────────────────────────────────

test("POST /api/attachments rejects anonymous uploads (401)", async () => {
  state.session = null;
  const { POST } = await load("attachments");
  const response = await POST(jsonRequest(`${ORIGIN}/api/attachments`, { method: "POST", headers: { origin: ORIGIN }, body: "" }));
  assert.equal(response.status, 401);
});

test("POST /api/attachments rejects non-Pro uploads (402)", async () => {
  state.session = SESSION;
  state.pro = false;
  const { POST } = await load("attachments");
  const response = await POST(jsonRequest(`${ORIGIN}/api/attachments`, { method: "POST", headers: { origin: ORIGIN }, body: "" }));
  assert.equal(response.status, 402);
});

// ── Webhooks ────────────────────────────────────────────────────────────────

test("Midtrans webhook rejects a forged signature with 401", async () => {
  const { POST } = await load("billing/webhooks/midtrans");
  const response = await POST(jsonRequest(`${ORIGIN}/api/billing/webhooks/midtrans`, {
    method: "POST",
    body: JSON.stringify({ order_id: "o1", status_code: "200", gross_amount: "49000.00", signature_key: "forged" }),
  }));
  assert.equal(response.status, 401);
});

test("Lemon Squeezy webhook rejects a missing signature with 401", async () => {
  const { POST } = await load("billing/webhooks/lemonsqueezy");
  const response = await POST(jsonRequest(`${ORIGIN}/api/billing/webhooks/lemonsqueezy`, {
    method: "POST",
    body: JSON.stringify({ meta: { event_name: "order_created" } }),
  }));
  assert.equal(response.status, 401);
});

// ── Legacy surface ──────────────────────────────────────────────────────────

test("the legacy shared journal API stays disabled with 410", async () => {
  const { POST, DELETE } = await load("trades");
  const post = await POST(jsonRequest(`${ORIGIN}/api/trades`, { method: "POST", body: "{}" }));
  const del = await DELETE(jsonRequest(`${ORIGIN}/api/trades`, { method: "DELETE" }));
  assert.equal(post.status, 410);
  assert.equal(del.status, 410);
});
