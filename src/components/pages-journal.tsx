"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { JournalApp } from "@/components/journal-app";
import { JournalLoading } from "@/components/journal-loading";
import type { CloudContext } from "@/lib/billing";
import { inspectBrowserJournal } from "@/lib/browser-journal";
import { createDemoData } from "@/lib/demo-data";
import { ensurePersistentDeviceStorage } from "@/lib/persistent-storage";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
// Match the visual exit in globals.css. The ready journal remains interactive underneath.
const LOADING_EXIT_MS = 1250;

function BrowserJournal({
  cloudContext,
  initialOpenCloud = false,
}: {
  cloudContext?: CloudContext;
  initialOpenCloud?: boolean;
}) {
  const [initial] = useState(() => {
    try { return inspectBrowserJournal(window.localStorage, createDemoData()); }
    catch { return { data: createDemoData(), damaged: null }; }
  });
  const reduced = initial.data.settings.reduceMotion === true;
  const [showLoading, setShowLoading] = useState(() => !reduced && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    void ensurePersistentDeviceStorage();
  }, []);

  useEffect(() => {
    if (!showLoading) return;
    const timer = window.setTimeout(() => setShowLoading(false), LOADING_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [showLoading]);

  return (
    <>
      <JournalApp
        initialData={initial.data}
        storage="browser"
        initialDamaged={initial.damaged}
        cloudContext={cloudContext}
        initialOpenCloud={initialOpenCloud}
      />
      {showLoading && (
        <JournalLoading
          leaving
          reduceMotion={reduced}
          theme={initial.data.settings.theme}
          darkVariant={initial.data.settings.darkVariant ?? "forest"}
          locale={initial.data.settings.locale ?? "en"}
        />
      )}
    </>
  );
}

export function PagesJournal({
  cloudContext,
  initialOpenCloud = false,
}: {
  cloudContext?: CloudContext;
  initialOpenCloud?: boolean;
} = {}) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return mounted ? (
    <BrowserJournal cloudContext={cloudContext} initialOpenCloud={initialOpenCloud} />
  ) : (
    <JournalLoading />
  );
}
