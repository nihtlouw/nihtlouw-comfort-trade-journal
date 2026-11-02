"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { StorageMode } from "@/lib/attachments";
import { todayString } from "@/lib/format";
import { UI_COPY } from "@/lib/i18n";
import {
  cleanPdfTitle,
  formatBytes,
  getStrategyPdf,
  parseStrategyLinkUrl,
} from "@/lib/strategy-library";
import {
  MAX_STRATEGY_ITEMS,
  type AppLocale,
  type StrategyLibraryItem,
  type StrategyPdfResource,
} from "@/lib/types";

export function StrategyShelf({
  items,
  mode = "browser",
  locale = "en",
  onAddPdf,
  onAddLink,
  onRemoveItem,
  onNotifyError,
}: {
  items: StrategyLibraryItem[];
  mode?: StorageMode;
  locale?: AppLocale;
  onAddPdf: (file: File, customTitle: string) => Promise<boolean>;
  onAddLink: (url: string, title: string) => Promise<boolean>;
  onRemoveItem: (item: StrategyLibraryItem) => Promise<boolean> | void;
  onNotifyError?: (message: string) => void;
}) {
  const copy = UI_COPY[locale];
  const [formOpen, setFormOpen] = useState(false);
  const [tab, setTab] = useState<"pdf" | "link">("pdf");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readingPdf, setReadingPdf] = useState<{
    item: StrategyPdfResource;
    blobUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!readingPdf) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setReadingPdf((current) => {
          if (current) URL.revokeObjectURL(current.blobUrl);
          return null;
        });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [readingPdf]);

  useEffect(() => {
    return () => {
      if (readingPdf) URL.revokeObjectURL(readingPdf.blobUrl);
    };
  }, [readingPdf]);

  function resetForm() {
    setFormOpen(false);
    setPdfFile(null);
    setLinkUrl("");
    setTitleInput("");
    setError(null);
    setBusy(false);
  }

  function openForm(kind: "pdf" | "link") {
    setTab(kind);
    setPdfFile(null);
    setLinkUrl("");
    setTitleInput("");
    setError(null);
    setFormOpen(true);
  }

  function handlePdfChoose(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!chosen) return;
    setPdfFile(chosen);
    setError(null);
    if (!titleInput.trim()) {
      setTitleInput(cleanPdfTitle(chosen.name));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (items.length >= MAX_STRATEGY_ITEMS) {
      setError(copy.libLimitError);
      return;
    }

    if (tab === "pdf") {
      if (!pdfFile) {
        setError(copy.libChoosePdfError);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const ok = await onAddPdf(pdfFile, titleInput.trim());
        setBusy(false);
        if (ok) resetForm();
      } catch (caught) {
        setBusy(false);
        setError(caught instanceof Error ? caught.message : "Couldn't save PDF.");
      }
      return;
    }

    const parsed = parseStrategyLinkUrl(linkUrl);
    if (!parsed) {
      setError(copy.libInvalidLinkError);
      return;
    }
    const finalTitle = (titleInput.trim() || parsed.suggestedTitle).slice(0, 120);
    setBusy(true);
    setError(null);
    try {
      const ok = await onAddLink(parsed.url, finalTitle);
      setBusy(false);
      if (ok) resetForm();
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "Couldn't save link.");
    }
  }

  async function openPdfItem(item: StrategyPdfResource) {
    try {
      const blob = await getStrategyPdf(item.fileId, item.fileName, mode);
      const blobUrl = URL.createObjectURL(blob);
      setReadingPdf((prev) => {
        if (prev) URL.revokeObjectURL(prev.blobUrl);
        return { item, blobUrl };
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Couldn't open PDF.";
      onNotifyError?.(message);
    }
  }

  function closeReader() {
    setReadingPdf((prev) => {
      if (prev) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });
  }

  function confirmRemove(item: StrategyLibraryItem) {
    if (!window.confirm(copy.libConfirmRemove(item.title))) return;
    void onRemoveItem(item);
  }

  return (
    <section className="card strategy-shelf-card">
      <div className="widget-top strategy-shelf-head">
        <div className="strategy-shelf-title">
          <span className="widget-icon green">
            <BookOpen size={17} />
          </span>
          <h2>{copy.libTitle}</h2>
        </div>
        <button
          type="button"
          className="button-quiet strategy-add-toggle"
          onClick={() => (formOpen ? resetForm() : openForm("pdf"))}
        >
          {formOpen ? (
            <>
              <X size={13} /> {copy.libCancelBtn}
            </>
          ) : (
            <>
              <Plus size={13} /> {copy.libAddBtn}
            </>
          )}
        </button>
      </div>

      {formOpen && (
        <form className="strategy-form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="segment-control strategy-mode-switch" role="group" aria-label={copy.libModeAria}>
            <button
              type="button"
              className={tab === "pdf" ? "selected" : ""}
              aria-pressed={tab === "pdf"}
              onClick={() => {
                setTab("pdf");
                setError(null);
              }}
            >
              <FileText size={13} /> <span>{copy.libTabPdf}</span>
            </button>
            <button
              type="button"
              className={tab === "link" ? "selected" : ""}
              aria-pressed={tab === "link"}
              onClick={() => {
                setTab("link");
                setError(null);
              }}
            >
              <Link2 size={13} /> <span>{copy.libTabLink}</span>
            </button>
          </div>

          {tab === "pdf" ? (
            <label className="strategy-pdf-picker">
              <Upload size={15} />
              <div className="strategy-pdf-picker-copy">
                <strong>{pdfFile ? pdfFile.name : copy.libChoosePdf}</strong>
                <small>{pdfFile ? formatBytes(pdfFile.size) : copy.libPdfSub}</small>
              </div>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePdfChoose}
              />
            </label>
          ) : (
            <label className="strategy-field">
              <span>{copy.libLinkLabel}</span>
              <input
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={copy.libLinkPlaceholder}
                value={linkUrl}
                onChange={(event) => {
                  setLinkUrl(event.target.value);
                  if (error) setError(null);
                }}
                required
              />
            </label>
          )}

          <label className="strategy-field">
            <span>{copy.libItemTitleLabel}</span>
            <input
              type="text"
              maxLength={120}
              placeholder={copy.libItemTitlePlaceholder}
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
            />
          </label>

          {error && (
            <p className="strategy-form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="button-primary strategy-submit-btn" disabled={busy}>
            {busy ? copy.libSavingBtn : tab === "pdf" ? copy.libSavePdfBtn : copy.libSaveLinkBtn}
          </button>
        </form>
      )}

      {items.length > 0 ? (
        <ul className="strategy-mini-list">
          {items.map((item) => {
            if (item.kind === "link") {
              const host = parseStrategyLinkUrl(item.url)?.hostLabel ?? item.url;
              return (
                <li key={item.id} className="strategy-mini-row">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="strategy-item-main"
                    aria-label={copy.libOpenLinkAria(item.title)}
                  >
                    <span className="strategy-kind-badge is-link" aria-hidden="true">
                      <Link2 size={13} />
                    </span>
                    <span className="strategy-item-copy">
                      <strong>{item.title}</strong>
                      <small>{host}</small>
                    </span>
                    <ArrowUpRight size={14} className="strategy-item-arrow" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    className="icon-button strategy-remove-btn"
                    aria-label={copy.libRemoveAria(item.title)}
                    onClick={() => confirmRemove(item)}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            }

            return (
              <li key={item.id} className="strategy-mini-row">
                <button
                  type="button"
                  className="strategy-item-main"
                  aria-label={copy.libOpenPdfAria(item.title)}
                  onClick={() => void openPdfItem(item)}
                >
                  <span className="strategy-kind-badge is-pdf" aria-hidden="true">
                    <FileText size={13} />
                  </span>
                  <span className="strategy-item-copy">
                    <strong>{item.title}</strong>
                    <small>PDF · {formatBytes(item.size)}</small>
                  </span>
                  <ArrowUpRight size={14} className="strategy-item-arrow" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button strategy-remove-btn"
                  aria-label={copy.libRemoveAria(item.title)}
                  onClick={() => confirmRemove(item)}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        !formOpen && (
          <div className="strategy-empty">
            <p>{copy.libEmptyHint}</p>
            <div className="strategy-empty-actions">
              <button type="button" className="button-secondary" onClick={() => openForm("pdf")}>
                <Upload size={13} /> {copy.libTabPdf}
              </button>
              <button type="button" className="button-secondary" onClick={() => openForm("link")}>
                <Link2 size={13} /> {copy.libTabLink}
              </button>
            </div>
          </div>
        )
      )}

      {readingPdf && (
        <div
          className="strategy-pdf-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={copy.libReaderAria}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeReader();
          }}
        >
          <div className="strategy-pdf-modal">
            <div className="strategy-pdf-header">
              <div className="strategy-pdf-title">
                <FileText size={16} />
                <strong>{readingPdf.item.title}</strong>
                <small>{formatBytes(readingPdf.item.size)}</small>
              </div>
              <div className="strategy-pdf-actions">
                <a
                  href={readingPdf.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button-secondary strategy-pdf-action-link"
                >
                  <ExternalLink size={13} /> <span>{copy.libOpenNewTab}</span>
                </a>
                <a
                  href={readingPdf.blobUrl}
                  download={readingPdf.item.fileName}
                  className="button-secondary strategy-pdf-action-link"
                >
                  <Download size={13} /> <span>{copy.libDownloadPdf}</span>
                </a>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={copy.close}
                  onClick={closeReader}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe
              className="strategy-pdf-frame"
              src={readingPdf.blobUrl}
              title={readingPdf.item.title}
            />
          </div>
        </div>
      )}
    </section>
  );
}

export function buildStrategyLinkItem(url: string, title: string): StrategyLibraryItem {
  return {
    id: crypto.randomUUID(),
    kind: "link",
    title: title.slice(0, 120),
    url,
    addedAt: todayString(),
  };
}
