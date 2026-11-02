import Papa from "papaparse";
import {
  MARKETS,
  MOODS,
  type AppLocale,
  type RuleSnapshot,
  type Trade,
  type TradingAccount,
} from "@/lib/types";
import { isDate } from "@/lib/journal-data";
import { getStats, tradeRMultiple } from "@/lib/format";
import { maxRealizedDrawdown } from "@/lib/analytics";
import { parseTradeInput } from "@/lib/trade-validation";
import { parseXlsxBuffer } from "@/lib/xlsx-report";

export const CSV_FIELDS = [
  "symbol",
  "tradeDate",
  "pnl",
  "market",
  "side",
  "setup",
  "session",
  "timeframe",
  "initialRisk",
  "followedPlan",
  "checklist",
  "mood",
  "tags",
  "notes",
  "account",
  "entryPrice",
  "exitPrice",
  "positionSize",
  "stopLoss",
  "takeProfit",
  "fees",
] as const;

export type CsvField = (typeof CSV_FIELDS)[number];
export type CsvMapping = Record<CsvField, string>;
export type CsvPreview = {
  headers: string[];
  rows: Record<string, string>[];
  rowNumbers?: number[];
  mapping: CsvMapping;
};

const aliases: Record<CsvField, string[]> = {
  symbol: ["symbol", "asset", "instrument", "ticker", "pair", "simbol", "aset", "simbolaset"],
  tradeDate: ["tradedate", "date", "closedate", "exitdate", "tanggaltrade", "tanggal"],
  pnl: [
    "pnl",
    "pl",
    "netpnl",
    "netpl",
    "netpnlusd",
    "netplusd",
    "netprofit",
    "profitloss",
    "profit",
    "pnlbersih",
    "plbersih",
    "pnlbersihusd",
    "plbersihusd",
  ],
  market: ["market", "assetclass", "pasar", "instrumen"],
  side: ["side", "direction", "type", "arah", "posisi"],
  setup: ["setup", "strategy", "strategi"],
  session: ["session", "sesi", "tradingsession"],
  timeframe: ["timeframe", "tf", "jangkawaktu"],
  initialRisk: ["initialrisk", "initialriskusd", "risk", "risikoawal", "risikoawalusd"],
  followedPlan: ["followedplan", "planadherence", "ikutiplan", "ikutirencana", "disiplinrencana"],
  checklist: ["checklist", "checklistitems", "daftarperiksa"],
  mood: ["mood", "feeling", "suasanahati", "emosi"],
  tags: ["tags", "tag", "label"],
  notes: ["notes", "note", "comment", "catatan", "komentar"],
  account: ["account", "accountname", "tradingaccount", "akun", "namaakun"],
  entryPrice: ["entryprice", "entry", "hargamasuk"],
  exitPrice: ["exitprice", "exit", "hargakeluar"],
  positionSize: ["positionsize", "size", "quantity", "qty", "lots", "ukuranposisi", "lot"],
  stopLoss: ["stoploss", "stop", "sl"],
  takeProfit: ["takeprofit", "target", "tp"],
  fees: ["fees", "feesusd", "commission", "biaya", "biayausd", "komisi"],
};

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/p\s*&\s*l/g, "pnl")
    .replace(/[^a-z0-9]/g, "");

export function serializeChecklist(checklist?: RuleSnapshot[]): string {
  if (!checklist?.length) return "";
  return checklist
    .map((item) => `[${item.checked ? "x" : " "}] ${item.text.replace(/\|/g, "/").trim()}`)
    .join(" | ");
}

export function parseChecklistText(raw: string): RuleSnapshot[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\s*\|\s*/)
    .map((part, idx) => {
      const m = part.match(/^\[(x|X|✓|v|\s)?\]\s*(.+)$/);
      if (!m) return null;
      const text = m[2].trim();
      if (!text) return null;
      return {
        id: `csv-rule-${idx + 1}`,
        text: text.slice(0, 140),
        checked: Boolean(m[1] && m[1].trim().length > 0),
      };
    })
    .filter((item): item is RuleSnapshot => item !== null);
}

