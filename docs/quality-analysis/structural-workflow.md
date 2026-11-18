# Structural Quality Workflow

A six-gate workflow with explicit entry/exit criteria, a shared defect taxonomy, and a release decision rule. It is designed to be *enforced by a script* (`scripts/quality-gate.mjs`), not by good intentions.

---

## 0. The model

```
                    ┌──────────────────────────────────────────────┐
                    │            QUALITY CONTROL LOOP              │
                    └──────────────────────────────────────────────┘

  IDEA ──► G0 SCOPE ──► G1 STATIC ──► G2 LOGIC ──► G3 INTEGRATION ──► G4 BUILD ──► G5 DESIGN ──► G6 RELEASE
              │             │            │              │                │             │            │
          acceptance     tsc+eslint   unit tests    route/component   prod bundle    a11y+contrast  gate +
          criteria +     zero-warn    + coverage    + authz + sync    budgets +      + responsive   sign-off
          risk class     baseline     floor         + conflict        headers                       record
              │             │            │              │                │             │            │
              ▼             ▼            ▼              ▼                ▼             ▼            ▼
          [fail fast]   [fail fast]  [fail fast]   [fail fast]      [fail fast]   [advisory]    [binary]
```

**Design principles**

1. **Left-shift.** Every gate is cheaper than the one to its right. G1 catches in 17 s what G6 catches in a day of production.
2. **Binary exits.** A gate either passes or it does not. "Known flaky" is not a state.
3. **Evidence, not assertion.** Every gate emits machine-readable output. The release record cites gate IDs, not opinions.
4. **Asymmetry of trust.** Server code gets stricter gates than client code, because a client bug annoys one user and a server bug can expose all users.

---

## 1. Gate definitions

### G0 — Scope & risk classification *(human, 15 min)*

| Field | Required | Bloom example |
|---|---|---|
| Change summary | yes | "Add XLSX export" |
| Acceptance criteria | yes, testable | "Round-trips 1,000 trades with cent-exact P&L in EN and ID" |
| **Risk class** | R1 / R2 / R3 | R2 (touches money formatting) |
| Blast radius | which gates must run | G1–G4 full |
| Rollback plan | for R2+ | revert commit; no migration |

**Risk classes**

| Class | Definition | Required gates |
|---|---|---|
| **R1** | Docs, copy, comments, styles with no behavioural effect | G1, G5 |
| **R2** | Any logic, calculation, persistence, or i18n change | G1→G4, G5 advisory |
| **R3** | Auth, billing, storage, migrations, crypto, data deletion, or **anything that can destroy user data** | **All gates + second reviewer + restore rehearsal** |

> **Bloom's critical realization:** a trading journal's P&L is the user's actual financial record. Every R2 classification should be *justified downward*, never assumed. `src/lib/analytics.ts`, `src/lib/csv.ts`, `src/lib/xlsx-report.ts`, `src/lib/backup.ts`, and `src/lib/journal-data.ts` are **R3 by default** — they are the app's source of truth.

---

### G1 — Static correctness → **exit: binary**

| Check | Command | Pass criteria | Bloom status |
|---|---|---|---|
| Type check | `npx tsc --noEmit` | 0 errors, `strict: true` | ✅ PASS |
| Lint | `npx eslint .` | 0 errors, **0 warnings** | ✅ PASS |
| Forbidden patterns | static scan | 0 `any`, 0 `@ts-ignore`, 0 `dangerouslySetInnerHTML`, 0 `console.log` in `src/` | ✅ PASS (all four = 0) |
| Env documentation | manual | every `process.env.X` appears in `.env.example` | ✅ PASS |

**Why `strict` matters here and is verified, not assumed:** `tsconfig.json` sets `"strict": true`. The forbidden-pattern scan then confirms the team has not punched holes in it. Zero `any` across 34k lines in a codebase touching money, dates, and binary buffers is the single strongest quality signal in this repository.

**Forbidden-pattern policy (regression-locked):**

