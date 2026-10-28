"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Check, Leaf, Pause, Play, RotateCcw, Sparkles, Trash2, Wind, X } from "lucide-react";
import { MARKETS, MOODS, type JournalSettings, type Trade } from "@/lib/types";
import { todayString } from "@/lib/format";

export type TradeDraft = {
  symbol: string;
  market: string;
  side: "Long" | "Short";
  tradeDate: string;
  pnl: string;
  setup: string;
  mood: string;
  notes: string;
};

function ModalShell({ children, onClose, labelledBy, wide = false }: { children: ReactNode; onClose: () => void; labelledBy: string; wide?: boolean }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", handleKey); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</div></div>;
}

export function TradeModal({ trade, onClose, onSave, onDelete }: { trade: Trade | null; onClose: () => void; onSave: (draft: TradeDraft, id?: number) => Promise<boolean>; onDelete: (id: number) => Promise<boolean> }) {
  const [form, setForm] = useState<TradeDraft>(() => trade ? { symbol: trade.symbol, market: trade.market, side: trade.side, tradeDate: trade.tradeDate, pnl: trade.pnl, setup: trade.setup, mood: trade.mood, notes: trade.notes } : { symbol: "", market: "Forex", side: "Long", tradeDate: todayString(), pnl: "", setup: "", mood: "Calm", notes: "" });
  const [saving, setSaving] = useState(false);
  const update = (key: keyof TradeDraft, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const ok = await onSave(form, trade?.id);
    setSaving(false); if (ok) onClose();
  }
  async function remove() {
    if (!trade || !window.confirm(`Delete the ${trade.symbol} trade? This can't be undone.`)) return;
    setSaving(true); const ok = await onDelete(trade.id); setSaving(false); if (ok) onClose();
  }
  return <ModalShell onClose={onClose} labelledBy="trade-modal-title" wide>
    <div className="modal-header"><div><span className="modal-eyebrow"><Leaf size={14} /> YOUR TRADING JOURNAL</span><h2 id="trade-modal-title">{trade ? "Edit your trade" : "Log a trade"}</h2><p>Every entry is a little step toward growth.</p></div><button type="button" className="close-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
    <form onSubmit={submit} className="modal-form"><div className="form-grid">
      <label>Asset / symbol <input required maxLength={24} autoFocus placeholder="e.g. EUR/USD" value={form.symbol} onChange={(event) => update("symbol", event.target.value)} /></label>
      <label>Market <select value={form.market} onChange={(event) => update("market", event.target.value)}>{MARKETS.map((market) => <option key={market}>{market}</option>)}</select></label>
      <label>Direction <select value={form.side} onChange={(event) => update("side", event.target.value)}><option>Long</option><option>Short</option></select></label>
      <label>Trade date <input type="date" required value={form.tradeDate} onChange={(event) => update("tradeDate", event.target.value)} /></label>
      <label>P&amp;L (USD) <input type="number" step="0.01" required placeholder="e.g. 125 or -50" value={form.pnl} onChange={(event) => update("pnl", event.target.value)} /><small>Use a negative number for a loss.</small></label>
      <label>Setup <input maxLength={80} placeholder="e.g. Trend continuation" value={form.setup} onChange={(event) => update("setup", event.target.value)} /></label>
      <label className="form-full">How did you feel? <select value={form.mood} onChange={(event) => update("mood", event.target.value)}>{MOODS.map((mood) => <option key={mood}>{mood}</option>)}</select></label>
      <label className="form-full">Notes <textarea maxLength={2000} rows={3} placeholder="What went well? What did you learn? Be kind to yourself." value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
    </div><div className="modal-actions">{trade && <button type="button" className="delete-link" onClick={remove} disabled={saving}><Trash2 size={15} /> Delete trade</button>}<span className="actions-spacer" /><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button-primary" disabled={saving}><Check size={16} /> {saving ? "Saving..." : trade ? "Save changes" : "Save trade"}</button></div></form>
  </ModalShell>;
}

