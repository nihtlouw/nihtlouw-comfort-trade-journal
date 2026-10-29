import { ATTACHMENT_STAGES, MARKETS, MOODS, type AttachmentStage, type RuleSnapshot, type TradeAttachment } from "@/lib/types";
import { isDate } from "@/lib/journal-data";

function sanitizeAttachments(raw: unknown): TradeAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((item) => {
    const entry = item as TradeAttachment;
    const stage = ATTACHMENT_STAGES.includes(entry.stage as AttachmentStage) ? (entry.stage as AttachmentStage) : undefined;
    const caption = typeof entry.caption === "string" && entry.caption.trim() ? entry.caption.trim().slice(0, 180) : undefined;
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      size: entry.size,
      ...(stage ? { stage } : {}),
      ...(caption ? { caption } : {}),
    };
  });
}

export function parseTradeInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Please check the trade details.");
  const body = input as Record<string, unknown>;
  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const market = String(body.market ?? "");
  const side = String(body.side ?? "");
  const setup = String(body.setup ?? "").trim();
  const tradeDate = String(body.tradeDate ?? "");
  const pnlRaw = String(body.pnl ?? "").trim();
  const pnl = Number(pnlRaw);
  const mood = String(body.mood ?? "Calm");
  const notes = String(body.notes ?? "").trim();
  if (!symbol || symbol.length > 24) throw new Error("Enter an asset name (up to 24 characters).");
  if (!MARKETS.includes(market as typeof MARKETS[number])) throw new Error("Choose a valid market.");
  if (side !== "Long" && side !== "Short") throw new Error("Choose a trade direction.");
  if (!isDate(tradeDate)) throw new Error("Choose a valid trade date (YYYY-MM-DD).");
  if (!pnlRaw || !Number.isFinite(pnl) || Math.abs(pnl) > 99999999999) throw new Error("Enter a valid net P&L amount.");
  if (!MOODS.includes(mood as typeof MOODS[number])) throw new Error("Choose a valid feeling.");
  if (setup.length > 80 || notes.length > 5000) throw new Error("Your setup or notes are too long.");
  const numeric = (key: string) => {
    const value = String(body[key] ?? "").trim();
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 99999999999)) throw new Error(`${key} must be a positive number.`);
    return value;
  };
  const tags = Array.isArray(body.tags) ? body.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 20) : [];
  if (tags.some((tag) => tag.length > 30)) throw new Error("Tags must be 30 characters or less.");
  return {
    symbol, market, side: side as "Long" | "Short", setup, tradeDate, pnl: pnl.toFixed(2), mood, notes,
    accountId: String(body.accountId ?? "main").slice(0, 100),
    entryPrice: numeric("entryPrice"), exitPrice: numeric("exitPrice"), positionSize: numeric("positionSize"),
    stopLoss: numeric("stopLoss"), takeProfit: numeric("takeProfit"), fees: numeric("fees"), initialRisk: numeric("initialRisk"),
    timeframe: String(body.timeframe ?? "").trim().slice(0, 40), session: String(body.session ?? "").trim().slice(0, 40), tags,
    ...(typeof body.followedPlan === "boolean" ? { followedPlan: body.followedPlan } : {}),
    checklist: Array.isArray(body.checklist) ? body.checklist as RuleSnapshot[] : [],
    attachments: sanitizeAttachments(body.attachments),
  };
}
