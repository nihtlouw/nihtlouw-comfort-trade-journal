"use client";

import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";

/**
 * Root error boundary. This replaces the entire document, so it must render its
 * own <html>/<body> and cannot rely on the app shell, fonts loaded via the root
 * layout, or any state. Kept dependency-light and semantic for that reason.
 *
 * It exists specifically so a failure in the root layout (which `error.tsx`
 * cannot catch) still tells the user their journal data is intact.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#f5f7f3",
          color: "#263f32",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main role="alert" style={{ maxWidth: 520, width: "100%" }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: 20,
              border: "1px solid #edcfbd",
              borderRadius: 13,
              background: "#fff5ec",
            }}
          >
            <span style={{ color: "#a65c4a", flexShrink: 0 }} aria-hidden="true">
              <CircleAlert size={22} />
            </span>
            <div>
              <h1 style={{ margin: "0 0 8px", fontSize: 18, lineHeight: 1.3 }}>
                Bloom could not start this screen.
              </h1>
              <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.6, color: "#5c4a3f" }}>
                Your saved journal has not been changed or deleted. Reload to try again. If the
                problem continues, open Bloom in the same browser and download a backup from{" "}
                <strong>Settings → Data</strong> before making further changes.
              </p>
              <p lang="id" style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6, color: "#5c4a3f" }}>
                Data jurnalmu tidak diubah atau dihapus. Muat ulang halaman untuk mencoba lagi.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => reset()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    minHeight: 41,
                    padding: "0 16px",
                    border: 0,
                    borderRadius: 8,
                    background: "#457a58",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <RotateCcw size={15} /> Try again
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{
                    minHeight: 41,
                    padding: "0 16px",
                    border: "1px solid #e0d5c8",
                    borderRadius: 8,
                    background: "#fff",
                    color: "#263f32",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Reload the page
                </button>
              </div>
              {error.digest && (
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "#7a6759" }}>
                  Reference: {error.digest}
                </p>
              )}
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
