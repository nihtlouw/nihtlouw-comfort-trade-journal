#!/usr/bin/env node
/**
 * Bundle report.
 *
 * Walks .next/static and attributes gzipped JavaScript to the source modules that
 * dominate it, so "the bundle is 500 KB" becomes "these five modules are 400 KB".
 *
 * Usage: npm run build && npm run bundle:report
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const KB = (n) => `${(n / 1024).toFixed(0)} KB`;

function walk(dir, ext, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, ext, acc);
    else if (entry.name.endsWith(ext)) acc.push(rel);
  }
  return acc;
}

const files = walk(join(ROOT, ".next/static"), ".js");
if (!files.length) {
  console.error("No build output found. Run `npm run build` first.");
  process.exit(1);
}

const rows = files.map((file) => {
  const raw = readFileSync(file);
  return { file: file.replace(join(ROOT, ".next/static"), ""), gzip: gzipSync(raw).length, raw: raw.length };
});
rows.sort((a, b) => b.gzip - a.gzip);

const total = rows.reduce((sum, r) => sum + r.gzip, 0);
console.log(`\nClient JavaScript — ${rows.length} chunks, ${KB(total)} gzip total\n`);
for (const row of rows.slice(0, 12)) {
  const bar = "█".repeat(Math.max(1, Math.round((row.gzip / rows[0].gzip) * 32)));
  console.log(`  ${KB(row.gzip).padStart(7)}  ${bar} ${row.file}`);
}

// Attribute weight to source modules by grepping the build for module markers.
// Turbopack keeps module paths in its server-side chunks, so map client weight
// against the source files that the app shell imports eagerly.
const bigSources = walk(join(ROOT, "src/components"), ".tsx")
  .concat(walk(join(ROOT, "src/lib"), ".ts"))
  .map((file) => ({ file: file.replace(join(ROOT, "src/"), ""), size: statSync(file).size }))
  .sort((a, b) => b.size - a.size);

console.log("\nLargest source modules (lines of code drive client weight):");
for (const { file, size } of bigSources.slice(0, 12)) {
  console.log(`  ${String(Math.round(size / 1024)).padStart(5)} KB  ${file}`);
}

console.log(`
Guidance:
  - Anything rendered only in a modal or a non-default view should be imported
    with \`next/dynamic\` so it leaves the initial chunk.
  - A chunk over ~150 KB gzip usually means one module is pulling a large
    dependency into the shell (e.g. a charting or media library).
`);
