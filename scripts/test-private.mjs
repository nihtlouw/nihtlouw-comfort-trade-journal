// Integration smoke test: ONLY use a disposable local database and local server.
import assert from "node:assert/strict";
const base = process.env.BLOOM_TEST_URL;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Set BLOOM_TEST_URL to a local test server backed by a disposable database.");
const origin = new URL(base).origin;
const unique = Date.now().toString(36);
async function signUp(name) {
  const response = await fetch(`${origin}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email: `${name}-${unique}@example.test`, password: "test-password-not-for-production", name }) });
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
}
async function request(path, cookie, options = {}) { return fetch(`${origin}${path}`, { ...options, headers: { ...options.headers, cookie } }); }
const anonymous = await fetch(`${origin}/api/journal`); assert.equal(anonymous.status, 401);
const alice = await signUp("alice"); const bob = await signUp("bob");
const aliceJournal = await (await request("/api/journal", alice)).json(); const bobJournal = await (await request("/api/journal", bob)).json();
assert.equal(aliceJournal.data.settings.name, "alice"); assert.equal(bobJournal.data.settings.name, "bob");
aliceJournal.data.settings.name = "Alice private";
const put = (revision, requestOrigin = origin) => request("/api/journal", alice, { method: "PUT", headers: { "content-type": "application/json", origin: requestOrigin }, body: JSON.stringify({ revision, data: aliceJournal.data }) });
assert.equal((await put(aliceJournal.revision)).status, 200); assert.equal((await put(aliceJournal.revision)).status, 409); assert.equal((await put(aliceJournal.revision + 1, "https://attacker.invalid")).status, 403);
const oversized = await request("/api/journal", alice, { method: "PUT", headers: { "content-type": "application/json", origin }, body: "x".repeat(5_000_001) }); assert.equal(oversized.status, 413);
assert.equal((await (await request("/api/journal", bob)).json()).data.settings.name, "bob");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
const form = new FormData(); form.append("file", new Blob([png], { type: "image/png" }), "chart.png");
const upload = await request("/api/attachments", alice, { method: "POST", headers: { origin }, body: form }); assert.equal(upload.status, 201, await upload.clone().text());
const image = await upload.json(); assert.equal((await request(`/api/attachments/${image.id}`, alice)).status, 200); assert.equal((await request(`/api/attachments/${image.id}`, bob)).status, 404);
assert.equal((await request(`/api/attachments/${image.id}`, bob, { method: "DELETE", headers: { origin } })).status, 404);
assert.equal((await request(`/api/attachments/${image.id}`, alice, { method: "DELETE", headers: { origin } })).status, 200);
// Exercise private /api/audio chunked upload, Range streaming, CSRF, and user isolation.
const wavHeader = Buffer.alloc(64);
wavHeader.write("RIFF", 0); wavHeader.writeUInt32LE(56, 4); wavHeader.write("WAVE", 8); wavHeader.write("fmt ", 12);
assert.equal((await fetch(`${origin}/api/audio`)).status, 401);
assert.equal((await request("/api/audio", alice, { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.invalid" }, body: JSON.stringify({ fileName: "calm.wav", mimeType: "audio/wav", size: wavHeader.length }) })).status, 403);
const initAudio = await request("/api/audio", alice, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ fileName: "calm.wav", mimeType: "audio/wav", size: wavHeader.length }) });
assert.equal(initAudio.status, 201, await initAudio.clone().text());
const { id: audioId } = await initAudio.json();
assert.equal((await request(`/api/audio/${audioId}/chunk?index=0`, alice, { method: "PUT", headers: { "content-type": "application/octet-stream", origin }, body: wavHeader })).status, 200);
assert.equal((await request(`/api/audio/${audioId}/complete`, alice, { method: "POST", headers: { origin } })).status, 200);
const rangeResp = await request(`/api/audio/${audioId}`, alice, { headers: { range: "bytes=0-11" } });
assert.equal(rangeResp.status, 206);
assert.equal((await rangeResp.arrayBuffer()).byteLength, 12);
assert.equal((await request(`/api/audio/${audioId}`, bob)).status, 404);
assert.equal((await request(`/api/audio/${audioId}`, bob, { method: "DELETE", headers: { origin } })).status, 404);
assert.equal((await request(`/api/audio/${audioId}`, alice, { method: "DELETE", headers: { origin } })).status, 200);
assert.equal((await fetch(`${origin}/api/trades`, { method: "DELETE" })).status, 410);
console.log("PASS: private signup, isolation, conflict detection, CSRF checks, image & audio ownership/Range streaming, and disabled legacy API.");
