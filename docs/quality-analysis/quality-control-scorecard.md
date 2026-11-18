# Quality Control Scorecard — 81.5 / 100 (B+)

> Weighted across 9 dimensions. Every sub-score cites the evidence that produced it. Defect register and remediation roadmap follow.

---

## Scoring model

Each dimension scores 0–10 against an **absolute** rubric (what a 10 looks like for a production app in this class), then is weighted. Scores are deliberately *not* graded on a curve — a small team is not an excuse for a shared 7.

| 0–3 | 4–5 | 6–7 | 8–9 | 10 |
|---|---|---|---|---|
| Broken / absent | Ad hoc, hope-based | Present but inconsistent | Systematic, minor gaps | Exemplary, self-enforcing |

---

## 1. Static correctness & type safety — **9.5/10** (weight 10%)

| Evidence | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `tsconfig` `strict` | `true` |
| `: any` / `as any` occurrences | **0** |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| `dangerouslySetInnerHTML` | **0** |
| `eval` / `new Function` | **0** |
| `console.log` in `src/` | **0** |
| `eslint --max-warnings` equivalent | 0 warnings from `eslint-config-next/core-web-vitals` |

**Why 9.5 and not 10:** no `noUncheckedIndexedAccess`, no `exactOptionalPropertyTypes`, and no `eslint-plugin` rules beyond the Next preset (no `jsx-a11y`, no `import/order`, no `no-floating-promises`). Those three would catch real classes of bug — array index `undefined`, `parseInt` of a `string | undefined`, fire-and-forget promises in async handlers — that `strict` alone does not.

---

## 2. Test depth & coverage — **7.5/10** (weight 20%)

**Executed:** 38 tests, 0 failures, 1.9 s, `node:test` + `tsx`.

| Class | Covered? | Examples from the suite |
|---|---|---|
| Pure calculation | ✅ strong | `getStats` breakevens/no-loss/drawdown; `simulateExitBoard`; compounding + revenge-day |
| Round-trip identity | ✅ strong | CSV ↔ trades (EN/ID), XLSX ↔ trades (incl. DEFLATE-recompressed archives), backup create ↔ parse, local→cloud merge |
| Adversarial input | ✅ strong | corrupt JSON, wrong magic bytes (images/audio/PDF), chunked body without `content-length`, bad HMAC, untrusted YouTube host, `%PDF-` sniffing |
| State machine | ✅ good | Midtrans settlement lifecycle, Lemon Squeezy entitlement lifecycle, revision conflict, reminder snooze |
| Backward compat | ✅ good | v1 journal in-place upgrade, old preference shapes, chart-attachment v2 fields |
| **Boundary integration** | ❌ **absent** | **no route tests, no component tests** |
| Coverage measurement | ❌ **absent** | no `c8`/`istanbul`, no threshold, no PR comment |

**Distribution of the 38 tests** (by area): analytics/format 6 · CSV/XLSX 3 · backup/reminders 3 · journal-data migration 2 · exit-board 4 · patience/compounding 2 · billing/cloud 3 · audio/attachments/library 4 · i18n 1 · recap-card 1 · youtube 2 · misc/limits 5.

**Why 7.5:** the *content* of the tests is better than most funded products — they assert cent-exact money and deliberately attack the input layer. The *shape* is the problem: everything is a pure function. The 18 API routes and 17 components — where auth, entitlement, and user interaction actually live — have zero automated verification. `src/lib/auth.ts`, `src/lib/server-journal.ts`, `src/lib/server-billing.ts` and `src/lib/persistent-storage.ts` are entirely untested and are precisely the modules where a regression is a security incident.

**Fastest path to 9.0:** ~15 integration tests covering `/api/journal` (401 / 402 / 403 / 409 / 413 / 503 / happy path with revision bump), `/api/attachments` (quota, magic bytes, cross-user 404), and both webhooks (bad signature 401, replay idempotency). That is roughly 2 days for the highest-risk surface in the app.

