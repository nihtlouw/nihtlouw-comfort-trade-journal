"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { Check, ChevronDown, CircleHelp, Download, FileImage, ImagePlus, Pause, Pencil, Play, Plus, RotateCcw, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { getAttachment, type StorageMode } from "@/lib/attachments";
import { CSV_FIELDS, csvRowsToTrades, parseCsv, type CsvMapping, type CsvPreview } from "@/lib/csv";
import { currency, todayString } from "@/lib/format";
import { csvFieldLabel, translateAccountName, translateMarket, translateMood, translateSide, UI_COPY } from "@/lib/i18n";
import {
  DEFAULT_ACCOUNT,
  MARKETS,
  MAX_ATTACHMENT_BYTES,
  MOODS,
  type AppLocale,
  type BackupReminderDays,
  type JournalData,
  type PlaybookRule,
  type RiskLimits,
  type Trade,
  type TradeAttachment,
  type TradingAccount,
} from "@/lib/types";
import { parseTradeInput } from "@/lib/trade-validation";
import { getDraftRiskAlerts } from "@/lib/risk";
import type { BackupReminderState } from "@/lib/backup-reminder";

export function ModalShell({ children, onClose, label, wide = false }: { children: ReactNode; onClose: () => void; label: string; wide?: boolean }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow; const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const timeout = window.setTimeout(() => dialog.current?.querySelector<HTMLElement>("input:not([type=hidden]), button, select, textarea")?.focus(), 0);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab" && dialog.current) {
        const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter((item) => item.offsetParent !== null);
        if (!focusable.length) return;
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
      }
    };
    window.addEventListener("keydown", key);
    return () => { window.clearTimeout(timeout); document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", key); previousFocus?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialog} className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={label}>{children}</div></div>;
}

function ModalHeader({ title, description, onClose, id, closeLabel = "Close" }: { title: string; description: string; onClose: () => void; id: string; closeLabel?: string }) {
  return <div className="modal-header"><div><h2 id={id}>{title}</h2><p>{description}</p></div><button type="button" className="icon-button modal-close" onClick={onClose} aria-label={closeLabel}><X size={19}/></button></div>;
}

function ImagePreview({ item, mode, onRemove }: { item: TradeAttachment; mode: StorageMode; onRemove?: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let active = true; let created = ""; getAttachment(item, mode).then((blob) => { if (active) { created = URL.createObjectURL(blob); setUrl(created); } }).catch(() => {}); return () => { active = false; if (created) URL.revokeObjectURL(created); }; }, [item, mode]);
  return <div className="attachment-thumb">{url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${item.name}`}><Image src={url} alt={item.name} width={90} height={58} unoptimized/></a> : <span><FileImage size={20}/></span>}<small title={item.name}>{item.name}</small>{onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${item.name}`}><X size={13}/></button>}</div>;
}

type TradeForm = {
  symbol: string; market: string; side: "Long" | "Short"; tradeDate: string; pnl: string; setup: string; mood: string; notes: string; accountId: string;
  entryPrice: string; exitPrice: string; positionSize: string; stopLoss: string; takeProfit: string; fees: string; initialRisk: string; timeframe: string; session: string; tags: string;
  checklist: { id: string; text: string; checked: boolean }[]; attachments: TradeAttachment[];
};
export type TradeDraft = Omit<TradeForm, "tags"> & { tags: string[] };

