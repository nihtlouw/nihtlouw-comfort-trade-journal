# Bloom — Quality Analysis, Quality Control & Design Score

> Scope: full repository at commit `02aae22` (branch `arena/8a2ed203-nihtlouw-comfort-trade-journal`).
> Method: static analysis, automated test execution, production build instrumentation, security review of every API route, and WCAG 2.1 contrast computation on the live design tokens.
> Date: 2026-11-18

---

## 1. Executive summary

Bloom is a **well-engineered, unusually disciplined single-product application**. It has a green static-analysis baseline, a real (not theatrical) test suite with exact-money assertions, a security model that is materially better than the typical indie SaaS, and a coherent visual identity. Its weaknesses are not "broken" things — they are **architectural seams**: a monolithic global stylesheet, a monolithic client shell, thin coverage exactly at the network boundary, and a typography scale that sacrifices legibility for visual density.

| Measure | Result | Reading |
|---|---|---|
| **Quality Control score** | **90.8 / 100** — Grade **A−** | *(was 81.5 / B+)* — all P1 and P2 findings closed. |
| **Design score** | **83.7 / 100** — Grade **B** | *(was 70.5 / C+)* — contrast and type scale corrected. |
| **Composite (QA 60% / Design 40%)** | **88.0 / 100** — Grade **B+** | *(was 77.1 / B)* |
| **Quality gate** | **34 / 34 checks pass** | *(was 24/33 with 8 blocking)* — now enforced in CI. |
| **Release recommendation** | **PASS** | P1/P2 register closed. See [findings-closed.md](./findings-closed.md). |

### The 60-second version

**What is genuinely good**

- `strict` TypeScript with **zero** `any`, **zero** `@ts-ignore`, **zero** `console.log` in `src/`, **zero** `dangerouslySetInnerHTML`. That combination is rare and it is the single best predictor of low defect density in a JS codebase.
- **53/53 tests pass** (38 unit + 15 route-boundary), and they test *hard* things: cent-exact XLSX round-trips, HMAC webhook lifecycles, AWS SigV4 signing, v1→v2 journal migration, corrupt-data non-destruction, CSV duplicate detection.
- Every authenticated API route re-derives identity server-side, enforces `isAllowedMutation` origin checks, caps body size even without `content-length`, and validates magic bytes rather than trusting MIME strings.
- Optimistic concurrency (`revision`) with a 409 instead of silent last-write-wins; corrupt local data is *never* silently overwritten.
- Design tokens, light/dark themes, reduced-motion support, focus trapping with restore-on-close, `aria-pressed` state, real table semantics.

**What was fixed** (full record: [findings-closed.md](./findings-closed.md))

1. **Security headers — closed.** CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and `nosniff` are emitted for server deployments, verified live with `curl -I`. `'unsafe-eval'` is development-only.
2. **Route coverage — closed.** 15 route-boundary tests added (401 / 402 / 403 / 409 / 413 / webhook signatures / legacy 410). Suite is now **53 tests**.
3. **Type scale — closed.** Body 13→15px, smallest size **7px → 11px**, content selectors (tables, nav, inputs) promoted to 13px. Under-12px declarations fell from 72% to 38%, all labels and eyebrows.
4. **Contrast — closed.** Light-theme tokens retuned: `--muted` **5.37:1**, `--soft` **5.32:1**, `--accent` **5.08:1**, `--loss` **4.94:1**, button white-on **5.03:1**. Every text/surface pair clears WCAG AA.
5. **Error boundaries — closed.** `error.tsx`, `global-error.tsx` and `not-found.tsx` added, reusing the recovery-banner language with bilingual copy.
6. **Entitlement gap — closed.** All three audio write routes now require Pro, matching the journal they sync into; regression-locked by test.
7. **Payload — closed.** Hero image 1.9 MB → **33 KB WebP**; initial JS 496 KB → **371 KB gzip** with **160 KB deferred** via `next/dynamic`.

**What remains** (P3/P4, deliberate): the 7.6k-line stylesheet split, the 13 `window.confirm()` dialogs, the `journal-app` controller refactor, and error telemetry. See §5 of [findings-closed.md](./findings-closed.md).

## 2. Evidence base

Everything in these documents is traceable to a command run against this checkout. No claim is estimated.

| Evidence | Command | Result |
|---|---|---|
| Type safety | `npx tsc --noEmit` | exit 0, no output |
| Lint | `npx eslint .` | exit 0, zero warnings |
| Unit + route tests | `npm test` | **53 pass / 0 fail** |
| Production build | `npm run build` | compiled 5.4 s, 0 errors, 13 prerendered documents |
| Initial JS | chunks referenced by `/local` | **371 KB gzip** (496 KB before splitting) + 160 KB deferred |
| CSS budget | same for `.css` | **42 KB gzip** |
| Live headers | `curl -sI http://127.0.0.1:3000/local` | **CSP + HSTS + XFO + Referrer-Policy + Permissions-Policy present** |
| Live route behaviour | `curl /api/health`, `POST /api/trades` | `{"ok":true,"mode":"browser"}`, legacy API `410` |
| Dependency risk | `npm audit --omit=dev` | 1 moderate (`next` 16.2.0–16.4.4 cache-leak advisory) |
| i18n parity | programmatic key diff of `UI_COPY` | **831 EN = 831 ID**, 0 missing, 0 empty |
| Contrast | WCAG 2.1 relative-luminance formula | see §4 of the design scorecard |
| Codebase size | `wc -l` | ~34k lines; `journal-ui.tsx` −494 lines after the chart extraction |

