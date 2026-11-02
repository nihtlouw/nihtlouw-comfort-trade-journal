import { normalizeJournalData } from "@/lib/journal-data";
import { getAttachment, saveAttachment, validateImage, type StorageMode } from "@/lib/attachments";
import { getStrategyPdf, saveStrategyPdf, validatePdfBlob, type StoredPdfMeta } from "@/lib/strategy-library";
import { MAX_ATTACHMENT_BYTES, MAX_STRATEGY_PDF_BYTES, type JournalData, type StrategyPdfResource, type TradeAttachment } from "@/lib/types";

const BACKUP_FORMAT = "bloom-journal-backup";
type StoredImage = { id: string; name: string; type: TradeAttachment["type"]; size: number; base64: string };
type StoredDocument = { fileId: string; fileName: string; size: number; base64: string };
export type ParsedBackup = {
  journal: JournalData;
  images: { originalId: string; name: string; blob: Blob }[];
  documents: { originalFileId: string; fileName: string; blob: Blob }[];
};

const uniqueAttachments = (data: JournalData) => [
  ...new Map(data.trades.flatMap((trade) => trade.attachments ?? []).map((item) => [item.id, item])).values(),
];
const uniqueStrategyPdfs = (data: JournalData): StrategyPdfResource[] => [
  ...new Map(
    (data.settings.strategyLibrary ?? [])
      .filter((item): item is StrategyPdfResource => item.kind === "pdf")
      .map((item) => [item.fileId, item]),
  ).values(),
];

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(base64: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new Error("An asset in this backup is invalid.");
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function createBackup(data: JournalData, mode: StorageMode) {
  const images: StoredImage[] = [];
  for (const item of uniqueAttachments(data)) {
    const blob = await getAttachment(item, mode);
    if (blob.size !== item.size || (await validateImage(blob)) !== item.type) {
      throw new Error(`Screenshot “${item.name}” is damaged. Backup stopped to avoid producing an incomplete file.`);
    }
    images.push({ id: item.id, name: item.name, type: item.type, size: item.size, base64: toBase64(await blob.arrayBuffer()) });
  }

  const documents: StoredDocument[] = [];
  for (const doc of uniqueStrategyPdfs(data)) {
    const blob = await getStrategyPdf(doc.fileId, doc.fileName, mode);
    if (blob.size !== doc.size) {
      throw new Error(`PDF “${doc.fileName}” is damaged. Backup stopped to avoid producing an incomplete file.`);
    }
    await validatePdfBlob(blob);
    documents.push({
      fileId: doc.fileId,
      fileName: doc.fileName,
      size: doc.size,
      base64: toBase64(await blob.arrayBuffer()),
    });
  }

  const content = JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: 2,
      exportedAt: new Date().toISOString(),
      journal: normalizeJournalData(data),
      images,
      ...(documents.length ? { documents } : {}),
    },
    null,
    2,
  );
  if (new Blob([content]).size > 50_000_000) {
    throw new Error("This journal is too large for a single backup. Remove some screenshots or PDFs and try again.");
  }
  return content;
}