---

## 3. CI/CD reliability — **7.0/10** (weight 10%)

| Check | Status |
|---|---|
| Lint → typecheck → test → build in CI | ✅ `deploy-pages.yml` runs all four before publishing |
| `npm ci` (lockfile-pinned) | ✅ |
| Node version pinned in CI | ✅ `22` |
| Deploy concurrency guard | ✅ `cancel-in-progress: true` |
| Least-privilege workflow permissions | ✅ `contents: read` |
| Android APK/bundle pipeline | ✅ separate workflow, tag-triggered, Java 21 + SDK |
| **PR-gating CI (not just deploy)** | ❌ **absent** — tests only run on push to `main`; a PR is ungated |
| **Automatic dependency updates** | ❌ no `.github/dependabot.yml` |
| **CODEOWNERS / PR template / branch protection doc** | ❌ absent |
| **Coverage reporting** | ❌ absent |
| **Browser E2E in CI** | ❌ the Playwright suites exist but require a local `CHROME_PATH`, so they never run in CI |

**Why 7.0:** the pipeline that exists is correct and well-scoped. But it is *deployment*-gated, not *merge*-gated, so a green CI badge on `main` reflects only what already shipped. The `test:pages` / `test:features` suites are substantial (391 and 1,017 lines, covering persistence, imports, backup/restore, recovery, 320/360/412 px layouts, offline reload) — they are simply never executed automatically. Wiring them to `ubuntu-latest` with the preinstalled Chrome is a half-day of work that would move this dimension to 9.

---

## 4. Security posture — **8.0/10** (weight 20%)

This is the dimension where Bloom most exceeds expectations for its size — and where one structural gap keeps it from an A.

### What is done right (verified route by route)

| Control | Implementation |
|---|---|
| Session-derived identity | Every private route calls `auth.api.getSession({ headers })`; `userId` **never** read from body/query |
| CSRF defence | `isAllowedMutation(request)` requires `Origin` to equal the configured origin exactly, on all mutations |
| Per-tenant scoping | All reads/writes use `and(eq(table.id, id), eq(table.userId, session.user.id))` — a guessed ID returns 404, not another user's row |
| Payload caps | `readLimitedBody` streams with a hard byte ceiling **and** re-checks the running total, so a missing/ forged `Content-Length` cannot bypass it |
| Upload validation | Magic-byte sniffing (`validateImage`, `validatePdfBlob`, `validateAudioHeader`), not client MIME |
| Stored-file isolation | Attachment GET returns `Content-Security-Policy: default-src 'none'; sandbox` + `X-Content-Type-Options: nosniff` + `private, no-store` |
| Webhook authentication | Midtrans SHA-512 of `order_id+status_code+gross_amount+server_key`; Lemon Squeezy HMAC-SHA256 over the **raw** body; both compared with `timingSafeEqual` |
| Webhook idempotency | `billingEvents.eventKey` unique + `onConflictDoNothing` — replays cannot extend entitlement |
| Rate limiting | Better Auth database-backed, 100/60 s global, **5/60 s** on sign-in and sign-up |
| Auth hardening | min password 12 chars; sign-up disabled unless explicitly enabled or billing is live; startup assertions refuse weak `BETTER_AUTH_SECRET` (<32 chars or placeholder) and non-HTTPS non-localhost `BETTER_AUTH_URL` |
| Legacy surface removed | Old unauthenticated `/api/trades` + `/api/settings` return **410 Gone** (confirmed live), rows retained for deliberate admin export |
| Quota locking | `pg_advisory_xact_lock(hashtext(user_id))` inside the upload transaction prevents concurrent uploads racing past the quota |
| Secret hygiene | no secrets in `NEXT_PUBLIC_*`; `.env*` ignored except `.env.example`; no credentials in git |
| Honest security documentation | README explicitly lists missing email verification, password recovery, MFA, E2E encryption, and states it is not a substitute for an audit |

