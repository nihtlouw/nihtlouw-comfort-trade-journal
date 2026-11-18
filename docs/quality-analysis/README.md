# Bloom — Quality Analysis, Quality Control & Design Score

> Scope: full repository at commit `02aae22` (branch `arena/8a2ed203-nihtlouw-comfort-trade-journal`).
> Method: static analysis, automated test execution, production build instrumentation, security review of every API route, and WCAG 2.1 contrast computation on the live design tokens.
> Date: 2026-11-18

---

## 1. Executive summary

Bloom is a **well-engineered, unusually disciplined single-product application**. It has a green static-analysis baseline, a real (not theatrical) test suite with exact-money assertions, a security model that is materially better than the typical indie SaaS, and a coherent visual identity. Its weaknesses are not "broken" things — they are **architectural seams**: a monolithic global stylesheet, a monolithic client shell, thin coverage exactly at the network boundary, and a typography scale that sacrifices legibility for visual density.

| Measure | Result | Reading |
|---|---|---|
| **Quality Control score** | **81.5 / 100** — Grade **B+** | Strong. Production-capable with a bounded, known gap list. |
| **Design score** | **70.5 / 100** — Grade **C+** | Distinct and coherent, but accessibility and type scale hold it back. |
| **Composite (QA 60% / Design 40%)** | **77.1 / 100** — Grade **B** | Ship-ready for a personal/private deployment; not yet for untrusted public SaaS. |
| **Release recommendation** | **CONDITIONAL PASS** | Fix the 3 P1 defects in §7 before any public multi-tenant launch. |

### The 60-second version

**What is genuinely good**

- `strict` TypeScript with **zero** `any`, **zero** `@ts-ignore`, **zero** `console.log` in `src/`, **zero** `dangerouslySetInnerHTML`. That combination is rare and it is the single best predictor of low defect density in a JS codebase.
- **38/38 tests pass**, and they test *hard* things: cent-exact XLSX round-trips, HMAC webhook lifecycles, AWS SigV4 signing, v1→v2 journal migration, corrupt-data non-destruction, CSV duplicate detection.
- Every authenticated API route re-derives identity server-side, enforces `isAllowedMutation` origin checks, caps body size even without `content-length`, and validates magic bytes rather than trusting MIME strings.
- Optimistic concurrency (`revision`) with a 409 instead of silent last-write-wins; corrupt local data is *never* silently overwritten.
- Design tokens, light/dark themes, reduced-motion support, focus trapping with restore-on-close, `aria-pressed` state, real table semantics.

**What will bite**

1. **No global security headers.** No CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy` anywhere — confirmed by live response inspection. An app that stores financial data and renders user-supplied captions is one SVG/preset leak away from a bad day.
2. **Coverage stops exactly where risk starts.** 0% of the 18 API routes and 0% of the 17 components are tested. All 38 tests are pure-function tests.
3. **The type scale is too small.** 381 of 528 `font-size` declarations (72%) are under 12px — 11px is the *most common* size (146 uses), 10px appears 109 times, and a 7px declaration exists. Body text is 13px. On a 6" Android phone — an explicitly supported target — this is a real usability defect.
4. **Muted/soft text fails contrast.** `--soft: #94a398` on white computes to **2.64:1** and `--muted` to **3.98:1** (WCAG AA needs 4.5:1; even large text needs 3:1). The *dark* theme passes everything — the accessible theme is not the default one.
5. **`globals.css` is 7,665 lines** with 318 duplicated selectors and 879 hard-coded hex values. Every visual change is a regression risk.
6. **No error boundary.** No `error.tsx`, `global-error.tsx`, or `not-found.tsx`. One thrown render error white-screens the journal.

---

## 2. Evidence base

Everything in these documents is traceable to a command run against this checkout. No claim is estimated.

| Evidence | Command | Result |
|---|---|---|
| Type safety | `npx tsc --noEmit` | exit 0, no output |
| Lint | `npx eslint .` | exit 0, zero warnings |
| Unit tests | `npm test` | **38 pass / 0 fail**, ~1.9 s |
| Production build | `npm run build` | compiled 13.0 s, TS 11.8 s, 13 static pages, 0 errors |
| Client JS budget | `find .next/static -name '*.js' \| gzip -c` | **499 KB gzip** (largest chunk 312 KB gzip) |
| CSS budget | same for `.css` | **41 KB gzip** (from 264 KB source) |
| Live headers | `curl -sI http://127.0.0.1:3000/local` | **no** CSP / HSTS / XFO / Referrer-Policy |
| Live route behaviour | `curl /api/health`, `POST /api/trades` | `{"ok":true,"mode":"browser"}`, legacy API `410` |
| Dependency risk | `npm audit --omit=dev` | 1 moderate (`next` 16.2.0–16.4.4 cache-leak advisory) |
| i18n parity | programmatic key diff of `UI_COPY` | **831 EN = 831 ID**, 0 missing, 0 empty |
| Contrast | WCAG 2.1 relative-luminance formula | see §4 of the design scorecard |
| Codebase size | `wc -l` | 34,112 lines across 66 TS/TSX/CSS/SQL files |

Reproduce all of it with the executable gate:

```sh
node scripts/quality-gate.mjs          # full gate (lint + types + tests + build)
node scripts/quality-gate.mjs --fast   # static heuristics only, ~2 s
```

---

## 3. Document map

| Document | Purpose | Audience |
|---|---|---|
| **[structural-workflow.md](./structural-workflow.md)** | The 6-gate quality workflow, entry/exit criteria, defect taxonomy, release gate, and operating cadence — the *process* | Engineering lead, QA, reviewers |
| **[quality-control-scorecard.md](./quality-control-scorecard.md)** | 9 weighted quality dimensions with evidence, the defect register, and a sequenced remediation roadmap | Engineering, security |
| **[design-scorecard.md](./design-scorecard.md)** | 7 weighted design dimensions, heuristic audit, contrast tables, and design-system recommendations | Design, frontend |
| **[`scripts/quality-gate.mjs`](../../scripts/quality-gate.mjs)** | Machine-enforced subset of the workflow; fails CI on budget/a11y/hygiene regressions | CI |

---

## 4. Score at a glance

### Quality Control — 81.5 / 100

```
Static correctness & type safety   ███████████████████░  9.5   (10%)
Test depth & coverage              ███████████████░░░░░  7.5   (20%)
CI/CD reliability                  ██████████████░░░░░░  7.0   (10%)
Security posture                   ████████████████░░░░  8.0   (20%)
Data integrity & recovery          ██████████████████░░  9.0   (10%)
Error handling & observability     ███████████░░░░░░░░░  5.5   (10%)
Accessibility (technical)          █████████████░░░░░░░  6.5   (10%)
Performance                        ████████████░░░░░░░░  6.0   (10%)
Maintainability & hygiene          ██████████████░░░░░░  7.0   (10%)
```

### Design — 70.5 / 100

```
Visual system & tokens             ██████████████░░░░░░  7.0   (20%)
Layout & responsive behaviour      ███████████████░░░░░  7.5   (20%)
Typography & readability           ███████████░░░░░░░░░  5.5   (15%)
Design accessibility               ███████████░░░░░░░░░  5.5   (15%)
Motion & interaction quality       ████████████████░░░░  8.0   (10%)
Content design & i18n              ████████████████░░░░  8.0   (10%)
Brand & differentiation            ██████████████████░░  9.0   (10%)
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
