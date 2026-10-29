import Papa from "papaparse";
import { MARKETS, type Trade, type TradingAccount } from "@/lib/types";
import { parseTradeInput } from "@/lib/trade-validation";

export const CSV_FIELDS = ["symbol", "tradeDate", "pnl", "market", "side", "setup", "mood", "notes", "account", "entryPrice", "exitPrice", "positionSize", "stopLoss", "takeProfit", "fees", "initialRisk", "timeframe", "session", "tags"] as const;
export type CsvField = typeof CSV_FIELDS[number];
export type CsvMapping = Record<CsvField, string>;
export type CsvPreview = { headers: string[]; rows: Record<string, string>[]; mapping: CsvMapping };
const aliases: Record<CsvField, string[]> = {
  symbol: ["symbol", "asset", "instrument", "ticker"], tradeDate: ["tradedate", "date", "closedate", "exitdate"],
  pnl: ["pnl", "netpnl", "netprofit", "profitloss", "profit"], market: ["market", "assetclass"], side: ["side", "direction", "type"],
  setup: ["setup", "strategy"], mood: ["mood", "feeling"], notes: ["notes", "note", "comment"], account: ["account", "accountname"],
  entryPrice: ["entryprice", "entry"], exitPrice: ["exitprice", "exit"], positionSize: ["positionsize", "size", "quantity", "qty"],
  stopLoss: ["stoploss", "stop"], takeProfit: ["takeprofit", "target"], fees: ["fees", "commission"], initialRisk: ["initialrisk", "risk"],
  timeframe: ["timeframe"], session: ["session"], tags: ["tags"],
};
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
export function parseCsv(text: string): CsvPreview {
  if (text.length > 3_000_000) throw new Error("CSV files must be under 3 MB.");
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (header) => header.trim() });
  if (result.errors.length) throw new Error(`Could not read CSV: ${result.errors[0].message}`);
  const headers = result.meta.fields ?? [];
  if (!headers.length || new Set(headers).size !== headers.length) throw new Error("The CSV needs unique column headings.");
  if (result.data.length > 5000) throw new Error("Import at most 5,000 trades at a time.");
  const mapping = Object.fromEntries(CSV_FIELDS.map((field) => [field, headers.find((header) => aliases[field].includes(normalized(header))) ?? ""])) as CsvMapping;
  return { headers, rows: result.data, mapping };
}
export function csvRowsToTrades(preview: CsvPreview, mapping: CsvMapping, accounts: TradingAccount[], defaultAccountId: string, currentTrades: Trade[]) {
  if (!mapping.symbol || !mapping.tradeDate || !mapping.pnl) throw new Error("Map the symbol, date, and net P&L columns before importing.");
  const taken = new Set(currentTrades.map(tradeFingerprint));
  let nextId = Math.max(0, ...currentTrades.map((trade) => trade.id));
  const rows: { row: number; trade?: Trade; error?: string; duplicate?: boolean }[] = preview.rows.map((row, index) => {
    try {
      const value = (key: CsvField) => mapping[key] ? String(row[mapping[key]] ?? "").trim() : "";
      const sideText = value("side").toLowerCase();
      const side = ["short", "sell", "s"].includes(sideText) ? "Short" : ["", "long", "buy", "b"].includes(sideText) ? "Long" : value("side");
      const marketText = value("market");
      const market = MARKETS.find((item) => item.toLowerCase() === marketText.toLowerCase()) ?? (marketText || "Forex");
      const accountText = value("account");
      const accountId = accountText ? accounts.find((account) => account.name.toLowerCase() === accountText.toLowerCase() || account.id === accountText)?.id : defaultAccountId;
      if (!accountId) throw new Error(`Account “${accountText}” does not exist.`);
      const parsed = parseTradeInput({
        symbol: value("symbol"), tradeDate: value("tradeDate"), pnl: value("pnl").replace(/[$,]/g, ""), market, side,
        setup: value("setup"), mood: value("mood") || "Calm", notes: value("notes"), accountId,
        entryPrice: value("entryPrice"), exitPrice: value("exitPrice"), positionSize: value("positionSize"), stopLoss: value("stopLoss"),
        takeProfit: value("takeProfit"), fees: value("fees"), initialRisk: value("initialRisk"), timeframe: value("timeframe"), session: value("session"),
        tags: value("tags").split(/[|,]/).map((tag) => tag.trim()).filter(Boolean),
      });
      const trade: Trade = { ...parsed, id: ++nextId, isDemo: false };
      const fingerprint = tradeFingerprint(trade);
      const duplicate = taken.has(fingerprint); taken.add(fingerprint);
      return { row: index + 2, trade, duplicate };
    } catch (error) { return { row: index + 2, error: error instanceof Error ? error.message : "Invalid row." }; }
  });
  return rows;
}
export function tradeFingerprint(trade: Trade) {
  return [trade.symbol.toUpperCase(), trade.tradeDate, Number(trade.pnl).toFixed(2), trade.side, trade.accountId ?? "main"].join("|");
}
export function exportTradesCsv(trades: Trade[], accounts: TradingAccount[]) {
  // Numbers stay numbers, while Papa prefixes formula-like text to prevent spreadsheet injection.
  return Papa.unparse(trades.map((trade) => ({
    symbol: trade.symbol, tradeDate: trade.tradeDate, pnl: Number(trade.pnl), market: trade.market, side: trade.side,
    setup: trade.setup, mood: trade.mood, notes: trade.notes, account: accounts.find((item) => item.id === (trade.accountId ?? "main"))?.name ?? "Main account",
    entryPrice: trade.entryPrice ?? "", exitPrice: trade.exitPrice ?? "", positionSize: trade.positionSize ?? "", stopLoss: trade.stopLoss ?? "",
    takeProfit: trade.takeProfit ?? "", fees: trade.fees ?? "", initialRisk: trade.initialRisk ?? "", timeframe: trade.timeframe ?? "", session: trade.session ?? "", tags: (trade.tags ?? []).join("|"),
  })), { escapeFormulae: true });
}
