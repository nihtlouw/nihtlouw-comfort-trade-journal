import type { StorageMode } from "@/lib/attachments";
import { MAX_STRATEGY_PDF_BYTES, type AppLocale } from "@/lib/types";

export type StoredPdfMeta = {
  fileId: string;
  fileName: string;
  size: number;
};

/** Verify real %PDF- magic bytes within the first 1024 bytes and enforce size cap. */
export async function validatePdfBlob(blob: Blob): Promise<void> {
  if (!blob.size) {
    throw new Error("The selected PDF file is empty.");
  }
  if (blob.size > MAX_STRATEGY_PDF_BYTES) {
    throw new Error("Each strategy PDF must be 10 MB or less.");
  }
  const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
  let hasSignature = false;
  for (let i = 0; i <= head.length - 5; i++) {
    if (
      head[i] === 0x25 && // %
      head[i + 1] === 0x50 && // P
      head[i + 2] === 0x44 && // D
      head[i + 3] === 0x46 && // F
      head[i + 4] === 0x2d // -
    ) {
      hasSignature = true;
      break;
    }
  }
  if (!hasSignature) {
    throw new Error("Choose a valid PDF document (.pdf).");
  }
}

export function cleanPdfTitle(fileName: string): string {
  const base = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "Strategy PDF").slice(0, 120);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseStrategyLinkUrl(raw: string): {
  url: string;
  hostLabel: string;
  suggestedTitle: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#].*)?$/i.test(trimmed)
      ? `https://${trimmed}`
      : null;
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (!host || (!host.includes(".") && host !== "localhost")) return null;

  const hostLabel = host.replace(/^www\./, "");
  const slugSegment = parsed.pathname
    .split("/")
    .filter(Boolean)
    .pop();
  const decodedSlug = slugSegment
    ? decodeURIComponent(slugSegment)
        .replace(/\.[a-z0-9]{2,5}$/i, "")
        .replace(/[_-]+/g, " ")
        .trim()
    : "";
  const suggestedTitle = (decodedSlug ? `${hostLabel} · ${decodedSlug}` : hostLabel).slice(0, 120);

  return {
    url: parsed.href.slice(0, 500),
    hostLabel,
    suggestedTitle,
  };
}

function openStrategyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("bloom-strategy-library", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("pdfs")) {
        request.result.createObjectStore("pdfs");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Couldn't open PDF storage in this browser."));
    request.onblocked = () => reject(new Error("PDF storage is blocked by another tab."));
  });
}

async function browserPdfStore<T>(
  txMode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openStrategyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pdfs", txMode);
    const req = action(tx.objectStore("pdfs"));
    let result: T;
    req.onsuccess = () => {
      result = req.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(new Error("Couldn't save or read the PDF in browser storage."));
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("PDF storage was interrupted."));
    };
  });
}

export async function saveStrategyPdf(
  file: Blob,
  name: string,
  mode: StorageMode,
): Promise<StoredPdfMeta> {
  await validatePdfBlob(file);
  const rawName = (name.trim() || "strategy.pdf").slice(0, 196);
  const cleanName = /\.pdf$/i.test(rawName) ? rawName : `${rawName}.pdf`;
  const pdfBlob = file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" });

  if (mode === "browser") {
    const fileId = crypto.randomUUID();
    await browserPdfStore("readwrite", (store) => store.put(pdfBlob, fileId));
    return { fileId, fileName: cleanName, size: pdfBlob.size };
  }

  const form = new FormData();
  form.append("file", pdfBlob, cleanName);
  const response = await fetch("/api/library", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Couldn't upload strategy PDF.");
  }
  return result as StoredPdfMeta;
}

export async function getStrategyPdf(
  fileId: string,
  fileName: string,
  mode: StorageMode,
): Promise<Blob> {
  if (mode === "browser") {
    const blob = await browserPdfStore<Blob | undefined>("readonly", (store) => store.get(fileId));
    if (!(blob instanceof Blob)) {
      throw new Error(`PDF “${fileName}” is missing from this browser.`);
    }
    return blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
  }

  const response = await fetch(`/api/library/${encodeURIComponent(fileId)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Couldn't retrieve PDF “${fileName}”.`);
  }
  const bytes = await response.arrayBuffer();
  return new Blob([bytes], { type: "application/pdf" });
}

export async function removeStrategyPdf(fileId: string, mode: StorageMode): Promise<void> {
  if (mode === "browser") {
    await browserPdfStore("readwrite", (store) => store.delete(fileId));
    return;
  }
  const response = await fetch(`/api/library/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error("Couldn't remove PDF.");
  }
}

/** Generate a tiny, valid 1-page %PDF-1.4 strategy cheat-sheet for 3-month sample data. */
export function buildSampleStrategyPdfBlob(locale: AppLocale = "en"): Blob {
  const isId = locale === "id";
  const lines = isId
    ? [
        "BLOOM TRADING — RINGKASAN BUKU STRATEGI A+",
        "1. Tunggu sweep likuiditas sesi Asia/London sebelum entry.",
        "2. Konfirmasi perubahan struktur M15 dan tentukan risiko awal.",
        "3. Maksimal 2-3 trade berkualitas per hari; lindungi profit pagi.",
      ]
    : [
        "BLOOM TRADING — A+ STRATEGY PLAYBOOK NOTES",
        "1. Wait for Asian/London liquidity sweep into HTF key level.",
        "2. Confirm M15 structure shift and predefine exact USD risk.",
        "3. Cap daily execution at 2-3 A+ setups; protect green mornings.",
      ];

  const escapePdfText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const streamBody = [
    "BT",
    "/F1 15 Tf",
    "54 730 Td",
    `(${escapePdfText(lines[0])}) Tj`,
    "/F1 11 Tf",
    "0 -32 Td",
    `(${escapePdfText(lines[1])}) Tj`,
    "0 -22 Td",
    `(${escapePdfText(lines[2])}) Tj`,
    "0 -22 Td",
    `(${escapePdfText(lines[3])}) Tj`,
    "ET",
  ].join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new Blob([pdf], { type: "application/pdf" });
}
