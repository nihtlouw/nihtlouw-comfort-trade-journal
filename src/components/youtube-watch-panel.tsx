"use client";

import { useMemo, useRef, useState } from "react";
import {
  BookmarkCheck,
  Clock,
  ExternalLink,
  Film,
  Pencil,
  Pin,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { todayString } from "@/lib/format";
import { UI_COPY } from "@/lib/i18n";
import {
  YOUTUBE_VIDEO_CATEGORIES,
  type AppLocale,
  type SavedYoutubeVideo,
  type YoutubeVideoCategory,
} from "@/lib/types";
import {
  buildYoutubeUrls,
  formatYoutubeTimestamp,
  parseYoutubeUrl,
  sortYoutubeVideos,
} from "@/lib/youtube";
import { CardTitle } from "@/components/journal-ui";

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
  onChange,
}: {
  videos: SavedYoutubeVideo[];
  locale?: AppLocale;
  onChange: (next: SavedYoutubeVideo[], message?: string) => Promise<boolean> | void;
}) {
  const copy = UI_COPY[locale];
  const sortedVideos = useMemo(() => sortYoutubeVideos(videos), [videos]);

  const [categoryFilter, setCategoryFilter] = useState<"all" | YoutubeVideoCategory>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [categoryInput, setCategoryInput] = useState<YoutubeVideoCategory>("followup");
  const [noteInput, setNoteInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const lastFetchedVideoId = useRef<string>("");

  const filteredVideos = useMemo(
    () =>
      categoryFilter === "all"
        ? sortedVideos
        : sortedVideos.filter((item) => item.category === categoryFilter),
    [sortedVideos, categoryFilter],
  );

  const activeVideo = useMemo(() => {
    if (!filteredVideos.length) return null;
    if (selectedId) {
      const found = filteredVideos.find((item) => item.id === selectedId);
      if (found) return found;
    }
    return filteredVideos[0];
  }, [filteredVideos, selectedId]);

  const liveDraftParsed = useMemo(() => parseYoutubeUrl(urlInput), [urlInput]);
  const showForm = formOpen || editingId !== null || sortedVideos.length === 0;

  function categoryLabel(cat: YoutubeVideoCategory): string {
    if (cat === "reminder") return copy.ytCatReminder;
    if (cat === "motivation") return copy.ytCatMotivation;
    return copy.ytCatFollowup;
  }

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setUrlInput("");
    setTitleInput("");
    setCategoryInput("followup");
    setNoteInput("");
    setFormError(null);
    lastFetchedVideoId.current = "";
  }

  function startAdd() {
    setEditingId(null);
    setUrlInput("");
    setTitleInput("");
    setCategoryInput("followup");
    setNoteInput("");
    setFormError(null);
    lastFetchedVideoId.current = "";
    setFormOpen(true);
  }

  function startEdit(video: SavedYoutubeVideo) {
    setFormOpen(true);
    setEditingId(video.id);
    setUrlInput(video.url);
    setTitleInput(video.title);
    setCategoryInput(video.category);
    setNoteInput(video.note);
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
    const cleanNote = noteInput.trim().slice(0, 400);

    if (editingId) {
      const next = videos.map((item) =>
        item.id === editingId
          ? {
              ...item,
              videoId: parsed.videoId,
              url: parsed.canonicalUrl,
              title: cleanTitle,
              category: categoryInput,
              note: cleanNote,
              startSeconds: parsed.startSeconds,
            }
          : item,
      );
      void onChange(next, copy.ytUpdatedToast);
      setSelectedId(editingId);
      setPlayingId(null);
      resetForm();
      return;
    }

    const newItem: SavedYoutubeVideo = {
      id: crypto.randomUUID(),
      videoId: parsed.videoId,
      url: parsed.canonicalUrl,
      title: cleanTitle,
      category: categoryInput,
      note: cleanNote,
      ...(parsed.startSeconds ? { startSeconds: parsed.startSeconds } : {}),
      pinned: videos.length === 0,
      addedAt: todayString(),
    };
    const next = [newItem, ...videos];
    void onChange(next, copy.ytSavedToast);
    setCategoryFilter("all");
    setSelectedId(newItem.id);
    setPlayingId(null);
    resetForm();
  }

  function togglePin(target: SavedYoutubeVideo) {
    const willPin = !target.pinned;
    const next = videos.map((item) => ({
      ...item,
      pinned: item.id === target.id ? willPin : false,
    }));
    void onChange(next, copy.ytUpdatedToast);
    if (willPin) setSelectedId(target.id);
  }

  function removeVideo(target: SavedYoutubeVideo) {
    if (!window.confirm(copy.ytConfirmDelete(target.title))) return;
    const next = videos.filter((item) => item.id !== target.id);
    if (playingId === target.id) setPlayingId(null);
    if (selectedId === target.id) setSelectedId(null);
    if (editingId === target.id) resetForm();
    void onChange(next, copy.ytDeletedToast);
  }

  const activeUrls = activeVideo
    ? buildYoutubeUrls(activeVideo.videoId, activeVideo.startSeconds)
    : null;
  const activeStartBadge = activeVideo ? formatYoutubeTimestamp(activeVideo.startSeconds) : null;
  const isPlayingActive = Boolean(activeVideo && playingId === activeVideo.id);

  return (
    <section className="card yt-watch-card">
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

      {sortedVideos.length > 1 && (
        <div className="yt-filter-row" role="group" aria-label={copy.ytCategoryFilterAria}>
          {(["all", ...YOUTUBE_VIDEO_CATEGORIES] as const).map((cat) => {
            const selected = categoryFilter === cat;
            const label = cat === "all" ? copy.ytCatAll : categoryLabel(cat);
            const count =
              cat === "all"
                ? sortedVideos.length
                : sortedVideos.filter((v) => v.category === cat).length;
            return (
              <button
                type="button"
                key={cat}
                className={`yt-filter-pill ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                onClick={() => {
                  setCategoryFilter(cat);
                  setPlayingId(null);
                }}
              >
                <span>{label}</span>
                <b>{count}</b>
              </button>
            );
          })}
        </div>
      )}

      {showForm && (
        <form className="yt-form" onSubmit={handleSubmit}>
          {sortedVideos.length === 0 && <p className="yt-empty-lead">{copy.ytEmptyPrompt}</p>}
          <div className="yt-form-grid">
            <label className="yt-field yt-field-full">
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

            <div className="yt-field">
              <span>{copy.ytCategoryLabel}</span>
              <div className="segment-control yt-purpose-group" role="group" aria-label={copy.ytCategoryLabel}>
                {YOUTUBE_VIDEO_CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    className={categoryInput === cat ? "selected" : ""}
                    aria-pressed={categoryInput === cat}
                    onClick={() => setCategoryInput(cat)}
                  >
                    {categoryLabel(cat)}
                  </button>
                ))}
              </div>
            </div>

            <label className="yt-field yt-field-full">
              <span>{copy.ytNoteLabel}</span>
              <textarea
                rows={2}
                maxLength={400}
                placeholder={copy.ytNotePlaceholder}
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
              />
            </label>
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

      {sortedVideos.length > 0 && !activeVideo && (
        <div className="simple-empty">{copy.ytFilterEmpty}</div>
      )}

      {activeVideo && activeUrls && (
        <div className="yt-featured">
          <div className="yt-stage">
            {isPlayingActive ? (
              <iframe
                key={`${activeVideo.id}-${activeVideo.videoId}-${activeVideo.startSeconds ?? 0}`}
                className="yt-iframe"
                src={activeUrls.embedUrl}
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                className="yt-stage-trigger"
                aria-label={copy.ytPlayAria(activeVideo.title)}
                onClick={() => setPlayingId(activeVideo.id)}
              >
                <YoutubeThumbnail videoId={activeVideo.videoId} alt={activeVideo.title} />
                <span className="yt-stage-scrim" aria-hidden="true" />
                <span className="yt-stage-badges">
                  <span className={`yt-cat-badge cat-${activeVideo.category}`}>
                    {categoryLabel(activeVideo.category)}
                  </span>
                  {activeVideo.pinned && (
                    <span className="yt-pin-badge">
                      <Pin size={11} /> {copy.ytPinnedBadge}
                    </span>
                  )}
                  {activeStartBadge && (
                    <span className="yt-time-badge">
                      <Clock size={11} /> {copy.ytStartAtBadge(activeStartBadge)}
                    </span>
                  )}
                </span>
                <span className="yt-play-pill">
                  <span className="yt-play-circle">
                    <Play size={18} fill="currentColor" />
                  </span>
                  <strong>{copy.ytPlayBtn}</strong>
                </span>
              </button>
            )}
          </div>

          <div className="yt-active-body">
            <div className="yt-active-title-row">
              <h3>{activeVideo.title}</h3>
              <div className="yt-active-controls">
                {isPlayingActive && (
                  <button
                    type="button"
                    className="button-secondary yt-ctrl-btn"
                    onClick={() => setPlayingId(null)}
                  >
                    <Square size={13} /> <span>{copy.ytStopBtn}</span>
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

            {activeVideo.note && (
              <blockquote className="yt-reminder-note">
                <p>{activeVideo.note}</p>
              </blockquote>
            )}
          </div>
        </div>
      )}

      {filteredVideos.length > 1 && (
        <div className="yt-queue">
          <div className="yt-queue-head">
            <span>{copy.ytQueueLabel(filteredVideos.length)}</span>
          </div>
          <div className="yt-queue-list">
            {filteredVideos.map((item) => {
              const isCurrent = activeVideo?.id === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`yt-queue-item ${isCurrent ? "is-active" : ""}`}
                  aria-pressed={isCurrent}
                  onClick={() => {
                    setSelectedId(item.id);
                    if (playingId && playingId !== item.id) setPlayingId(null);
                  }}
                >
                  <div className="yt-queue-thumb">
                    <YoutubeThumbnail videoId={item.videoId} alt={item.title} />
                    <span className="yt-queue-play-icon" aria-hidden="true">
                      <Play size={11} fill="currentColor" />
                    </span>
                  </div>
                  <div className="yt-queue-copy">
                    <div className="yt-queue-tags">
                      <span className={`yt-cat-dot cat-${item.category}`}>
                        {categoryLabel(item.category)}
                      </span>
                      {item.pinned && (
                        <span className="yt-queue-pin" aria-hidden="true">
                          <Pin size={10} />
                        </span>
                      )}
                    </div>
                    <strong>{item.title}</strong>
                    {item.note && <small>{item.note}</small>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