export function TradeModal({ trade, trades, limits, hidden, accounts, playbook, defaultAccount, mode, locale = "en", onClose, onSave, onDelete }: { trade: Trade | null; trades: Trade[]; limits: RiskLimits; hidden: boolean; accounts: TradingAccount[]; playbook: PlaybookRule[]; defaultAccount: string; mode: StorageMode; locale?: AppLocale; onClose: () => void; onSave: (draft: TradeDraft, files: File[], removed: TradeAttachment[], id?: number) => Promise<boolean>; onDelete: (id: number) => Promise<boolean> }) {
  const copy = UI_COPY[locale];
  const [form, setForm] = useState<TradeForm>(() => ({
    symbol: trade?.symbol ?? "", market: trade?.market ?? "Forex", side: trade?.side ?? "Long", tradeDate: trade?.tradeDate ?? todayString(), pnl: trade?.pnl ?? "",
    setup: trade?.setup ?? "", mood: trade?.mood ?? "Calm", notes: trade?.notes ?? "", accountId: trade?.accountId ?? defaultAccount,
    entryPrice: trade?.entryPrice ?? "", exitPrice: trade?.exitPrice ?? "", positionSize: trade?.positionSize ?? "", stopLoss: trade?.stopLoss ?? "", takeProfit: trade?.takeProfit ?? "", fees: trade?.fees ?? "", initialRisk: trade?.initialRisk ?? "", timeframe: trade?.timeframe ?? "", session: trade?.session ?? "", tags: (trade?.tags ?? []).join(", "),
    checklist: trade?.checklist?.length ? trade.checklist.map((rule) => ({ ...rule })) : playbook.map(({ id, text }) => ({ id, text, checked: false })), attachments: trade?.attachments ?? [],
  }));
  const [files, setFiles] = useState<File[]>([]); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [advanced, setAdvanced] = useState(!!trade && !!(trade.entryPrice || trade.initialRisk || trade.tags?.length || trade.attachments?.length || trade.checklist?.some((rule) => rule.checked)));
  const update = <K extends keyof TradeForm>(key: K, value: TradeForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const draftAlerts = getDraftRiskAlerts(trades, { ...form, tags: [], id: trade?.id ?? 0, isDemo: trade?.isDemo ?? false }, limits, trade?.id);
  async function submit(event: FormEvent) { event.preventDefault(); setError("");
    const draft: TradeDraft = { ...form, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) };
    try { parseTradeInput(draft); } catch (caught) { setError(caught instanceof Error ? caught.message : "Please check your trade."); return; }
    setSaving(true); const removed = (trade?.attachments ?? []).filter((item) => !form.attachments.some((current) => current.id === item.id));
    const ok = await onSave(draft, files, removed, trade?.id); setSaving(false); if (ok) onClose();
  }
  async function remove() { if (!trade || !window.confirm(copy.confirmDeleteTrade(trade.symbol))) return; setSaving(true); const ok = await onDelete(trade.id); setSaving(false); if (ok) onClose(); }
  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) { const chosen = Array.from(event.target.files ?? []); event.target.value = ""; if (chosen.some((file) => file.size > MAX_ATTACHMENT_BYTES)) { setError(locale === "id" ? "Setiap gambar maksimal berukuran 2 MB." : "Each screenshot must be 2 MB or less."); return; } if (form.attachments.length + files.length + chosen.length > 8) { setError(locale === "id" ? "Maksimal 8 screenshot per trade." : "Add up to 8 screenshots per trade."); return; } setError(""); setFiles((current) => [...current, ...chosen]); }
  return <ModalShell onClose={onClose} label="trade-modal-title" wide><ModalHeader id="trade-modal-title" title={trade ? copy.editTradeTitle : copy.logTradeTitle} description={copy.tradeModalDesc} onClose={onClose} closeLabel={copy.close}/>
    <form className="modal-form" onSubmit={submit}><div className="form-section-label">{copy.tradeDetailsSection}</div><div className="form-grid">
      <label>{copy.assetSymbolLabel}<input required maxLength={24} placeholder="e.g. EUR/USD" value={form.symbol} onChange={(event) => update("symbol", event.target.value)}/></label>
      <label>{copy.marketLabel}<select value={form.market} onChange={(event) => update("market", event.target.value)}>{MARKETS.map((market) => <option key={market} value={market}>{translateMarket(market, locale)}</option>)}</select></label>
      <label>{copy.directionLabel}<select value={form.side} onChange={(event) => update("side", event.target.value as "Long" | "Short")}><option value="Long">{translateSide("Long", locale)}</option><option value="Short">{translateSide("Short", locale)}</option></select></label>
      <label>{copy.tradeDateLabel}<input type="date" required value={form.tradeDate} onChange={(event) => update("tradeDate", event.target.value)}/></label>
      <label>{copy.netPnlLabel}<input type="number" step="0.01" required placeholder="e.g. 125 or -50" value={form.pnl} onChange={(event) => update("pnl", event.target.value)}/><small>{copy.netPnlHint}</small></label>
      <label>{copy.tradingAccountLabel}<select value={form.accountId} onChange={(event) => update("accountId", event.target.value)}>{accounts.map((account) => <option value={account.id} key={account.id}>{translateAccountName(account.name, locale)}</option>)}</select></label>
      <label>{copy.setupLabel}<input maxLength={80} placeholder={copy.setupPlaceholder} value={form.setup} onChange={(event) => update("setup", event.target.value)}/></label>
      <label>{copy.howFeelLabel}<select value={form.mood} onChange={(event) => update("mood", event.target.value)}>{MOODS.map((mood) => <option key={mood} value={mood}>{translateMood(mood, locale)}</option>)}</select></label>
      <label className="form-full">{copy.notesLabel}<textarea maxLength={5000} rows={3} placeholder={copy.notesPlaceholder} value={form.notes} onChange={(event) => update("notes", event.target.value)}/></label>
    </div>
    <button type="button" className="advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><span>{copy.optionalDetails}</span><ChevronDown size={17} className={advanced ? "rotated" : ""}/></button>
    {advanced && <div className="advanced-content"><div className="form-grid"><label>{copy.entryPriceLabel}<input type="number" min="0" step="any" value={form.entryPrice} onChange={(event) => update("entryPrice", event.target.value)} placeholder={copy.optionalPlaceholder}/></label><label>{copy.exitPriceLabel}<input type="number" min="0" step="any" value={form.exitPrice} onChange={(event) => update("exitPrice", event.target.value)} placeholder={copy.optionalPlaceholder}/></label><label>{copy.positionSizeLabel}<input type="number" min="0" step="any" value={form.positionSize} onChange={(event) => update("positionSize", event.target.value)} placeholder={copy.optionalPlaceholder}/></label><label>{copy.initialRiskLabel}<input type="number" min="0" step="any" value={form.initialRisk} onChange={(event) => update("initialRisk", event.target.value)} placeholder="e.g. 100"/><small>{copy.initialRiskHint}</small></label><label>{copy.stopLossLabel}<input type="number" min="0" step="any" value={form.stopLoss} onChange={(event) => update("stopLoss", event.target.value)} placeholder={copy.optionalPlaceholder}/></label><label>{copy.takeProfitLabel}<input type="number" min="0" step="any" value={form.takeProfit} onChange={(event) => update("takeProfit", event.target.value)} placeholder={copy.optionalPlaceholder}/></label><label>{copy.feesLabel}<input type="number" min="0" step="any" value={form.fees} onChange={(event) => update("fees", event.target.value)} placeholder={copy.optionalPlaceholder}/><small>{copy.feesHint}</small></label><label>{copy.timeframeLabel}<input maxLength={40} value={form.timeframe} onChange={(event) => update("timeframe", event.target.value)} placeholder={copy.timeframePlaceholder}/></label><label>{copy.sessionLabel}<input maxLength={40} value={form.session} onChange={(event) => update("session", event.target.value)} placeholder="e.g. London"/></label><label>{copy.tagsLabel}<input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="breakout, patient, A+"/><small>{copy.tagsHint}</small></label></div>
      <div className="form-subheading"><strong>{copy.playbookChecklistTitle}</strong><span>{copy.playbookChecklistSub}</span></div><div className="trade-checklist">{form.checklist.map((rule) => <label key={rule.id}><input type="checkbox" checked={rule.checked} onChange={(event) => update("checklist", form.checklist.map((item) => item.id === rule.id ? { ...item, checked: event.target.checked } : item))}/><span>{rule.text}</span></label>)}{!form.checklist.length && <p>{copy.emptyChecklistHint}</p>}</div>
      <div className="form-subheading"><strong>{copy.screenshotsTitle}</strong><span>{copy.screenshotsSub}</span></div><div className="attachment-list">{form.attachments.map((item) => <ImagePreview key={item.id} item={item} mode={mode} onRemove={() => update("attachments", form.attachments.filter((image) => image.id !== item.id))}/>)}{files.map((file, index) => <div className="attachment-thumb pending" key={`${file.name}-${index}`}><span><FileImage size={20}/></span><small>{file.name}</small><button type="button" onClick={() => setFiles(files.filter((_, item) => item !== index))} aria-label={`Remove ${file.name}`}><X size={13}/></button></div>)}<label className="upload-image"><ImagePlus size={20}/><span>{copy.addImage}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={chooseFiles}/></label></div>
    </div>}
    {draftAlerts.length > 0 && <div className="draft-risk-notice" role="status"><ShieldCheck size={19}/><div><strong>{copy.draftRiskTitle}</strong>{draftAlerts.map((alert) => <p key={alert.kind}>{alert.kind === "trade" ? copy.draftRiskTradePrefix : copy.draftRiskDailyPrefix} {copy.draftRiskExceeds(currency(alert.amount, false, hidden), currency(alert.limit, false, hidden))}</p>)}<small>{copy.draftRiskNote}</small></div></div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions">{trade && <button type="button" className="delete-link" onClick={remove} disabled={saving}><Trash2 size={15}/> {copy.deleteTrade}</button>}<span className="actions-spacer"/><button type="button" className="button-secondary" onClick={onClose} disabled={saving}>{copy.cancel}</button><button type="submit" className="button-primary" disabled={saving}><Check size={16}/> {saving ? copy.saving : trade ? copy.saveChanges : copy.saveTrade}</button></div></form>
  </ModalShell>;
}

