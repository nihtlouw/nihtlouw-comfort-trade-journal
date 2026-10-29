"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Smartphone } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type OfflineStatus = "checking" | "ready" | "unavailable";
const basePath = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true" ? "/nihtlouw-comfort-trade-journal" : "";

/** Only the browser journal registers the worker. The worker itself never caches private routes. */
export function LocalPwaStatus() {
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
  return <section className="local-pwa-status" aria-label="Browser-only app status"><span className="local-pwa-icon"><Smartphone size={18}/></span><div><strong aria-live="polite">{status === "ready" ? "Browser journal ready offline" : status === "checking" ? "Preparing browser journal for offline use" : "Offline app is not ready"}</strong><p>{status === "ready" ? "Stored on this device. Private-account sync is separate and requires a connection." : "Open this browser journal online and wait for it to prepare. Private sync needs a connection."}</p>
    {!installed && <details><summary>Install on Android</summary><p>In your browser menu, choose <b>Install app</b> or <b>Add to Home screen</b>. The installed icon opens this browser-only journal, not your private account.</p></details>}</div>{canInstall && !installed && <button type="button" className="button-secondary" onClick={() => void install()}><Download size={15}/> Install app</button>}</section>;
}
