import { Sprout } from "lucide-react";
import { UI_COPY } from "@/lib/i18n";
import type { AppLocale } from "@/lib/types";

/** An honest, indeterminate loading state; it never delays the journal becoming interactive. */
export function JournalLoading({
  leaving = false,
  reduceMotion = false,
  theme = "light",
  locale = "en",
}: {
  leaving?: boolean;
  reduceMotion?: boolean;
  theme?: "light" | "dark";
  locale?: AppLocale;
}) {
  const copy = UI_COPY[locale];
  return (
    <main
      className={`loading-screen ${leaving ? "is-leaving" : ""}`}
      data-motion={reduceMotion ? "reduced" : "system"}
      data-theme={theme}
      aria-hidden={leaving || undefined}
    >
      <div className="loading-glow" aria-hidden="true" />
      <div className="loading-content">
        <div className="loading-emblem" aria-hidden="true">
          <span>
            <Sprout size={31} strokeWidth={1.5} />
          </span>
        </div>
        <h1 className="loading-wordmark">
          bloom<span>.</span>
        </h1>
        <p className="loading-subtitle">{copy.loadingSubtitle}</p>
        <div className="loading-track" aria-hidden="true">
          <span />
        </div>
        <p className="loading-message" role="status">
          {copy.loadingMessage}
        </p>
        <noscript>{copy.loadingNoscript}</noscript>
      </div>
    </main>
  );
}
