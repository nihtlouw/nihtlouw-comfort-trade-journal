# bloom — Comfort Trade Journal

A mindful trading journal built with Next.js, React, Drizzle ORM, and PostgreSQL.

## Live GitHub Pages journal

Open **https://nihtlouw.github.io/nihtlouw-comfort-trade-journal/** to use the UI.
The `github.com` repository URL shows source code, not the running application.

GitHub Pages only hosts static files. This version starts with sample trades and
stores changes in **this browser's local storage**. It does not connect to Neon,
sync across devices, or back up your trades. Clearing site data removes those
entries. Do not use browser-only storage as your only copy of important records.

The `Deploy to GitHub Pages` workflow builds and publishes the site on pushes to
`main`. Repository **Settings → Pages → Source** must be **GitHub Actions**.

To validate the Pages build locally:

```sh
npm ci
npm run lint
npm run typecheck
npm run build:pages
```

The generated site is in `out/`. The build uses a temporary source copy, omits
server routes, and leaves the original database-backed app unchanged. Environment
files and database credentials are not copied into the Pages build.

With Chrome installed, run `npm run test:pages` after building to check rendering,
trade/goal persistence, deletion, invalid saved-data recovery, navigation, and
mobile styling in a fresh, isolated browser profile. If Chrome is not installed
in the default Windows location, set `CHROME_PATH` to its executable. Set
`PAGES_TEST_URL` to the live site URL to run the same checks against deployment.

## Database-backed app

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL` privately.
3. Apply `src/db/schema.ts` to your PostgreSQL database using Drizzle. Drizzle's
   CLI reads `.env` by default, so load `DATABASE_URL` into your shell or provide
   it via `.env` before running `npx drizzle-kit push`. Review schema changes
   before applying them to an existing database.
4. Run `npm run dev`, or `npm run build` followed by `npm start` for production.

The server app seeds sample trades the first time a journal is initialized.
It needs a Node.js-capable host, not GitHub Pages. Keep `DATABASE_URL` on the
server; never expose it through `NEXT_PUBLIC_*` variables or commit it to Git.
This is currently a single shared journal with no authentication; add access
control before deploying private financial information to a public server.