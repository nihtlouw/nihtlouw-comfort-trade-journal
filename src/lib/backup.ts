import { normalizeJournalData } from "@/lib/journal-data";
import { getAttachment, saveAttachment, validateImage, type StorageMode } from "@/lib/attachments";
import { MAX_ATTACHMENT_BYTES, type JournalData, type TradeAttachment } from "@/lib/types";

const BACKUP_FORMAT = "bloom-journal-backup";
type StoredImage = { id: string; name: string; type: TradeAttachment["type"]; size: number; base64: string };
export type ParsedBackup = { journal: JournalData; images: { originalId: string; name: string; blob: Blob }[] };
const uniqueAttachments = (data: JournalData) => [...new Map(data.trades.flatMap((trade) => trade.attachments ?? []).map((item) => [item.id, item])).values()];
function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(base64: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error("An image in this backup is invalid.");
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export async function createBackup(data: JournalData, mode: StorageMode) {
  const images: StoredImage[] = [];
  for (const item of uniqueAttachments(data)) {
    const blob = await getAttachment(item, mode);
    if (blob.size !== item.size || await validateImage(blob) !== item.type) throw new Error(`Screenshot “${item.name}” is damaged. Backup stopped to avoid producing an incomplete file.`);
    images.push({ ...item, base64: toBase64(await blob.arrayBuffer()) });
  }
  const content = JSON.stringify({ format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), journal: normalizeJournalData(data), images }, null, 2);
  if (new Blob([content]).size > 50_000_000) throw new Error("This journal is too large for a single backup. Remove some screenshots and try again.");
  return content;
}
export async function parseBackup(text: string): Promise<ParsedBackup> {
  if (text.length > 50_000_000) throw new Error("Backup files must be under 50 MB.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("This is not a valid JSON backup."); }
  if (!raw || typeof raw !== "object") throw new Error("This is not a valid Bloom backup.");
  const object = raw as Record<string, unknown>;
  if (object.format !== BACKUP_FORMAT || object.version !== 2 || !Array.isArray(object.images)) throw new Error("This backup format is not supported.");
  const journal = normalizeJournalData(object.journal);
  const references = uniqueAttachments(journal);
  if (object.images.length !== references.length) throw new Error("The backup is missing one or more screenshots.");
  const seen = new Set<string>();
  const images: ParsedBackup["images"] = [];
  for (const value of object.images) {
    if (!value || typeof value !== "object") throw new Error("Invalid screenshot in backup.");
    const image = value as Record<string, unknown>;
    const reference = references.find((item) => item.id === image.id);
    if (!reference || seen.has(reference.id) || typeof image.base64 !== "string" || image.base64.length > Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 4 || image.type !== reference.type || image.size !== reference.size) throw new Error("A screenshot in this backup is missing or invalid.");
    seen.add(reference.id);
    const bytes = fromBase64(image.base64);
    const blob = new Blob([bytes], { type: reference.type });
    if (blob.size !== reference.size) throw new Error("A screenshot in this backup has an incorrect size.");
    await validateImage(blob);
    images.push({ originalId: reference.id, name: reference.name, blob });
  }
  return { journal, images };
}
/** Stage restored images under new IDs so a failed restore never overwrites existing assets. */
export async function stageBackupImages(backup: ParsedBackup, mode: StorageMode) {
  const staged: TradeAttachment[] = [];
  try {
    const replacements = new Map<string, TradeAttachment>();
    for (const image of backup.images) {
      const saved = await saveAttachment(image.blob, image.name, mode); staged.push(saved); replacements.set(image.originalId, saved);
    }
    return { staged, journal: { ...backup.journal, trades: backup.journal.trades.map((trade) => ({ ...trade, attachments: (trade.attachments ?? []).map((image) => replacements.get(image.id)!) })) } };
  } catch (error) {
    const { removeAttachment } = await import("@/lib/attachments");
    await Promise.allSettled(staged.map((item) => removeAttachment(item.id, mode)));
    throw error;
  }
}
export function downloadFile(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name;
  try { document.body.appendChild(link); link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