| Pattern | Rationale | Allowed exception |
|---|---|---|
| `: any` / `as any` | Erases the type graph exactly where bugs live | none |
| `@ts-ignore` | Silent contract break | `@ts-expect-error` with a comment, reviewed |
| `dangerouslySetInnerHTML` | XSS vector | none in this app |
| `console.log` | Leaks financial data into client logs | structured logger on server only |

---

### G2 — Logic & calculation correctness → **exit: binary on suite, floor on coverage**

| Check | Pass criteria | Bloom status |
|---|---|---|
| Unit suite | 0 failures | ✅ 38/38 |
| Money invariants | every P&L assertion cent-exact, not epsilon | ✅ PASS — XLSX and recap tests assert exact reconciliation |
| Timezone/date invariants | date-only logic independent of `TZ` | ✅ PASS — Monday-first grids, leap years, cross-year weeks tested |
| Migration invariants | old data upgrades in memory; original **never mutated** | ✅ PASS — dedicated tests for v1 upgrade and corrupt-data blocking |
| Boundary invariants | limits enforced at the exact byte, not ± | ✅ PASS — `readLimitedBody` tested "even when `content-length` is absent" |
| **Coverage floor (recommended)** | lib ≥ 80% lines | ⚠️ **GAP** — not measured; no coverage tooling configured |

**Test taxonomy — what a good suite looks like.** Bloom's 38 tests map cleanly onto the five classes that actually find bugs:

1. **Pure calculation** (`getStats`, drawdown, expectancy, R-multiple, compounding simulation) — the money core.
2. **Round-trip/identity** (CSV export→import, XLSX export→import, backup create→parse, local→cloud merge) — catches asymmetry bugs that unit assertions miss.
3. **Adversarial input** (corrupt JSON, wrong magic bytes, oversized chunked body, bad HMAC signature, untrusted YouTube host) — the security-adjacent edge.
4. **State-machine** (billing webhook settlement lifecycle, revision conflict, backup-reminder snooze) — the transitions.
5. **Backward compatibility** (v1 journal, old preference shape, legacy `mailto` fields) — the upgrade path.

**The missing sixth class is the risk:** *boundary integration* (does the route actually 401/402/409/413 under the right conditions?). See G3.

---

### G3 — Integration, authorization & concurrency → **exit: binary**

This is the gate Bloom is **weakest** on, and it is the gate that matters most for a multi-tenant app.

| Check | Pass criteria | Bloom status |
|---|---|---|
| Auth on every private route | each route derives `userId` from session, never from the request body | ✅ PASS — verified route by route |
| Origin check on every mutation | `isAllowedMutation` on all POST/PUT/DELETE | ✅ PASS |
| Per-user data scoping | every query constrained by `userId` | ✅ PASS — e.g. attachment GET/DELETE use `and(eq(id), eq(userId))` |
| Entitlement gating | paid routes check `hasCloudSyncAccess` | ⚠️ **PARTIAL** — enforced on journal, attachments, library; **absent on the 3 audio write routes** |
| Body-size cap independent of `Content-Length` | streamed counter | ✅ PASS |
| Content validation by magic bytes, not MIME | header sniffing | ✅ PASS — images, PDF `%PDF-`, audio |
| Optimistic concurrency | stale write → `409`, not overwrite | ✅ PASS |
| Webhook authenticity | HMAC / signature verified **before** parsing effects | ✅ PASS — Midtrans SHA-512, Lemon Squeezy HMAC-SHA256, both `timingSafeEqual` |
| Webhook idempotency | replay does not double-extend entitlement | ✅ PASS — `onConflictDoNothing` on `eventKey` |
| **Route tests exist** | ≥1 test per route module | ❌ **FAIL — 0 of 18** |
| **Component tests exist** | ≥1 test per interactive component | ❌ **FAIL — 0 of 17** |

**G3 gate rule.** For an R3 change, a route may not merge without at least one negative-path test (401 / 402 / 403 / 409 / 413). This is the highest-value process change available to this project: the code is already correct, but nothing prevents a *future* commit from being incorrect.

