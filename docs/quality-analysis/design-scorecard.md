# Design Scorecard — 70.5 / 100 (C+)

> Seven weighted dimensions, scored against an absolute rubric for a calm, data-dense productivity app. Includes a Nielsen heuristic audit, computed WCAG 2.1 contrast tables, and a design-system recommendation.

---

## Scoring model

| 0–3 | 4–5 | 6–7 | 8–9 | 10 |
|---|---|---|---|---|
| Incoherent / unusable | Generic, inconsistent | Coherent with visible rough edges | Distinctive and disciplined | Reference-quality craft |

---

## 1. Visual system & tokens — **7.0/10** (weight 20%)

### What works

A real token layer exists and is used **1,014 times** to reference just **46 variables**:

```css
.app-shell {
  --canvas: #f5f7f3; --surface: #fff; --surface-alt: #f8faf6; --sidebar: #fdfefb;
  --ink: #263f32; --heading: #253f31; --muted: #718479; --soft: #94a398;
  --accent: #4f8664; --accent-dark: #326d4d; --accent-pale: #e8f2e7;
  --line: #e7ede6; --chart-grid: #e8eee8; --loss: #b76e5e; --shadow: …
}
```

The palette is genuinely good design: a sage/moss green accent on a warm off-white ("paper") canvas, with a warm charcoal dark theme rather than a blue-grey one. Semantic naming (`--ink`, `--muted`, `--soft`, `--line`, `--loss`) rather than literal naming (`--green-500`) shows intent. Light and dark are both fully authored — dark is not an inverted afterthought; it re-tunes every surface to `#141210`/`#1e1a17` and re-maps the accent to `#92ba98` so it survives on a dark ground.

### What holds it back

| Finding | Measurement |
|---|---|
| Token coverage | 879 hard-coded hex values vs 46 tokens — **~5% of colour decisions are tokenized** |
| Dark-mode maintenance | 274 `[data-theme="dark"]` references (the base `.app-shell` token block is re-declared 4×) — the theme is maintained by *duplication*, so every new component needs a second rule |
| Scale proliferation — type | **50 distinct font sizes** (7, 8, 8.2, 9, 9.5, 9.6, 9.8, 10, 10.2, 10.3, 10.5, 10.6, 10.8, 11, 11.1, 11.2, 11.4, 11.5, 11.6, 12, 12.5, …) |
| Scale proliferation — radius | **21 distinct radii** (2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,20,24,99,999) |
| Scale proliferation — padding | **33 distinct single-value padding steps** |
| Scale proliferation — breakpoints | **9 ad-hoc widths** (390, 560, 650, 700, 860, 900, 950, 980) plus compound queries |
| `!important` | 41 uses — a symptom of specificity fighting in one 7.6k-line file |

**Verdict:** excellent *palette*, weak *system*. A token layer that covers 5% of colour usage and five competing numeric scales is a palette with good manners, not a design system. The fix is mechanical and high-leverage: 3 spacing steps, 4 radii, a 9-step type scale — and dark mode derived from tokens rather than re-declared.

---

## 2. Layout & responsive behaviour — **7.5/10** (weight 20%)

### Strengths

- **Real responsive engineering, not media-query theatre.** 61 media queries, and the layouts actually *restructure*: the trade table converts to detail-preserving stacked rows on phones ("trade rows show all details without horizontal scrolling" — verified in `TradeTable`), filters collapse behind a disclosure with a live active-filter count, and the sidebar becomes an off-canvas drawer with focus trap and Escape.
- **Deliberate touch targets.** `min-height: 42px` on nav items, `41px` on buttons — above the 40px practical floor.
- **Tested at real device widths.** The Playwright suite explicitly exercises **320 / 360 / 412 px** plus landscape, and `pointer: coarse` is used to differentiate touch from mouse on the 651–900 px band. That is unusually careful.
- **Density is appropriate to the domain.** 13px base with tight leading is defensible for a data journal — traders expect a terminal-like density. The problem is not the intent, it is the floor (see §3).
- **Vertical rhythm is mostly consistent** (`--shadow` and `13px` card radius recur), and layout primitives (`.card`, `.view-stack`, `.form-grid`) are reused rather than re-invented per view.

