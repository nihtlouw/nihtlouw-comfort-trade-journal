"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileImage,
  Images,
  Maximize2,
  Pencil,
  Plus,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getAttachment, type StorageMode } from "@/lib/attachments";
import { currency, formatRMultiple, shortDate, tradeRMultiple } from "@/lib/format";
import { translateAttachmentStage, translateMarket, translateMood, translateSide, UI_COPY } from "@/lib/i18n";
import { ATTACHMENT_STAGES, type AppLocale, type AttachmentStage, type Trade, type TradeAttachment } from "@/lib/types";
import { AssetIcon, CardTitle } from "@/components/journal-ui";

export type StageFilterValue = "All" | AttachmentStage | "Untagged";

export type ChartLightboxSlide = {
  key: string;
  attachment?: TradeAttachment;
  blob?: Blob;
  name: string;
  stage?: AttachmentStage;
  caption?: string;
  trade?: Trade;
};

const ZOOM_LEVELS = [1, 1.75, 2.5] as const;
type ZoomLevel = (typeof ZOOM_LEVELS)[number];

function useSlideObjectUrl(attachment: TradeAttachment | undefined, blob: Blob | undefined, mode: StorageMode) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let active = true;
    let created = "";

    if (blob) {
      created = URL.createObjectURL(blob);
      queueMicrotask(() => {
        if (active) setUrl(created);
      });
      return () => {
        active = false;
        if (created) URL.revokeObjectURL(created);
      };
    }

    if (!attachment) {
      queueMicrotask(() => {
        if (active) setUrl("");
      });
      return () => {
        active = false;
      };
    }

    getAttachment(attachment, mode)
      .then((loaded) => {
        if (!active) return;
        created = URL.createObjectURL(loaded);
        setUrl(created);
      })
      .catch(() => {
        if (active) setUrl("");
      });

    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [attachment, blob, mode]);

  return url;
}

export function StageBadge({
  stage,
  locale,
  untaggedLabel,
}: {
  stage?: AttachmentStage;
  locale: AppLocale;
  untaggedLabel?: string;
}) {
  if (!stage) {
    if (!untaggedLabel) return null;
    return <span className="chart-stage-badge stage-untagged">{untaggedLabel}</span>;
  }
  return (
    <span className={`chart-stage-badge stage-${stage.toLowerCase()}`}>
      {translateAttachmentStage(stage, locale)}
    </span>
  );
}

