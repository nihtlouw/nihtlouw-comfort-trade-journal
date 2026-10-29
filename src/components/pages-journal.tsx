"use client";
import { useState, useSyncExternalStore } from "react";
import { JournalApp } from "@/components/journal-app";
import { inspectBrowserJournal } from "@/lib/browser-journal";
import { createDemoData } from "@/lib/demo-data";
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function BrowserJournal() {
  const [initial] = useState(() => {
    try { return inspectBrowserJournal(window.localStorage, createDemoData()); }
    catch { return { data: createDemoData(), damaged: null }; }
  });
  return <JournalApp initialData={initial.data} storage="browser" initialDamaged={initial.damaged}/>;
}
export function PagesJournal() {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return mounted ? <BrowserJournal/> : <main className="loading-screen"><span>✳</span><h1>bloom.</h1><p role="status">Opening your journal…</p><noscript>Please enable JavaScript to use this journal.</noscript></main>;
}
