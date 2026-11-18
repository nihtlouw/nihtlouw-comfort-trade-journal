import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * 404 boundary. Bloom is a single-page shell, so the only realistic way to reach
 * this is a stale or mistyped URL (including the app's own `/local/` install
 * entry). Offer both the journal and the offline-capable entry point.
 */
export const metadata = { title: "Page not found — Bloom" };

export default function NotFound() {
  return (
    <main className="fatal-shell" role="main">
      <div className="fatal-card">
        <span className="fatal-icon" aria-hidden="true">
          <Compass size={22} />
        </span>
        <h1>This page doesn’t exist.</h1>
        <p>
          The link may be out of date. Your journal is unaffected — everything is still saved on this
          device.
        </p>
        <p lang="id" className="fatal-secondary">
          Halaman ini tidak ditemukan. Jurnalmu tidak terpengaruh dan tetap tersimpan di perangkat ini.
        </p>
        <div className="fatal-actions">
          <Link className="button-primary" href="/">
            Open my journal
          </Link>
          <Link className="button-secondary" href="/local/">
            Browser-only journal
          </Link>
        </div>
      </div>
    </main>
  );
}