### Gaps

| ID | Finding | Sev |
|---|---|---|
| SEC-1 | **No security headers at all.** `curl -I` on a live response shows no CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, or `Permissions-Policy` on the app itself. Next.js sends none by default and `next.config.ts` declares no `headers()`. The attachment route hardens *itself* — proving the team knows the technique — but the app shell is unguarded against clickjacking and reflected-content injection. | **P1** |
| SEC-2 | **Paid-tier gating is inconsistent.** `hasCloudSyncAccess` is enforced on `/api/journal` (all verbs), `/api/attachments` (POST), `/api/library` (POST). **None of the three audio *write* routes** (`POST /api/audio`, `PUT /api/audio/[id]/chunk`, `POST /api/audio/[id]/complete`) check it, while the journal those tracks sync into does. Result: a non-Pro user can create tracks and upload up to 200 MB of audio that the paid journal can never read. | **P1** |
| SEC-3 | **1 moderate dependency advisory** — `next@16.4.3` falls in the 16.2.0–16.4.4 range affected by GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8 (cache leakage across root params). *Compensating control:* the codebase contains **zero** uses of `unstable_cache` or `"use cache"`, so the vulnerable path is unreachable today. It becomes live the moment caching is introduced. | P2 |
| SEC-4 | Confirmation and destructive actions use 13 native `window.confirm()` calls. Functionally safe (modal, blocking) but unstyled, not localized, and impossible to make accessible or undoable. | P3 |
| SEC-5 | No edge/WAF rate limiting documented for auth beyond Better Auth's per-key rules; trusted-proxy/IP handling is left to the operator (acknowledged in README). | P3 |

**Why 8.0:** the *authorization and input-validation* engineering is genuinely strong — this is better than most production SaaS. But "no CSP on an app that renders user-supplied captions, playbook text, and reflection notes" is a category-level omission, not a nitpick, and inconsistent entitlement gating is an exploitable revenue/integrity bug. Fixing SEC-1 and SEC-2 is roughly a day and takes this dimension to 9.5.

---

## 5. Data integrity & recovery — **9.0/10** (weight 10%)

This is Bloom's standout dimension. The engineering here shows a team that has thought about the user's worst day.

| Property | Implementation |
|---|---|
| Corrupt data is never destroyed | `saveBrowserJournal` inspects existing data; if invalid it **throws** and leaves the original untouched, surfacing a recovery banner with download / restore / start-fresh |
| In-memory upgrade, original preserved | v1 journals are normalized on read; the storage key is not rewritten until the user acts |
| Schema validation on every ingress | `normalizeJournalData` (zod) guards client storage, backup restore, and the server `PUT` |
| Optimistic concurrency | `revision` column; stale `PUT` → **409** with an explicit "reload before saving" message rather than silent overwrite |
| Offline/dirty tracking | cloud cache key + dirty flag; offline edits are not silently promoted to "saved" |
| Backup completeness | full JSON incl. images, PDFs, settings, reflections; capped at 50 MB; validated on parse; restore requires confirmation; CSV explicitly scoped to trades only |
| Backup reminders | periodic, snoozable, per-journal-scope isolation, and honest that "download started" ≠ "file saved" |
| Merge safety | local→cloud migration deduplicates trades/accounts/settings |
| Storage discipline | images ≤2 MiB × 8/trade, journal image cap 30 MiB, server image quota 100 MiB, PDF caps, audio 200 MiB/5 tracks, CSV 3 MB/5,000 rows, 10,000 trades |

**Why 9.0:** the only missing piece is a **documented restore rehearsal** — the recovery path is unit-tested for JSON parsing but never proven end-to-end against real IndexedDB + localStorage eviction. Also, no encryption at rest (acknowledged): a stolen backup file is plaintext financial data.

---

## 6. Error handling & observability — **5.5/10** (weight 10%)

This is the **weakest dimension** and the one most likely to embarrass in production.