---

### G4 — Build & delivery → **exit: binary on build, budget on size**

| Check | Pass criteria | Bloom status |
|---|---|---|
| Prod build | 0 errors | ✅ PASS — 13 s compile, 13 pages |
| Static (Pages) build | succeeds, no server API leakage | ✅ PASS — dedicated script excluding API routes |
| Bundle budget — client JS | ≤ 350 KB gzip | ⚠️ **499 KB gzip — over budget** |
| Bundle budget — CSS | ≤ 60 KB gzip | ✅ 41 KB gzip |
| LCP-critical image | ≤ 200 KB, modern format | ❌ **`bloom-landscape.png` = 1.9 MB PNG** |
| Security headers present | CSP + HSTS + XFO + Referrer-Policy | ❌ **FAIL — none sent** |
| Dependency advisories | 0 high/critical; moderates triaged | ⚠️ 1 moderate (`next` advisory) |
| Node engine pinned | `engines` field or `.nvmrc` | ⚠️ **GAP** — README says ≥20.9, no enforcement |

**Budget rationale.** 499 KB gzip of JS on a mid-range Android phone over 4G is roughly 3–5 s of parse+execute on top of network time. Bloom is explicitly positioned as an installable Android experience, so the JS budget is a *product* requirement, not an aesthetic one. The 1.9 MB hero PNG is worse: it is referenced as a CSS `background-image` on the Overview banner, so it is discovered late and cannot be lazy-loaded.

---

### G5 — Design, accessibility & responsiveness → **exit: advisory score + hard accessibility floor**

| Check | Pass criteria | Bloom status |
|---|---|---|
| Contrast — body text | ≥ 4.5:1 | ❌ **light: `--soft` = 2.64:1, `--muted` = 3.98:1** (dark theme passes) |
| Contrast — large text | ≥ 3:1 | ✅ mostly |
| Keyboard reachability | every action focusable | ✅ PASS |
| Focus visibility | visible ring on all interactive elements | ✅ PASS — global `:focus-visible` 3px ring |
| Modal focus trap + restore | trap + Escape + restore | ✅ PASS — 4 modals implement it |
| Reduced motion honoured | `prefers-reduced-motion` respected | ✅ PASS — 7 references, incl. in-app setting |
| Form labelling | every input has `<label>` or `aria-label` | ✅ PASS — 88 controls, 0 unlabelled |
| Table semantics | `role`/`scope`/`rowheader` | ✅ PASS |
| Live-region announcements | toasts/status announced | ✅ PASS — `role="status"` + `aria-live` |
| Document `lang` reflects content language | `<html lang>` matches UI language | ⚠️ **PARTIAL** — corrected client-side in the journal shell, never in `AuthScreen`/`JournalLoading` |
| **Minimum readable type** | body ≥ 15px, labels ≥ 12px | ❌ **FAIL — 72% of sizes < 12px, smallest 7px** |
| Responsive | verified at 320/360/412/landscape | ✅ PASS — scripted UI suite exists |

**G5 is deliberately asymmetric**: a *failed hard floor* (contrast, unlabelled control, missing alt) **blocks release**; a low *design score* is advisory. Accessibility is a correctness property, not a taste property.

---

### G6 — Release decision → **binary**

| Condition | Decision |
|---|---|
| G1–G4 pass, G5 hard floor passes | **PASS** — ship |
| G1–G4 pass, G5 hard floor fails | **BLOCKED** — accessibility fix required |
| Any of G1–G4 fails | **BLOCKED** |
| P1 defect open | **BLOCKED** regardless of scores |
| P2 defect open | **CONDITIONAL PASS** with owner + date recorded |

Every release records: commit SHA, gate results per ID, open defect IDs with severity, and the composite score. This makes quality *auditable over time* rather than a feeling.

---

## 2. Defect taxonomy

Severity is about **user harm**, not code ugliness.

