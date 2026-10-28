import { MARKETS, MOODS } from "@/lib/types";

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate) || Number.isNaN(Date.parse(`${tradeDate}T12:00:00Z`)) || new Date(`${tradeDate}T12:00:00Z`).toISOString().slice(0, 10) !== tradeDate) throw new Error("Choose a valid trade date.");
  if (!pnlRaw || !Number.isFinite(pnl) || Math.abs(pnl) > 99999999999) throw new Error("Enter a valid P&L amount.");
  if (!MOODS.includes(mood as typeof MOODS[number])) throw new Error("Choose a valid feeling.");
  if (setup.length > 80 || notes.length > 2000) throw new Error("Your setup or notes are too long.");
  return { symbol, market, side: side as "Long" | "Short", setup, tradeDate, pnl: pnl.toFixed(2), mood, notes };
}
