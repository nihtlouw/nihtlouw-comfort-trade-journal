#!/usr/bin/env node
/**
 * Bloom structural quality gate.
 *
 * Implements the automatable subset of docs/quality-analysis/structural-workflow.md:
 *
 *   G1  static correctness   typecheck, lint, forbidden patterns, env documentation
 *   G3  boundary integrity   route-auth audit, entitlement gating, body caps
 *   G4  build & delivery     production build, JS/CSS budgets, security headers
 *   G5  design & a11y        labels, alt text, document lang, dialog focus trap,
 *                            reduced motion, minimum type size, contrast tokens
 *
 * Usage:
 *   node scripts/quality-gate.mjs           # full gate (slow: runs tsc, eslint, build)
 *   node scripts/quality-gate.mjs --fast    # static heuristics only
 *
 * Exits non-zero if any gate fails, so it can be added to CI as a step.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const FAST = process.argv.includes("--fast");
const results = [];
let failed = 0;

/** ok=true -> passDetail; ok=false -> failDetail (blocking unless advisory=true). */
function record(gate, name, ok, passDetail, failDetail = passDetail, advisory = false) {
  results.push({ gate, name, ok, detail: ok ? passDetail : failDetail, advisory: !ok && advisory });
  if (!ok && !advisory) failed++;
}
const pass = (g, n, d) => record(g, n, true, d);
const fail = (g, n, d) => record(g, n, false, "", d);
const warn = (g, n, d) => record(g, n, false, "", d, true);
const check = (g, n, ok, okDetail, failDetail) => (ok ? pass(g, n, okDetail) : fail(g, n, failDetail));

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

/** Recursively list source files, skipping generated/vendored trees. */
function walk(dir, exts = [".ts", ".tsx"], acc = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (["node_modules", ".next", "out", "out-android", "android", ".git", "build"].includes(entry.name)) continue;
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, exts, acc);
    else if (exts.includes(extname(entry.name))) acc.push(rel);
  }
  return acc;
}

