"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkCheck,
  Clock,
  ExternalLink,
  Film,
  Maximize2,
  Minimize2,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { todayString } from "@/lib/format";
import { UI_COPY } from "@/lib/i18n";
import type { AppLocale, SavedYoutubeVideo } from "@/lib/types";
import {
  buildYoutubeUrls,
  clearYoutubePlaybackPosition,
  formatYoutubeTimestamp,
  parseYoutubePlayerMessage,
  parseYoutubeUrl,
  readYoutubePlaybackCache,
  resolveYoutubeResumeSeconds,
  sortYoutubeVideos,
  updateYoutubePlaybackPosition,
  writeYoutubePlaybackCache,
  type YoutubePlaybackCache,
} from "@/lib/youtube";
import { CardTitle } from "@/components/journal-ui";

type ActivePlayerSession = {
  sessionKey: string;
  itemId: string;
  videoId: string;
  embedUrl: string;
};

const ALLOWED_PLAYER_ORIGINS = new Set([
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
]);

function YoutubeThumbnail({
  videoId,
  alt,
}: {
  videoId: string;
  alt: string;
}) {
  const [failedUrls, setFailedUrls] = useState<Record<string, number>>({});
  const urls = useMemo(() => buildYoutubeUrls(videoId), [videoId]);
  const stage = failedUrls[videoId] ?? 0;

  if (stage >= 2) {
    return (
      <div className="yt-thumb-fallback" aria-hidden="true">
        <span className="yt-thumb-fallback-ring">
          <Film size={22} strokeWidth={1.7} />
        </span>
        <small>YouTube · {videoId}</small>
      </div>
    );
  }

  const src = stage === 0 ? urls.thumbnailUrl : urls.fallbackThumbnailUrl;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="yt-thumb-img"
      onError={() =>
        setFailedUrls((prev) => ({
          ...prev,
          [videoId]: (prev[videoId] ?? 0) + 1,
        }))
      }
    />
  );
}

