import {
  AUDIO_CHUNK_BYTES,
  MAX_AUDIO_TOTAL_BYTES,
  MAX_AUDIO_TRACKS,
  type AppLocale,
  type AudioMimeType,
  type AudioTrackMeta,
} from "@/lib/types";
import type { StorageMode } from "@/lib/attachments";

export const ALLOWED_AUDIO_MIMES: readonly AudioMimeType[] = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
];

const MIME_ALIASES: Record<string, AudioMimeType> = {
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/x-mpeg-3": "audio/mpeg",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/ogg": "audio/ogg",
  "application/ogg": "audio/ogg",
  "audio/opus": "audio/ogg",
  "audio/flac": "audio/flac",
  "audio/x-flac": "audio/flac",
  "audio/mp4": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "video/mp4": "audio/mp4",
  "audio/aac": "audio/aac",
  "audio/aacp": "audio/aac",
  "audio/webm": "audio/webm",
};

const EXT_MIMES: Record<string, AudioMimeType> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  wave: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  webm: "audio/webm",
};

export function inferAudioMimeType(fileName: string, rawType: string): AudioMimeType | null {
  const normalized = rawType.trim().toLowerCase().split(";")[0];
  if (normalized && MIME_ALIASES[normalized]) return MIME_ALIASES[normalized];
  const ext = fileName.trim().toLowerCase().split(".").pop() ?? "";
  return EXT_MIMES[ext] ?? null;
}

export function cleanTrackTitle(fileName: string) {
  const stripped = fileName.replace(/\.[^./\\]+$/, "").replace(/[_-]+/g, " ").trim();
  return (stripped || "Untitled track").slice(0, 80);
}

/** Verifies magic bytes on the start of an audio file so non-audio binaries are rejected. */
export function validateAudioHeader(bytes: Uint8Array, mimeType: AudioMimeType): boolean {
  if (bytes.length < 4) return false;
  const ascii = (start: number, length: number) =>
    bytes.length >= start + length ? String.fromCharCode(...bytes.slice(start, start + length)) : "";

  switch (mimeType) {
    case "audio/mpeg": {
      if (ascii(0, 3) === "ID3") return true;
      // MPEG audio frame sync (11 set bits) or RIFF-wrapped MP3.
      if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
      return bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
    }
    case "audio/wav":
      return bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
    case "audio/ogg":
      return ascii(0, 4) === "OggS";
    case "audio/flac":
      return ascii(0, 4) === "fLaC";
    case "audio/mp4":
      return bytes.length >= 8 && ascii(4, 4) === "ftyp";
    case "audio/aac":
      if (bytes.length >= 8 && ascii(4, 4) === "ftyp") return true;
      if (ascii(0, 3) === "ID3") return true;
      return bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0 && (bytes[1] & 0x06) === 0x00;
    case "audio/webm":
      return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    default:
      return false;
  }
}

export function audioErrorMessage(
  code: "max_tracks" | "empty" | "quota" | "format" | "header",
  locale: AppLocale = "en",
): string {
  if (locale === "id") {
    switch (code) {
      case "max_tracks":
        return `Maksimal ${MAX_AUDIO_TRACKS} lagu. Hapus salah satu lagu sebelum menambahkan yang baru.`;
      case "empty":
        return "File audio kosong atau tidak valid.";
      case "quota":
        return "Batas total penyimpanan lagu adalah 200 MB. Hapus lagu lama atau pilih file yang lebih kecil.";
      case "format":
        return "Pilih file audio MP3, M4A, WAV, OGG, FLAC, AAC, atau WebM.";
      case "header":
        return "Isi file tidak cocok dengan format audionya.";
    }
  }
  switch (code) {
    case "max_tracks":
      return `You can store up to ${MAX_AUDIO_TRACKS} songs. Remove a track before adding another.`;
    case "empty":
      return "This audio file is empty or invalid.";
    case "quota":
      return "Total music storage is capped at 200 MB. Remove a track or choose a smaller file.";
    case "format":
      return "Choose an MP3, M4A, WAV, OGG, FLAC, AAC, or WebM audio file.";
    case "header":
      return "The file content does not match a supported audio format.";
  }
}

export function validateNewAudioTrack(params: {
  size: number;
  fileName: string;
  rawType: string;
  existingCount: number;
  existingBytes: number;
  headerBytes?: Uint8Array;
  locale?: AppLocale;
}): AudioMimeType {
  const locale = params.locale ?? "en";
  if (params.existingCount >= MAX_AUDIO_TRACKS) throw new Error(audioErrorMessage("max_tracks", locale));
  if (!Number.isFinite(params.size) || params.size <= 0) throw new Error(audioErrorMessage("empty", locale));
  if (params.existingBytes + params.size > MAX_AUDIO_TOTAL_BYTES) throw new Error(audioErrorMessage("quota", locale));
  const mimeType = inferAudioMimeType(params.fileName, params.rawType);
  if (!mimeType) throw new Error(audioErrorMessage("format", locale));
  if (params.headerBytes && !validateAudioHeader(params.headerBytes, mimeType)) {
    throw new Error(audioErrorMessage("header", locale));
  }
  return mimeType;
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("bloom-journal-audio", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("tracks")) db.createObjectStore("tracks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Couldn't open audio storage in this browser."));
    request.onblocked = () => reject(new Error("Audio storage is blocked by another tab."));
  });
}