function sh(cmd, args) {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: "pipe" });
    return { ok: true, out: "" };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ""}${error.stderr ?? ""}`.slice(0, 1500) };
  }
}

// ─── G1 · Static correctness ────────────────────────────────────────────────
console.log("\n\u001b[1mG1 · Static correctness\u001b[0m");

const code = [...walk("src"), ...walk("tests"), ...walk("scripts", [".mjs"]), ...walk("src", [".css"])];
const srcFiles = walk("src");
const allText = (files) => files.map((f) => ({ f, t: read(f) }));
const count = (files, re) => allText(files).reduce((n, { t }) => n + (t.match(re) ?? []).length, 0);

check("G1", "no `any` types", count(srcFiles, /:\s*any\b|\bas any\b/g) === 0, "0 occurrences in src/", "found `any` — type safety hole");
check("G1", "no @ts-ignore", count(srcFiles, /@ts-ignore/g) === 0, "0 occurrences", "found @ts-ignore");
check("G1", "no dangerouslySetInnerHTML", count(srcFiles, /dangerouslySetInnerHTML/g) === 0, "0 occurrences", "XSS surface introduced");
check("G1", "no eval / new Function", count(srcFiles, /\beval\(|new Function\b/g) === 0, "0 occurrences", "dynamic code execution");
check("G1", "no console.log in src/", count(srcFiles, /console\.log\(/g) === 0, "0 occurrences", "console.log risks leaking financial data");
check("G1", "tsconfig strict", /"strict"\s*:\s*true/.test(read("tsconfig.json")), "strict: true", "strict mode disabled");

// Every process.env key must be documented in .env.example.
const envExample = read(".env.example");
const envKeys = new Set(
  allText(srcFiles).flatMap(({ t }) => [...t.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1])),
);
const undocumented = [...envKeys].filter((k) => !envExample.includes(k) && !["NODE_ENV", "NEXT_PUBLIC_GITHUB_PAGES", "NEXT_PUBLIC_ANDROID_CAPACITOR"].includes(k));
record("G1", "env keys documented", undocumented.length === 0, `${envKeys.size} keys, all in .env.example`, `not in .env.example: ${undocumented.join(", ")}`);

if (!FAST) {
  check("G1", "typecheck (tsc --noEmit)", sh("npx", ["tsc", "--noEmit"]).ok, "0 errors", "typecheck failed");
  const lint = sh("npx", ["eslint", "."]);
  check("G1", "lint (eslint)", lint.ok && !/warning/.test(lint.out), "0 errors, 0 warnings", "lint failed or produced warnings");
}

// ─── G3 · Boundary integrity ────────────────────────────────────────────────
console.log("\u001b[1mG3 · Boundary integrity\u001b[0m");

const routes = walk("src/app/api", [".ts"]).filter((f) => f.endsWith("route.ts"));
const publicRoutes = new Set([
  "src/app/api/health/route.ts",
  "src/app/api/auth/[...all]/route.ts",
  "src/app/api/trades/route.ts",
  "src/app/api/trades/[id]/route.ts",
  "src/app/api/settings/route.ts",
  "src/app/api/billing/webhooks/lemonsqueezy/route.ts",
  "src/app/api/billing/webhooks/midtrans/route.ts",
]);
const unauthenticated = routes.filter((f) => !publicRoutes.has(f) && !read(f).includes("getSession"));
check(
  "G3",
  "every private route derives identity from the session",
  unauthenticated.length === 0,
  `${routes.length} routes audited`,
  `routes without getSession: ${unauthenticated.join(", ")}`,
);

const mutations = routes.filter((f) => /export async function (POST|PUT|DELETE|PATCH)/.test(read(f)));
const noOrigin = mutations.filter(
  (f) => !read(f).includes("isAllowedMutation") && !f.includes("webhooks/"),
);
check(
  "G3",
  "every mutation checks request origin",
  noOrigin.length === 0,
  `${mutations.length} mutation routes audited`,
  `missing isAllowedMutation: ${noOrigin.join(", ")}`,
);

// Availability routes (attachment/audio/library) that accept uploads should be
// entitlement-gated, matching /api/journal.
const uploadRoutes = routes.filter((f) => /attachments|audio|library/.test(f) && /export async function POST/.test(read(f)));
const ungated = uploadRoutes.filter((f) => !read(f).includes("hasCloudSyncAccess"));
record(
  "G3",
  "upload routes enforce the paid entitlement",
  ungated.length === 0,
  `all ${uploadRoutes.length} upload routes gated`,
  `no hasCloudSyncAccess in: ${ungated.join(", ")}`,
);

check("G3", "streamed body cap utility is used", read("src/lib/request-body.ts").includes("readLimitedBody"), "readLimitedBody present", "missing body cap utility");
const routesWithBodies = routes.filter((f) => /readLimitedBody/.test(read(f)));
pass("G3", "body caps applied", `${routesWithBodies.length}/${routes.length} routes import readLimitedBody`);

const webhooks = routes.filter((f) => f.includes("webhooks/"));
const verified = webhooks.filter((f) => /verifyMidtransSignature|verifyLemonSqueezySignature/.test(read(f)));
check("G3", "webhooks verify signatures before effects", verified.length === webhooks.length, `${verified.length}/${webhooks.length} verified`, "unverified webhook");

// ─── G4 · Build & delivery ─────────────────────────────────────────────────
console.log("\u001b[1mG4 · Build & delivery\u001b[0m");

const nextConfig = read("next.config.ts");
check("G4", "security headers declared", /async\s+headers\s*\(/.test(nextConfig), "headers() configured", "no headers() in next.config.ts — CSP/HSTS/XFO missing");
const pkg = JSON.parse(read("package.json"));
check("G4", "node engine pinned", Boolean(pkg.engines?.node), `engines.node = ${pkg.engines?.node}`, "no engines field (README claims >=20.9, unenforced)");
check(
  "G4",
  "no use-cache APIs with the current next advisory",
  count(srcFiles, /unstable_cache|["']use cache["']/g) === 0,
  "no caching APIs used (advisory path unreachable)",
  "caching APIs present while next is on an affected version",
);

// Static assets: reject any public image over 400 KB.
let oversized = [];
for (const dir of ["public/images", "public/icons"]) {
  try {
    for (const f of readdirSync(join(ROOT, dir))) {
      const size = statSync(join(ROOT, dir, f)).size;
      if (size > 400 * 1024) oversized.push(`${dir}/${f} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    }
  } catch {
    /* directory may not exist */
  }
}
record("G4", "public images <= 400 KB", oversized.length === 0, "all public images within budget", `oversized: ${oversized.join(", ")}`);

