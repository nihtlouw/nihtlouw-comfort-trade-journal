/**
 * Requests durable device storage (`navigator.storage.persist()`) so Android
 * WebView / Chrome never evicts the trader's local journal or IndexedDB assets
 * under low-memory pressure.
 */
export async function ensurePersistentDeviceStorage(): Promise<{
  supported: boolean;
  persisted: boolean;
}> {
  if (typeof navigator === "undefined" || !navigator.storage || typeof navigator.storage.persisted !== "function") {
    return { supported: false, persisted: false };
  }
  try {
    const already = await navigator.storage.persisted();
    if (already) return { supported: true, persisted: true };
    if (typeof navigator.storage.persist === "function") {
      const granted = await navigator.storage.persist();
      return { supported: true, persisted: Boolean(granted) };
    }
    return { supported: true, persisted: false };
  } catch {
    return { supported: true, persisted: false };
  }
}
