import type { SavedYoutubeVideo } from "@/lib/types";

export const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const ALLOWED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export type ParsedYoutubeLink = {
  videoId: string;
  canonicalUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  fallbackThumbnailUrl: string;
  startSeconds?: number;
};

/** Parse YouTube ?t= / ?start= values such as "90", "90s", "2m15s", or "1h02m05s". */
export function parseYoutubeTimestamp(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;

  if (/^\d+s?$/.test(trimmed)) {
    const secs = Number(trimmed.replace(/s$/, ""));
    return Number.isInteger(secs) && secs > 0 && secs <= 86_400 ? secs : undefined;
  }

  const hms = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    const hours = Number(hms[1] ?? 0);
    const mins = Number(hms[2] ?? 0);
    const secs = Number(hms[3] ?? 0);
    const total = hours * 3600 + mins * 60 + secs;
    return Number.isInteger(total) && total > 0 && total <= 86_400 ? total : undefined;
  }

  return undefined;
}

export function buildYoutubeUrls(videoId: string, startSeconds?: number): ParsedYoutubeLink {
  const safeStart = startSeconds && startSeconds > 0 && startSeconds <= 86_400 ? Math.floor(startSeconds) : undefined;
  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}${safeStart ? `&t=${safeStart}s` : ""}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1${safeStart ? `&start=${safeStart}` : ""}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    fallbackThumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    ...(safeStart ? { startSeconds: safeStart } : {}),
  };
}

/** Strictly parse and validate a YouTube watch, short, live, embed, or youtu.be URL. */
export function parseYoutubeUrl(input: string): ParsedYoutubeLink | null {
  const raw = input.trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw)
    ? raw
    : /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(raw)
      ? `https://${raw}`
      : null;
  if (!withProtocol) return null;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(host)) return null;

  let candidateId: string | null = null;
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" || host === "www.youtu.be") {
    candidateId = segments[0] ?? null;
  } else if (parsed.pathname === "/watch") {
    candidateId = parsed.searchParams.get("v");
  } else if (segments.length >= 2 && ["shorts", "embed", "live", "v"].includes(segments[0])) {
    candidateId = segments[1] ?? null;
  }

  if (!candidateId || !YOUTUBE_ID_REGEX.test(candidateId)) return null;

  const hashTime = parsed.hash.startsWith("#t=") ? parsed.hash.slice(3) : null;
  const startSeconds =
    parseYoutubeTimestamp(parsed.searchParams.get("t")) ??
    parseYoutubeTimestamp(parsed.searchParams.get("start")) ??
    parseYoutubeTimestamp(hashTime);

  return buildYoutubeUrls(candidateId, startSeconds);
}

export function formatYoutubeTimestamp(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function sortYoutubeVideos(videos: SavedYoutubeVideo[]): SavedYoutubeVideo[] {
  return [...videos].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
}