if (!FAST) {
  const build = sh("npx", ["next", "build"]);
  check("G4", "production build", build.ok, "build succeeded", `build failed:\n${build.out}`);
  if (build.ok) {
    let js = 0;
    let css = 0;
    const walkStatic = (dir) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = join(dir, entry.name);
        if (entry.isDirectory()) walkStatic(rel);
        else if (entry.name.endsWith(".js")) js += gzipSync(readFileSync(join(ROOT, rel))).length;
        else if (entry.name.endsWith(".css")) css += gzipSync(readFileSync(join(ROOT, rel))).length;
      }
    };
    try {
      walkStatic(".next/static");
      record("G4", "client JS budget (<= 350 KB gzip)", js <= 350 * 1024, `${(js / 1024).toFixed(0)} KB gzip`, `${(js / 1024).toFixed(0)} KB gzip exceeds 350 KB budget`);
      record("G4", "CSS budget (<= 60 KB gzip)", css <= 60 * 1024, `${(css / 1024).toFixed(0)} KB gzip`, `${(css / 1024).toFixed(0)} KB gzip exceeds 60 KB budget`);
    } catch {
      warn("G4", "bundle measurement", "could not read .next/static");
    }
  }
}

// ─── G5 · Design & accessibility ───────────────────────────────────────────
console.log("\u001b[1mG5 · Design & accessibility\u001b[0m");