export function ImportModal({ trades, accounts, defaultAccount, locale = "en", onClose, onImport }: { trades: Trade[]; accounts: TradingAccount[]; defaultAccount: string; locale?: AppLocale; onClose: () => void; onImport: (trades: Trade[]) => Promise<boolean> }) {
  const copy = UI_COPY[locale];
  const [preview, setPreview] = useState<CsvPreview | null>(null); const [mapping, setMapping] = useState<CsvMapping | null>(null); const [skipDuplicates, setSkipDuplicates] = useState(true); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const rows = useMemo(() => { if (!preview || !mapping) return []; try { return csvRowsToTrades(preview, mapping, accounts, defaultAccount, trades); } catch { return []; } }, [preview, mapping, accounts, defaultAccount, trades]);
  const valid = rows.filter((row) => row.trade && (!row.duplicate || !skipDuplicates));
  async function choose(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { if (file.size > 3_000_000) throw new Error("CSV files must be under 3 MB."); const data = parseCsv(await file.text()); setPreview(data); setMapping(data.mapping); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn't read this CSV."); } }
  async function submit() { if (!preview || !mapping) return; try { csvRowsToTrades(preview, mapping, accounts, defaultAccount, trades); if (!valid.length) throw new Error(locale === "id" ? "Tidak ada baris valid untuk diimpor. Periksa pemetaan kolom dan pesan error." : "There are no valid rows to import. Check the column mapping and row errors."); setBusy(true); const ok = await onImport(valid.map((row) => row.trade!)); setBusy(false); if (ok) onClose(); } catch (caught) { setBusy(false); setError(caught instanceof Error ? caught.message : "Couldn't import."); } }
  return <ModalShell onClose={onClose} label="import-modal-title" wide><ModalHeader id="import-modal-title" title={copy.importCsvTitle} description={copy.importCsvDesc} onClose={onClose} closeLabel={copy.close}/><div className="modal-form import-content"><div className="import-help"><ShieldCheck size={18}/><span>{copy.importHelp}</span></div><label className="csv-upload"><Upload size={20}/><strong>{preview ? copy.chooseAnotherCsv : copy.chooseCsvFile}</strong><span>{copy.csvLimitSub}</span><input type="file" accept=".csv,text/csv" onChange={choose}/></label>
    {preview && mapping && <><div className="form-subheading"><strong>{copy.mapColumnsTitle}</strong><span>{copy.mapColumnsSub}</span></div><div className="mapping-grid">{CSV_FIELDS.map((field) => <label key={field}>{csvFieldLabel(field, locale)}<select value={mapping[field]} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}><option value="">{copy.notMapped}</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><label className="check-line"><input type="checkbox" checked={skipDuplicates} onChange={(event) => setSkipDuplicates(event.target.checked)}/> {copy.skipDuplicatesLabel}</label><div className="import-summary"><strong>{copy.readyToImport(valid.length)}</strong><span>{copy.importCounts(rows.filter((row) => row.error).length, rows.filter((row) => row.duplicate).length)}</span></div>{rows.some((row) => row.error) && <div className="import-errors" role="status"><strong>{copy.invalidRowsSkipped}</strong>{rows.filter((row) => row.error).slice(0, 5).map((row) => <span key={row.row}>Row {row.row}: {row.error}</span>)}{rows.filter((row) => row.error).length > 5 && <span>{copy.additionalSkipped}</span>}</div>}<div className="import-preview">{rows.slice(0, 6).map((row) => <div key={row.row}><span>Row {row.row}</span><strong>{row.trade ? `${row.trade.symbol} · ${row.trade.tradeDate} · ${currency(Number(row.trade.pnl))}` : copy.needsAttention}</strong><small className={row.error ? "loss-text" : ""}>{row.error || (row.duplicate ? copy.possibleDuplicate : copy.readyRow)}</small></div>)}{rows.length > 6 && <small>{copy.showingFirst6(rows.length)}</small>}</div></>}
    {error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><span className="actions-spacer"/><button type="button" className="button-secondary" onClick={onClose}>{copy.cancel}</button><button type="button" className="button-primary" disabled={!preview || busy} onClick={submit}><Upload size={16}/> {busy ? copy.importing : copy.importNTrades(valid.length)}</button></div></div></ModalShell>;
}

function parseBalanceField(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 99999999999) return { ok: false };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export type SettingsTab = "General" | "Data" | "Accounts" | "Risk";
export function SettingsModal({
  data,
  mode,
  sampleCount,
  initialTab = "General",
  backupState,
  backupAvailable,
  backupEnabled,
  hidden = false,
  onClose,
  onUpdate,
  onClearSamples,
  onBackup,
  onRestore,
  onExportCsv,
  onImportCsv,
  onAddAccount,
  onUpdateAccount,
  onRemoveAccount,
  onSignOut,
}: {
  data: JournalData;
  mode: StorageMode;
  sampleCount: number;
  initialTab?: SettingsTab;
  backupState: BackupReminderState | null;
  backupAvailable: boolean;
  backupEnabled: boolean;
  hidden?: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<JournalData["settings"]>) => Promise<boolean>;
  onClearSamples: () => Promise<boolean>;
  onBackup: () => Promise<void>;
  onRestore: (file: File) => Promise<boolean>;
  onExportCsv: () => void;
  onImportCsv: () => void;
  onAddAccount: (name: string, startingBalance: number | null) => Promise<boolean>;
  onUpdateAccount: (id: string, patch: { name: string; startingBalance: number | null }) => Promise<boolean>;
  onRemoveAccount: (id: string) => Promise<boolean>;
  onSignOut?: () => void;
}) {
  const locale = data.settings.locale ?? "en";
  const copy = UI_COPY[locale];
  const [name, setName] = useState(data.settings.name);
  const [accountName, setAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccountName, setEditAccountName] = useState("");
  const [editAccountBalance, setEditAccountBalance] = useState("");
  const [accountError, setAccountError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [perTradeLimit, setPerTradeLimit] = useState(data.settings.riskLimits?.perTrade?.toString() ?? "");
  const [dailyLimit, setDailyLimit] = useState(data.settings.riskLimits?.dailyLoss?.toString() ?? "");
  const [riskError, setRiskError] = useState("");
  const [riskSaved, setRiskSaved] = useState(false);
  const accounts = data.settings.accounts ?? [DEFAULT_ACCOUNT];

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const ok = await onUpdate({ name: name.trim() });
    setBusy(false);
    if (ok) onClose();
  }
  async function restore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !window.confirm(copy.confirmRestore)) return;
    setBusy(true);
    const ok = await onRestore(file);
    setBusy(false);
    if (ok) onClose();
  }
  async function addAccount(event: FormEvent) {
    event.preventDefault();
    setAccountError("");
    if (!accountName.trim()) return;
    const parsedBal = parseBalanceField(newAccountBalance);
    if (!parsedBal.ok) {
      setAccountError(copy.startingBalanceError);
      return;
    }
    setBusy(true);
    const ok = await onAddAccount(accountName.trim(), parsedBal.value);
    setBusy(false);
    if (ok) {
      setAccountName("");
      setNewAccountBalance("");
    }
  }
  function startEditingAccount(account: TradingAccount) {
    setAccountError("");
    setEditingAccountId(account.id);
    setEditAccountName(account.name);
    setEditAccountBalance(account.startingBalance !== null && account.startingBalance !== undefined ? String(account.startingBalance) : "");
  }
  async function saveEditedAccount(event: FormEvent, accountId: string) {
    event.preventDefault();
    setAccountError("");
    if (!editAccountName.trim()) return;
    const parsedBal = parseBalanceField(editAccountBalance);
    if (!parsedBal.ok) {
      setAccountError(copy.startingBalanceError);
      return;
    }
    setBusy(true);
    const ok = await onUpdateAccount(accountId, { name: editAccountName.trim(), startingBalance: parsedBal.value });
    setBusy(false);
    if (ok) setEditingAccountId(null);
  }
  async function saveRisk(event: FormEvent) {
    event.preventDefault();
    setRiskError("");
    setRiskSaved(false);
    const parse = (value: string) => (value.trim() ? Number(value) : null);
    const perTrade = parse(perTradeLimit);
    const dailyLoss = parse(dailyLimit);
    if ([perTrade, dailyLoss].some((value) => value !== null && (!Number.isFinite(value) || value <= 0 || value > 99999999999))) {
      setRiskError(
        locale === "id"
          ? "Masukkan batas positif hingga 99.999.999.999, atau kosongkan untuk menonaktifkan."
          : "Enter a positive limit up to 99,999,999,999, or leave it blank to turn it off.",
      );
      return;
    }
    setBusy(true);
    const ok = await onUpdate({ riskLimits: { perTrade, dailyLoss } });
    setBusy(false);
    if (ok) setRiskSaved(true);
  }

  return (
    <ModalShell onClose={onClose} label="settings-modal-title" wide>
      <ModalHeader id="settings-modal-title" title={copy.settingsTitle} description={copy.settingsDesc} onClose={onClose} closeLabel={copy.close} />
      <div className="settings-tabs">
        {(["General", "Data", "Accounts", "Risk"] as const).map((item) => (
          <button type="button" key={item} className={tab === item ? "selected" : ""} aria-pressed={tab === item} onClick={() => setTab(item)}>
            {copy.settingsTabs[item]}
          </button>
        ))}
      </div>
      <div className="modal-form settings-content" key={tab}>
        {tab === "General" && (
          <form onSubmit={save}>
            <label>
              {copy.displayNameLabel}
              <input maxLength={40} required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="settings-row">
              <div>
                <strong>{copy.languageRowTitle}</strong>
                <p>{copy.languageRowDesc}</p>
              </div>
              <div className="segment-control settings-lang-switch" role="group" aria-label={copy.languageToggleAria}>
                <button
                  type="button"
                  className={locale === "en" ? "selected" : ""}
                  aria-pressed={locale === "en"}
                  onClick={() => void onUpdate({ locale: "en", patienceLocale: "en" })}
                >
                  English
                </button>
                <button
                  type="button"
                  className={locale === "id" ? "selected" : ""}
                  aria-pressed={locale === "id"}
                  onClick={() => void onUpdate({ locale: "id", patienceLocale: "id" })}
                >
                  Indonesia
                </button>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <strong>{copy.appearanceTitle}</strong>
                <p>{copy.appearanceDesc}</p>
              </div>
              <button type="button" className="button-secondary" onClick={() => void onUpdate({ theme: data.settings.theme === "dark" ? "light" : "dark" })}>
                {data.settings.theme === "dark" ? copy.lightModeBtn : copy.darkModeBtn}
              </button>
            </div>
            <div className="settings-row">
              <div>
                <strong>{copy.motionTitle}</strong>
                <p>{copy.motionDesc}</p>
              </div>
              <button
                type="button"
                className="button-secondary"
                aria-pressed={data.settings.reduceMotion === true}
                onClick={() => void onUpdate({ reduceMotion: !data.settings.reduceMotion })}
              >
                {copy.reduceMotionBtn(data.settings.reduceMotion === true)}
              </button>
            </div>
            <div className="settings-row">
              <div>
                <strong>{copy.sampleTradesTitle}</strong>
                <p>{copy.sampleTradesDesc(sampleCount)}</p>
              </div>
              <button
                type="button"
                className="button-secondary"
                disabled={!sampleCount || busy}
                onClick={async () => {
                  if (window.confirm(copy.confirmClearSamples)) {
                    setBusy(true);
                    await onClearSamples();
                    setBusy(false);
                  }
                }}
              >
                {copy.clearSamplesBtn}
              </button>
            </div>
            {onSignOut && (
              <div className="settings-row">
                <div>
                  <strong>{copy.privateAccountRowTitle}</strong>
                  <p>{copy.privateAccountRowDesc}</p>
                </div>
                <button type="button" className="button-secondary" onClick={onSignOut}>
                  {copy.signOutBtn}
                </button>
              </div>
            )}
            <div className="modal-actions">
              <span className="actions-spacer" />
              <button type="button" className="button-secondary" onClick={onClose}>
                {copy.cancel}
              </button>
              <button type="submit" className="button-primary" disabled={busy}>
                {copy.saveChanges}
              </button>
            </div>
          </form>
        )}

        {tab === "Data" && (
          <div className="data-settings">
            <div className="storage-notice">
              <ShieldCheck size={20} />
              <div>
                <strong>{mode === "browser" ? copy.savedBrowserNoticeTitle : copy.savedServerNoticeTitle}</strong>
                <p>{mode === "browser" ? copy.savedBrowserNoticeBody : copy.savedServerNoticeBody}</p>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <strong>{copy.fullBackupTitle}</strong>
                <p>{copy.fullBackupDesc}</p>
                {!backupEnabled && <p>{copy.fullBackupRecoveryNote}</p>}
              </div>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !backupEnabled}
                onClick={async () => {
                  setBusy(true);
                  await onBackup();
                  setBusy(false);
                }}
              >
                <Download size={15} /> {copy.downloadBtn}
              </button>
            </div>
            <div className="settings-row backup-reminder-settings">
              <div>
                <strong>{copy.backupRemindersTitle}</strong>
                <p>
                  {!backupAvailable
                    ? copy.backupNoHistoryDevice
                    : backupState?.lastDownloadAt
                      ? copy.backupLastStarted(new Date(backupState.lastDownloadAt).toLocaleString(locale === "id" ? "id-ID" : "en-US"))
                      : copy.backupNeverStarted}{" "}
                  {copy.backupStartedCaveat}
                </p>
                <p>{copy.backupInAppNote}</p>
              </div>
              <label>
                <span className="sr-only">{copy.backupFreqAria}</span>
                <select
                  aria-label={copy.backupFreqAria}
                  value={data.settings.backupReminderDays ?? 7}
                  disabled={busy}
                  onChange={async (event) => {
                    setBusy(true);
                    await onUpdate({ backupReminderDays: Number(event.target.value) as BackupReminderDays });
                    setBusy(false);
                  }}
                >
                  <option value={0}>{copy.backupOff}</option>
                  <option value={7}>{copy.backupEveryDays(7)}</option>
                  <option value={14}>{copy.backupEveryDays(14)}</option>
                  <option value={30}>{copy.backupEveryDays(30)}</option>
                </select>
              </label>
            </div>
            <div className="settings-row">
              <div>
                <strong>{copy.restoreBackupTitle}</strong>
                <p>{copy.restoreBackupDesc}</p>
              </div>
              <label className="button-secondary file-button">
                <Upload size={15} /> {copy.restoreBtn}
                <input type="file" accept="application/json,.json" disabled={busy} onChange={restore} />
              </label>
            </div>
            <div className="settings-row">
              <div>
                <strong>{copy.tradeCsvTitle}</strong>
                <p>{copy.tradeCsvDesc}</p>
              </div>
              <div className="settings-actions">
                <button type="button" className="button-secondary" onClick={onExportCsv}>
                  {copy.exportBtn}
                </button>
                <button type="button" className="button-secondary" onClick={onImportCsv}>
                  {copy.importBtn}
                </button>
              </div>
            </div>
            <div className="data-warning">
              <CircleHelp size={15} /> {copy.dataWarning}
            </div>
          </div>
        )}

        {tab === "Risk" && (
          <form className="risk-settings" onSubmit={saveRisk}>
            <div className="storage-notice">
              <ShieldCheck size={20} />
              <div>
                <strong>{copy.riskNoticeTitle}</strong>
                <p>{copy.riskNoticeBody}</p>
              </div>
            </div>
            <p>{copy.riskIntro}</p>
            <div className="risk-settings-fields">
              <label>
                {copy.perTradeLimitLabel}
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="99999999999"
                  step="0.01"
                  placeholder={copy.noLimitPlaceholder}
                  value={perTradeLimit}
                  onChange={(event) => {
                    setPerTradeLimit(event.target.value);
                    setRiskSaved(false);
                  }}
                />
                <small>{copy.perTradeLimitHint}</small>
              </label>
              <label>
                {copy.dailyLossLimitLabel}
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="99999999999"
                  step="0.01"
                  placeholder={copy.noLimitPlaceholder}
                  value={dailyLimit}
                  onChange={(event) => {
                    setDailyLimit(event.target.value);
                    setRiskSaved(false);
                  }}
                />
                <small>{copy.dailyLossLimitHint}</small>
              </label>
            </div>
            {riskError && (
              <div className="form-error" role="alert">
                {riskError}
              </div>
            )}
            {riskSaved && (
              <p className="risk-saved" role="status">
                {copy.riskSavedMsg}
              </p>
            )}
            <div className="modal-actions">
              <span className="actions-spacer" />
              <button type="submit" className="button-primary" disabled={busy}>
                {copy.saveLimitsBtn}
              </button>
            </div>
          </form>
        )}

        {tab === "Accounts" && (
          <div className="account-settings">
            <p>{copy.accountsIntro}</p>
            {accounts.map((account) => {
              const allAccountTrades = data.trades.filter((trade) => (trade.accountId ?? "main") === account.id);
              const realNet = allAccountTrades
                .filter((trade) => !trade.isDemo)
                .reduce((sum, trade) => sum + Number(trade.pnl), 0);
              const startBal = account.startingBalance ?? null;
              const currentBal = startBal !== null ? startBal + realNet : null;
              const isEditing = editingAccountId === account.id;
              const displayName = translateAccountName(account.name, locale);

              return (
                <div className="account-card-item" key={account.id}>
                  <div className="account-row">
                    <span className="account-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>{displayName}</strong>
                      <small>
                        {copy.accountTradesMeta(
                          allAccountTrades.length,
                          startBal !== null ? currency(startBal, false, hidden) : null,
                          currentBal !== null ? currency(currentBal, false, hidden) : null,
                        )}
                      </small>
                    </div>
                    <div className="account-row-actions">
                      <button
                        type="button"
                        className="button-secondary account-edit-btn"
                        disabled={busy}
                        onClick={() => (isEditing ? setEditingAccountId(null) : startEditingAccount(account))}
                      >
                        <Pencil size={13} /> {copy.editAccountBtn}
                      </button>
                      {accounts.length > 1 && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Delete ${account.name}`}
                          disabled={busy}
                          onClick={async () => {
                            if (window.confirm(copy.confirmRemoveAccount(displayName))) {
                              setBusy(true);
                              await onRemoveAccount(account.id);
                              setBusy(false);
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <form className="account-inline-editor" onSubmit={(event) => void saveEditedAccount(event, account.id)}>
                      <div className="form-grid">
                        <label>
                          {copy.accountNameInputLabel}
                          <input
                            required
                            maxLength={40}
                            value={editAccountName}
                            onChange={(event) => setEditAccountName(event.target.value)}
                          />
                        </label>
                        <label>
                          {copy.startingBalanceInputLabel}
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max="99999999999"
                            step="0.01"
                            placeholder={copy.startingBalancePlaceholder}
                            value={editAccountBalance}
                            onChange={(event) => setEditAccountBalance(event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="account-inline-actions">
                        <button type="button" className="button-secondary" onClick={() => setEditingAccountId(null)} disabled={busy}>
                          {copy.cancel}
                        </button>
                        <button type="submit" className="button-primary" disabled={busy || !editAccountName.trim()}>
                          <Check size={14} /> {copy.saveAccountBtn}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}

            {accountError && (
              <div className="form-error" role="alert">
                {accountError}
              </div>
            )}

            <form className="new-account-form" onSubmit={addAccount}>
              <label>
                {copy.newAccountNameLabel}
                <input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={40} placeholder={copy.newAccountPlaceholder} />
              </label>
              <label>
                {copy.newAccountBalanceLabel}
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="99999999999"
                  step="0.01"
                  value={newAccountBalance}
                  onChange={(event) => setNewAccountBalance(event.target.value)}
                  placeholder={copy.startingBalancePlaceholder}
                />
              </label>
              <button type="submit" className="button-primary" disabled={busy || !accountName.trim()}>
                <Plus size={15} /> {copy.addAccountBtn}
              </button>
            </form>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

export function BreathingModal({ onClose, locale = "en" }: { onClose: () => void; locale?: AppLocale }) {
  const copy = UI_COPY[locale];
  const [running, setRunning] = useState(false); const [ticks, setTicks] = useState(0);
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setTicks((current) => current + 1), 1000); return () => window.clearInterval(timer); }, [running]);
  const phase = Math.floor(ticks / 4) % 3; const label = copy.breathePhases[phase];
  return <ModalShell onClose={onClose} label="breathing-title"><ModalHeader id="breathing-title" title={copy.breathingHeroTitle} description={copy.breathingModalDesc} onClose={onClose} closeLabel={copy.close}/><div className="breathing-content"><div className={`breathing-orb ${running ? `running phase-${phase}` : ""}`}><div><span>{running ? label : copy.ready}</span><strong>{running ? 4 - ticks % 4 : "✳"}</strong><small>{running ? copy.seconds : copy.fourSecPhase}</small></div></div><p>{copy.breathingHeroDesc}</p><div className="breathing-actions"><button type="button" className="button-primary" onClick={() => setRunning(!running)}>{running ? <Pause size={16}/> : <Play size={16}/>} {running ? copy.pause : ticks ? copy.continueBtn : copy.beginBreathing}</button><button type="button" className="button-secondary" onClick={() => { setTicks(0); setRunning(false); }}><RotateCcw size={15}/> {copy.reset}</button></div></div></ModalShell>;
}