| Sev | Definition | Bloom example | SLA |
|---|---|---|---|
| **P0** | Data loss, silent corruption, cross-tenant leak, RCE | none found | hotfix < 24 h |
| **P1** | Security header gap, unprotected paid route, white-screen on error, unrecoverable state | missing CSP; audio routes ungated; no error boundary | < 1 week |
| **P2** | Accessibility-blocking, unreadable type, over-budget payload, test gap in R3 code | light-theme contrast failure; 72% sub-12px text; 0 route tests | < 1 month |
| **P3** | Design inconsistency, duplication, minor UX friction | 318 duplicate CSS selectors; native `confirm()` | next cycle |
| **P4** | Cosmetic, nitpick | — | opportunistic |

**Classification rule used throughout this analysis:** if a user could *lose money or data*, or a stranger could *see another user's data*, it is P0/P1. If a user could *not read or not operate* the app, it is P1/P2. Everything else is debt.

---

## 3. Applying the workflow to Bloom today

A worked example, using the gate model on an actual proposed change: **"Add a per-trade commission field."**

| Gate | Action | Result |
|---|---|---|
| **G0** | Risk class **R3** — touches P&L math and persisted schema | Gates: all |
| **G1** | `tsc` + `eslint` + forbidden-pattern scan | PASS |
| **G2** | Add tests: commission subtracted exactly once; CSV/XLSX/backup round-trip preserves it; v2 journal without the field upgrades to `0`; negative commission rejected | PASS after 5 new tests |
| **G3** | Backup `parseBackup` accepts new field; `/api/journal` `normalizeJournalData` preserves it; revision conflict still 409 | PASS |
| **G4** | Build; bundle delta < 5 KB gzip | PASS |
| **G5** | New input labelled; mobile keyboard is `inputMode="decimal"`; type ≥ 12px; contrast ≥ 4.5:1 | PASS |
| **G6** | Second reviewer (R3 rule) verifies commission is **not** double-deducted against the documented "fees are not deducted twice" contract | SIGN-OFF |

That last row is the whole point of the workflow: the calculation contract is documentation, and a gate exists to prove the code still honours it.

---

## 4. Operating cadence

| Cadence | Activity | Owner | Output |
|---|---|---|---|
| **Every PR** | G1–G4 automated via `scripts/quality-gate.mjs`; G5 checklist for UI diffs | Author + CI | Gate report in CI log |
| **Every release** | G6 record: SHA, gate results, open defect IDs, composite score | Maintainer | Release note entry |
| **Weekly** | Triage `npm audit`; re-run forbidden-pattern scan; review SLO of `/api/health` | Maintainer | Triage note |
| **Monthly** | Accessibility sweep (contrast + keyboard paths); bundle trend; **restore rehearsal** (take a backup, wipe, restore) | Maintainer | Scorecard update |
| **Quarterly** | Re-score both scorecards; prune defect register; revisit budgets | Maintainer | Score delta |
| **Before public launch** | Pen-test pass on auth/billing; trusted-proxy + edge rate-limit configuration; encryption-at-rest decision | Owner | Launch checklist |

### The one practice Bloom is missing outright

**Restore rehearsals.** The app encourages users to back up and warns that browser storage can be evicted — but the *restore* path is only exercised by unit tests parsing JSON. A quarterly drill — export a real journal, clear storage, restore, verify trades and screenshots — is the only thing that proves the recovery story to a user whose trading history is at stake.

---

## 5. Where the workflow is enforced

`scripts/quality-gate.mjs` implements the automatable subset:

```
G1  typecheck + lint + forbidden patterns + env documentation
G3  route-auth audit (every private route must derive identity server-side)
G4  build + client-JS budget + CSS budget + security-header declaration
G5  a11y static audit (labels, alt, lang, dialog trap, reduced motion) + type-size floor
```

Run `node scripts/quality-gate.mjs --fast` for the static heuristics, or without `--fast` for the full build-backed gate. It exits non-zero on any regression, so it can be dropped into `.github/workflows/deploy-pages.yml` as an additional step.