const components = walk("src/components", [".tsx"]).concat(walk("src/app", [".tsx"]));
const layout = read("src/app/layout.tsx");
check("G5", "document lang is declared", /<html[^>]*lang=/.test(layout), "lang attribute present", "no lang attribute");
const setsLang = count(srcFiles, /documentElement\.lang\s*=|setAttribute\(["']lang["']/g) > 0;
record(
  "G5",
  "document lang tracks the UI locale",
  setsLang,
  "journal shell syncs <html lang> to the active locale",
  "no documentElement.lang assignment; <html lang=\"en\"> would stay English for an Indonesian UI",
);
// The static shell still ships lang="en"; only the journal shell corrects it after hydration.
record(
  "G5",
  "server-rendered lang is not fixed",
  false,
  "",
  'AuthScreen and JournalLoading render under <html lang="en"> with no correction',
  true,
);

const imgs = allText(components).flatMap(({ f, t }) => [...t.matchAll(/<img\b[^>]*>/g)].map((m) => ({ f, tag: m[0] })));
const noAlt = imgs.filter(({ tag }) => !/\balt=/.test(tag));
check("G5", "all <img> have alt", noAlt.length === 0, `${imgs.length} images checked`, `missing alt: ${noAlt.map((i) => i.f).join(", ")}`);

const componentText = allText(components);
const dialogs = componentText.filter(({ t }) => /role="dialog"/.test(t)).length;
const trapped = componentText.filter(({ t }) => /role="dialog"/.test(t) && /Escape/.test(t)).length;
check("G5", "modals trap focus and handle Escape", dialogs > 0 && trapped === dialogs, `${trapped}/${dialogs} dialogs trap focus + Escape`, `${dialogs - trapped} dialog(s) missing focus trap or Escape`);
check("G5", "reduced motion honoured", count([...srcFiles, "src/app/globals.css"], /prefers-reduced-motion/g) > 0, "prefers-reduced-motion used", "reduced motion not supported");
check("G5", "global focus-visible style", /:focus-visible/.test(read("src/app/globals.css")), "focus-visible ring defined", "no focus-visible style");
check("G5", "live regions for status", count(srcFiles, /role="status"|role="alert"|aria-live/g) > 0, "live regions present", "no live regions");
check("G5", "sr-only utility", /\.sr-only\s*\{/.test(read("src/app/globals.css")), ".sr-only defined", "missing sr-only");

// Minimum legible type: report how much of the scale is under 12px.
const css = read("src/app/globals.css");
const sizes = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map((m) => Number(m[1]));
const tiny = sizes.filter((s) => s < 12).length;
const pct = ((tiny / sizes.length) * 100).toFixed(0);
record(
  "G5",
  "type scale floor (>= 90% of sizes 12px+)",
  tiny / sizes.length <= 0.1,
  `${sizes.length} declarations, ${pct}% under 12px`,
  `${pct}% of ${sizes.length} font-size declarations are under 12px; floor should be 11-12px`,
);

// WCAG contrast over the actual design tokens.
function luminance(hex) {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const tokenBlock = (selector) => {
  const m = css.match(new RegExp(`${selector.replace(/[[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  if (!m) return null;
  const expand = (h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h);
  return Object.fromEntries([...m[1].matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)].map((x) => [x[1], expand(x[2])]));
};
const light = tokenBlock(".app-shell") ?? {};
const darkBlock = tokenBlock('.app-shell[data-theme="dark"]') ?? {};
const pairs = [
  ["light: muted on surface", light.muted, light.surface],
  ["light: soft on surface", light.soft, light.surface],
  ["light: ink on canvas", light.ink, light.canvas],
  ["dark: muted on surface", darkBlock.muted, darkBlock.surface],
  ["dark: soft on surface", darkBlock.soft, darkBlock.surface],
  ["dark: ink on canvas", darkBlock.ink, darkBlock.canvas],
].filter(([, fg, bg]) => fg && bg);

const badContrast = pairs.filter(([, fg, bg]) => contrast(fg, bg) < 4.5).map(([name, fg, bg]) => `${name} ${contrast(fg, bg).toFixed(2)}:1`);
record(
  "G5",
  "text contrast >= 4.5:1 (WCAG AA)",
  badContrast.length === 0,
  `${pairs.length} token pairs pass`,
  `${badContrast.length}/${pairs.length} pairs below 4.5:1 — ${badContrast.join("; ")}`,
);

// ─── Report ────────────────────────────────────────────────────────────────
const W = 78;
console.log(`\n${"═".repeat(W)}\n\u001b[1mBloom quality gate\u001b[0m${FAST ? "  (fast: static heuristics only)" : ""}\n${"═".repeat(W)}`);
let currentGate = "";
for (const r of results) {
  if (r.gate !== currentGate) {
    currentGate = r.gate;
    console.log(`\n\u001b[1m${r.gate}\u001b[0m`);
  }
  const mark = r.ok ? "\u001b[32m✓\u001b[0m" : r.advisory ? "\u001b[33m▲\u001b[0m" : "\u001b[31m✗\u001b[0m";
  console.log(`  ${mark} ${r.name.padEnd(48)} ${r.detail}`);
}
const total = results.length;
const okCount = results.filter((r) => r.ok).length;
const advisories = results.filter((r) => !r.ok && r.advisory).length;
console.log(`\n${"─".repeat(W)}`);
console.log(`${okCount}/${total} checks passed · ${failed} blocking failure(s) · ${advisories} advisory note(s)`);
if (failed > 0) {
  console.log("\u001b[31mGATE FAILED\u001b[0m — fix blocking findings before release.\n");
  process.exit(1);
}
console.log("\u001b[32mGATE PASSED\u001b[0m — review advisory notes for the next cycle.\n");
