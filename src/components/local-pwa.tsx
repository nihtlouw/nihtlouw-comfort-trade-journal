"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { UI_COPY } from "@/lib/i18n";
import type { AppLocale } from "@/lib/types";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type OfflineStatus = "checking" | "ready" | "unavailable";
const basePath = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true" ? "/nihtlouw-comfort-trade-journal" : "";

/** Only the browser journal registers the worker. The worker itself never caches private routes. */
export function LocalPwaStatus({ locale = "en" }: { locale?: AppLocale }) {
  const copy = UI_COPY[locale];
  const [status, setStatus] = useState<OfflineStatus>("checking");
  const [canInstall, setCanInstall] = useState(false); const [installed, setInstalled] = useState(false);
  const installPrompt = useRef<InstallEvent | null>(null);
  useEffect(() => {
    let alive = true;
    const onInstallPrompt = (event: Event) => { event.preventDefault(); installPrompt.current = event as InstallEvent; if (alive) setCanInstall(true); };
    const onInstalled = () => { installPrompt.current = null; if (alive) { setCanInstall(false); setInstalled(true); } };
    window.addEventListener("beforeinstallprompt", onInstallPrompt); window.addEventListener("appinstalled", onInstalled);
    const timer = window.setTimeout(() => {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches);
      if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || !("caches" in window)) { setStatus("unavailable"); return; }
      void navigator.serviceWorker.register(`${basePath}/sw.js`, { scope: `${basePath || ""}/` }).then((registration) => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => { if (alive && installing.state === "redundant" && !registration.active) setStatus("unavailable"); });
        return navigator.serviceWorker.ready;
      }).then(async () => {
        const cache = await caches.open("bloom-local-shell-v1");
        const cached = await cache.match(`${window.location.origin}${basePath}/local/`);
        if (alive) setStatus(cached ? "ready" : "unavailable");
      }).catch(() => { if (alive) setStatus("unavailable"); });
    }, 0);
    return () => { alive = false; window.clearTimeout(timer); window.removeEventListener("beforeinstallprompt", onInstallPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  async function install() {
    const prompt = installPrompt.current; if (!prompt) return;
    try { await prompt.prompt(); await prompt.userChoice; } catch { /* The browser may dismiss or revoke its install prompt. */ }
    finally { installPrompt.current = null; setCanInstall(false); }
  }
  return <section className="local-pwa-status" aria-label="Browser-only app status"><span className="local-pwa-icon"><Smartphone size={18}/></span><div><strong aria-live="polite">{status === "ready" ? copy.pwaReadyTitle : status === "checking" ? copy.pwaCheckingTitle : copy.pwaUnavailableTitle}</strong><p>{status === "ready" ? copy.pwaReadyBody : copy.pwaWaitBody}</p>
    {!installed && <details><summary>{copy.pwaInstallSummary}</summary><p>{copy.pwaInstallHelpPrefix} <b>{copy.pwaInstallMenu1}</b> {copy.pwaOr} <b>{copy.pwaInstallMenu2}</b>. {copy.pwaInstallHelpSuffix}</p></details>}</div>{canInstall && !installed && <button type="button" className="button-secondary" onClick={() => void install()}><Download size={15}/> {copy.pwaInstallBtn}</button>}</section>;
}
