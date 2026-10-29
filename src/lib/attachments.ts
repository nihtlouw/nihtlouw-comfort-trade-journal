import { MAX_ATTACHMENT_BYTES, type TradeAttachment } from "@/lib/types";
export type StorageMode = "browser" | "server";
const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

type AttachmentType = TradeAttachment["type"];
export async function validateImage(blob: Blob): Promise<AttachmentType> {
  if (!allowed.includes(blob.type as AttachmentType)) throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
  if (!blob.size || blob.size > MAX_ATTACHMENT_BYTES) throw new Error("Each screenshot must be 2 MB or less.");
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  const valid = blob.type === "image/png" ? bytes[0] === 137 && ascii(1, 3) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10
    : blob.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : blob.type === "image/webp" ? ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP"
    : ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
  if (!valid) throw new Error("The image content does not match its file type.");
  return blob.type as AttachmentType;
}

function openAssetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("bloom-journal-assets", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("images")) request.result.createObjectStore("images"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Couldn't open image storage in this browser."));
    request.onblocked = () => reject(new Error("Image storage is blocked by another tab."));
  });
}
async function browserAsset<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openAssetDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("images", mode);
    const request = action(transaction.objectStore("images"));
    let value: T;
    request.onsuccess = () => { value = request.result; };
    transaction.oncomplete = () => { db.close(); resolve(value); };
    transaction.onerror = () => { db.close(); reject(new Error("Couldn't save or read the screenshot. Check browser storage permissions and space.")); };
    transaction.onabort = () => { db.close(); reject(new Error("Screenshot storage was interrupted.")); };
  });
}
export async function saveAttachment(file: Blob, name: string, mode: StorageMode): Promise<TradeAttachment> {
  const type = await validateImage(file);
  const cleanName = name.slice(0, 200) || "Screenshot";
  if (mode === "browser") {
    const id = crypto.randomUUID();
    await browserAsset("readwrite", (store) => store.put(file, id));
    return { id, name: cleanName, type, size: file.size };
  }
  const form = new FormData(); form.append("file", file, cleanName);
  const response = await fetch("/api/attachments", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Couldn't upload screenshot.");
  return result as TradeAttachment;
}
export async function getAttachment(item: TradeAttachment, mode: StorageMode): Promise<Blob> {
  if (mode === "browser") {
    const blob = await browserAsset<Blob | undefined>("readonly", (store) => store.get(item.id));
    if (!(blob instanceof Blob)) throw new Error(`Screenshot “${item.name}” is missing from this browser.`);
    return blob;
  }
  const response = await fetch(`/api/attachments/${encodeURIComponent(item.id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Couldn't retrieve screenshot “${item.name}”.`);
  return response.blob();
}
export async function removeAttachment(id: string, mode: StorageMode) {
  if (mode === "browser") { await browserAsset("readwrite", (store) => store.delete(id)); return; }
  const response = await fetch(`/api/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error("Couldn't remove screenshot.");
}
