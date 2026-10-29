"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Disc3,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { StorageMode } from "@/lib/attachments";
import {
  AmbientSynthController,
  getAmbientPresets,
  type AmbientPresetId,
} from "@/lib/ambient-synth";
import {
  getAudioPlayableUrl,
  listAudioTracks,
  probeAudioDuration,
  removeAudioTrack,
  saveAudioTrack,
} from "@/lib/audio";
import { formatBytes } from "@/lib/format";
import { UI_COPY } from "@/lib/i18n";
import {
  MAX_AUDIO_TOTAL_BYTES,
  MAX_AUDIO_TRACKS,
  type AppLocale,
  type AudioTrackMeta,
} from "@/lib/types";
import { ModalShell } from "@/components/journal-dialogs";

export type LoopMode = "all" | "one" | "off";
export type PlaybackStatus = "stopped" | "playing" | "paused";

function formatClock(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function CassetteReelSvg({
  tapeRadius,
  spinning,
  size = 64,
}: {
  tapeRadius: number;
  spinning: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`cassette-reel-svg ${spinning ? "is-spinning" : ""}`}
      aria-hidden="true"
    >
      {/* Magnetic tape pack wound around the hub */}
      <circle cx="32" cy="32" r={tapeRadius} className="cassette-tape-pack" />
      <circle cx="32" cy="32" r={Math.max(13.5, tapeRadius - 3.5)} className="cassette-tape-ring" />
      {/* Hub outer collar */}
      <circle cx="32" cy="32" r="13.5" className="cassette-hub-outer" />
      <circle cx="32" cy="32" r="9.5" className="cassette-hub-inner" />
      {/* 6 spokes / drive teeth */}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 32 32)`}>
          <rect x="30.6" y="18.8" width="2.8" height="5.2" rx="1" className="cassette-hub-tooth" />
        </g>
      ))}
      <circle cx="32" cy="32" r="3.4" className="cassette-hub-pin" />
    </svg>
  );
}

export function useCassetteDeck({
  mode,
  locale,
  reduceMotion,
  onNotify,
}: {
  mode: StorageMode;
  locale: AppLocale;
  reduceMotion: boolean;
  onNotify: (message: string, error?: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<AmbientSynthController | null>(null);
  const activeUrlRef = useRef<{ trackId: string; url: string; revoke: boolean } | null>(null);
  const [tracks, setTracks] = useState<AudioTrackMeta[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeAmbientId, setActiveAmbientId] = useState<AmbientPresetId | null>(null);
  const activeAmbientRef = useRef<AmbientPresetId | null>(null);
  const [ambientElapsed, setAmbientElapsed] = useState(0);
  const [status, setStatus] = useState<PlaybackStatus>("stopped");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopMode, setLoopMode] = useState<LoopMode>("all");
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [deckError, setDeckError] = useState("");

  const copy = UI_COPY[locale];
  const ambientPresets = useMemo(() => getAmbientPresets(locale), [locale]);
  const activeAmbient = useMemo(
    () => (activeAmbientId ? ambientPresets.find((p) => p.id === activeAmbientId) ?? null : null),
    [activeAmbientId, ambientPresets],
  );

  const ensureSynth = useCallback(() => {
    if (!synthRef.current) synthRef.current = new AmbientSynthController();
    return synthRef.current;
  }, []);

  const releaseActiveUrl = useCallback(() => {
    if (activeUrlRef.current?.revoke) {
      URL.revokeObjectURL(activeUrlRef.current.url);
    }
    activeUrlRef.current = null;
  }, []);

  useEffect(() => {
    let alive = true;
    const initialAudio = audioRef.current;
    listAudioTracks(mode)
      .then((loaded) => {
        if (!alive) return;
        setTracks(loaded);
        setActiveIndex(0);
      })
      .catch(() => {
        // Stay quiet on initial mount if offline or storage unavailable.
      });
    return () => {
      alive = false;
      if (initialAudio) {
        initialAudio.pause();
        initialAudio.removeAttribute("src");
      }
      synthRef.current?.dispose();
      synthRef.current = null;
      releaseActiveUrl();
    };
  }, [mode, releaseActiveUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = volume;
      el.muted = muted;
    }
    synthRef.current?.setVolume(volume, muted);
  }, [volume, muted]);

  useEffect(() => {
    if (!activeAmbientId || status !== "playing") return;
    const timer = window.setInterval(() => {
      setAmbientElapsed((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeAmbientId, status]);

  const activeTrack = tracks[activeIndex] ?? tracks[0] ?? null;
  const totalBytes = useMemo(() => tracks.reduce((sum, item) => sum + item.size, 0), [tracks]);

  const loadAndPlayTrack = useCallback(
    async (track: AudioTrackMeta, shouldPlay: boolean) => {
      const el = audioRef.current;
      if (!el) return;
      try {
        setDeckError("");
        synthRef.current?.stop();
        activeAmbientRef.current = null;
        setActiveAmbientId(null);
        setAmbientElapsed(0);
        if (activeUrlRef.current?.trackId !== track.id) {
          el.pause();
          releaseActiveUrl();
          const resolved = await getAudioPlayableUrl(track, mode);
          activeUrlRef.current = { trackId: track.id, ...resolved };
          el.src = resolved.url;
          el.load();
          setCurrentTime(0);
          setDuration(track.durationSec ?? 0);
        }
        if (shouldPlay) {
          await el.play();
          setStatus("playing");
        } else {
          setStatus("stopped");
        }
      } catch (caught) {
        setStatus("stopped");
        const msg = caught instanceof Error ? caught.message : "Couldn't play this song.";
        setDeckError(msg);
      }
    },
    [mode, releaseActiveUrl],
  );

  const selectAmbient = useCallback(
    async (presetId: AmbientPresetId) => {
      setDeckError("");
      const el = audioRef.current;
      if (el && !el.paused) el.pause();

      const synth = ensureSynth();
      synth.setVolume(volume, muted);

      if (activeAmbientId === presetId && status === "playing") {
        synth.pause();
        setStatus("paused");
        return;
      }
      if (activeAmbientId !== presetId) {
        setAmbientElapsed(0);
      }
      activeAmbientRef.current = presetId;
      setActiveAmbientId(presetId);
      const started = await synth.start(presetId);
      setStatus(started ? "playing" : "stopped");
    },
    [activeAmbientId, ensureSynth, muted, status, volume],
  );

  const togglePlay = useCallback(async () => {
    if (activeAmbientId) {
      const synth = ensureSynth();
      synth.setVolume(volume, muted);
      if (status === "playing") {
        synth.pause();
        setStatus("paused");
        return;
      }
      const started = await synth.start(activeAmbientId);
      if (started) setStatus("playing");
      return;
    }
    if (!activeTrack) return;
    const el = audioRef.current;
    if (!el) return;
    if (status === "playing") {
      el.pause();
      setStatus("paused");
      return;
    }
    await loadAndPlayTrack(activeTrack, true);
  }, [activeAmbientId, activeTrack, ensureSynth, loadAndPlayTrack, muted, status, volume]);

  const stop = useCallback(() => {
    if (activeAmbientId) {
      synthRef.current?.stop();
      setAmbientElapsed(0);
      setStatus("stopped");
      return;
    }
    const el = audioRef.current;
    if (el) {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        // Ignore if metadata hasn't loaded yet.
      }
    }
    setCurrentTime(0);
    setStatus("stopped");
  }, [activeAmbientId]);

  const selectTrack = useCallback(
    async (index: number, autoPlay = true) => {
      const target = tracks[index];
      if (!target) return;
      setActiveIndex(index);
      await loadAndPlayTrack(target, autoPlay);
    },
    [loadAndPlayTrack, tracks],
  );

  const prevTrack = useCallback(async () => {
    if (!tracks.length) return;
    const el = audioRef.current;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const nextIdx = (activeIndex - 1 + tracks.length) % tracks.length;
    await selectTrack(nextIdx, status === "playing");
  }, [activeIndex, selectTrack, status, tracks.length]);

  const nextTrack = useCallback(async () => {
    if (!tracks.length) return;
    const nextIdx = (activeIndex + 1) % tracks.length;
    await selectTrack(nextIdx, status === "playing");
  }, [activeIndex, selectTrack, status, tracks.length]);

  const seek = useCallback((nextSeconds: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(nextSeconds)) return;
    try {
      el.currentTime = nextSeconds;
      setCurrentTime(nextSeconds);
    } catch {
      // Ignore seek before readyState.
    }
  }, []);

  const cycleLoop = useCallback(() => {
    setLoopMode((current) => (current === "all" ? "one" : current === "one" ? "off" : "all"));
  }, []);

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      if (!incoming.length || uploading) return;
      setDeckError("");

      if (tracks.length + incoming.length > MAX_AUDIO_TRACKS) {
        const msg =
          locale === "id"
            ? `Maksimal ${MAX_AUDIO_TRACKS} lagu (tersisa ${Math.max(0, MAX_AUDIO_TRACKS - tracks.length)} slot).`
            : `Up to ${MAX_AUDIO_TRACKS} songs allowed (${Math.max(0, MAX_AUDIO_TRACKS - tracks.length)} slot${MAX_AUDIO_TRACKS - tracks.length === 1 ? "" : "s"} left).`;
        setDeckError(msg);
        return;
      }

      const incomingBytes = incoming.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes + incomingBytes > MAX_AUDIO_TOTAL_BYTES) {
        const msg =
          locale === "id"
            ? "Total ukuran lagu melebihi batas 200 MB. Pilih file yang lebih kecil atau hapus lagu lama."
            : "Total audio size exceeds the 200 MB limit. Choose smaller files or remove an existing song.";
        setDeckError(msg);
        return;
      }

      setUploading(true);
      setUploadPct(0);
      const added: AudioTrackMeta[] = [];

      try {
        for (let i = 0; i < incoming.length; i++) {
          const file = incoming[i];
          const dur = await probeAudioDuration(file);
          const saved = await saveAudioTrack(file, {
            fileName: file.name,
            durationSec: dur,
            mode,
            locale,
            onProgress: (fraction) => {
              const overall = ((i + fraction) / incoming.length) * 100;
              setUploadPct(Math.min(100, Math.round(overall)));
            },
          });
          added.push(saved);
        }
        setTracks((current) => {
          const merged = [...current, ...added];
          if (!current.length && merged.length) setActiveIndex(0);
          return merged;
        });
        onNotify(copy.songAddedToast);
      } catch (caught) {
        if (added.length) {
          setTracks((current) => [...current, ...added]);
        }
        const msg = caught instanceof Error ? caught.message : "Couldn't add song.";
        setDeckError(msg);
      } finally {
        setUploading(false);
        setUploadPct(0);
      }
    },
    [copy.songAddedToast, locale, mode, onNotify, totalBytes, tracks.length, uploading],
  );

  const deleteTrack = useCallback(
    async (id: string) => {
      const idx = tracks.findIndex((item) => item.id === id);
      if (idx === -1) return;
      setDeckError("");
      try {
        if (activeTrack?.id === id) {
          const el = audioRef.current;
          if (el) {
            el.pause();
            el.removeAttribute("src");
          }
          releaseActiveUrl();
          setStatus("stopped");
          setCurrentTime(0);
          setDuration(0);
        }
        await removeAudioTrack(id, mode);
        setTracks((current) => {
          const next = current.filter((item) => item.id !== id);
          setActiveIndex((prev) => Math.min(prev, Math.max(0, next.length - 1)));
          return next;
        });
        onNotify(copy.songRemovedToast);
      } catch (caught) {
        setDeckError(caught instanceof Error ? caught.message : "Couldn't remove song.");
      }
    },
    [activeTrack, copy.songRemovedToast, mode, onNotify, releaseActiveUrl, tracks],
  );

  const handleEnded = useCallback(() => {
    const el = audioRef.current;
    if (!tracks.length) {
      setStatus("stopped");
      return;
    }
    if (loopMode === "one" && el) {
      el.currentTime = 0;
      void el.play();
      return;
    }
    const isLast = activeIndex >= tracks.length - 1;
    if (isLast && loopMode === "off") {
      setStatus("stopped");
      setCurrentTime(0);
      return;
    }
    const nextIdx = (activeIndex + 1) % tracks.length;
    void selectTrack(nextIdx, true);
  }, [activeIndex, loopMode, selectTrack, tracks.length]);

  const audioElement = (
    <audio
      ref={audioRef}
      preload="metadata"
      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => {
        const d = event.currentTarget.duration;
        if (Number.isFinite(d) && d > 0) setDuration(d);
      }}
      onDurationChange={(event) => {
        const d = event.currentTarget.duration;
        if (Number.isFinite(d) && d > 0) setDuration(d);
      }}
      onEnded={handleEnded}
      onPause={() => {
        if (!activeAmbientRef.current) {
          setStatus((prev) => (prev === "playing" ? "paused" : prev));
        }
      }}
      onPlay={() => {
        if (!activeAmbientRef.current) setStatus("playing");
      }}
    />
  );

  const effectiveCurrentTime = activeAmbient ? ambientElapsed : currentTime;
  const effectiveDuration = activeAmbient ? 0 : duration || activeTrack?.durationSec || 0;

  return {
    audioElement,
    tracks,
    activeTrack,
    activeIndex,
    ambientPresets,
    activeAmbient,
    status,
    currentTime: effectiveCurrentTime,
    duration: effectiveDuration,
    loopMode,
    volume,
    muted,
    uploading,
    uploadPct,
    deckError,
    setDeckError,
    totalBytes,
    reduceMotion,
    togglePlay,
    stop,
    selectTrack,
    selectAmbient,
    prevTrack,
    nextTrack,
    seek,
    cycleLoop,
    setVolume,
    setMuted,
    addFiles,
    deleteTrack,
  };
}

export type CassetteDeckController = ReturnType<typeof useCassetteDeck>;

export function CassetteSidebarMini({
  deck,
  locale,
  onOpen,
}: {
  deck: CassetteDeckController;
  locale: AppLocale;
  onOpen: () => void;
}) {
  const copy = UI_COPY[locale];
  const spinning = deck.status === "playing" && !deck.reduceMotion;
  const displayTitle = deck.activeAmbient
    ? deck.activeAmbient.title
    : deck.activeTrack
      ? deck.activeTrack.title
      : copy.cassetteMiniEmpty;
  const hasSource = Boolean(deck.activeAmbient || deck.activeTrack);
  const statusLabel =
    deck.status === "playing"
      ? copy.cassettePlaying
      : deck.status === "paused"
        ? copy.cassettePaused
        : deck.activeAmbient
          ? copy.ambientSlotBadge
          : deck.tracks.length
            ? `${deck.activeIndex + 1}/${deck.tracks.length}`
            : copy.cassetteMiniReady;

  return (
    <div className={`cassette-mini ${deck.status === "playing" ? "is-playing" : ""}`}>
      <button
        type="button"
        className="cassette-mini-body"
        onClick={onOpen}
        aria-label={copy.cassetteOpenAria}
      >
        <span className="cassette-mini-window" aria-hidden="true">
          <span className={`cassette-mini-reel ${spinning ? "is-spinning" : ""}`} />
          <span className="cassette-mini-bridge" />
          <span className={`cassette-mini-reel ${spinning ? "is-spinning" : ""}`} />
        </span>
        <span className="cassette-mini-meta">
          <strong>{displayTitle}</strong>
          <small>{statusLabel}</small>
        </span>
      </button>
      {hasSource && (
        <div className="cassette-mini-controls">
          <button
            type="button"
            className="icon-button cassette-mini-btn"
            onClick={() => void deck.togglePlay()}
            aria-label={deck.status === "playing" ? copy.pause : copy.play}
            title={deck.status === "playing" ? copy.pause : copy.play}
          >
            {deck.status === "playing" ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button
            type="button"
            className="icon-button cassette-mini-btn"
            onClick={deck.stop}
            disabled={deck.status === "stopped" && deck.currentTime === 0}
            aria-label={copy.stop}
            title={copy.stop}
          >
            <Square size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export function CassetteTopbarButton({
  deck,
  locale,
  onOpen,
}: {
  deck: CassetteDeckController;
  locale: AppLocale;
  onOpen: () => void;
}) {
  const copy = UI_COPY[locale];
  const spinning = deck.status === "playing" && !deck.reduceMotion;
  return (
    <button
      type="button"
      className={`cassette-top-btn ${deck.status === "playing" ? "is-playing" : ""}`}
      onClick={onOpen}
      aria-label={copy.cassetteOpenAria}
      title={copy.cassetteTitle}
    >
      <Disc3 size={16} className={spinning ? "is-spinning" : ""} />
      <span className="cassette-top-label">{copy.cassetteTitle}</span>
      {deck.tracks.length > 0 && <b className="cassette-top-count">{deck.tracks.length}</b>}
    </button>
  );
}

export function CassetteDeckModal({
  deck,
  mode,
  locale,
  onClose,
}: {
  deck: CassetteDeckController;
  mode: StorageMode;
  locale: AppLocale;
  onClose: () => void;
}) {
  const copy = UI_COPY[locale];
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const progress = deck.duration > 0 ? Math.min(1, Math.max(0, deck.currentTime / deck.duration)) : 0;
  // Left tape spool unwinds (26 -> 16) while right spool winds up (16 -> 26).
  const leftRadius = 26 - progress * 10;
  const rightRadius = 16 + progress * 10;
  const spinning = deck.status === "playing" && !deck.reduceMotion;
  const quotaPct = Math.min(100, (deck.totalBytes / MAX_AUDIO_TOTAL_BYTES) * 100);

  const loopLabel =
    deck.loopMode === "all" ? copy.loopAll : deck.loopMode === "one" ? copy.loopOne : copy.loopOff;

  return (
    <ModalShell onClose={onClose} label={titleId}>
      <div className="modal-header">
        <div>
          <h2 id={titleId}>{copy.cassetteTitle}</h2>
          <p>{copy.cassetteDesc}</p>
        </div>
        <button type="button" className="icon-button modal-close" onClick={onClose} aria-label={copy.close}>
          <X size={19} />
        </button>
      </div>

      <div className="modal-form cassette-modal-body">
        {/* Tactile Cassette Tape Illustration */}
        <div className={`cassette-shell status-${deck.status}`}>
          <span className="cassette-screw tl" aria-hidden="true" />
          <span className="cassette-screw tr" aria-hidden="true" />
          <span className="cassette-screw bl" aria-hidden="true" />
          <span className="cassette-screw br" aria-hidden="true" />

          <div className="cassette-paper-label">
            <div className="cassette-label-top">
              <span className="cassette-side-tag">
                <i className={`cassette-led ${deck.status === "playing" ? "on" : ""}`} />
                {copy.cassetteLabel}
              </span>
              <span className="cassette-slot-counter">
                {deck.activeAmbient
                  ? copy.ambientSlotBadge
                  : deck.tracks.length
                    ? `${String(deck.activeIndex + 1).padStart(2, "0")} / 0${MAX_AUDIO_TRACKS}`
                    : `00 / 0${MAX_AUDIO_TRACKS}`}
              </span>
            </div>

            <div className="cassette-track-marquee">
              <strong>
                {deck.activeAmbient
                  ? deck.activeAmbient.title
                  : deck.activeTrack
                    ? deck.activeTrack.title
                    : copy.cassetteMiniEmpty}
              </strong>
              <small>
                {deck.activeAmbient
                  ? deck.activeAmbient.subtitle
                  : deck.activeTrack
                    ? `${deck.activeTrack.mimeType.replace("audio/", "").toUpperCase()} · ${formatBytes(deck.activeTrack.size)}`
                    : copy.emptyTapeHint}
              </small>
            </div>

            <div className="cassette-window">
              <CassetteReelSvg tapeRadius={deck.activeAmbient ? 21 : leftRadius} spinning={spinning} />
              <div className="cassette-sight-gauge" aria-hidden="true">
                <div className="cassette-sight-marks">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <small>
                  {deck.status === "playing"
                    ? copy.cassettePlaying
                    : deck.status === "paused"
                      ? copy.cassettePaused
                      : copy.cassetteStopped}
                </small>
              </div>
              <CassetteReelSvg tapeRadius={deck.activeAmbient ? 21 : rightRadius} spinning={spinning} />
            </div>
          </div>

          <div className="cassette-head-trapezoid" aria-hidden="true">
            <span />
            <span />
          </div>
        </div>

        {/* Scrubber & Time */}
        <div className="cassette-timeline">
          <span>{formatClock(deck.currentTime)}</span>
          <input
            type="range"
            min={0}
            max={deck.duration > 0 ? deck.duration : 1}
            step={0.1}
            value={deck.activeAmbient ? 0.5 : Math.min(deck.currentTime, deck.duration > 0 ? deck.duration : 0)}
            disabled={Boolean(deck.activeAmbient) || !deck.activeTrack || !(deck.duration > 0)}
            aria-label={copy.seekAria}
            onChange={(event) => deck.seek(Number(event.target.value))}
          />
          <span>{deck.activeAmbient ? "∞" : formatClock(deck.duration)}</span>
        </div>

        {/* Deck Transport Controls */}
        <div className="cassette-transport">
          <div className="cassette-transport-main">
            <button
              type="button"
              className="button-secondary cassette-transport-btn"
              onClick={() => void deck.prevTrack()}
              disabled={!deck.tracks.length}
              aria-label={copy.prevTrack}
              title={copy.prevTrack}
            >
              <SkipBack size={15} />
            </button>
            <button
              type="button"
              className="button-primary cassette-play-btn"
              onClick={() => void deck.togglePlay()}
              disabled={!deck.activeAmbient && !deck.activeTrack}
              aria-label={deck.status === "playing" ? copy.pause : copy.play}
            >
              {deck.status === "playing" ? <Pause size={16} /> : <Play size={16} />}
              <span>{deck.status === "playing" ? copy.pause : copy.play}</span>
            </button>
            <button
              type="button"
              className="button-secondary cassette-transport-btn"
              onClick={deck.stop}
              disabled={(!deck.activeAmbient && !deck.activeTrack) || (deck.status === "stopped" && deck.currentTime === 0)}
              aria-label={copy.stop}
              title={copy.stop}
            >
              <Square size={14} />
              <span className="cassette-stop-text">{copy.stop}</span>
            </button>
            <button
              type="button"
              className="button-secondary cassette-transport-btn"
              onClick={() => void deck.nextTrack()}
              disabled={deck.tracks.length < 2}
              aria-label={copy.nextTrack}
              title={copy.nextTrack}
            >
              <SkipForward size={15} />
            </button>
          </div>

          <div className="cassette-transport-aux">
            <button
              type="button"
              className={`icon-button cassette-loop-btn ${deck.loopMode !== "off" ? "active" : ""}`}
              onClick={deck.cycleLoop}
              aria-label={loopLabel}
              title={loopLabel}
            >
              {deck.loopMode === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
            <div className="cassette-volume">
              <button
                type="button"
                className="icon-button"
                onClick={() => deck.setMuted(!deck.muted)}
                aria-label={deck.muted ? copy.unmute : copy.mute}
                title={deck.muted ? copy.unmute : copy.mute}
              >
                {deck.muted || deck.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={deck.muted ? 0 : deck.volume}
                aria-label={copy.volumeAria}
                onChange={(event) => {
                  const v = Number(event.target.value);
                  deck.setVolume(v);
                  if (v > 0 && deck.muted) deck.setMuted(false);
                }}
              />
            </div>
          </div>
        </div>

        {/* Built-in 0 MB Ambient Soundscapes */}
        <div className="cassette-ambient-section">
          <div className="cassette-ambient-head">
            <strong>
              <Sparkles size={13} /> {copy.ambientSectionLabel}
            </strong>
            <small>{copy.ambientSectionHint}</small>
          </div>
          <div className="cassette-ambient-pills" role="group" aria-label={copy.ambientGroupAria}>
            {deck.ambientPresets.map((preset) => {
              const isSelected = deck.activeAmbient?.id === preset.id;
              const isPlayingPreset = isSelected && deck.status === "playing";
              return (
                <button
                  type="button"
                  key={preset.id}
                  className={`cassette-ambient-pill ${isSelected ? "selected" : ""} ${isPlayingPreset ? "is-playing" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => void deck.selectAmbient(preset.id)}
                >
                  <i className="cassette-ambient-dot" aria-hidden="true" />
                  <span>{preset.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Storage Quota & Upload */}
        <div className="cassette-library-head">
          <div className="cassette-quota">
            <div className="cassette-quota-line">
              <strong>{copy.quotaSummary(deck.tracks.length, MAX_AUDIO_TRACKS, formatBytes(deck.totalBytes))}</strong>
            </div>
            <div className="progress-track cassette-quota-bar">
              <span style={{ width: `${quotaPct}%` }} />
            </div>
          </div>
          <label
            className={`button-secondary file-button cassette-add-btn ${deck.tracks.length >= MAX_AUDIO_TRACKS || deck.uploading ? "is-disabled" : ""}`}
          >
            <Plus size={15} />
            <span>{deck.uploading ? copy.uploadingSong(deck.uploadPct) : copy.addSongBtn}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac,.webm"
              multiple
              disabled={deck.tracks.length >= MAX_AUDIO_TRACKS || deck.uploading}
              onChange={(event) => {
                const chosen = event.target.files;
                if (chosen?.length) void deck.addFiles(chosen);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        {deck.uploading && (
          <div className="progress-track cassette-upload-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={deck.uploadPct}>
            <span style={{ width: `${deck.uploadPct}%` }} />
          </div>
        )}

        {deck.deckError && (
          <div className="form-error" role="alert">
            {deck.deckError}
          </div>
        )}

        {/* Tracklist (up to 5 slots) */}
        {deck.tracks.length > 0 ? (
          <ul className="cassette-tracklist">
            {deck.tracks.map((track, idx) => {
              const isCurrent = deck.activeTrack?.id === track.id;
              const isPlayingThis = isCurrent && deck.status === "playing";
              return (
                <li key={track.id} className={isCurrent ? "active" : ""}>
                  <button
                    type="button"
                    className="cassette-track-select"
                    onClick={() => void deck.selectTrack(idx, true)}
                  >
                    <span className="cassette-track-num">
                      {isPlayingThis ? <Music2 size={13} /> : String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="cassette-track-info">
                      <strong>{track.title}</strong>
                      <small>
                        {track.durationSec ? `${formatClock(track.durationSec)} · ` : ""}
                        {formatBytes(track.size)}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button cassette-track-remove"
                    onClick={() => void deck.deleteTrack(track.id)}
                    aria-label={copy.removeSongAria(track.title)}
                    title={copy.removeSongAria(track.title)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="cassette-empty">
            <Music2 size={18} />
            <p>{copy.emptyTapeHint}</p>
          </div>
        )}

        <p className="cassette-footnote">
          {mode === "server" ? copy.storageNoteServer : copy.storageNoteBrowser}
        </p>
      </div>
    </ModalShell>
  );
}
