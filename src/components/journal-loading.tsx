import { Sprout } from "lucide-react";

/** An honest, indeterminate loading state; it never delays the journal becoming interactive. */
export function JournalLoading({ leaving = false, reduceMotion = false, theme = "light" }: { leaving?: boolean; reduceMotion?: boolean; theme?: "light" | "dark" }) {
  return <main className={`loading-screen ${leaving ? "is-leaving" : ""}`} data-motion={reduceMotion ? "reduced" : "system"} data-theme={theme} aria-hidden={leaving || undefined}>
    <div className="loading-glow" aria-hidden="true"/>
    <div className="loading-content">
      <div className="loading-emblem" aria-hidden="true"><span><Sprout size={31} strokeWidth={1.5}/></span></div>
      <h1 className="loading-wordmark">bloom<span>.</span></h1>
      <p className="loading-subtitle">A MINDFUL TRADING JOURNAL</p>
      <div className="loading-track" aria-hidden="true"><span/></div>
      <p className="loading-message" role="status">Opening your journal…</p>
      <noscript>Please enable JavaScript to use this journal.</noscript>
    </div>
    <div className="loading-footnote" aria-hidden="true"><span>✳</span> A LITTLE SPACE TO GROW</div>
  </main>;
}
