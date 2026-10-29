# bloom — mindful trading journal

A calmer place to record trades, understand your process, and look after your mindset. Bloom is built with Next.js, React, Drizzle, and PostgreSQL. It can run entirely in one browser or, with extra configuration, as a private account-backed journal.

## What’s included

- A redesigned responsive dashboard, a calm loading transition and varied, unhurried interface motion, light/dark themes, amount-hiding control, sample-data toggle, and portfolio filters. Motion follows the device’s reduced-motion setting and can also be reduced in Settings.
- Trade logging with optional entry/exit, size, stop, target, fees, initial risk, timeframe, session, tags, checklist snapshots, and screenshots.
- Search and filters, a trading calendar, CSV export, and mapped CSV import with a preview, validation, and possible-duplicate checks. On phones, filters collapse, trade rows show all details without horizontal scrolling, and calendar markers lead to exact daily amounts. Broker CSV files can be imported without giving Bloom trading permissions; **there is no live broker API connection or order execution**.
- Realized P&L charts, period comparisons, expectancy, average win/loss, R-multiple, realized drawdown, and breakdowns by market, setup, mood, and weekday.
- A playbook, mood-check-in history, reflections, multiple intentions, and an optional breathing break.
- Full JSON backup/restore including screenshots, plus an optional private PostgreSQL account mode.

## Quick start: browser-only

Use Node.js 20.9 or newer (Node 22 is recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. If `DATABASE_URL` is not set, the app uses the browser-only journal; no database or account is required. Changes stay in **this browser on this device**: journal data is in local storage and screenshots are in IndexedDB. They do not automatically sync. Clearing site data, using private browsing, or changing browsers/devices can remove access to the data.

Use **Settings → Data → Download** to make a full backup and keep it somewhere safe. The JSON file contains sensitive financial information and images **in plaintext**, so protect it and do not commit it to Git. Restoring a backup replaces the current journal after confirmation. CSV contains trades only, not screenshots, settings, or reflections.

Existing v1 browser journals are read and upgraded in memory using the original storage key; no manual migration is required. If saved data is invalid, Bloom leaves it untouched and blocks writes until you download the original, restore a backup, or explicitly start fresh.

## GitHub Pages

The static app is published at **https://nihtlouw.github.io/nihtlouw-comfort-trade-journal/**. It is always browser-only: GitHub Pages cannot run the database or authentication APIs. The `Deploy to GitHub Pages` workflow publishes on pushes to `main`; repository **Settings → Pages → Source** must be **GitHub Actions**.

```sh
npm run build:pages
# With Chrome/Chromium installed:
CHROME_PATH=/path/to/chromium npm run test:pages
```

The site is generated in `out/` using a temporary source copy; API routes and environment files are excluded. The UI test uses an isolated browser profile and checks the repository base path, persistence, imports, backup/restore, recovery, and all seven views on 320px, 360px, and 412px touch screens, plus landscape layouts. `PAGES_TEST_URL` can point it at a deployed Pages URL.

## Optional private accounts and sync

This mode needs a Node.js host and a PostgreSQL database. It cannot be deployed on GitHub Pages. Use a dedicated database, HTTPS in production, and a private `DATABASE_URL`; never put secrets in `NEXT_PUBLIC_*` variables or commit them.

1. Back up the database first. Copy `.env.example` to `.env.local` and configure:
   - `DATABASE_URL`: your PostgreSQL connection string.
   - `BETTER_AUTH_SECRET`: a unique random secret of at least 32 characters (for example, generate one with `openssl rand -base64 32`).
   - `BETTER_AUTH_URL`: the exact public origin, e.g. `https://journal.example.com`. Outside localhost, HTTPS is required.
   - `BLOOM_ALLOW_SIGNUP=true` temporarily to create your accounts. Sign-ups are disabled by default.
2. Run `npm run db:migrate:private`. It reads `.env.local`/`.env` or environment variables and applies the additive SQL in `migrations/0001_bloom_private.sql`. Review it before applying it to an existing database. It does **not** alter the original shared journal tables.
3. Start the app (`npm run dev`, or `npm run build` then `npm start`) and create an account. Set `BLOOM_ALLOW_SIGNUP=false` and restart after creating the accounts you need.
4. To move a browser-only journal into an account, download its full JSON backup, sign in, and restore it in **Settings → Data**. Local and account-backed journals are otherwise separate.

Each signed-in user has their own journal and screenshots. The server uses Better Auth email/password sessions, per-user data checks, origin checks on mutations, login rate limiting, and revision checks to prevent a stale device from silently overwriting a newer save. On a conflict, copy any unsaved form contents and reload before trying again.

**Operational limitations:** account email verification, password recovery, MFA, and end-to-end encryption are not configured. If a password is lost, there is no self-service reset. Database contents and backups are not application-level encrypted. Before a public deployment, review security, use strong secrets and TLS, protect the database and backups, configure trusted proxy/IP handling and edge rate limits, and keep sign-ups restricted. This is not a substitute for a production security audit.

### Upgrading the previous shared database app

The old `/api/trades` and `/api/settings` mutation endpoints were unauthenticated and are now disabled. Existing `trades` and `journal_settings` rows remain untouched and are **not** automatically assigned to the first person who signs up.

A trusted database administrator can export the old shared journal to an unencrypted Bloom backup file:

```sh
# DATABASE_URL must point to the old database; choose a private path outside the repository.
npm run export:legacy -- /secure/path/bloom-legacy-backup.json
```

The command refuses to overwrite an existing file. After creating and signing in to the intended private account, restore that file from **Settings → Data**. Verify the restored journal before retiring the legacy tables or deleting the export.

## Calculation and storage notes

- P&L is a **manually entered realized net USD amount**, after fees. Fees are saved for reference and are not deducted a second time. There is no automatic instrument-specific P&L calculation, currency conversion, or live market data.
- Win rate excludes breakeven trades. Profit factor is gross wins divided by the absolute value of gross losses. Expectancy is average net P&L per trade. R is net P&L divided by the recorded positive initial risk.
- Drawdown is the peak-to-trough decline in cumulative realized P&L, starting at zero and ordered by trade date then entry ID. It is **not account-equity drawdown** and does not include open positions or cash flows. Chart values are rebased for the selected period.
- Mood breakdowns describe recorded data, not causation or trading advice. Date-only entries use the browser’s local calendar date; the journal does not currently record trade times or exchange time zones.
- Screenshots support PNG, JPEG, WebP, or GIF: up to 2 MiB each, 8 per trade, and 30 MiB per journal. Full backup files are capped at 50 MB. CSV imports are limited to 3 MB and 5,000 rows at a time; journals support up to 10,000 trades. Browser storage availability depends on the device and its quota. Keep independent backups even when using account sync.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run build:pages
CHROME_PATH=/path/to/chromium npm run test:pages
```

`npm run test:private` and `CHROME_PATH=/path/to/chromium npm run test:private:ui` are additional API and browser smoke tests for a **disposable local** PostgreSQL database and local server with sign-up enabled. Set `BLOOM_TEST_URL=http://localhost:3001`; the scripts create test accounts and check isolation, conflicts, origin checks, image ownership, backups, and the disabled legacy API. Do not point tests at real user data.