| Finding | Sev |
|---|---|
| **No `error.tsx`, no `global-error.tsx`, no `not-found.tsx`.** A thrown render error in one view takes down the entire journal to Next's default white screen. For a client shell holding the user's only copy of their data, this is severe. | **P1** |
| **No structured logging or error reporting.** Zero `console.log` is good hygiene, but there is also no logger, no request ID, no Sentry/equivalent. A failed `PUT /api/journal` returns a generic 500 to the user and leaves **no server-side trace**. | P2 |
| `/api/health` is a real liveness + DB probe (good) but there is no readiness/version endpoint, no uptime check, no latency metric. | P3 |
| Catch blocks frequently swallow (`catch { /* storage unavailable */ }`) — correct for client quota errors, but the same pattern appears around cloud delete where a silent failure leaks an orphaned object. | P3 |
| Errors are user-friendly and specific (401 "Please sign in again", 402 "Active Cloud Sync Pro subscription required", 409 stale-device message, 413 size) — genuinely good copy. | — |
| **No error boundary means no user-facing recovery affordance** even though the app already has an excellent recovery banner pattern to reuse. | — |

**Why 5.5:** the *error messages* are better than average; the *error architecture* is absent. There is no boundary, no telemetry, no correlation. For a browser-first journal where the user may be the only holder of their data, "white screen" is a data-availability incident.

---

## 7. Accessibility (technical) — **6.5/10** (weight 10%)

| Control | Status |
|---|---|
| Modal focus trap, Escape, focus restore | ✅ implemented in 4 dialogs (`chart-lightbox`, `journal-dialogs`, mobile nav, `strategy-shelf`) |
| Global `:focus-visible` ring (3px, offset 3px) | ✅ |
| `aria-pressed` on every toggle/segment control | ✅ systematic |
| `aria-expanded` + `aria-controls` on disclosure | ✅ |
| `aria-live` / `role="status"` / `role="alert"` for toasts, recovery banner, offline notice, calendar month | ✅ |
| Form labelling | ✅ 88 controls, 0 unlabelled (label or `aria-label`) |
| Table semantics | ✅ `role="table"`, `scope="col"`, `role="rowheader"` |
| `.sr-only` utility | ✅ used (6 places) |
| Reduced motion | ✅ 2 media rules + in-app setting + motion normalization test |
| `alt` on images | ✅ present at all `<img>` sites |
| **Contrast** | ❌ body-adjacent tokens fail (§ see design scorecard) |
| **`<html lang>`** | ❌ hard-coded `"en"` while the app ships a full Bahasa Indonesia UI — screen readers will mispronounce the entire Indonesian experience |
| **No automated a11y test** | ❌ no `@axe-core/playwright` / `jest-axe` in any suite |
| No skip-to-content link, no landmark `role="main"` audit | ⚠️ minor |
| `font-size` floor | ❌ 72% of declarations < 12px, smallest 7px (accessibility-adjacent; scored under design) |

**Why 6.5:** the *component-level* a11y work is better than most apps — focus management and ARIA state are handled properly, which is the hard part. But three structural things are missing: correct document language, compliant contrast, and any automated check to stop regressions.

---

## 8. Performance — **6.0/10** (weight 10%)

| Metric | Measured | Target | Verdict |
|---|---|---|---|
| Client JS (all chunks) | **499 KB gzip** | ≤ 350 KB | ❌ 1.4× over |
| Largest single chunk | **312 KB gzip** (1.1 MB raw) | ≤ 150 KB | ❌ |
| CSS | **41 KB gzip** (from 264 KB source) | ≤ 60 KB | ✅ |
| Fonts | 14 KB | — | ✅ (subset, `@fontsource`, 4 weights) |
| **Hero image** | **1.9 MB PNG** | ≤ 200 KB | ❌ **10× over** |
| Static shell TTFB (dev) | 1.6 s | < 800 ms (prod) | ⚠️ dev only, not conclusive |
| Build time | 13 s compile / 11.8 s TS | — | ✅ |
| Route splitting | ⚠️ **no `next/dynamic` / `React.lazy` anywhere** | — | ❌ everything in one shell |
| Data pagination | ⚠️ all 10,000 trades held in memory and filtered client-side | — | ⚠️ O(n) filter on every keystroke |
| Rendering | ✅ `useMemo` used on the heavy filter/stat paths | — | ✅ |
| Concurrency | ✅ advisory-lock quota; no N+1 in the hot paths | — | ✅ |