export async function parseBackup(text: string): Promise<ParsedBackup> {
  if (text.length > 50_000_000) throw new Error("Backup files must be under 50 MB.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This is not a valid JSON backup.");
  }
  if (!raw || typeof raw !== "object") throw new Error("This is not a valid Bloom backup.");
  const object = raw as Record<string, unknown>;
  if (object.format !== BACKUP_FORMAT || object.version !== 2 || !Array.isArray(object.images)) {
    throw new Error("This backup format is not supported.");
  }
  const journal = normalizeJournalData(object.journal);
  const references = uniqueAttachments(journal);
  if (object.images.length !== references.length) throw new Error("The backup is missing one or more screenshots.");

  const seen = new Set<string>();
  const images: ParsedBackup["images"] = [];
  for (const value of object.images) {
    if (!value || typeof value !== "object") throw new Error("Invalid screenshot in backup.");
    const image = value as Record<string, unknown>;
    const reference = references.find((item) => item.id === image.id);
    if (
      !reference ||
      seen.has(reference.id) ||
      typeof image.base64 !== "string" ||
      image.base64.length > Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4 ||
      image.type !== reference.type ||
      image.size !== reference.size
    ) {
      throw new Error("A screenshot in this backup is missing or invalid.");
    }
    seen.add(reference.id);
    const bytes = fromBase64(image.base64);
    const blob = new Blob([bytes], { type: reference.type });
    if (blob.size !== reference.size) throw new Error("A screenshot in this backup has an incorrect size.");
    await validateImage(blob);
    images.push({ originalId: reference.id, name: reference.name, blob });
  }

  const pdfReferences = uniqueStrategyPdfs(journal);
  const rawDocs = object.documents === undefined ? [] : object.documents;
  if (!Array.isArray(rawDocs) || rawDocs.length !== pdfReferences.length) {
    throw new Error("The backup is missing one or more strategy PDFs.");
  }
  const seenDocs = new Set<string>();
  const documents: ParsedBackup["documents"] = [];
  for (const value of rawDocs) {
    if (!value || typeof value !== "object") throw new Error("Invalid strategy PDF in backup.");
    const doc = value as Record<string, unknown>;
    const reference = pdfReferences.find((item) => item.fileId === doc.fileId);
    if (
      !reference ||
      seenDocs.has(reference.fileId) ||
      typeof doc.base64 !== "string" ||
      doc.base64.length > Math.ceil((MAX_STRATEGY_PDF_BYTES * 4) / 3) + 4 ||
      doc.size !== reference.size
    ) {
      throw new Error("A strategy PDF in this backup is missing or invalid.");
    }
    seenDocs.add(reference.fileId);
    const bytes = fromBase64(doc.base64);
    const blob = new Blob([bytes], { type: "application/pdf" });
    if (blob.size !== reference.size) throw new Error("A strategy PDF in this backup has an incorrect size.");
    await validatePdfBlob(blob);
    documents.push({ originalFileId: reference.fileId, fileName: reference.fileName, blob });
  }

  return { journal, images, documents };
}

/** Stage restored images & PDFs under new IDs so a failed restore never overwrites existing assets. */
export async function stageBackupImages(backup: ParsedBackup, mode: StorageMode) {
  const staged: TradeAttachment[] = [];
  const stagedDocs: StoredPdfMeta[] = [];
  try {
    const replacements = new Map<string, TradeAttachment>();
    for (const image of backup.images) {
      const saved = await saveAttachment(image.blob, image.name, mode);
      staged.push(saved);
      replacements.set(image.originalId, saved);
    }

    const docReplacements = new Map<string, StoredPdfMeta>();
    for (const doc of backup.documents) {
      const saved = await saveStrategyPdf(doc.blob, doc.fileName, mode);
      stagedDocs.push(saved);
      docReplacements.set(doc.originalFileId, saved);
    }

    return {
      staged,
      stagedDocs,
      journal: {
        ...backup.journal,
        trades: backup.journal.trades.map((trade) => ({
          ...trade,
          attachments: (trade.attachments ?? []).map((image) => {
            const replaced = replacements.get(image.id)!;
            return {
              ...replaced,
              ...(image.stage ? { stage: image.stage } : {}),
              ...(image.caption ? { caption: image.caption } : {}),
            };
          }),
        })),
        settings: {
          ...backup.journal.settings,
          strategyLibrary: (backup.journal.settings.strategyLibrary ?? []).map((item) => {
            if (item.kind !== "pdf") return item;
            const replaced = docReplacements.get(item.fileId)!;
            return {
              ...item,
              fileId: replaced.fileId,
              fileName: replaced.fileName,
              size: replaced.size,
            };
          }),
        },
      },
    };
  } catch (error) {
    const { removeAttachment } = await import("@/lib/attachments");
    const { removeStrategyPdf } = await import("@/lib/strategy-library");
    await Promise.allSettled(staged.map((item) => removeAttachment(item.id, mode)));
    await Promise.allSettled(stagedDocs.map((item) => removeStrategyPdf(item.fileId, mode)));
    throw error;
  }
}

export function downloadFile(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
