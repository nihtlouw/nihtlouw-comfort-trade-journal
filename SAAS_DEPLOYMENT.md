# Bloom Trading Journal — SaaS & Android Deployment Guide

Bloom uses an **Obsidian-style "Local-First Freemium + Cloud Sync Pro"** architecture:

- **Free Tier (`$0` server cost per user):** Visitors open `/` and immediately enter **Local Mode** (`localStorage` + `IndexedDB` + `navigator.storage.persist()`). 100% of journaling, analytics, chartbook, playbook, mindset, patience, and `.csv`/`.xlsx`/`.json` features work offline for free.
- **Cloud Sync Pro (`IDR` & `USD`):** Subscribers unlock real-time **Auto Cloud Sync** between Web PC & Android, **Cloud Chartbook & Strategy PDF storage** (smart client-side WebP compression + Cloudflare R2 `$0` egress), and **1-Click Local-to-Cloud Migration**. Cassette MP3 audio stays device-local so audio streaming never inflates cloud bandwidth.

---

## 1. Deploy Web SaaS (Vercel + Neon/Supabase Postgres + Cloudflare R2)

1. **Create PostgreSQL Database** (Neon.tech or Supabase — Free tier supports thousands of users because Free-tier users never touch PostgreSQL).
2. **Run Database Migrations** (`0001`, `0002`, `0003_bloom_saas_billing.sql`):
   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate:private
   ```
3. **Create Cloudflare R2 Bucket** (optional, recommended for `$0` egress image/PDF storage):
   - Create bucket `bloom-journal-assets` and an R2 API Token with Object Read & Write permissions.
   - Add `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` to your environment variables.
4. **Configure Google 1-Click OAuth** (optional):
   - In Google Cloud Console → OAuth 2.0 Client, add Authorized Redirect URI:
     `https://<your-domain>/api/auth/callback/google`
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

---

## 2. Connect Dual Payment Gateways (Indonesia IDR & Global USD)

### A. Indonesian Traders — Midtrans Snap (`QRIS`, `Virtual Account`, `GoPay`, `ShopeePay`)
1. In Midtrans Dashboard (**Settings → Access Keys**), copy `Server Key` and `Client Key`.
2. In **Settings → Configuration → Payment Notification URL**, set:
   ```text
   https://<your-domain>/api/billing/webhooks/midtrans
   ```
3. Set `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, and `MIDTRANS_IS_PRODUCTION=true` (use `false` for Sandbox testing).

### B. International Traders — Lemon Squeezy (`USD` Cards, Apple Pay, PayPal — Merchant of Record)
1. Create Monthly and Yearly variants in Lemon Squeezy and copy `Store ID` + both `Variant ID`s.
2. In **Settings → Webhooks**, point to:
   ```text
   https://<your-domain>/api/billing/webhooks/lemonsqueezy
   ```
   Select events: `subscription_created`, `subscription_updated`, `subscription_payment_success`, `subscription_cancelled`, `subscription_expired`.
3. Set `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_VARIANT_MONTHLY_ID`, `LEMONSQUEEZY_VARIANT_YEARLY_ID`, and `LEMONSQUEEZY_WEBHOOK_SECRET`.

---

## 3. Build Independent Android App (`.apk` & Google Play `.aab`)

### Option A — 1-Click Automated Build on GitHub Actions (No Android Studio Needed)
1. Open your GitHub repository → **Actions → Build Android APK & Play Bundle → Run workflow**.
   - Leave `saas_server_url` blank for a **100% standalone offline Android APK**, or enter `https://<your-domain>` for a **Hybrid Cloud-Sync Android APK**.
2. Download `bloom-trading-journal-android-apk` (`app-debug.apk`) to install directly on Android, or `bloom-trading-journal-play-bundle-aab` (`.aab`) for Google Play Console.

### Option B — Local Build with Android Studio
```bash
npm ci
npm run build:android
npm install --no-save @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```