**Why 6.0:** correctness-preserving choices are sound (memoization, subset fonts, CSS-first styling instead of a component library). But the payload story is poor for a stated Android target: one monolithic client shell with no lazy boundaries, a 312 KB gzip chunk, and a 1.9 MB un-lazy-loadable hero PNG referenced from CSS. A mobile user on a slow connection downloads ~2.4 MB before the Overview looks right.

---

## 9. Maintainability & hygiene — **7.0/10** (weight 10%)

| Signal | Value | Reading |
|---|---|---|
| Total handwritten code | 34,112 lines / 66 files | moderate for the feature surface |
| Largest module | `globals.css` **7,665 lines** | ❌ single-file design system |
| Duplicate CSS selectors | **318** of 1,677 distinct (`.page-content` ×7, `.calendar-day` ×7) | ❌ |
| Hard-coded hex in CSS | **879** (vs 46 tokens) | ❌ token coverage ~5% |
| `!important` | 41 | ⚠️ |
| Media queries | 61, including 9 ad-hoc breakpoints (390/560/650/700/860/900/950/980/…) | ⚠️ inconsistent scale |
| Largest component | `journal-dialogs.tsx` 1,492 lines / 8 exports; `journal-app.tsx` 773 lines / **19 `useState`** | ❌ god-component |
| Layering | `src/lib` (31 modules) is cleanly separated from `src/components` (17) | ✅ genuinely good |
| Naming & file organization | predictable, domain-named | ✅ |
| Documentation | exceptional README (calculation contract, limits, storage semantics, operational limitations) | ✅ best-in-class for a project this size |
| Repo hygiene | ❌ no LICENSE, CONTRIBUTING, CHANGELOG, `.editorconfig`, `.nvmrc`, `engines`, dependabot | ❌ |
| Git history | 1 commit in this checkout | n/a (squashed) |

**Why 7.0:** the TypeScript layer is well factored — `lib/` is a model of separation, and the README documents invariants that most teams leave in someone's head. But the presentation layer is a 7.6k-line global stylesheet plus a 773-line component with 19 pieces of top-level state, and there is no repository scaffolding for a second contributor.

---

# 6. Remediation roadmap

Sequenced by **risk reduction per day of effort**. Effort estimates assume one competent engineer.

### Sprint 1 — "Don't get hurt" (~2 days, QC 81.5 → 87)

