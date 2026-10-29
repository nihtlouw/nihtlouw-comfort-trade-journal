"use client";

import { useState, useSyncExternalStore } from "react";
import { JournalApp } from "@/components/journal-app";
import { loadBrowserJournal } from "@/lib/browser-journal";
import { createDemoData } from "@/lib/demo-data";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function BrowserJournal() {
  const [initialData] = useState(() => {
    const fallback = createDemoData();
    try {
      return loadBrowserJournal(window.localStorage, fallback);
    } catch {
      return fallback;
    }
  });
  return <JournalApp initialData={initialData} storage="browser" />;
}

export function PagesJournal() {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return mounted ? <BrowserJournal /> : <main style={{ padding: "3rem", textAlign: "center" }}>
    <h1>bloom — your mindful trading journal</h1>
    <p role="status">Opening your journal…</p>
    <noscript>Please enable JavaScript to use this journal.</noscript>
  </main>;
}