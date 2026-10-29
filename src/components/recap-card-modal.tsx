"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ShieldCheck, X } from "lucide-react";
import { todayString } from "@/lib/format";
import { UI_COPY } from "@/lib/i18n";
import {
  buildRecapSummary,
  renderRecapCanvas,
  type RecapPrivacyMode,
  type RecapRange,
  type RecapTheme,
} from "@/lib/recap-card";
import { weekBounds } from "@/lib/review";
import type { AppLocale, DayJournalEntry, Trade, WeeklyReflection } from "@/lib/types";
import { ModalShell } from "@/components/journal-dialogs";

export function RecapCardModal({
  trades,
  dayJournals = [],
  reflections = [],
  accountLabel,
  defaultTheme = "light",
  initialWeekStart,
  locale = "en",
  onNotify,
  onClose,
}: {
  trades: Trade[];
  dayJournals?: DayJournalEntry[];
  reflections?: WeeklyReflection[];
  accountLabel: string;
  defaultTheme?: "light" | "dark";
  initialWeekStart?: string;
  locale?: AppLocale;
  onNotify: (message: string, error?: boolean) => void;
  onClose: () => void;
}) {
  const copy = UI_COPY[locale];
  const titleId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const resolvedWeekStart = initialWeekStart ?? weekBounds().start;
  const initialReflection = useMemo(() => {
    const bounds = weekBounds(resolvedWeekStart);
    const inWeek = reflections.find((r) => r.date >= bounds.start && r.date <= bounds.end);
    const candidate = (inWeek?.nextWeek || inWeek?.wentWell || "").trim();
    return candidate ? candidate.slice(0, 110) : copy.recapDefaultMantra;
  }, [copy.recapDefaultMantra, reflections, resolvedWeekStart]);

  const [range, setRange] = useState<RecapRange>(initialWeekStart ? "week" : "month");
  const [privacyMode, setPrivacyMode] = useState<RecapPrivacyMode>("r_only");
  const [cardTheme, setCardTheme] = useState<RecapTheme>(defaultTheme === "dark" ? "espresso" : "sage");
  const [mantra, setMantra] = useState(initialReflection);
  const [copied, setCopied] = useState(false);

  const canCopyClipboard =
    typeof window !== "undefined" &&
    typeof ClipboardItem !== "undefined" &&
    Boolean(navigator.clipboard?.write);

  const summary = useMemo(
    () =>
      buildRecapSummary({
        trades,
        dayJournals,
        range,
        weekStart: resolvedWeekStart,
        privacyMode,
        locale,
      }),
    [dayJournals, locale, privacyMode, range, resolvedWeekStart, trades],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderRecapCanvas(canvas, summary, {
      theme: cardTheme,
      accountLabel,
      mantra,
      locale,
      privacyMode,
    });
  }, [accountLabel, cardTheme, locale, mantra, privacyMode, summary]);

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bloom-recap-${todayString()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onNotify(copy.recapDownloadedToast);
    }, "image/png");
  }

  function copyPng() {
    const canvas = canvasRef.current;
    if (!canvas || !canCopyClipboard) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": blob })])
        .then(() => {
          setCopied(true);
          onNotify(copy.recapCopiedToast);
          window.setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {});
    }, "image/png");
  }

  return (
    <ModalShell onClose={onClose} label={titleId} wide>
      <div className="modal-header">
        <div>
          <h2 id={titleId}>{copy.recapModalTitle}</h2>
          <p>{copy.recapModalDesc}</p>
        </div>
        <button type="button" className="icon-button modal-close" onClick={onClose} aria-label={copy.close}>
          <X size={19} />
        </button>
      </div>

      <div className="modal-form recap-modal-body">
        <div className="recap-controls-grid">
          <div className="recap-control-block">
            <span className="recap-control-label">{copy.recapRangeAria}</span>
            <div className="segment-control recap-segments" role="group" aria-label={copy.recapRangeAria}>
              {([
                { id: "week", label: copy.recapRangeWeek },
                { id: "today", label: copy.recapRangeToday },
                { id: "month", label: copy.recapRangeMonth },
                { id: "all", label: copy.recapRangeAll },
              ] as const).map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  className={range === opt.id ? "selected" : ""}
                  aria-pressed={range === opt.id}
                  onClick={() => setRange(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="recap-control-block">
            <span className="recap-control-label">
              <ShieldCheck size={13} /> {copy.recapPrivacyAria}
            </span>
            <div className="segment-control recap-segments" role="group" aria-label={copy.recapPrivacyAria}>
              {([
                { id: "r_only", label: copy.recapModeROnly },
                { id: "process_only", label: copy.recapModeProcess },
                { id: "full", label: copy.recapModeFull },
              ] as const).map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  className={privacyMode === opt.id ? "selected" : ""}
                  aria-pressed={privacyMode === opt.id}
                  onClick={() => setPrivacyMode(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="recap-control-block">
            <span className="recap-control-label">{copy.recapThemeAria}</span>
            <div className="segment-control recap-segments" role="group" aria-label={copy.recapThemeAria}>
              <button
                type="button"
                className={cardTheme === "sage" ? "selected" : ""}
                aria-pressed={cardTheme === "sage"}
                onClick={() => setCardTheme("sage")}
              >
                {copy.recapThemeSage}
              </button>
              <button
                type="button"
                className={cardTheme === "espresso" ? "selected" : ""}
                aria-pressed={cardTheme === "espresso"}
                onClick={() => setCardTheme("espresso")}
              >
                {copy.recapThemeEspresso}
              </button>
            </div>
          </div>
        </div>

        <label className="recap-mantra-field">
          <span>{copy.recapMantraLabel}</span>
          <input
            maxLength={110}
            value={mantra}
            onChange={(event) => setMantra(event.target.value)}
            placeholder={copy.recapDefaultMantra}
          />
        </label>

        <div className="recap-canvas-frame">
          <canvas
            ref={canvasRef}
            width={1200}
            height={630}
            className="recap-preview-canvas"
            role="img"
            aria-label={`${copy.recapPreviewAria}: ${summary.headlineLabel} ${summary.headlineValue}`}
          />
        </div>

        <div className="modal-actions recap-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            {copy.close}
          </button>
          {canCopyClipboard && (
            <button type="button" className="button-secondary" onClick={copyPng}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copy.recapCopyBtn}</span>
            </button>
          )}
          <button type="button" className="button-primary" onClick={downloadPng}>
            <Download size={15} />
            <span>{copy.recapDownloadBtn}</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