function sortTracks(tracks: AudioTrackMeta[]) {
  return [...tracks].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export async function listAudioTracks(mode: StorageMode): Promise<AudioTrackMeta[]> {
  if (mode === "browser") {
    const db = await openAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tracks", "readonly");
      const req = tx.objectStore("tracks").getAll();
      let rows: AudioTrackMeta[] = [];
      req.onsuccess = () => { rows = (req.result as AudioTrackMeta[]) ?? []; };
      tx.oncomplete = () => { db.close(); resolve(sortTracks(rows)); };
      tx.onerror = () => { db.close(); reject(new Error("Couldn't read saved songs in this browser.")); };
    });
  }
  const response = await fetch("/api/audio", { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Couldn't load your songs.");
  return sortTracks((result.tracks as AudioTrackMeta[]) ?? []);
}

export function probeAudioDuration(file: Blob): Promise<number | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(value !== null && Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : null);
    };
    const timer = window.setTimeout(() => finish(null), 4000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => { window.clearTimeout(timer); finish(audio.duration); };
    audio.onerror = () => { window.clearTimeout(timer); finish(null); };
    audio.src = url;
  });
}

export async function saveAudioTrack(
  file: Blob,
  options: {
    fileName: string;
    title?: string;
    durationSec?: number | null;
    mode: StorageMode;
    locale?: AppLocale;
    onProgress?: (fraction: number) => void;
  },
): Promise<AudioTrackMeta> {
  const locale = options.locale ?? "en";
  const headerBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const fileName = options.fileName.trim().slice(0, 180) || "track.mp3";
  const title = (options.title?.trim() || cleanTrackTitle(fileName)).slice(0, 80);

  if (options.mode === "browser") {
    const existing = await listAudioTracks("browser");
    const existingBytes = existing.reduce((sum, item) => sum + item.size, 0);
    const mimeType = validateNewAudioTrack({
      size: file.size,
      fileName,
      rawType: file.type,
      existingCount: existing.length,
      existingBytes,
      headerBytes,
      locale,
    });
    const nextOrder = existing.length ? Math.max(...existing.map((item) => item.sortOrder)) + 1 : 0;
    const track: AudioTrackMeta = {
      id: crypto.randomUUID(),
      title,
      fileName,
      mimeType,
      size: file.size,
      durationSec: options.durationSec ?? null,
      sortOrder: nextOrder,
      createdAt: new Date().toISOString(),
    };
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["tracks", "blobs"], "readwrite");
      tx.objectStore("tracks").put(track);
      tx.objectStore("blobs").put(new Blob([file], { type: mimeType }), track.id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error(locale === "id" ? "Gagal menyimpan lagu di browser ini. Periksa izin ruang penyimpanan." : "Couldn't save the song in this browser. Check storage space and permissions.")); };
      tx.onabort = () => { db.close(); reject(new Error(locale === "id" ? "Penyimpanan lagu terhenti." : "Audio storage was interrupted.")); };
    });
    options.onProgress?.(1);
    return track;
  }

  // Server mode: validate format & header locally first, then upload 2 MB chunks to PostgreSQL.
  const mimeType = validateNewAudioTrack({
    size: file.size,
    fileName,
    rawType: file.type,
    existingCount: 0,
    existingBytes: 0,
    headerBytes,
    locale,
  });

  const initRes = await fetch("/api/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      fileName,
      mimeType,
      size: file.size,
      durationSec: options.durationSec ?? null,
    }),
  });
  const initJson = await initRes.json().catch(() => ({}));
  if (!initRes.ok) throw new Error(initJson.error || "Couldn't start song upload.");
  const { id, chunkSize = AUDIO_CHUNK_BYTES, expectedChunks } = initJson as {
    id: string;
    chunkSize: number;
    expectedChunks: number;
  };

  try {
    for (let index = 0; index < expectedChunks; index++) {
      const start = index * chunkSize;
      const slice = file.slice(start, Math.min(start + chunkSize, file.size));
      const chunkRes = await fetch(`/api/audio/${encodeURIComponent(id)}/chunk?index=${index}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: slice,
      });
      if (!chunkRes.ok) {
        const errJson = await chunkRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Couldn't upload song chunk.");
      }
      options.onProgress?.((index + 1) / expectedChunks);
    }
    const completeRes = await fetch(`/api/audio/${encodeURIComponent(id)}/complete`, { method: "POST" });
    const completeJson = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok) throw new Error(completeJson.error || "Couldn't finalize song upload.");
    return completeJson.track as AudioTrackMeta;
  } catch (error) {
    await fetch(`/api/audio/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}

export async function getAudioPlayableUrl(
  track: AudioTrackMeta,
  mode: StorageMode,
): Promise<{ url: string; revoke: boolean }> {
  if (mode === "browser") {
    const db = await openAudioDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction("blobs", "readonly");
      const req = tx.objectStore("blobs").get(track.id);
      let result: Blob | undefined;
      req.onsuccess = () => { result = req.result as Blob | undefined; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(new Error("Couldn't read song from browser storage.")); };
    });
    if (!(blob instanceof Blob)) throw new Error(`Song “${track.title}” is missing from this browser.`);
    return { url: URL.createObjectURL(blob), revoke: true };
  }
  return { url: `/api/audio/${encodeURIComponent(track.id)}`, revoke: false };
}

export async function removeAudioTrack(id: string, mode: StorageMode): Promise<void> {
  if (mode === "browser") {
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["tracks", "blobs"], "readwrite");
      tx.objectStore("tracks").delete(id);
      tx.objectStore("blobs").delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error("Couldn't remove song.")); };
    });
    return;
  }
  const response = await fetch(`/api/audio/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || "Couldn't remove song.");
  }
}