export function YoutubeWatchPanel({
  videos,
  locale = "en",
  active = true,
  onPlayerMountChange,
  onReturnToOverview,
  onChange,
}: {
  videos: SavedYoutubeVideo[];
  locale?: AppLocale;
  active?: boolean;
  onPlayerMountChange?: (mounted: boolean) => void;
  onReturnToOverview?: () => void;
  onChange: (next: SavedYoutubeVideo[], message?: string) => Promise<boolean> | void;
}) {
  const copy = UI_COPY[locale];
  const sortedVideos = useMemo(() => sortYoutubeVideos(videos), [videos]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playerSession, setPlayerSession] = useState<ActivePlayerSession | null>(null);
  const [playbackCache, setPlaybackCache] = useState<YoutubePlaybackCache>({ positions: {} });
  const [isPausedState, setIsPausedState] = useState(false);
  const [miniCollapsed, setMiniCollapsed] = useState(false);

  const cacheRef = useRef<YoutubePlaybackCache>({ positions: {} });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const handshakeDoneRef = useRef(false);
  const lastSavedTickRef = useRef(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const lastFetchedVideoId = useRef<string>("");

  const persistCacheNow = useCallback((nextCache: YoutubePlaybackCache) => {
    cacheRef.current = nextCache;
    try {
      writeYoutubePlaybackCache(window.localStorage, nextCache);
    } catch {
      /* Ignore storage quota / privacy mode errors */
    }
  }, []);

  // Hydrate saved playback positions & compact-mobile preference on mount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.innerWidth <= 700) {
        setMiniCollapsed(true);
      }
      try {
        const loaded = readYoutubePlaybackCache(window.localStorage);
        cacheRef.current = loaded;
        setPlaybackCache(loaded);
        if (loaded.selectedId) {
          setSelectedId((current) => current ?? loaded.selectedId ?? null);
        }
      } catch {
        /* Ignore storage errors */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeVideo = useMemo(() => {
    if (!sortedVideos.length) return null;
    if (selectedId) {
      const found = sortedVideos.find((item) => item.id === selectedId);
      if (found) return found;
    }
    return sortedVideos[0];
  }, [sortedVideos, selectedId]);

  const isPlayingActive = Boolean(
    activeVideo &&
      playerSession &&
      playerSession.itemId === activeVideo.id &&
      playerSession.videoId === activeVideo.videoId,
  );

  useEffect(() => {
    onPlayerMountChange?.(isPlayingActive);
  }, [isPlayingActive, onPlayerMountChange]);

  const sendYoutubeCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({ event: "command", func, args, id: "bloom-yt-player", channel: "widget" }),
        "*",
      );
    } catch {
      /* Ignore cross-origin postMessage errors */
    }
  }, []);

  const sendListeningHandshake = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({ event: "listening", id: "bloom-yt-player", channel: "widget" }),
        "*",
      );
      win.postMessage(
        JSON.stringify({
          event: "command",
          func: "addEventListener",
          args: ["onStateChange"],
          id: "bloom-yt-player",
          channel: "widget",
        }),
        "*",
      );
    } catch {
      /* Ignore cross-origin postMessage errors */
    }
  }, []);

  // Flush latest playback timestamp when leaving Overview — keep video playing continuously!
  useEffect(() => {
    if (!active && isPlayingActive) {
      persistCacheNow(cacheRef.current);
    }
  }, [active, isPlayingActive, persistCacheNow]);

  // Listen to YouTube IFrame JS API postMessage updates (currentTime, duration, pause/ended state)
  useEffect(() => {
    if (!playerSession) return;
    handshakeDoneRef.current = false;

    let attempts = 0;
    const poll = window.setInterval(() => {
      if (handshakeDoneRef.current || attempts >= 15) {
        window.clearInterval(poll);
        return;
      }
      attempts += 1;
      sendListeningHandshake();
    }, 320);

    function handleMessage(event: MessageEvent) {
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin || event.source !== iframeWin) return;
      if (
        !ALLOWED_PLAYER_ORIGINS.has(event.origin) &&
        event.origin !== window.location.origin
      ) {
        return;
      }
      const parsed = parseYoutubePlayerMessage(event.data);
      if (!parsed) return;
      handshakeDoneRef.current = true;

      if (parsed.playerState === 1 || parsed.playerState === 3) {
        setIsPausedState(false);
      } else if (parsed.playerState === 2) {
        setIsPausedState(true);
      }

      const vid = playerSession?.videoId;
      if (!vid) return;

      if (parsed.playerState === 0) {
        setIsPausedState(true);
        const cleared = clearYoutubePlaybackPosition(cacheRef.current, vid);
        persistCacheNow(cleared);
        setPlaybackCache(cleared);
        return;
      }

      if (typeof parsed.currentTime === "number") {
        const now = Date.now();
        const updated = updateYoutubePlaybackPosition(
          cacheRef.current,
          vid,
          parsed.currentTime,
          parsed.duration,
          now,
        );
        cacheRef.current = updated;
        const isPaused = parsed.playerState === 2;
        if (isPaused || now - lastSavedTickRef.current >= 1000) {
          lastSavedTickRef.current = now;
          persistCacheNow(updated);
          setPlaybackCache(updated);
        }
      } else if (parsed.playerState === 2) {
        persistCacheNow(cacheRef.current);
        setPlaybackCache({ ...cacheRef.current });
      }
    }

    function flushOnHide() {
      if (document.visibilityState === "hidden") {
        persistCacheNow(cacheRef.current);
      }
    }
    function flushOnPageHide() {
      persistCacheNow(cacheRef.current);
    }

    window.addEventListener("message", handleMessage);
    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushOnPageHide);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("pagehide", flushOnPageHide);
    };
  }, [persistCacheNow, playerSession, sendListeningHandshake]);

  const liveDraftParsed = useMemo(() => parseYoutubeUrl(urlInput), [urlInput]);
  const showForm = formOpen || editingId !== null || sortedVideos.length === 0;

  function selectVideoItem(itemId: string) {
    setSelectedId(itemId);
    const nextCache: YoutubePlaybackCache = { ...cacheRef.current, selectedId: itemId };
    persistCacheNow(nextCache);
    setPlaybackCache(nextCache);
  }

  function startPlayback(video: SavedYoutubeVideo, forceRestart = false) {
    let workingCache = cacheRef.current;
    if (forceRestart) {
      workingCache = clearYoutubePlaybackPosition(workingCache, video.videoId);
    }
    workingCache = { ...workingCache, selectedId: video.id };
    persistCacheNow(workingCache);
    setPlaybackCache(workingCache);
    setSelectedId(video.id);
    setIsPausedState(false);

    const startAt = forceRestart
      ? video.startSeconds
      : resolveYoutubeResumeSeconds(video, workingCache);
    const origin =
      typeof window !== "undefined" && /^https?:\/\//i.test(window.location.origin)
        ? window.location.origin
        : undefined;
    const urls = buildYoutubeUrls(video.videoId, startAt, { autoplay: true, origin });

    setPlayerSession({
      sessionKey: `${video.id}-${video.videoId}-${Date.now()}`,
      itemId: video.id,
      videoId: video.videoId,
      embedUrl: urls.embedUrl,
    });
  }

  function toggleMiniPlayPause() {
    if (isPausedState) {
      sendYoutubeCommand("playVideo");
      setIsPausedState(false);
    } else {
      sendYoutubeCommand("pauseVideo");
      setIsPausedState(true);
      persistCacheNow(cacheRef.current);
      setPlaybackCache({ ...cacheRef.current });
    }
  }

  function stopToThumbnail() {
    sendYoutubeCommand("pauseVideo");
    persistCacheNow(cacheRef.current);
    setPlaybackCache({ ...cacheRef.current });
    setPlayerSession(null);
  }

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setUrlInput("");
    setTitleInput("");
    setFormError(null);
    lastFetchedVideoId.current = "";
  }

  function startAdd() {
    setEditingId(null);
    setUrlInput("");
    setTitleInput("");
    setFormError(null);
    lastFetchedVideoId.current = "";
    setFormOpen(true);
  }

  function startEdit(video: SavedYoutubeVideo) {
    setFormOpen(true);
    setEditingId(video.id);
    setUrlInput(video.url);
    setTitleInput(video.title);
    setFormError(null);
    lastFetchedVideoId.current = video.videoId;
  }

  async function maybeFetchOembedTitle(rawUrl: string) {
    const parsed = parseYoutubeUrl(rawUrl);
    if (!parsed || titleInput.trim() || lastFetchedVideoId.current === parsed.videoId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    lastFetchedVideoId.current = parsed.videoId;
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 2500);
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${parsed.videoId}`)}&format=json`;
      const response = await fetch(endpoint, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!response.ok) return;
      const payload = (await response.json()) as { title?: unknown };
      if (typeof payload.title === "string" && payload.title.trim()) {
        const fetchedTitle = payload.title.trim().slice(0, 140);
        setTitleInput((current) => (current.trim() ? current : fetchedTitle));
      }
    } catch {
      /* Offline or blocked network: keep manual/default title without noise. */
    }
  }

  function handleUrlChange(nextValue: string) {
    setUrlInput(nextValue);
    if (formError) setFormError(null);
    const parsed = parseYoutubeUrl(nextValue);
    if (parsed && !titleInput.trim()) {
      void maybeFetchOembedTitle(nextValue);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseYoutubeUrl(urlInput);
    if (!parsed) {
      setFormError(copy.ytInvalidUrlError);
      return;
    }

    if (!editingId && videos.length >= 30) {
      setFormError(copy.ytLimitError);
      return;
    }

    const cleanTitle = (titleInput.trim() || copy.ytDefaultTitle(parsed.videoId)).slice(0, 140);

    if (editingId) {
      const next = videos.map((item) =>
        item.id === editingId
          ? {
              ...item,
              videoId: parsed.videoId,
              url: parsed.canonicalUrl,
              title: cleanTitle,
              startSeconds: parsed.startSeconds,
            }
          : item,
      );
      void onChange(next, copy.ytUpdatedToast);
      selectVideoItem(editingId);
      setPlayerSession(null);
      resetForm();
      return;
    }

    const newItem: SavedYoutubeVideo = {
      id: crypto.randomUUID(),
      videoId: parsed.videoId,
      url: parsed.canonicalUrl,
      title: cleanTitle,
      ...(parsed.startSeconds ? { startSeconds: parsed.startSeconds } : {}),
      pinned: videos.length === 0,
      addedAt: todayString(),
    };
    const next = [newItem, ...videos];
    void onChange(next, copy.ytSavedToast);
    selectVideoItem(newItem.id);
    setPlayerSession(null);
    resetForm();
  }

  function togglePin(target: SavedYoutubeVideo) {
    const willPin = !target.pinned;
    const next = videos.map((item) => ({
      ...item,
      pinned: item.id === target.id ? willPin : false,
    }));
    void onChange(next, copy.ytUpdatedToast);
    if (willPin) selectVideoItem(target.id);
  }

  function removeVideo(target: SavedYoutubeVideo) {
    if (!window.confirm(copy.ytConfirmDelete(target.title))) return;
    const next = videos.filter((item) => item.id !== target.id);
    const cleaned = clearYoutubePlaybackPosition(cacheRef.current, target.videoId);
    persistCacheNow(cleaned);
    setPlaybackCache(cleaned);
    if (playerSession?.itemId === target.id) setPlayerSession(null);
    if (selectedId === target.id) setSelectedId(null);
    if (editingId === target.id) resetForm();
    void onChange(next, copy.ytDeletedToast);
  }

  const cachedResumeSeconds = activeVideo
    ? playbackCache.positions[activeVideo.videoId]?.seconds
    : undefined;
  const effectiveStartSeconds = activeVideo
    ? resolveYoutubeResumeSeconds(activeVideo, playbackCache)
    : undefined;
  const activeUrls = activeVideo
    ? buildYoutubeUrls(activeVideo.videoId, effectiveStartSeconds)
    : null;
  const hasSavedResume = Boolean(
    activeVideo &&
      cachedResumeSeconds &&
      cachedResumeSeconds > 0 &&
      cachedResumeSeconds !== activeVideo.startSeconds,
  );
  const resumeLabel = hasSavedResume ? formatYoutubeTimestamp(cachedResumeSeconds) : null;
  const initialStartBadge =
    !hasSavedResume && activeVideo ? formatYoutubeTimestamp(activeVideo.startSeconds) : null;
  const isMiniMode = !active && isPlayingActive;

  return (
    <section
      className={`card yt-watch-card ${isMiniMode ? "yt-watch-mini" : ""} ${
        isMiniMode && miniCollapsed ? "is-mini-collapsed" : ""
      }`}
    >
      {active ? (
        <CardTitle
          title={copy.ytTitle}
          action={
            <div className="yt-header-actions">
              {sortedVideos.length > 0 && (
                <button
                  type="button"
                  className={showForm ? "button-quiet" : "button-secondary"}
                  onClick={() => (showForm ? resetForm() : startAdd())}
                >
                  {showForm ? (
                    <>
                      <X size={14} /> {copy.ytCancelBtn}
                    </>
                  ) : (
                    <>
                      <Plus size={14} /> {copy.ytAddBtn}
                    </>
                  )}
                </button>
              )}
            </div>
          }
        />
      ) : isPlayingActive && activeVideo ? (
        <div className="yt-mini-bar" role="region" aria-label={copy.ytTitle}>
          <button
            type="button"
            className="yt-mini-jump"
            aria-label={copy.ytMiniBackAria}
            onClick={() => onReturnToOverview?.()}
          >
            <span
              className={`yt-mini-dot ${isPausedState ? "is-paused" : "is-live"}`}
              aria-hidden="true"
            />
            <strong>{activeVideo.title}</strong>
          </button>
          <div className="yt-mini-actions">
            <button
              type="button"
              className="icon-button yt-mini-btn"
              aria-label={isPausedState ? copy.ytMiniResumeAria : copy.ytMiniPauseAria}
              onClick={toggleMiniPlayPause}
            >
              {isPausedState ? <Play size={13} fill="currentColor" /> : <Pause size={13} />}
            </button>
            <button
              type="button"
              className="icon-button yt-mini-btn"
              aria-label={miniCollapsed ? copy.ytMiniExpandAria : copy.ytMiniCollapseAria}
              onClick={() => setMiniCollapsed((prev) => !prev)}
            >
              {miniCollapsed ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
            </button>
            <button
              type="button"
              className="icon-button yt-mini-btn"
              aria-label={copy.ytMiniCloseAria}
              onClick={stopToThumbnail}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {active && showForm && (
        <form className="yt-form" onSubmit={handleSubmit}>
          <div className="yt-form-grid">
            <label className="yt-field">
              <span>{copy.ytUrlLabel}</span>
              <input
                type="url"
                inputMode="url"
                placeholder={copy.ytUrlPlaceholder}
                value={urlInput}
                onChange={(event) => handleUrlChange(event.target.value)}
                required
              />
            </label>

            <label className="yt-field">
              <span>{copy.ytVideoTitleLabel}</span>
              <input
                type="text"
                maxLength={140}
                placeholder={copy.ytVideoTitlePlaceholder}
                value={titleInput}
                onChange={(event) => setTitleInput(event.target.value)}
              />
            </label>

            {liveDraftParsed && (
              <div className="yt-draft-preview">
                <div className="yt-draft-thumb">
                  <YoutubeThumbnail
                    videoId={liveDraftParsed.videoId}
                    alt={titleInput.trim() || copy.ytDefaultTitle(liveDraftParsed.videoId)}
                  />
                </div>
                <div className="yt-draft-info">
                  <strong>{copy.ytPreviewReady}</strong>
                  <small>
                    ID: {liveDraftParsed.videoId}
                    {liveDraftParsed.startSeconds
                      ? ` · ${copy.ytStartAtBadge(formatYoutubeTimestamp(liveDraftParsed.startSeconds) ?? "")}`
                      : ""}
                  </small>
                </div>
              </div>
            )}
          </div>

          {formError && (
            <p className="yt-form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="yt-form-actions">
            {sortedVideos.length > 0 && (
              <button type="button" className="button-quiet" onClick={resetForm}>
                {copy.ytCancelBtn}
              </button>
            )}
            <button type="submit" className="button-primary">
              <BookmarkCheck size={15} /> {editingId ? copy.ytUpdateBtn : copy.ytSaveBtn}
            </button>
          </div>
        </form>
      )}

      {activeVideo && activeUrls && (
        <div className="yt-featured">
          <div className="yt-stage">
            {isPlayingActive && playerSession ? (
              <iframe
                ref={iframeRef}
                key={playerSession.sessionKey}
                className="yt-iframe"
                src={playerSession.embedUrl}
                title={activeVideo.title}
                onLoad={sendListeningHandshake}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                className="yt-stage-trigger"
                aria-label={copy.ytPlayAria(activeVideo.title)}
                onClick={() => startPlayback(activeVideo)}
              >
                <YoutubeThumbnail videoId={activeVideo.videoId} alt={activeVideo.title} />
                <span className="yt-stage-scrim" aria-hidden="true" />
                {(activeVideo.pinned || resumeLabel || initialStartBadge) && (
                  <span className="yt-stage-badges">
                    {activeVideo.pinned && (
                      <span className="yt-pin-badge">
                        <Pin size={11} /> {copy.ytPinnedBadge}
                      </span>
                    )}
                    {resumeLabel && (
                      <span className="yt-resume-badge">
                        <Clock size={11} /> {copy.ytResumeBadge(resumeLabel)}
                      </span>
                    )}
                    {initialStartBadge && (
                      <span className="yt-time-badge">
                        <Clock size={11} /> {copy.ytStartAtBadge(initialStartBadge)}
                      </span>
                    )}
                  </span>
                )}
                <span className="yt-play-pill">
                  <span className="yt-play-circle">
                    <Play size={18} fill="currentColor" />
                  </span>
                  <strong>{resumeLabel ? copy.ytResumeBadge(resumeLabel) : copy.ytPlayBtn}</strong>
                </span>
              </button>
            )}
          </div>

          {active && (
            <div className="yt-active-body">
              <div className="yt-active-title-row">
                <h3>{activeVideo.title}</h3>
                <div className="yt-active-controls">
                  {isPlayingActive && (
                    <button
                      type="button"
                      className="button-secondary yt-ctrl-btn"
                      onClick={stopToThumbnail}
                    >
                      <Square size={13} /> <span>{copy.ytStopBtn}</span>
                    </button>
                  )}
                  {(hasSavedResume || isPlayingActive) && (
                    <button
                      type="button"
                      className="button-quiet yt-ctrl-btn"
                      aria-label={copy.ytRestartAria(activeVideo.title)}
                      onClick={() => startPlayback(activeVideo, true)}
                    >
                      <RotateCcw size={13} /> <span>{copy.ytRestartBtn}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className={`button-quiet yt-ctrl-btn ${activeVideo.pinned ? "is-pinned" : ""}`}
                    aria-pressed={Boolean(activeVideo.pinned)}
                    aria-label={
                      activeVideo.pinned
                        ? copy.ytUnpinAria(activeVideo.title)
                        : copy.ytPinAria(activeVideo.title)
                    }
                    onClick={() => togglePin(activeVideo)}
                  >
                    <Pin size={13} /> <span>{copy.ytPinBtn}</span>
                  </button>
                  <a
                    href={activeUrls.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button-quiet yt-ctrl-btn yt-ext-link"
                  >
                    <ExternalLink size={13} /> <span>{copy.ytOpenExternal}</span>
                  </a>
                  <button
                    type="button"
                    className="icon-button yt-icon-btn"
                    aria-label={copy.ytEditAria(activeVideo.title)}
                    onClick={() => startEdit(activeVideo)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button yt-icon-btn yt-delete-btn"
                    aria-label={copy.ytDeleteAria(activeVideo.title)}
                    onClick={() => removeVideo(activeVideo)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {active && sortedVideos.length > 1 && (
        <div className="yt-queue">
          <div className="yt-queue-head">
            <span>{copy.ytQueueLabel(sortedVideos.length)}</span>
          </div>
          <div className="yt-queue-list">
            {sortedVideos.map((item) => {
              const isCurrent = activeVideo?.id === item.id;
              const itemSavedSec = playbackCache.positions[item.videoId]?.seconds;
              const itemResumeBadge =
                itemSavedSec && itemSavedSec !== item.startSeconds
                  ? formatYoutubeTimestamp(itemSavedSec)
                  : null;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`yt-queue-item ${isCurrent ? "is-active" : ""}`}
                  aria-pressed={isCurrent}
                  onClick={() => {
                    if (isCurrent) return;
                    if (isPlayingActive) {
                      sendYoutubeCommand("pauseVideo");
                      persistCacheNow(cacheRef.current);
                    }
                    selectVideoItem(item.id);
                    setPlayerSession(null);
                  }}
                >
                  <div className="yt-queue-thumb">
                    <YoutubeThumbnail videoId={item.videoId} alt={item.title} />
                    <span className="yt-queue-play-icon" aria-hidden="true">
                      <Play size={11} fill="currentColor" />
                    </span>
                  </div>
                  <div className="yt-queue-copy">
                    <strong>{item.title}</strong>
                    {itemResumeBadge && <small>{copy.ytResumeBadge(itemResumeBadge)}</small>}
                  </div>
                  {item.pinned && (
                    <span className="yt-queue-pin" aria-hidden="true">
                      <Pin size={11} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