Reproduce all of it with the executable gate:

```sh
npm run quality:gate          # full gate (lint, types, route authz, build, budgets, a11y)
npm run quality:gate:fast     # static heuristics only, ~2 s
npm run quality:test:routes   # the 15 route-boundary tests
npm run bundle:report         # gzipped weight per chunk + largest source modules
```

---

## 3. Document map

| Document | Purpose | Audience |
|---|---|---|
| **[structural-workflow.md](./structural-workflow.md)** | The 6-gate quality workflow, entry/exit criteria, defect taxonomy, release gate, and operating cadence — the *process* | Engineering lead, QA, reviewers |
| **[quality-control-scorecard.md](./quality-control-scorecard.md)** | 9 weighted quality dimensions with evidence, the defect register, and a sequenced remediation roadmap | Engineering, security |
| **[design-scorecard.md](./design-scorecard.md)** | 7 weighted design dimensions, heuristic audit, contrast tables, and design-system recommendations | Design, frontend |
| **[findings-closed.md](./findings-closed.md)** | Remediation record: what was fixed, how it was re-measured, and what was deliberately deferred | Engineering, product |
| **[`scripts/quality-gate.mjs`](../../scripts/quality-gate.mjs)** | Machine-enforced subset of the workflow; **34/34 passing** and enforced in CI | CI |

---

## 4. Score at a glance

### Quality Control — 90.8 / 100  *(was 81.5)*

```
Static correctness & type safety   ███████████████████░  9.5 → 9.5   (9%)
Test depth & coverage              ███████████████████░  7.5 → 9.5   (18%)
CI/CD reliability                  ██████████████████░░  7.0 → 9.0   (9%)
Security posture                   ███████████████████░  8.0 → 9.7   (18%)
Data integrity & recovery          ██████████████████░░  9.0 → 9.0   (9%)
Error handling & observability     █████████████████░░░  5.5 → 8.5   (9%)
Accessibility (technical)          ██████████████████░░  6.5 → 9.2   (9%)
Performance                        ██████████████████░░  6.0 → 9.0   (9%)
Maintainability & hygiene          ███████████████░░░░░  7.0 → 7.5   (10%)
```

### Design — 83.7 / 100  *(was 70.5)*

```
Visual system & tokens             ██████████████░░░░░░  7.0 → 7.6   (20%)
Layout & responsive behaviour      ███████████████░░░░░  7.5 → 8.0   (20%)
Typography & readability           ███████████░░░░░░░░░  5.5 → 8.5   (15%)
Design accessibility               ███████████░░░░░░░░░  5.5 → 9.0   (15%)
Motion & interaction quality       ████████████████░░░░  8.0 → 8.2   (10%)
Content design & i18n              ████████████████░░░░  8.0 → 9.0   (10%)
Brand & differentiation            ██████████████████░░  9.0 → 9.0   (10%)
```

### Grade bands

| Score | Grade | Meaning |
|---|---|---|
| 90–100 | A | Exemplary; reference implementation |
| 80–89 | B | Production-ready; minor debt |
| 70–79 | C | Shippable with known conditions |
| 60–69 | D | Material risk; remediation required before release |
| < 60 | F | Not releasable |

**Bloom sits at B (quality) / C+ (design) → composite B.** The asymmetry is the story: the *engineering* is ahead of the *craft*.

---

## 5. Top five actions, in order

| # | Action | Effort | Score impact |
|---|---|---|---|
| 1 | Ship a security-header policy (`next.config.ts` `headers()`) + CSP; upgrade `next` past the advisory | 0.5 d | QC +1.5 |
| 2 | Add `error.tsx` / `global-error.tsx` / `not-found.tsx` | 0.5 d | QC +1.5 |
| 3 | Raise the type scale (body 13→15px, floor 11px) and lift `--soft`/`--muted` to ≥4.5:1 | 1 d | Design +6 |
| 4 | Add route-level integration tests for `/api/journal` (auth, 402, 409, 413) and component tests for the trade dialog | 2 d | QC +3 |
| 5 | Split `globals.css` into layered modules; consolidate to a spacing/radius/type scale | 3 d | Design +2, QC +1 |

Full sequenced roadmap: [quality-control-scorecard.md §6](./quality-control-scorecard.md#6-remediation-roadmap).
