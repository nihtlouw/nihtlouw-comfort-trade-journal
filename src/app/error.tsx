"use client";

import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";

/**
 * Route-level error boundary.
 *
 * A thrown render error must never white-screen a journal that may hold the
 * user's only copy of their trading record. This mirrors the existing
 * `.recovery-banner` visual language and explicitly reassures the user that
 * stored data is untouched — because it is: all writes happen through the
 * journal controller, and a render error cannot reach storage.
 *
 * Deliberately written without `UI_COPY`: an error boundary must render even if
 * the failing tree is the i18n table itself. Copy is bilingual and static.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The app has no error-reporting service yet; keep the diagnostic local and
    // never log journal contents.
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);

  return (
    <main className="fatal-shell" role="alert">
      <div className="fatal-card">
        <span className="fatal-icon" aria-hidden="true">
          <CircleAlert size={22} />
        </span>
        <h1>Something interrupted this screen.</h1>
        <p>
          Nothing was deleted. Your journal is still saved on this device, and no trade, note, or
          reflection was changed. Reload this screen to carry on — if it happens again, open{" "}
          <strong>Settings → Data</strong> and download a backup before making further changes.
        </p>
        <p lang="id" className="fatal-secondary">
          Layar ini terhenti, tetapi data jurnalmu tidak dihapus dan tidak berubah. Muat ulang layar
          ini untuk melanjutkan.
        </p>
        <div className="fatal-actions">
          <button type="button" className="button-primary" onClick={() => reset()}>
            <RotateCcw size={15} /> Try again
          </button>
          <button type="button" className="button-secondary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
        {error.digest && <p className="fatal-digest">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