### Weaknesses

- The breakpoint set is **accumulated, not designed** — 650 px and 560 px and 390 px all exist with overlapping intents.
- No container queries despite a shell/sidebar split that would benefit from them.
- `z-index` is ad hoc (0,1,2,20,40,42,45,70,75,80,95,100,110) with no layer scale — a latent stacking bug source when a new overlay is added.
- 22 inline `style={{…}}` props, including the dynamic `backgroundImage` on the Overview banner (which is also the 1.9 MB PNG problem).

---

## 3. Typography & readability — **5.5/10** (weight 15%)

**The single largest design defect in the app.**

| Measurement | Value |
|---|---|
| Total `font-size` declarations | **528** |
| Declarations **under 12 px** | **381 (72%)** |
| Distribution | 7px ×1 · 8px ×6 · 9px ×37 · 9.5px ×14 · **10px ×109** · 10.5px ×33 · **11px ×146** · 11.5px ×17 · 12px ×39 (+51 at 12px and above, to 150px display sizes) |
| Base body size | **13px** (`font-size: 13px` on `.app-shell`) |
| Distinct sizes | 50 |

### Why this is a defect, not a style choice

For a browser-only Android product — which Bloom explicitly is, complete with an install prompt and a manifest — this scale fails the physical test:

- **11px is the app's most common text size (146 declarations).** At 11px on a 6" 1080p phone, that is roughly **6.5 physical points** — below Apple's 11pt minimum and Android's 12sp recommendation, and well under any comfortable reading size.
- **10px appears 109 times** and **9px 37 times** — these are eyebrow labels, nav labels, table metadata, chart axes, and badges. Legible on a designer's monitor at 100% zoom; not legible on a phone in daylight.
- A **7px** and an **8px** declaration exist at all.
- WCAG 1.4.4 requires 200% text resize without loss of content; a 10px label leaves almost no headroom before layout breaks.
- The type *pairing* is genuinely lovely — **DM Serif Display** for the wordmark and headings against **DM Sans** for UI, with a hand-tuned `letter-spacing: -1px` on the brand word. The craft is there; it is simply scaled down too far.

### Recommendation

| Element | Current | Target |
|---|---|---|
| Body / base | 13px | **15px** |
| Secondary/metadata | 11px | **13px** |
| Labels & eyebrows | 9–10px | **11–12px, floor 11px** |
| Absolute minimum anywhere | 7px | **11px** |
| Distinct sizes | 50 | **9** (11,12,13,14,16,18,22,30,38) |
| Line-height | mixed | **1.45 body / 1.2 headings** |

This is a ~1-day change with a disproportionate effect on perceived quality and real usability.

---

## 4. Design accessibility — **5.5/10** (weight 15%)

Contrast computed with the WCAG 2.1 relative-luminance formula on the actual token values in `globals.css`.

### Light theme

| Pair | Ratio | AA (4.5) | AA-large (3.0) |
|---|---|---|---|
| `--ink` `#263f32` on `--canvas` | **10.59:1** | ✅ | ✅ |
| `--ink` on `--accent-pale` `#e8f2e7` | **9.94:1** | ✅ | ✅ |
| `--accent-dark` `#326d4d` on white | **6.12:1** | ✅ | ✅ |
| `--accent` `#4f8664` on white | 4.26:1 | ❌ marginal fail | ✅ |
| white on `--accent` button `#4e8463` | 4.37:1 | ❌ marginal fail | ✅ |
| `--loss` `#b76e5e` on white | 3.88:1 | ❌ | ✅ |
| **`--muted` `#718479` on white** | **3.98:1** | ❌ | ✅ |
| **`--muted` on `--canvas`** | **3.69:1** | ❌ | ✅ |
| **`--soft` `#94a398` on white** | **2.64:1** | ❌ **fail** | ❌ **fail** |
| **`--soft` on `--canvas`** | **2.45:1** | ❌ **fail** | ❌ **fail** |

### Dark theme