export function ChartLightbox({
  slides,
  index,
  onIndexChange,
  onClose,
  mode,
  hidden,
  locale = "en",
  onEditTrade,
}: {
  slides: ChartLightboxSlide[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  mode: StorageMode;
  hidden: boolean;
  locale?: AppLocale;
  onEditTrade?: (trade: Trade) => void;
}) {
  const copy = UI_COPY[locale];
  const safeIndex = slides.length ? Math.min(Math.max(0, index), slides.length - 1) : 0;
  const current = slides[safeIndex];
  const currentKey = current?.key ?? "";
  const [zoomState, setZoomState] = useState<{ key: string; level: ZoomLevel }>({
    key: currentKey,
    level: 1,
  });
  const zoom: ZoomLevel = zoomState.key === currentKey ? zoomState.level : 1;
  const setZoom = useCallback((level: ZoomLevel) => setZoomState({ key: currentKey, level }), [currentKey]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const url = useSlideObjectUrl(current?.attachment, current?.blob, mode);

  const sameTradeSlides = useMemo(() => {
    if (!current?.trade) return [];
    const targetId = current.trade.id;
    return slides
      .map((slide, slideIdx) => ({ slide, slideIdx }))
      .filter((entry) => entry.slide.trade?.id === targetId);
  }, [slides, current]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeBtnRef.current?.focus(), 0);

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" && slides.length > 1) {
        event.preventDefault();
        onIndexChange((safeIndex - 1 + slides.length) % slides.length);
        return;
      }
      if (event.key === "ArrowRight" && slides.length > 1) {
        event.preventDefault();
        onIndexChange((safeIndex + 1) % slides.length);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        const curIdx = ZOOM_LEVELS.indexOf(zoom);
        if (curIdx < ZOOM_LEVELS.length - 1) setZoom(ZOOM_LEVELS[curIdx + 1]);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        const curIdx = ZOOM_LEVELS.indexOf(zoom);
        if (curIdx > 0) setZoom(ZOOM_LEVELS[curIdx - 1]);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        setZoom(1);
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((item) => item.offsetParent !== null);
        if (!focusable.length) return;
        if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
          event.preventDefault();
          focusable[0].focus();
        }
      }
    };

    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey, true);
      previousFocus?.focus();
    };
  }, [onClose, onIndexChange, safeIndex, setZoom, slides.length, zoom]);

  if (!current || typeof document === "undefined") return null;

  const portalRoot = document.querySelector(".app-shell") ?? document.body;
  const trade = current.trade;
  const pnl = trade ? Number(trade.pnl) : 0;
  const rVal = trade ? tradeRMultiple(trade) : null;
  const zoomIdx = ZOOM_LEVELS.indexOf(zoom);

  const node = (
    <div
      className="chart-lightbox-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`chart-lightbox ${trade ? "has-context" : "preview-only"}`}
        role="dialog"
        aria-modal="true"
        aria-label={copy.lightboxDialogLabel}
      >
        <div className="chart-lightbox-stage">
          <div className="chart-lightbox-topbar">
            <div className="chart-lightbox-title">
              <StageBadge stage={current.stage} locale={locale} />
              <strong title={current.name}>{current.name}</strong>
              {slides.length > 1 && (
                <span className="chart-lightbox-counter">
                  {copy.lightboxCounter(safeIndex + 1, slides.length)}
                </span>
              )}
            </div>

            <div className="chart-lightbox-controls">
              <div className="chart-zoom-group" role="group" aria-label={copy.lightboxZoomAria}>
                <button
                  type="button"
                  className="icon-button"
                  disabled={zoomIdx <= 0}
                  onClick={() => zoomIdx > 0 && setZoom(ZOOM_LEVELS[zoomIdx - 1])}
                  aria-label="Zoom out"
                >
                  <ZoomOut size={15} />
                </button>
                {ZOOM_LEVELS.map((level) => (
                  <button
                    type="button"
                    key={level}
                    className={`chart-zoom-pill ${zoom === level ? "selected" : ""}`}
                    aria-pressed={zoom === level}
                    onClick={() => setZoom(level)}
                  >
                    {level}×
                  </button>
                ))}
                <button
                  type="button"
                  className="icon-button"
                  disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
                  onClick={() => zoomIdx < ZOOM_LEVELS.length - 1 && setZoom(ZOOM_LEVELS[zoomIdx + 1])}
                  aria-label="Zoom in"
                >
                  <ZoomIn size={15} />
                </button>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                className="icon-button chart-lightbox-close"
                onClick={onClose}
                aria-label={copy.lightboxClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className={`chart-lightbox-viewport ${zoom > 1 ? "is-zoomed" : ""}`}>
            {slides.length > 1 && (
              <button
                type="button"
                className="chart-nav-arrow prev"
                onClick={() => onIndexChange((safeIndex - 1 + slides.length) % slides.length)}
                aria-label={copy.lightboxPrev}
              >
                <ChevronLeft size={20} />
              </button>
            )}

            <div className="chart-lightbox-canvas">
              {url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={url}
                  alt={current.caption || current.name}
                  className={zoom > 1 ? "zoomed" : ""}
                  style={zoom > 1 ? { width: `${zoom * 100}%`, maxWidth: "none", maxHeight: "none" } : undefined}
                  onClick={() => setZoom(zoom === 1 ? 1.75 : 1)}
                />
              ) : (
                <div className="chart-lightbox-placeholder">
                  <FileImage size={28} />
                </div>
              )}
            </div>

            {slides.length > 1 && (
              <button
                type="button"
                className="chart-nav-arrow next"
                onClick={() => onIndexChange((safeIndex + 1) % slides.length)}
                aria-label={copy.lightboxNext}
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          <div className="chart-lightbox-foot">
            {sameTradeSlides.length > 1 ? (
              <div className="chart-trade-strip" role="group" aria-label={copy.lightboxTradeShots}>
                <span className="chart-strip-label">{copy.lightboxTradeShots}:</span>
                {sameTradeSlides.map(({ slide, slideIdx }, shotNum) => {
                  const stageText = slide.stage
                    ? translateAttachmentStage(slide.stage, locale)
                    : `#${shotNum + 1}`;
                  return (
                    <button
                      type="button"
                      key={slide.key}
                      className={`chart-shot-pill ${slideIdx === safeIndex ? "active" : ""}`}
                      aria-pressed={slideIdx === safeIndex}
                      onClick={() => onIndexChange(slideIdx)}
                    >
                      {shotNum + 1} · {stageText}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span />
            )}
            <small className="chart-keyboard-hint">{copy.lightboxKeyboardHint}</small>
          </div>
        </div>

        {trade && (
          <aside className="chart-lightbox-context">
            <div className="chart-context-head">
              <span className="card-eyebrow">{copy.lightboxTradeContext}</span>
              <div className="chart-context-symbol">
                <AssetIcon symbol={trade.symbol} />
                <div>
                  <strong>{trade.symbol}</strong>
                  <small>
                    {translateMarket(trade.market, locale)} · {shortDate(trade.tradeDate, true, locale)}
                  </small>
                </div>
                <span className={`direction ${trade.side.toLowerCase()}`}>
                  {trade.side === "Long" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {translateSide(trade.side, locale)}
                </span>
              </div>
            </div>

            <div className="chart-context-metrics">
              <div>
                <small>{copy.colNetPnl}</small>
                <strong className={pnl > 0 ? "positive-text" : pnl < 0 ? "loss-text" : ""}>
                  {currency(pnl, pnl > 0, hidden)}
                </strong>
              </div>
              <div>
                <small>{copy.lightboxRMultiple}</small>
                <strong className={rVal !== null && rVal > 0 ? "positive-text" : rVal !== null && rVal < 0 ? "loss-text" : ""}>
                  {formatRMultiple(rVal)}
                </strong>
              </div>
              <div>
                <small>{copy.lightboxMoodLabel}</small>
                <strong>{translateMood(trade.mood, locale)}</strong>
              </div>
            </div>

            <div className="chart-context-block">
              <small>{copy.lightboxChartNoteLabel}</small>
              <p className={current.caption ? "" : "is-muted"}>
                {current.caption || copy.lightboxNoCaption}
              </p>
            </div>

            {(trade.setup || trade.timeframe || trade.session) && (
              <div className="chart-context-meta-grid">
                {trade.setup && (
                  <div>
                    <small>{copy.colSetup}</small>
                    <strong>{trade.setup}</strong>
                  </div>
                )}
                {(trade.timeframe || trade.session) && (
                  <div>
                    <small>{copy.lightboxTimeframeSession}</small>
                    <strong>{[trade.timeframe, trade.session].filter(Boolean).join(" · ")}</strong>
                  </div>
                )}
              </div>
            )}

            {(trade.tags?.length ?? 0) > 0 && (
              <div className="chart-context-tags">
                {trade.tags!.map((tag) => (
                  <span key={tag} className="chart-tag-chip">#{tag}</span>
                ))}
              </div>
            )}

            <div className="chart-context-block chart-context-notes">
              <small>{copy.lightboxTradeNotesLabel}</small>
              <p className={trade.notes ? "" : "is-muted"}>
                {trade.notes || copy.lightboxNoNotes}
              </p>
            </div>

            {onEditTrade && (
              <button
                type="button"
                className="button-secondary chart-context-edit"
                onClick={() => {
                  onClose();
                  onEditTrade(trade);
                }}
              >
                <Pencil size={14} /> {copy.lightboxEditTrade}
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  );

  return createPortal(node, portalRoot);
}

function ChartbookCard({
  slide,
  mode,
  hidden,
  locale,
  onOpen,
}: {
  slide: ChartLightboxSlide;
  mode: StorageMode;
  hidden: boolean;
  locale: AppLocale;
  onOpen: () => void;
}) {
  const copy = UI_COPY[locale];
  const url = useSlideObjectUrl(slide.attachment, slide.blob, mode);
  const trade = slide.trade!;
  const pnl = Number(trade.pnl);
  const rVal = tradeRMultiple(trade);

  return (
    <article className="card chartbook-card">
      <button
        type="button"
        className="chartbook-card-trigger"
        onClick={onOpen}
        aria-label={`${trade.symbol} ${slide.stage ? translateAttachmentStage(slide.stage, locale) : ""} ${shortDate(trade.tradeDate, true, locale)}`.trim()}
      >
        <div className="chartbook-thumb">
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt={slide.caption || `${trade.symbol} — ${slide.name}`} loading="lazy" />
          ) : (
            <span className="chartbook-thumb-fallback">
              <FileImage size={24} />
            </span>
          )}
          <div className="chartbook-thumb-badges">
            <StageBadge stage={slide.stage} locale={locale} untaggedLabel={copy.untaggedStage} />
            <span className="chartbook-zoom-chip" aria-hidden="true">
              <Maximize2 size={12} />
            </span>
          </div>
        </div>

        <div className="chartbook-body">
          <div className="chartbook-head">
            <div className="chartbook-symbol">
              <AssetIcon symbol={trade.symbol} />
              <div>
                <strong>{trade.symbol}</strong>
                <small>
                  {shortDate(trade.tradeDate, true, locale)}
                  {trade.setup ? ` · ${trade.setup}` : ` · ${translateMarket(trade.market, locale)}`}
                </small>
              </div>
            </div>
            <div className="chartbook-outcome">
              <strong className={pnl > 0 ? "positive-text" : pnl < 0 ? "loss-text" : ""}>
                {currency(pnl, pnl > 0, hidden)}
              </strong>
              <small>
                <span className={`direction ${trade.side.toLowerCase()}`}>
                  {translateSide(trade.side, locale)}
                </span>
                {rVal !== null ? ` · ${formatRMultiple(rVal)}` : ""}
              </small>
            </div>
          </div>

          {(slide.caption || trade.notes) && (
            <p className={`chartbook-caption ${slide.caption ? "has-caption" : ""}`}>
              {slide.caption || trade.notes}
            </p>
          )}
        </div>
      </button>
    </article>
  );
}

export function ChartbookGallery({
  trades,
  stageFilter,
  onStageFilterChange,
  mode,
  hidden,
  locale = "en",
  onOpenSlide,
  onNewTrade,
}: {
  trades: Trade[];
  stageFilter: StageFilterValue;
  onStageFilterChange: (stage: StageFilterValue) => void;
  mode: StorageMode;
  hidden: boolean;
  locale?: AppLocale;
  onOpenSlide: (slides: ChartLightboxSlide[], index: number) => void;
  onNewTrade: () => void;
}) {
  const copy = UI_COPY[locale];

  const allSlides = useMemo<ChartLightboxSlide[]>(
    () =>
      trades.flatMap((trade) =>
        (trade.attachments ?? []).map((att) => ({
          key: `${trade.id}-${att.id}`,
          attachment: att,
          name: att.name,
          stage: att.stage,
          caption: att.caption,
          trade,
        })),
      ),
    [trades],
  );

  const stageCounts = useMemo(() => {
    const counts: Record<StageFilterValue, number> = {
      All: allSlides.length,
      Before: 0,
      Entry: 0,
      After: 0,
      HTF: 0,
      Untagged: 0,
    };
    for (const slide of allSlides) {
      if (slide.stage) counts[slide.stage]++;
      else counts.Untagged++;
    }
    return counts;
  }, [allSlides]);

  const visibleSlides = useMemo(
    () =>
      allSlides.filter((slide) => {
        if (stageFilter === "All") return true;
        if (stageFilter === "Untagged") return !slide.stage;
        return slide.stage === stageFilter;
      }),
    [allSlides, stageFilter],
  );

  const uniqueTradeCount = useMemo(
    () => new Set(visibleSlides.map((slide) => slide.trade?.id)).size,
    [visibleSlides],
  );

  return (
    <section className="card chartbook-section">
      <CardTitle
        title={copy.chartbookTitle}
        description={copy.chartbookCountDesc(visibleSlides.length, uniqueTradeCount)}
      />

      <div className="chartbook-stage-bar" role="group" aria-label={copy.stageFilterAria}>
        <button
          type="button"
          className={`chart-stage-filter ${stageFilter === "All" ? "selected" : ""}`}
          aria-pressed={stageFilter === "All"}
          onClick={() => onStageFilterChange("All")}
        >
          {copy.allStages} <b>{stageCounts.All}</b>
        </button>
        {ATTACHMENT_STAGES.map((stage) => (
          <button
            type="button"
            key={stage}
            className={`chart-stage-filter ${stageFilter === stage ? "selected" : ""}`}
            aria-pressed={stageFilter === stage}
            onClick={() => onStageFilterChange(stage)}
          >
            {translateAttachmentStage(stage, locale)} <b>{stageCounts[stage]}</b>
          </button>
        ))}
        {stageCounts.Untagged > 0 && (
          <button
            type="button"
            className={`chart-stage-filter ${stageFilter === "Untagged" ? "selected" : ""}`}
            aria-pressed={stageFilter === "Untagged"}
            onClick={() => onStageFilterChange("Untagged")}
          >
            {copy.untaggedStage} <b>{stageCounts.Untagged}</b>
          </button>
        )}
      </div>

      {visibleSlides.length > 0 ? (
        <div className="chartbook-grid">
          {visibleSlides.map((slide, idx) => (
            <ChartbookCard
              key={slide.key}
              slide={slide}
              mode={mode}
              hidden={hidden}
              locale={locale}
              onOpen={() => onOpenSlide(visibleSlides, idx)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state chartbook-empty">
          <span>
            <Images size={20} />
          </span>
          <strong>{copy.chartbookEmptyTitle}</strong>
          <p>{copy.chartbookEmptyBody}</p>
          <button type="button" className="text-link" onClick={onNewTrade}>
            <Plus size={14} /> {copy.logATrade}
          </button>
        </div>
      )}
    </section>
  );
}
