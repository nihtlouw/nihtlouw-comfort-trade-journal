"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { JournalApp } from "@/components/journal-app";
import { JournalLoading } from "@/components/journal-loading";
import { inspectBrowserJournal } from "@/lib/browser-journal";
import { createDemoData } from "@/lib/demo-data";
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
// Match the visual exit in globals.css. The ready journal remains interactive underneath.
const LOADING_EXIT_MS = 1250;
function BrowserJournal() {
  const [initial] = useState(() => {
    try { return inspectBrowserJournal(window.localStorage, createDemoData()); }
    catch { return { data: createDemoData(), damaged: null }; }
  });
  const reduced = initial.data.settings.reduceMotion === true;
  const [showLoading, setShowLoading] = useState(() => !reduced && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (!showLoading) return;
    const timer = window.setTimeout(() => setShowLoading(false), LOADING_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [showLoading]);
  return <><JournalApp initialData={initial.data} storage="browser" initialDamaged={initial.damaged}/>{showLoading && <JournalLoading leaving reduceMotion={reduced} theme={initial.data.settings.theme} locale={initial.data.settings.locale ?? "en"}/>}</>;
}
export function PagesJournal() {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return mounted ? <BrowserJournal/> : <JournalLoading/>;
}