function parseFollowedPlanValue(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (!v || v === "—" || v === "-" || v === "unrated") return undefined;
  if (["yes", "true", "1", "y", "ya", "patuh", "followed"].includes(v)) return true;
  if (["no", "false", "0", "n", "tidak", "langgar", "broken"].includes(v)) return false;
  return undefined;
}

function cleanNumericString(raw: string, allowNegative = false): string {
  let s = raw.trim();
  if (!s || s === "—" || s === "-") return "";
  let isAccountingNeg = false;
  if (/^\(.*\)$/.test(s)) {
    isAccountingNeg = true;
    s = s.slice(1, -1).trim();
  }
  // Normalize unicode minus '−' and en-dash '–'
  s = s.replace(/[−–]/g, "-").replace(/[$€£¥\s]/g, "");
  // Handle thousand separators vs decimal commas:
  // If both ',' and '.' appear, whichever comes last is the decimal separator
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    // Single comma with 1-2 digits after it (e.g. Indonesian Excel "125,50") vs thousands "1,250"
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  }
  if (isAccountingNeg && !s.startsWith("-")) s = `-${s}`;
  if (!allowNegative && s.startsWith("+")) s = s.slice(1);
  if (allowNegative && s.startsWith("+")) s = s.slice(1);
  return s;
}