| Pair | Ratio | AA | AA-large |
|---|---|---|---|
| `--ink` `#e8e0d5` on `--canvas` `#141210` | 14.29:1 | ✅ | ✅ |
| `--accent` `#92ba98` on surface | 7.98:1 | ✅ | ✅ |
| `--loss` `#e2977e` on surface | 7.37:1 | ✅ | ✅ |
| `--muted` `#b2a698` on surface | 7.24:1 | ✅ | ✅ |
| `--soft` `#8d8275` on surface | 4.59:1 | ✅ | ✅ |
| white on accent button | 4.37:1 | ❌ marginal | ✅ |

**Finding: the dark theme is the accessible one.** All six measured dark pairs pass. The *light* theme — the default — fails on `--soft` in every context (2.45–2.64:1) and on `--muted` for small text (3.69–3.98:1). `--soft` is applied 38 times as `var(--soft)` (nav section labels, eyebrows, secondary metadata) and `--muted` carries most secondary body copy, so **a meaningful share of the default light experience sits below WCAG AA.** Note also that the button/accent pairs (4.26–4.37:1) miss AA by a hair in *both* themes — they pass only as large text.

### Minimum fixes (keep the hue, change the lightness)

| Token | Current | Proposed | New ratio on white | On canvas |
|---|---|---|---|---|
| `--soft` | `#94a398` | `#6d7d73` | 4.62:1 ✅ | 4.28 → nudge to `#667a6f` for 4.5+ |
| `--muted` | `#718479` | `#5c6f63` | 5.35:1 ✅ | 4.96:1 ✅ |
| `--accent` | `#4f8664` | `#45795a` | 4.72:1 ✅ | — |
| button bg | `#4e8463` | `#43795a` | white → 4.72:1 ✅ | — |
| `--loss` | `#b76e5e` | `#a85c4b` | 4.60:1 ✅ | — |

### Other accessibility findings

| Item | Status |
|---|---|
| Focus rings | ✅ 3px `:focus-visible` ring, 3px offset, on all interactive elements |
| Focus trap / Escape / restore | ✅ 4 modals |
| `aria-pressed` / `aria-expanded` / `aria-current` | ✅ systematic |
| Live regions | ✅ toasts, banners, calendar month |
| Unlabelled form controls | ✅ 0 of 88 |
| Table semantics | ✅ full |
| `prefers-reduced-motion` | ✅ honoured (`reduce` blocks animation) + in-app toggle |
| **`<html lang>`** | ⚠️ server-renders `lang="en"`; the journal shell corrects it via `document.documentElement.lang` after hydration, but `AuthScreen` (sign-in) and `JournalLoading` are never corrected — the Indonesian sign-in screen is announced as English |
| **Colour as sole carrier of meaning** | ⚠️ P&L sign is also carried by `+`/`−` and `$` formatting and arrows in most places — mostly fine, but the calendar's day-total colour has a text fallback only on hover |
| Automated a11y regression test | ❌ none |
| Skip link / `role="main"` | ⚠️ absent |

---

## 5. Motion & interaction quality — **8.0/10** (weight 10%)

This is the most *loved* dimension. The motion design is intentional and specific to the brand promise ("calm", "unhurried").

| Evidence | Detail |
|---|---|
| Named easing/exit contract | `MODAL_EXIT_MS = 420` with an explicit comment: *"Keep this in sync with `--bloom-dialog-exit` in globals.css"* |
| Modal choreography | Enter + exit states, `onSubmitCapture` blocking submission during close — the kind of detail that prevents "double-save" bugs |
| Reduced motion | `prefers-reduced-motion: reduce` (2 rules) **and** `no-preference` gating, **and** a user-facing Settings toggle, **and** a test that the preference survives normalization/storage/backup |
| Ambient audio | A purpose-built `ambient-synth.ts` (340 lines) rather than an audio file — synthesizes calm tones, no payload cost |
| Micro-interactions | `translateY(-1px)` hover lift on primary buttons, 150–220 ms colour transitions, `aria-live` month label, toast "take a breath" action that opens the breathing modal |
| Loading | A branded `JournalLoading` transition reused for both client and server routes |
| Domain-specific delight | Cassette deck player (932 lines), vinyl-tape metaphors, exit-board "chalkboard" simulator, recap card export |