| # | Action | Fixes | Effort |
|---|---|---|---|
| 1 | Add `headers()` to `next.config.ts`: CSP (`default-src 'self'`; allow the specific font/youtube hosts), HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` | SEC-1 | 0.5 d |
| 2 | Add `hasCloudSyncAccess` to the three audio *write* routes (or document audio as intentionally free and remove the inconsistency from the pricing surface) | SEC-2 | 0.5 d |
| 3 | Add `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx` — reuse the existing recovery-banner visual language | §6 P1 | 0.5 d |
| 4 | `npm i next@^16.4.6` and re-run the suite | SEC-3 | 0.25 d |
| 5 | Make CI run on `pull_request`, not only `push: main` | §3 | 0.25 d |

### Sprint 2 — "Prove the boundary" (~3 days, QC → 90)

| # | Action | Fixes | Effort |
|---|---|---|---|
| 6 | Integration tests for `/api/journal`: no session → 401; no Pro → 402; bad origin → 403; stale revision → 409; oversized body → 413; happy path bumps revision | coverage gap | 1 d |
| 7 | Integration tests for `/api/attachments` (quota, magic bytes, cross-user → 404) and both webhooks (bad signature → 401, replay idempotent) | coverage gap | 1 d |
| 8 | Add `c8` coverage with a floor (`src/lib` ≥ 80% lines) reported in CI | §2 | 0.5 d |
| 9 | Wire `test:pages` / `test:features` into CI using the runner's preinstalled Chrome | §3 | 0.5 d |

### Sprint 3 — "Make it readable" (~2 days, Design 70.5 → 78)

| # | Action | Fixes | Effort |
|---|---|---|---|
| 10 | Raise the type scale: body 13→15px, labels floor 11px, delete all `font-size` < 10px | 72% sub-12px | 0.75 d |
| 11 | Darken `--soft` and `--muted` until every text/background pair ≥ 4.5:1 in both themes | contrast | 0.5 d |
| 12 | Set `<html lang>` from the active locale (and on locale switch) | a11y | 0.25 d |
| 13 | Add `@axe-core/playwright` to `test:pages` with a zero-violation budget | a11y regression | 0.5 d |

### Sprint 4 — "Reduce the weight" (~3 days, Perf 6.0 → 8)

| # | Action | Fixes | Effort |
|---|---|---|---|
| 14 | Convert `bloom-landscape.png` to AVIF/WebP at ≤ 150 KB (or CSS gradient) | 1.9 MB hero | 0.5 d |
| 15 | Introduce `next/dynamic` boundaries for `cassette-player`, `youtube-watch-panel`, `journal-exit-board`, `journal-patience`, `recap-card-modal` | 499 KB / 312 KB chunk | 1.5 d |
| 16 | Virtualize or paginate the trade table beyond ~300 rows | O(n) filter/render | 1 d |

### Sprint 5 — "Structural debt" (~5 days, QC → 92, Design → 82)

| # | Action | Fixes | Effort |
|---|---|---|---|
| 17 | Split `globals.css` into `tokens.css` / `base.css` / `components/*` / `views/*`; consolidate to a spacing (4/8/12), radius (6/10/14/pill) and type (9-step) scale | 318 dupes, 879 hex | 3 d |
| 18 | Extract `journal-app.tsx` state into a `useJournalController` hook + context; split `journal-dialogs.tsx` by dialog | god-components | 1.5 d |
| 19 | Replace 13 `window.confirm()` with a single accessible, localized confirm dialog | SEC-4 | 0.5 d |

### Ongoing

- `.editorconfig`, `.nvmrc`, `engines` in `package.json`, `LICENSE`, `CONTRIBUTING.md`, `CHANGELOG.md`, `dependabot.yml`, PR template.
- Quarterly **restore rehearsal** and scorecard re-score.
- Structured logger + error reporting before any public SaaS launch.

---

# 7. Score summary

| # | Dimension | Weight | Score | Weighted |
|---|---|---|---|---|
| 1 | Static correctness & type safety | 10% | 9.5 | 0.95 |
| 2 | Test depth & coverage | 20% | 7.5 | 1.50 |
| 3 | CI/CD reliability | 10% | 7.0 | 0.70 |
| 4 | Security posture | 20% | 8.0 | 1.60 |
| 5 | Data integrity & recovery | 10% | 9.0 | 0.90 |
| 6 | Error handling & observability | 10% | 5.5 | 0.55 |
| 7 | Accessibility (technical) | 10% | 6.5 | 0.65 |
| 8 | Performance | 10% | 6.0 | 0.60 |
| 9 | Maintainability & hygiene | 10% | 7.0 | 0.70 |
| | **Total** | **100%** | | **8.15 / 10 → 81.5 / 100** |

**Grade: B+** — production-capable for private/self-hosted use today; the Sprint 1 + Sprint 2 items (≈5 days) are the precondition for public multi-tenant operation.
