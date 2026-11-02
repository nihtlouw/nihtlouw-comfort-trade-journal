import type { SavedYoutubeVideo } from "@/lib/types";

export const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
export const YOUTUBE_PLAYBACK_CACHE_KEY = "bloom:yt-playback-cache:v1";

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

export type YoutubePlaybackPosition = {
  seconds: number;
  duration?: number;
  updatedAt: number;
};

export type YoutubePlaybackCache = {
  selectedId?: string;
  positions: Record<string, YoutubePlaybackPosition>;
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

export function buildYoutubeUrls(
  videoId: string,
  startSeconds?: number,
  options?: { autoplay?: boolean; origin?: string },
): ParsedYoutubeLink {
  const safeStart = startSeconds && startSeconds > 0 && startSeconds <= 86_400 ? Math.floor(startSeconds) : undefined;
  const autoplay = options?.autoplay === false ? 0 : 1;
  const originParam =
    options?.origin && /^https?:\/\//i.test(options.origin)
      ? `&origin=${encodeURIComponent(options.origin)}`
      : "";
  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}${safeStart ? `&t=${safeStart}s` : ""}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoplay}&rel=0&modestbranding=1&playsinline=1&enablejsapi=1${originParam}${safeStart ? `&start=${safeStart}` : ""}`,
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

export function readYoutubePlaybackCache(
  storage: Pick<Storage, "getItem"> | null | undefined,
): YoutubePlaybackCache {
  if (!storage) return { positions: {} };
  try {
    const raw = storage.getItem(YOUTUBE_PLAYBACK_CACHE_KEY);
    if (!raw) return { positions: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { positions: {} };
    const record = parsed as Record<string, unknown>;
    const positions: Record<string, YoutubePlaybackPosition> = {};
    if (record.positions && typeof record.positions === "object") {
      for (const [vid, val] of Object.entries(record.positions as Record<string, unknown>)) {
        if (!YOUTUBE_ID_REGEX.test(vid) || !val || typeof val !== "object") continue;
        const entry = val as Record<string, unknown>;
        const seconds = typeof entry.seconds === "number" ? Math.floor(entry.seconds) : NaN;
        const duration = typeof entry.duration === "number" && entry.duration > 0 ? Math.floor(entry.duration) : undefined;
        const updatedAt = typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0;
        if (Number.isFinite(seconds) && seconds > 0 && seconds <= 86_400) {
          positions[vid] = { seconds, ...(duration ? { duration } : {}), updatedAt };
        }
      }
    }
    const selectedId =
      typeof record.selectedId === "string" && record.selectedId.length > 0 && record.selectedId.length <= 100
        ? record.selectedId
        : undefined;
    return { ...(selectedId ? { selectedId } : {}), positions };
  } catch {
    return { positions: {} };
  }
}

export function writeYoutubePlaybackCache(
  storage: Pick<Storage, "setItem"> | null | undefined,
  cache: YoutubePlaybackCache,
): boolean {
  if (!storage) return false;
  try {
    const entries = Object.entries(cache.positions)
      .filter(([vid, item]) => YOUTUBE_ID_REGEX.test(vid) && item.seconds > 0 && item.seconds <= 86_400)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, 50);
    const trimmed: YoutubePlaybackCache = {
      ...(cache.selectedId ? { selectedId: cache.selectedId } : {}),
      positions: Object.fromEntries(entries),
    };
    storage.setItem(YOUTUBE_PLAYBACK_CACHE_KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
}

export function updateYoutubePlaybackPosition(
  cache: YoutubePlaybackCache,
  videoId: string,
  currentTime: number,
  duration?: number,
  now = Date.now(),
): YoutubePlaybackCache {
  if (!YOUTUBE_ID_REGEX.test(videoId) || !Number.isFinite(currentTime) || currentTime < 0) {
    return cache;
  }
  const safeDuration =
    typeof duration === "number" && Number.isFinite(duration) && duration > 0
      ? Math.floor(duration)
      : cache.positions[videoId]?.duration;

  // Clear saved resume position when video finishes (within 3s of end) or is at the very start (< 2s)
  if ((safeDuration && safeDuration >= 15 && currentTime >= safeDuration - 3) || Math.floor(currentTime) < 2) {
    if (!(videoId in cache.positions)) return cache;
    const nextPositions = { ...cache.positions };
    delete nextPositions[videoId];
    return { ...cache, positions: nextPositions };
  }

  const seconds = Math.min(86_400, Math.floor(currentTime));
  return {
    ...cache,
    positions: {
      ...cache.positions,
      [videoId]: {
        seconds,
        ...(safeDuration ? { duration: safeDuration } : {}),
        updatedAt: now,
      },
    },
  };
}

export function clearYoutubePlaybackPosition(
  cache: YoutubePlaybackCache,
  videoId: string,
): YoutubePlaybackCache {
  if (!(videoId in cache.positions)) return cache;
  const nextPositions = { ...cache.positions };
  delete nextPositions[videoId];
  return { ...cache, positions: nextPositions };
}

export function resolveYoutubeResumeSeconds(
  video: Pick<SavedYoutubeVideo, "videoId" | "startSeconds">,
  cache: YoutubePlaybackCache,
): number | undefined {
  const cached = cache.positions[video.videoId]?.seconds;
  if (typeof cached === "number" && cached > 0 && cached <= 86_400) {
    return cached;
  }
  return video.startSeconds;
}

/** Parse YouTube IFrame JS API postMessage payloads (infoDelivery / initialDelivery / onStateChange). */
export function parseYoutubePlayerMessage(rawData: unknown): {
  currentTime?: number;
  duration?: number;
  playerState?: number;
} | null {
  let payload: unknown = rawData;
  if (typeof rawData === "string") {
    const trimmed = rawData.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const msg = payload as Record<string, unknown>;
  const event = msg.event;

  if ((event === "infoDelivery" || event === "initialDelivery") && msg.info && typeof msg.info === "object") {
    const info = msg.info as Record<string, unknown>;
    const currentTime =
      typeof info.currentTime === "number" && Number.isFinite(info.currentTime) && info.currentTime >= 0
        ? info.currentTime
        : undefined;
    const duration =
      typeof info.duration === "number" && Number.isFinite(info.duration) && info.duration > 0
        ? info.duration
        : undefined;
    const playerState =
      typeof info.playerState === "number" && Number.isInteger(info.playerState)
        ? info.playerState
        : undefined;
    if (currentTime === undefined && duration === undefined && playerState === undefined) {
      return null;
    }
    return {
      ...(currentTime !== undefined ? { currentTime } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(playerState !== undefined ? { playerState } : {}),
    };
  }

  if (event === "onStateChange" && typeof msg.info === "number" && Number.isInteger(msg.info)) {
    return { playerState: msg.info };
  }

  return null;
}