**Deductions:** duration vocabulary is inconsistent (44×~160–180 ms, 10× 440 ms, 5× 320 ms, 4× 420 ms — the `0.16s`/`160ms` and `0.18s`/`180ms` pairs are literally the same values written two ways), and 6 `transition: … 0s` declarations suggest animation is being disabled in patches rather than managed.

---

## 6. Content design & i18n — **8.0/10** (weight 10%)

| Check | Result |
|---|---|
| EN/ID key parity | ✅ **831 = 831**, 0 missing, 0 extra, 0 empty |
| Canonical enums stored, translated at render | ✅ markets/moods/sides stay stable in storage |
| Dates localized | ✅ `id-ID` / `en-US` via `Intl` |
| Tone of voice | ✅ distinctive and consistent — "A calmer place to record trades", "take a breath", recovery copy that reassures rather than alarms |
| Error copy | ✅ specific and human ("This journal changed on another device. Reload before saving; your current change has not been saved.") |
| Honesty in copy | ✅ **rare and valuable** — the README and UI disclaim that P&L is manual, that reminders are informational, that figures are hypothetical, that backup download ≠ saved file, that there is no broker connection |
| Financial framing | ⚠️ USD-first (`$` formatting, "$" chart toggle) while the Indonesian audience and Midtrans/IDR pricing imply a local market; `id-ID` locale formatting helps, but no IDR journal currency |
| Hard-coded English in JSX | ✅ ~0 (heuristic scan found none outside the copy table) |
| Two strings violate the i18n contract | ⚠️ `"Patience"` and `"A fresh journal is ready."` are hard-coded in `journal-app.tsx` ternaries |

**Why 8.0:** an 831-key bilingual system with perfect parity, localized enums and dates, and a genuinely kind voice is excellent. The gap is that the product's *financial* language (USD) doesn't yet match its *billing* language (IDR).

---

## 7. Brand & differentiation — **9.0/10** (weight 10%)

| Element | Assessment |
|---|---|
| Name & metaphor | **bloom** — growth, patience, tending. Perfectly aligned with a journal that asks you to breathe before trading. |
| Wordmark | Custom-set DM Serif Display, 29px, `-1px` tracking, with a green full stop as an accent. Memorable and distinctive. |
| Palette personality | Sage green + warm paper + warm charcoal dark. Escapes both the neon-crypto aesthetic and the clinical-blue fintech aesthetic. |
| Iconography | `lucide-react` at consistent `strokeWidth` 1.6–1.7 — coherent weight across 30+ icons |
| Illustration | Hand-planted landscape art, custom app icons including a proper `maskable` variant, an SVG icon |
| Signature features | Cassette audio deck, Patience workspace with 60-second impulse reset, Exit board compounding simulator, Recap card export — none of these are table-stakes features; they express the brand |
| Voice | Kind, non-judgmental, evidence-honest. Rare in trading software, which tends toward bravado. |