function normalizeImportedDate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (isDate(s)) return s;

  // YYYY/MM/DD or YYYY.MM.DD
  const ymd = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (ymd) {
    const candidate = `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    if (isDate(candidate)) return candidate;
  }

  // Excel serial date integer (e.g. 45000..55000)
  if (/^\d{5}$/.test(s)) {
    const serial = Number(s);
    if (serial >= 30000 && serial <= 70000) {
      const utcMs = Math.round((serial - 25569) * 86_400_000);
      const iso = new Date(utcMs).toISOString().slice(0, 10);
      if (isDate(iso)) return iso;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (when first part > 12 or year at end)
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const yyyy = dmy[3];
    // Prefer DD/MM/YYYY if valid, fallback MM/DD/YYYY if b > 12
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) {
      const candidate = `${yyyy}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
      if (isDate(candidate)) return candidate;
    }
    if (b >= 1 && b <= 31 && a >= 1 && a <= 12) {
      const candidate = `${yyyy}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
      if (isDate(candidate)) return candidate;
    }
  }

  return s;
}

function resolveMarket(raw: string): string {
  const v = raw.trim();
  if (!v) return "Forex";
  const lower = v.toLowerCase();
  const idMap: Record<string, (typeof MARKETS)[number]> = {
    saham: "Stocks",
    kripto: "Crypto",
    komoditas: "Commodities",
    berjangka: "Futures",
    valas: "Forex",
  };
  if (idMap[lower]) return idMap[lower];
  return MARKETS.find((item) => item.toLowerCase() === lower) ?? v;
}

function resolveMood(raw: string): string {
  const v = raw.trim();
  if (!v) return "Calm";
  const lower = v.toLowerCase();
  const idMap: Record<string, (typeof MOODS)[number]> = {
    tenang: "Calm",
    fokus: "Focused",
    cemas: "Anxious",
    lelah: "Tired",
  };
  if (idMap[lower]) return idMap[lower];
  return MOODS.find((item) => item.toLowerCase() === lower) ?? v;
}

function slugAccountId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `acc-${base || "imported"}`;
}

function findHeaderRowIndex(matrix: string[][]): number {
  const limit = Math.min(matrix.length, 30);
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < limit; i++) {
    const rawCells = matrix[i].map((c) => String(c ?? "").trim());
    let lastNonEmpty = rawCells.length - 1;
    while (lastNonEmpty >= 0 && rawCells[lastNonEmpty] === "") lastNonEmpty--;
    if (lastNonEmpty < 1) continue;
    const trimmed = rawCells.slice(0, lastNonEmpty + 1);
    // Real header rows do not contain blank interior cells or pure numeric KPI values
    if (trimmed.some((c) => !c || /^-?\d+(\.\d+)?$/.test(c))) continue;
    if (new Set(trimmed).size !== trimmed.length) continue;

    const normSet = new Set(trimmed.map(normalized));
    let matchedFields = 0;
    for (const field of CSV_FIELDS) {
      if (aliases[field].some((alias) => normSet.has(alias))) matchedFields++;
    }
    const hasCore =
      aliases.symbol.some((a) => normSet.has(a)) &&
      aliases.tradeDate.some((a) => normSet.has(a)) &&
      aliases.pnl.some((a) => normSet.has(a));
    const score = matchedFields + (hasCore ? 100 : 0);
    if (score > bestScore && matchedFields >= 2) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0) return bestIdx;

  // Fallback to first non-empty row so error validation stays predictable
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i].some((c) => String(c ?? "").trim() !== "")) return i;
  }
  return 0;
}

function isSummaryOrFooterRow(rowCells: string[], headerRow: string[]): boolean {
  const nonEmpty = rowCells.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (nonEmpty.length === 0) return true;
  const firstCell = String(rowCells[0] ?? "").trim().toUpperCase();
  if (firstCell === "TOTAL" || firstCell === "SUMMARY" || firstCell === "RINGKASAN") {
    // Check that Symbol cell isn't a real ticker with Trade # = TOTAL (Trade # col is index 0 in report exports)
    const firstHeader = normalized(headerRow[0] ?? "");
    if (["trade", "no", "tradeno", "tradenumber"].includes(firstHeader) || rowCells.length > 5) {
      return true;
    }
  }
  return false;
}

export function parseSpreadsheetMatrix(matrix: string[][]): CsvPreview {
  if (!matrix.length) throw new Error("The CSV needs unique column headings.");
  const headerIdx = findHeaderRowIndex(matrix);
  const rawHeaderRow = matrix[headerIdx] ?? [];

  // Trim trailing empty header columns from wide report sheets
  let lastNonEmpty = rawHeaderRow.length - 1;
  while (lastNonEmpty >= 0 && String(rawHeaderRow[lastNonEmpty] ?? "").trim() === "") {
    lastNonEmpty--;
  }
  const headers = rawHeaderRow.slice(0, lastNonEmpty + 1).map((h) => String(h ?? "").trim());
  if (!headers.length || headers.some((h) => !h) || new Set(headers).size !== headers.length) {
    throw new Error("The CSV needs unique column headings.");
  }

  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    if (isSummaryOrFooterRow(line, headers)) continue;
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = String(line[c] ?? "");
    }
    rows.push(record);
    rowNumbers.push(r + 1);
  }

  if (rows.length > 5000) throw new Error("Import at most 5,000 trades at a time.");

  const mapping = Object.fromEntries(
    CSV_FIELDS.map((field) => [
      field,
      headers.find((header) => aliases[field].includes(normalized(header))) ?? "",
    ]),
  ) as CsvMapping;

  return { headers, rows, rowNumbers, mapping };
}

export function parseCsv(text: string): CsvPreview {
  if (text.length > 3_000_000) throw new Error("CSV files must be under 3 MB.");
  // Strip UTF-8 BOM and optional Excel 'sep=,' / 'sep=;' directive line
  let cleaned = text.replace(/^\uFEFF/, "");
  let lineOffset = 0;
  const sepMatch = cleaned.match(/^sep=[,;\t]\r?\n/i);
  if (sepMatch) {
    cleaned = cleaned.slice(sepMatch[0].length);
    lineOffset = 1;
  }

  const result = Papa.parse<string[]>(cleaned, {
    header: false,
    skipEmptyLines: false,
    delimitersToGuess: [",", ";", "\t"],
  });
  const fatalError = result.errors.find((err) => err.type === "Quotes");
  if (fatalError) throw new Error(`Could not read CSV: ${fatalError.message}`);

  const matrix = result.data;
  const preview = parseSpreadsheetMatrix(matrix);
  if (lineOffset > 0 && preview.rowNumbers) {
    preview.rowNumbers = preview.rowNumbers.map((n) => n + lineOffset);
  }
  return preview;
}

export async function parseImportFile(file: File): Promise<CsvPreview> {
  const isXlsx =
    /\.xlsx$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (isXlsx) {
    if (file.size > 5_000_000) throw new Error("Excel files must be under 5 MB.");
    const matrix = await parseXlsxBuffer(await file.arrayBuffer());
    return parseSpreadsheetMatrix(matrix);
  }
  if (file.size > 3_000_000) throw new Error("CSV files must be under 3 MB.");
  return parseCsv(await file.text());
}

export type ParsedImportRow = {
  row: number;
  trade?: Trade;
  error?: string;
  duplicate?: boolean;
  newAccount?: TradingAccount;
};

export function csvRowsToTrades(
  preview: CsvPreview,
  mapping: CsvMapping,
  accounts: TradingAccount[],
  defaultAccountId: string,
  currentTrades: Trade[],
): ParsedImportRow[] {
  if (!mapping.symbol || !mapping.tradeDate || !mapping.pnl) {
    throw new Error("Map the symbol, date, and net P&L columns before importing.");
  }
  const taken = new Set(currentTrades.map(tradeFingerprint));
  let nextId = Math.max(0, ...currentTrades.map((trade) => trade.id));
  const pendingAccounts = new Map<string, TradingAccount>();

  return preview.rows.map((row, index) => {
    const spreadsheetRow = preview.rowNumbers?.[index] ?? index + 2;
    try {
      const value = (key: CsvField) => (mapping[key] ? String(row[mapping[key]] ?? "").trim() : "");

      const sideText = value("side").toLowerCase();
      const side = ["short", "sell", "s", "jual"].includes(sideText)
        ? "Short"
        : ["", "long", "buy", "b", "beli"].includes(sideText)
          ? "Long"
          : value("side");

      const market = resolveMarket(value("market"));
      const mood = resolveMood(value("mood"));

      const accountText = value("account");
      let accountId = defaultAccountId;
      let newAccount: TradingAccount | undefined;

      if (accountText) {
        const lowerAcc = accountText.toLowerCase();
        const isDefaultAlias = lowerAcc === "main account" || lowerAcc === "akun utama" || lowerAcc === "main";
        const existing = isDefaultAlias
          ? accounts.find((a) => a.id === "main") ?? accounts[0]
          : accounts.find((account) => account.name.toLowerCase() === lowerAcc || account.id === accountText);

        if (existing) {
          accountId = existing.id;
        } else {
          const created = pendingAccounts.get(lowerAcc) ?? {
            id: slugAccountId(accountText),
            name: accountText.slice(0, 40),
            startingBalance: null,
          };
          pendingAccounts.set(lowerAcc, created);
          accountId = created.id;
          newAccount = created;
        }
      }

      const followedPlan = parseFollowedPlanValue(value("followedPlan"));
      const checklist = parseChecklistText(value("checklist"));
      const rawNotes = value("notes").replace(/^'([=+\-@])/, "$1");

      const parsed = parseTradeInput({
        symbol: value("symbol"),
        tradeDate: normalizeImportedDate(value("tradeDate")),
        pnl: cleanNumericString(value("pnl"), true),
        market,
        side,
        setup: value("setup"),
        mood,
        notes: rawNotes,
        accountId,
        entryPrice: cleanNumericString(value("entryPrice")),
        exitPrice: cleanNumericString(value("exitPrice")),
        positionSize: cleanNumericString(value("positionSize")),
        stopLoss: cleanNumericString(value("stopLoss")),
        takeProfit: cleanNumericString(value("takeProfit")),
        fees: cleanNumericString(value("fees")),
        initialRisk: cleanNumericString(value("initialRisk")),
        timeframe: value("timeframe"),
        session: value("session"),
        tags: value("tags")
          .split(/\s*[|,]\s*/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        ...(followedPlan !== undefined ? { followedPlan } : {}),
        checklist,
      });

      const trade: Trade = { ...parsed, id: ++nextId, isDemo: false };
      const fingerprint = tradeFingerprint(trade);
      const duplicate = taken.has(fingerprint);
      taken.add(fingerprint);
      return { row: spreadsheetRow, trade, duplicate, ...(newAccount ? { newAccount } : {}) };
    } catch (error) {
      return { row: spreadsheetRow, error: error instanceof Error ? error.message : "Invalid row." };
    }
  });
}

export function collectNewAccountsFromRows(
  rows: ParsedImportRow[],
  existingAccounts: TradingAccount[],
): TradingAccount[] {
  const existingIds = new Set(existingAccounts.map((a) => a.id));
  const existingNames = new Set(existingAccounts.map((a) => a.name.toLowerCase()));
  const added: TradingAccount[] = [];
  for (const row of rows) {
    if (!row.newAccount) continue;
    const lower = row.newAccount.name.toLowerCase();
    if (existingIds.has(row.newAccount.id) || existingNames.has(lower)) continue;
    existingIds.add(row.newAccount.id);
    existingNames.add(lower);
    added.push(row.newAccount);
  }
  return added;
}

export function tradeFingerprint(trade: Trade) {
  return [
    trade.symbol.toUpperCase(),
    trade.tradeDate,
    Number(trade.pnl).toFixed(2),
    trade.side,
    trade.accountId ?? "main",
  ].join("|");
}

export function exportTradesCsv(
  trades: Trade[],
  accounts: TradingAccount[],
  locale: AppLocale = "en",
): string {
  const isId = locale === "id";
  const sorted = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id);
  const stats = getStats(sorted);
  const maxDd = maxRealizedDrawdown(sorted);
  const grossWins = sorted.filter((t) => Number(t.pnl) > 0).reduce((s, t) => s + Number(t.pnl), 0);
  const grossLosses = sorted.filter((t) => Number(t.pnl) < 0).reduce((s, t) => s + Number(t.pnl), 0);
  const today = new Date().toISOString().slice(0, 10);
  const dateRange = sorted.length
    ? `${sorted[0].tradeDate} -> ${sorted[sorted.length - 1].tradeDate}`
    : "-";

  const headers = isId
    ? [
        "No",
        "Tanggal Trade",
        "Akun",
        "Simbol",
        "Pasar",
        "Arah",
        "Setup",
        "Sesi",
        "Timeframe",
        "Harga Masuk",
        "Harga Keluar",
        "Stop Loss",
        "Take Profit",
        "Ukuran Posisi",
        "Risiko Awal (USD)",
        "Biaya (USD)",
        "P&L Bersih (USD)",
        "Hasil",
        "R-Multiple",
        "P&L Kumulatif (USD)",
        "Ikuti Rencana",
        "Skor Checklist",
        "Checklist",
        "Mood",
        "Tag",
        "Catatan",
      ]
    : [
        "Trade #",
        "Trade Date",
        "Account",
        "Symbol",
        "Market",
        "Direction",
        "Setup",
        "Session",
        "Timeframe",
        "Entry Price",
        "Exit Price",
        "Stop Loss",
        "Take Profit",
        "Position Size",
        "Initial Risk (USD)",
        "Fees (USD)",
        "Net P&L (USD)",
        "Result",
        "R-Multiple",
        "Cumulative P&L (USD)",
        "Followed Plan",
        "Checklist Score",
        "Checklist",
        "Mood",
        "Tags",
        "Notes",
      ];

  const padRow = (cells: (string | number)[]) => {
    const out = [...cells];
    while (out.length < headers.length) out.push("");
    return out;
  };

  const matrix: (string | number)[][] = [
    padRow([
      isId
        ? "BLOOM TRADING JOURNAL — LAPORAN PERFORMA TRADING"
        : "BLOOM TRADING JOURNAL — TRADING PERFORMANCE REPORT",
    ]),
    padRow([
      isId ? "Tanggal Cetak" : "Generated Date",
      today,
      isId ? "Periode Data" : "Date Range",
      dateRange,
    ]),
    padRow([
      isId ? "Total Trade" : "Total Trades",
      sorted.length,
      isId ? "Rasio Menang" : "Win Rate",
      stats.winRate === null ? "—" : `${stats.winRate}%`,
      "Profit Factor",
      stats.profitFactor,
      isId ? "Rata-rata R" : "Average R",
      stats.avgR !== null ? `${stats.avgR >= 0 ? "+" : ""}${stats.avgR.toFixed(2)}R` : "—",
    ]),
    padRow([
      isId ? "Profit Kotor (USD)" : "Gross Profit (USD)",
      Number(grossWins.toFixed(2)),
      isId ? "Rugi Kotor (USD)" : "Gross Loss (USD)",
      Number(grossLosses.toFixed(2)),
      isId ? "P&L Bersih (USD)" : "Net P&L (USD)",
      Number(stats.net.toFixed(2)),
      isId ? "Drawdown Realisasi (USD)" : "Max Drawdown (USD)",
      Number(maxDd.toFixed(2)),
    ]),
    padRow([
      isId ? "Menang / Rugi / Impas" : "Wins / Losses / Breakeven",
      `${stats.wins}W / ${stats.losses}L / ${stats.breakeven}BE`,
      isId ? "Rata-rata Menang (USD)" : "Average Win (USD)",
      stats.avgWin === null ? "—" : Number(stats.avgWin.toFixed(2)),
      isId ? "Rata-rata Rugi (USD)" : "Average Loss (USD)",
      stats.avgLoss === null ? "—" : Number((-Math.abs(stats.avgLoss)).toFixed(2)),
      "Expectancy (USD)",
      stats.expectancy === null ? "—" : Number(stats.expectancy.toFixed(2)),
    ]),
    padRow([]),
    headers,
  ];

  let runningPnl = 0;
  let totalRisk = 0;
  let totalFees = 0;

  const optNum = (raw?: string): string | number => {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) return "";
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  };

  sorted.forEach((trade, index) => {
    const pnl = Number(trade.pnl);
    runningPnl += pnl;
    const riskVal = trade.initialRisk ? Number(trade.initialRisk) : NaN;
    if (Number.isFinite(riskVal) && riskVal > 0) totalRisk += riskVal;
    const feeVal = trade.fees ? Number(trade.fees) : NaN;
    if (Number.isFinite(feeVal) && feeVal > 0) totalFees += feeVal;

    const rMult = tradeRMultiple(trade);
    const accountName = accounts.find((item) => item.id === (trade.accountId ?? "main"))?.name ?? "Main account";
    const resultLabel = pnl > 0 ? (isId ? "Untung" : "Win") : pnl < 0 ? (isId ? "Rugi" : "Loss") : (isId ? "Impas" : "Breakeven");
    const planText =
      trade.followedPlan === true
        ? isId ? "Ya" : "Yes"
        : trade.followedPlan === false
          ? isId ? "Tidak" : "No"
          : "";
    const checklistArr = trade.checklist ?? [];
    const checklistScore = checklistArr.length
      ? `${checklistArr.filter((c) => c.checked).length}/${checklistArr.length}`
      : "";

    matrix.push([
      index + 1,
      trade.tradeDate,
      accountName,
      trade.symbol,
      trade.market,
      trade.side,
      trade.setup,
      trade.session ?? "",
      trade.timeframe ?? "",
      optNum(trade.entryPrice),
      optNum(trade.exitPrice),
      optNum(trade.stopLoss),
      optNum(trade.takeProfit),
      optNum(trade.positionSize),
      optNum(trade.initialRisk),
      optNum(trade.fees),
      Number(pnl.toFixed(2)),
      resultLabel,
      rMult !== null ? Number(rMult.toFixed(2)) : "",
      Number(runningPnl.toFixed(2)),
      planText,
      checklistScore,
      serializeChecklist(checklistArr),
      trade.mood,
      (trade.tags ?? []).join(" | "),
      trade.notes,
    ]);
  });

  if (sorted.length > 0) {
    const footer: (string | number)[] = Array.from({ length: headers.length }, () => "");
    footer[0] = "TOTAL";
    footer[1] = isId ? `${sorted.length} trade` : `${sorted.length} trades`;
    footer[14] = Number(totalRisk.toFixed(2));
    footer[15] = Number(totalFees.toFixed(2));
    footer[16] = Number(stats.net.toFixed(2));
    footer[17] = stats.winRate === null ? "—" : `${stats.winRate}% WR`;
    footer[19] = Number(runningPnl.toFixed(2));
    matrix.push(footer);
  }

  // Numbers stay numbers, while Papa prefixes formula-like text to prevent spreadsheet injection.
  // Prepend UTF-8 BOM so Microsoft Excel opens UTF-8 characters cleanly.
  return `\uFEFF${Papa.unparse(matrix, { escapeFormulae: true, newline: "\r\n" })}`;
}