export function GoalModal({ settings, onClose, onSave }: { settings: JournalSettings; onClose: () => void; onSave: (patch: Partial<JournalSettings>) => Promise<boolean> }) {
  const [goal, setGoal] = useState(settings.goal);
  const [target, setTarget] = useState(settings.goalTarget);
  const [progress, setProgress] = useState(settings.goalProgress);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const ok = await onSave({ goal, goalTarget: target, goalProgress: Math.min(progress, target) });
    setSaving(false); if (ok) onClose();
  }
  return <ModalShell onClose={onClose} labelledBy="goal-modal-title"><div className="modal-header"><div><span className="modal-eyebrow"><Sparkles size={14} /> A LITTLE INTENTION</span><h2 id="goal-modal-title">Make it yours.</h2><p>Choose a process you can feel good about.</p></div><button className="close-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><form onSubmit={submit} className="modal-form"><div className="form-grid"><label className="form-full">My intention <input required maxLength={100} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="e.g. Stick to my trading plan" /></label><label className="form-full">Mindful days to aim for <select value={target} onChange={(event) => setTarget(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option key={day} value={day}>{day} {day === 1 ? "day" : "days"}</option>)}</select></label><div className="form-full reset-line"><span>Currently marked: {progress} {progress === 1 ? "day" : "days"}</span><button type="button" onClick={() => setProgress(0)}><RotateCcw size={14} /> Reset progress</button></div></div><div className="modal-actions"><span className="actions-spacer" /><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button-primary" disabled={saving}>Save intention</button></div></form></ModalShell>;
}

export function SettingsModal({ settings, sampleCount, onClose, onSave, onClearSamples }: { settings: JournalSettings; sampleCount: number; onClose: () => void; onSave: (patch: Partial<JournalSettings>) => Promise<boolean>; onClearSamples: () => Promise<boolean> }) {
  const [name, setName] = useState(settings.name);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const ok = await onSave({ name }); setBusy(false); if (ok) onClose();
  }
  async function clearSamples() {
    if (!window.confirm("Remove all sample trades? Your own trades will stay safe.")) return;
    setBusy(true); await onClearSamples(); setBusy(false);
  }
  return <ModalShell onClose={onClose} labelledBy="settings-modal-title"><div className="modal-header"><div><span className="modal-eyebrow"><Leaf size={14} /> YOUR SPACE</span><h2 id="settings-modal-title">A little more you.</h2><p>Make this space feel like home.</p></div><button type="button" className="close-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><form onSubmit={submit} className="modal-form"><label>What should we call you? <input maxLength={40} required value={name} onChange={(event) => setName(event.target.value)} /></label><div className="settings-sample"><div><strong>Sample trades</strong><p>We added {sampleCount} sample {sampleCount === 1 ? "trade" : "trades"} to help you explore. Remove them whenever you&apos;re ready.</p></div><button type="button" onClick={clearSamples} disabled={sampleCount === 0 || busy}>Clear samples</button></div><div className="modal-actions"><span className="actions-spacer" /><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>Save changes</button></div></form></ModalShell>;
}

export function BreathingModal({ onClose }: { onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setTicks((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [running]);
  const phase = Math.floor(ticks / 4) % 3;
  const label = ["Breathe in", "Hold gently", "Breathe out"][phase];
  return <ModalShell onClose={onClose} labelledBy="breathing-modal-title"><div className="modal-header"><div><span className="modal-eyebrow"><Wind size={14} /> A MOMENT FOR YOU</span><h2 id="breathing-modal-title">Let&apos;s take a breath.</h2><p>There&apos;s nowhere else you need to be right now.</p></div><button type="button" className="close-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><div className="breathing-content"><div className={`breathing-orb ${running ? `running phase-${phase}` : ""}`}><div><span>{running ? label : "Ready when you are"}</span><strong>{running ? 4 - ticks % 4 : "✳"}</strong><small>{running ? "seconds" : "a little pause"}</small></div></div><p>Inhale, hold, and exhale for four seconds each.<br />Let the noise settle, one breath at a time.</p><div className="breathing-actions"><button type="button" className="button-primary" onClick={() => setRunning(!running)}>{running ? <Pause size={16} /> : <Play size={16} />}{running ? "Pause" : ticks ? "Continue" : "Begin breathing"}</button><button type="button" className="button-secondary" onClick={() => { setTicks(0); setRunning(false); }}><RotateCcw size={15} /> Reset</button></div></div></ModalShell>;
}