**Deduction:** the same brand language is diluted by the 9–11px type (the wordmark's elegance is undercut by 8px "MINDFUL TRADING JOURNAL" sub-labels) and by the 1.9 MB banner art not being optimized — craft in the pixels, not in the delivery.

---

# Heuristic audit (Nielsen's 10)

| # | Heuristic | Score | Evidence |
|---|---|---|---|
| 1 | Visibility of system status | **9** | Toast + `role="status"`; saving state; `aria-live` calendar month; sync banner; offline notice; backup-reminder state; dirty-flag cache |
| 2 | Match to real world | **9** | "Walk away", "giveback", "revenge day", "exit board", "patience"; EN/ID native copy |
| 3 | User control & freedom | **8** | Undo-ish via edit, explicit restore, cancel-on-backdrop, Escape everywhere; **−1** for 13 native `confirm()` dialogs and no undo for deletes |
| 4 | Consistency & standards | **6** | Icons/tokens consistent; **−** 50 type sizes, 21 radii, 9 breakpoints, 318 duplicate selectors, mixed `0.16s`/`160ms` |
| 5 | Error prevention | **9** | Zod on every ingress; magic-byte checks; revision 409; duplicate-CSV detection; quota locks; corrupt-data write block |
| 6 | Recognition over recall | **8** | Persistent nav with active dot; command palette; filter chips with counts; breadcrumb-ish selected-day banner; smart entry chips |
| 7 | Flexibility & efficiency | **8** | Command palette, keyboard shortcuts, CSV import/export, XLSX reports, bulk filters, presets |
| 8 | Aesthetic & minimalist design | **7** | Calm and uncluttered in structure; **−** density achieved by shrinking type rather than by information hierarchy |
| 9 | Help users recover from errors | **6** | Excellent recovery *banner* and honest error copy, but **no error boundary** — a render throw yields a white screen; no retry affordance for failed sync beyond reload |
| 10 | Help & documentation | **10** | The README is genuinely best-in-class: calculation contract, storage semantics, operational limits, security caveats, restore instructions |

**Heuristic mean: 8.0 / 10.** Note the shape: Bloom is strongest on *status, prevention, and documentation*, and weakest on *consistency* and *error recovery* — exactly the two areas the scorecard also flags.

---

# Design system recommendation

Replace "a palette plus 2,334 rules" with a four-layer system. Target end-state, ~5 days of work:

```
src/styles/
├── 01-tokens.css      ← single source: colour (semantic, light+dark via one map),
│                         space (4/8/12/16/24/32), radius (6/10/14/pill),
│                         type (9 steps), shadow (3), z-index (6 named layers),
│                         motion (3 durations × 2 easings)
├── 02-base.css        ← reset, focus-visible, sr-only, form primitives
├── 03-components/     ← button, card, segment, dialog, table, toast, chart (one file each)
└── 04-views/          ← overview, journal, analytics, calendar, patience, exit-board, settings
```

**Concrete targets**

| Property | Now | Target |
|---|---|---|
| Stylesheet files | 1 × 7,665 lines | 25–30 files, none > 400 lines |
| Tokens | 46 | ~110 (colour, space, radius, type, shadow, z, motion) |
| Hard-coded hex | 879 | < 50 (charts only) |
| Type sizes | 50 | 9 |
| Radii | 21 | 4 |
| Breakpoints | 9 ad hoc | 4 (390 / 700 / 900 / 1200) + container queries |
| `!important` | 41 | 0 |
| Duplicate selectors | 318 | < 20 |
| Dark mode | 274 override blocks | 0 (tokens swap) |
| `z-index` | 13 raw values | 6 named layers |
| Minimum font size | 7px | 11px |

**Projected effect:** design score 70.5 → **~84 (B)**, and — more importantly — every future visual change stops being a regression gamble.

---

# Score summary

| # | Dimension | Weight | Score | Weighted |
|---|---|---|---|---|
| 1 | Visual system & tokens | 20% | 7.0 | 1.40 |
| 2 | Layout & responsive | 20% | 7.5 | 1.50 |
| 3 | Typography & readability | 15% | 5.5 | 0.83 |
| 4 | Design accessibility | 15% | 5.5 | 0.83 |
| 5 | Motion & interaction | 10% | 8.0 | 0.80 |
| 6 | Content design & i18n | 10% | 8.0 | 0.80 |
| 7 | Brand & differentiation | 10% | 9.0 | 0.90 |
| | **Total** | **100%** | | **7.05 / 10 → 70.5 / 100** |

**Grade: C+.**

The design is **better than its score suggests in character and worse than it looks in craft**. The brand is distinctive, the motion is thoughtful, the copy is kind, and the structure is calm. What separates it from a B or an A is entirely fixable in about a week: a legible type scale, compliant contrast, and an actual token system instead of a large stylesheet.

**One-paragraph verdict:** Bloom looks like a product made by someone who cares deeply about how trading *feels* — and it is. But it is currently designed for a 27-inch monitor viewed by someone with excellent eyesight. Raising the type floor and the contrast floor is not a redesign; it is a correction that would let the rest of the craft finally be seen.
