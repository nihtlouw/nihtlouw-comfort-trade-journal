import type { AppLocale, Trade, TradingAccount } from "@/lib/types";
import { getStats, tradeRMultiple } from "@/lib/format";
import { groupTrades, maxRealizedDrawdown, type TradeGroupRow } from "@/lib/analytics";
import { serializeChecklist } from "@/lib/csv";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Strip control chars invalid in XML 1.0 except tab/LF/CR
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function sanitizeSpreadsheetText(value: string): string {
  if (!value) return "";
  // Prevent spreadsheet formula injection when opened in Excel
  if (/^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function colIndexToLetters(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i);
    if (code >= 65 && code <= 90) idx = idx * 26 + (code - 64);
    else if (code >= 97 && code <= 122) idx = idx * 26 + (code - 96);
  }
  return Math.max(0, idx - 1);
}

type CellSpec =
  | { kind: "empty"; style?: number }
  | { kind: "str"; value: string; style?: number; rawSafe?: boolean }
  | { kind: "num"; value: number; style?: number };

// Style indices in xl/styles.xml:
// 0 = default
// 1 = report title (14pt bold white on botanical dark green #2E5339)
// 2 = report subtitle / meta label (bold muted)
// 3 = KPI label (bold on soft sage #EDF5EE, thin border)
// 4 = KPI value text/count (bold on #FFFFFF, thin border)
// 5 = KPI currency USD ($#,##0.00;[Red]-$#,##0.00;"$0.00", bold, thin border)
// 6 = table header (bold white on #2E5339, centered/left, border)
// 7 = data text cell (thin border)
// 8 = data centered text cell (thin border, centered)
// 9 = data number generic (0.00####, thin border)
// 10 = data USD currency ($#,##0.00;[Red]-$#,##0.00;"$0.00", thin border)
// 11 = data R-multiple (+0.00"R";-0.00"R";0.00"R", thin border)
// 12 = Win pill (bold green text #245A36 on #E7F4E8, centered, thin border)
// 13 = Loss pill (bold terracotta #8F3B2B on #FBEBE7, centered, thin border)
// 14 = Breakeven pill (bold #6E6545 on #F7F3E6, centered, thin border)
// 15 = Total footer label (bold on #EDF5EE, top+bottom border)
// 16 = Total footer USD (bold $#,##0.00;[Red]-$#,##0.00;"$0.00" on #EDF5EE, top+bottom border)
// 17 = Section subheader (11pt bold #2E5339)

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="$#,##0.00;[Red]-$#,##0.00;&quot;$0.00&quot;"/>
    <numFmt numFmtId="165" formatCode="+0.00&quot;R&quot;;-0.00&quot;R&quot;;0.00&quot;R&quot;"/>
    <numFmt numFmtId="166" formatCode="0.00####"/>
  </numFmts>
  <fonts count="7">
    <font><sz val="10"/><color rgb="FF1F2922"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF2E5339"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF245A36"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF8F3B2B"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF6E6545"/><name val="Calibri"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2E5339"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEDF5EE"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE7F4E8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFBEBE7"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7F3E6"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD8E2D9"/></left>
      <right style="thin"><color rgb="FFD8E2D9"/></right>
      <top style="thin"><color rgb="FFD8E2D9"/></top>
      <bottom style="thin"><color rgb="FFD8E2D9"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFB7CBB9"/></left>
      <right style="thin"><color rgb="FFB7CBB9"/></right>
      <top style="medium"><color rgb="FF2E5339"/></top>
      <bottom style="double"><color rgb="FF2E5339"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="18">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;
}

function buildWorksheetXml(
  rows: { cells: CellSpec[]; height?: number }[],
  colWidths: number[],
  freezeRow?: number,
): string {
  const colsXml = colWidths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const sheetViewXml = freezeRow
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;

  const rowsXml = rows
    .map((row, rIdx) => {
      const rNum = rIdx + 1;
      const htAttr = row.height ? ` ht="${row.height}" customHeight="1"` : "";
      const cellsXml = row.cells
        .map((cell, cIdx) => {
          const ref = `${colIndexToLetters(cIdx)}${rNum}`;
          const sAttr = cell.style !== undefined ? ` s="${cell.style}"` : "";
          if (cell.kind === "empty") {
            return cell.style !== undefined ? `<c r="${ref}"${sAttr}/>` : "";
          }
          if (cell.kind === "num" && Number.isFinite(cell.value)) {
            return `<c r="${ref}"${sAttr}><v>${cell.value}</v></c>`;
          }
          const text = cell.kind === "str"
            ? (cell.rawSafe ? cell.value : sanitizeSpreadsheetText(cell.value))
            : "";
          return `<c r="${ref}" t="inlineStr"${sAttr}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
        })
        .filter(Boolean)
        .join("");
      return `<row r="${rNum}"${htAttr}>${cellsXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${sheetViewXml}
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

// Pure CRC-32 & uncompressed PKZIP builder (0 external dependencies)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // STORE (0)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x2100, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(file.data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x2100, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

export function exportTradesXlsx(
  trades: Trade[],
  accounts: TradingAccount[],
  locale: AppLocale = "en",
): Uint8Array {
  const isId = locale === "id";
  const sorted = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id);
  const stats = getStats(sorted);
  const maxDd = maxRealizedDrawdown(sorted);
  const grossWins = sorted.filter((t) => Number(t.pnl) > 0).reduce((s, t) => s + Number(t.pnl), 0);
  const grossLosses = sorted.filter((t) => Number(t.pnl) < 0).reduce((s, t) => s + Number(t.pnl), 0);
  const today = new Date().toISOString().slice(0, 10);

  // Sheet 1: Executive Summary + Complete Trade Ledger
  const sheet1Rows: { cells: CellSpec[]; height?: number }[] = [];

  const titleBanner: CellSpec[] = Array.from({ length: 25 }, (_, idx) =>
    idx === 0
      ? {
          kind: "str",
          value: isId
            ? "BLOOM TRADING JOURNAL — LAPORAN PERFORMA TRADING"
            : "BLOOM TRADING JOURNAL — TRADING PERFORMANCE REPORT",
          style: 1,
          rawSafe: true,
        }
      : { kind: "empty", style: 1 },
  );
  sheet1Rows.push({ cells: titleBanner, height: 28 });

  const dateRange = sorted.length
    ? `${sorted[0].tradeDate} → ${sorted[sorted.length - 1].tradeDate}`
    : "—";
  sheet1Rows.push({
    cells: [
      { kind: "str", value: isId ? "Tanggal Cetak" : "Generated Date", style: 2, rawSafe: true },
      { kind: "str", value: today, style: 7, rawSafe: true },
      { kind: "str", value: isId ? "Periode Data" : "Date Range", style: 2, rawSafe: true },
      { kind: "str", value: dateRange, style: 7, rawSafe: true },
    ],
    height: 20,
  });

  sheet1Rows.push({
    cells: [
      { kind: "str", value: isId ? "Total Trade" : "Total Trades", style: 3, rawSafe: true },
      { kind: "num", value: sorted.length, style: 4 },
      { kind: "str", value: isId ? "Rasio Menang" : "Win Rate", style: 3, rawSafe: true },
      { kind: "str", value: stats.winRate === null ? "—" : `${stats.winRate}%`, style: 4, rawSafe: true },
      { kind: "str", value: "Profit Factor", style: 3, rawSafe: true },
      { kind: "str", value: stats.profitFactor, style: 4, rawSafe: true },
      { kind: "str", value: isId ? "Rata-rata R" : "Average R", style: 3, rawSafe: true },
      stats.avgR !== null
        ? { kind: "num", value: Number(stats.avgR.toFixed(2)), style: 11 }
        : { kind: "str", value: "—", style: 4, rawSafe: true },
    ],
    height: 21,
  });

  sheet1Rows.push({
    cells: [
      { kind: "str", value: isId ? "Profit Kotor" : "Gross Profit", style: 3, rawSafe: true },
      { kind: "num", value: Number(grossWins.toFixed(2)), style: 5 },
      { kind: "str", value: isId ? "Rugi Kotor" : "Gross Loss", style: 3, rawSafe: true },
      { kind: "num", value: Number(grossLosses.toFixed(2)), style: 5 },
      { kind: "str", value: isId ? "P&L Bersih (USD)" : "Net P&L (USD)", style: 3, rawSafe: true },
      { kind: "num", value: Number(stats.net.toFixed(2)), style: 5 },
      { kind: "str", value: isId ? "Drawdown Realisasi" : "Max Drawdown", style: 3, rawSafe: true },
      { kind: "num", value: Number(maxDd.toFixed(2)), style: 5 },
    ],
    height: 21,
  });

  sheet1Rows.push({
    cells: [
      { kind: "str", value: isId ? "Menang / Rugi / Impas" : "Wins / Losses / Breakeven", style: 3, rawSafe: true },
      { kind: "str", value: `${stats.wins}W / ${stats.losses}L / ${stats.breakeven}BE`, style: 4, rawSafe: true },
      { kind: "str", value: isId ? "Rata-rata Menang" : "Average Win", style: 3, rawSafe: true },
      stats.avgWin === null ? { kind: "str", value: "—", style: 4, rawSafe: true } : { kind: "num", value: Number(stats.avgWin.toFixed(2)), style: 5 },
      { kind: "str", value: isId ? "Rata-rata Rugi" : "Average Loss", style: 3, rawSafe: true },
      stats.avgLoss === null ? { kind: "str", value: "—", style: 4, rawSafe: true } : { kind: "num", value: Number((-Math.abs(stats.avgLoss)).toFixed(2)), style: 5 },
      { kind: "str", value: "Expectancy", style: 3, rawSafe: true },
      stats.expectancy === null ? { kind: "str", value: "—", style: 4, rawSafe: true } : { kind: "num", value: Number(stats.expectancy.toFixed(2)), style: 5 },
    ],
    height: 21,
  });

  // Blank spacer row (row 6)
  sheet1Rows.push({ cells: [], height: 10 });

  // Table Headers (row 7 — frozen!)
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

  sheet1Rows.push({
    cells: headers.map((h) => ({ kind: "str" as const, value: h, style: 6, rawSafe: true })),
    height: 24,
  });

  const optNumCell = (raw: string | undefined, style: number): CellSpec => {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) return { kind: "empty", style: 7 };
    const n = Number(trimmed);
    return Number.isFinite(n) ? { kind: "num", value: n, style } : { kind: "str", value: trimmed, style: 7 };
  };

  let runningPnl = 0;
  let totalRisk = 0;
  let totalFees = 0;

  sorted.forEach((trade, index) => {
    const pnl = Number(trade.pnl);
    runningPnl += pnl;
    const riskVal = trade.initialRisk ? Number(trade.initialRisk) : NaN;
    if (Number.isFinite(riskVal) && riskVal > 0) totalRisk += riskVal;
    const feeVal = trade.fees ? Number(trade.fees) : NaN;
    if (Number.isFinite(feeVal) && feeVal > 0) totalFees += feeVal;

    const rMult = tradeRMultiple(trade);
    const accountName = accounts.find((a) => a.id === (trade.accountId ?? "main"))?.name ?? "Main account";
    const resultLabel = pnl > 0 ? (isId ? "Untung" : "Win") : pnl < 0 ? (isId ? "Rugi" : "Loss") : (isId ? "Impas" : "Breakeven");
    const resultStyle = pnl > 0 ? 12 : pnl < 0 ? 13 : 14;
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

    sheet1Rows.push({
      cells: [
        { kind: "num", value: index + 1, style: 8 },
        { kind: "str", value: trade.tradeDate, style: 8, rawSafe: true },
        { kind: "str", value: accountName, style: 7 },
        { kind: "str", value: trade.symbol, style: 8 },
        { kind: "str", value: trade.market, style: 7 },
        { kind: "str", value: trade.side, style: 8 },
        { kind: "str", value: trade.setup, style: 7 },
        { kind: "str", value: trade.session ?? "", style: 7 },
        { kind: "str", value: trade.timeframe ?? "", style: 8 },
        optNumCell(trade.entryPrice, 9),
        optNumCell(trade.exitPrice, 9),
        optNumCell(trade.stopLoss, 9),
        optNumCell(trade.takeProfit, 9),
        optNumCell(trade.positionSize, 9),
        optNumCell(trade.initialRisk, 10),
        optNumCell(trade.fees, 10),
        { kind: "num", value: Number(pnl.toFixed(2)), style: 10 },
        { kind: "str", value: resultLabel, style: resultStyle, rawSafe: true },
        rMult !== null ? { kind: "num", value: Number(rMult.toFixed(2)), style: 11 } : { kind: "empty", style: 7 },
        { kind: "num", value: Number(runningPnl.toFixed(2)), style: 10 },
        { kind: "str", value: planText, style: 8, rawSafe: true },
        { kind: "str", value: checklistScore, style: 8, rawSafe: true },
        { kind: "str", value: serializeChecklist(checklistArr), style: 7 },
        { kind: "str", value: trade.mood, style: 8 },
        { kind: "str", value: (trade.tags ?? []).join(" | "), style: 7 },
        { kind: "str", value: trade.notes, style: 7 },
      ],
      height: 20,
    });
  });

  // Footer Summary Row
  if (sorted.length > 0) {
    const footerCells: CellSpec[] = Array.from({ length: headers.length }, () => ({ kind: "empty" as const, style: 15 }));
    footerCells[0] = { kind: "str", value: "TOTAL", style: 15, rawSafe: true };
    footerCells[1] = {
      kind: "str",
      value: isId ? `${sorted.length} trade` : `${sorted.length} trades`,
      style: 15,
      rawSafe: true,
    };
    footerCells[14] = { kind: "num", value: Number(totalRisk.toFixed(2)), style: 16 };
    footerCells[15] = { kind: "num", value: Number(totalFees.toFixed(2)), style: 16 };
    footerCells[16] = { kind: "num", value: Number(stats.net.toFixed(2)), style: 16 };
    footerCells[17] = {
      kind: "str",
      value: stats.winRate === null ? "—" : `${stats.winRate}% WR`,
      style: 15,
      rawSafe: true,
    };
    footerCells[19] = { kind: "num", value: Number(runningPnl.toFixed(2)), style: 16 };
    sheet1Rows.push({ cells: footerCells, height: 23 });
  }

  const sheet1Widths = [
    8, 14, 18, 12, 14, 11, 24, 18, 11, 13, 13, 13, 13, 13, 16, 13, 16, 12, 12, 19, 14, 14, 34, 12, 24, 46,
  ];

  // Sheet 2: Executive Breakdown by Account, Setup, Market, Session
  const sheet2Rows: { cells: CellSpec[]; height?: number }[] = [];
  sheet2Rows.push({
    cells: [
      {
        kind: "str",
        value: isId ? "RINGKASAN PERFORMA PER KATEGORI" : "PERFORMANCE BREAKDOWN SUMMARY",
        style: 1,
        rawSafe: true,
      },
      ...Array.from({ length: 6 }, () => ({ kind: "empty" as const, style: 1 })),
    ],
    height: 26,
  });

  const appendBreakdownSection = (sectionTitle: string, groups: TradeGroupRow[]) => {
    sheet2Rows.push({ cells: [], height: 10 });
    sheet2Rows.push({ cells: [{ kind: "str", value: sectionTitle, style: 17, rawSafe: true }], height: 21 });
    sheet2Rows.push({
      cells: [
        isId ? "Kategori" : "Category",
        isId ? "Trade" : "Trades",
        isId ? "Menang" : "Wins",
        isId ? "Rugi" : "Losses",
        isId ? "Rasio Menang" : "Win Rate",
        isId ? "Rata-rata R" : "Average R",
        isId ? "P&L Bersih (USD)" : "Net P&L (USD)",
      ].map((h) => ({ kind: "str" as const, value: h, style: 6, rawSafe: true })),
      height: 22,
    });
    for (const g of groups) {
      const wr = g.wins + g.losses > 0 ? Math.round((g.wins / (g.wins + g.losses)) * 100) : null;
      sheet2Rows.push({
        cells: [
          { kind: "str", value: g.name, style: 7 },
          { kind: "num", value: g.count, style: 8 },
          { kind: "num", value: g.wins, style: 8 },
          { kind: "num", value: g.losses, style: 8 },
          { kind: "str", value: wr === null ? "—" : `${wr}%`, style: 8, rawSafe: true },
          g.avgR !== null ? { kind: "num", value: Number(g.avgR.toFixed(2)), style: 11 } : { kind: "str", value: "—", style: 8, rawSafe: true },
          { kind: "num", value: Number(g.pnl.toFixed(2)), style: 10 },
        ],
        height: 20,
      });
    }
  };

  appendBreakdownSection(
    isId ? "Per Akun Trading" : "By Trading Account",
    groupTrades(
      sorted,
      (t) => accounts.find((a) => a.id === (t.accountId ?? "main"))?.name ?? "Main account",
      "Main account",
    ),
  );
  appendBreakdownSection(
    isId ? "Per Setup" : "By Setup",
    groupTrades(sorted, (t) => t.setup, isId ? "Tanpa setup" : "No setup"),
  );
  appendBreakdownSection(
    isId ? "Per Pasar" : "By Market",
    groupTrades(sorted, (t) => t.market, isId ? "Lainnya" : "Other"),
  );
  appendBreakdownSection(
    isId ? "Per Sesi" : "By Session",
    groupTrades(sorted, (t) => t.session ?? "", isId ? "Tanpa sesi" : "No session"),
  );

  const encoder = new TextEncoder();
  const sheet1Name = isId ? "Catatan Trade" : "Trade Ledger";
  const sheet2Name = isId ? "Ringkasan Performa" : "Summary Breakdown";

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/workbook" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheet1Name)}" sheetId="1" r:id="rId1"/>
    <sheet name="${escapeXml(sheet2Name)}" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  return buildZipStore([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/styles.xml", data: encoder.encode(buildStylesXml()) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(buildWorksheetXml(sheet1Rows, sheet1Widths, 7)) },
    { name: "xl/worksheets/sheet2.xml", data: encoder.encode(buildWorksheetXml(sheet2Rows, [28, 12, 12, 12, 14, 14, 18])) },
  ]);
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const safeCopy = new Uint8Array(compressed.byteLength);
  safeCopy.set(compressed);
  await writer.write(safeCopy);
  await writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function extractZipEntries(input: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map<string, Uint8Array>();

  // Locate End of Central Directory (0x06054b50) from the end of the file
  let eocdOffset = -1;
  const minPos = Math.max(0, input.length - 65557);
  for (let i = input.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Invalid Excel (.xlsx) file.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);

  for (let i = 0; i < entryCount && cdOffset + 46 <= input.length; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(input.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

    if (localHeaderOffset + 30 <= input.length && view.getUint32(localHeaderOffset, true) === 0x04034b50) {
      const lNameLen = view.getUint16(localHeaderOffset + 26, true);
      const lExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
      const slice = input.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) {
        entries.set(name, slice);
      } else if (method === 8) {
        entries.set(name, await inflateRawBytes(slice));
      }
    }
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/** Parse the primary worksheet of an .xlsx file into a 2D string matrix for CSV/table import. */
export async function parseXlsxBuffer(buffer: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength > 5_000_000) throw new Error("Excel files must be under 5 MB.");
  const entries = await extractZipEntries(bytes);
  const decoder = new TextDecoder("utf-8");

  const sharedStrings: string[] = [];
  const sstBytes = entries.get("xl/sharedStrings.xml");
  if (sstBytes) {
    const sstXml = decoder.decode(sstBytes);
    const siMatches = sstXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) ?? [];
    for (const si of siMatches) {
      const tMatches = [...si.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
      sharedStrings.push(tMatches.map((m) => decodeXmlEntities(m[1])).join(""));
    }
  }

  const sheetBytes =
    entries.get("xl/worksheets/sheet1.xml") ??
    [...entries.entries()].find(([k]) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))?.[1];
  if (!sheetBytes) throw new Error("Could not find a worksheet inside this Excel file.");

  const sheetXml = decoder.decode(sheetBytes);
  const rowMatches = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
  const matrix: string[][] = [];

  for (const rowXml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowXml.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? [];
    let nextCol = 0;
    for (const cellXml of cellMatches) {
      const refMatch = cellXml.match(/\br="([A-Za-z]+)\d+"/);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : nextCol;
      nextCol = colIdx + 1;

      const typeMatch = cellXml.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : "";
      let val = "";

      if (cellType === "inlineStr") {
        const tParts = [...cellXml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
        val = tParts.map((m) => decodeXmlEntities(m[1])).join("");
      } else {
        const vMatch = cellXml.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
        const rawV = vMatch ? decodeXmlEntities(vMatch[1]) : "";
        if (cellType === "s") {
          const sIdx = Number(rawV);
          val = Number.isInteger(sIdx) && sIdx >= 0 && sIdx < sharedStrings.length ? sharedStrings[sIdx] : "";
        } else if (cellType === "b") {
          val = rawV === "1" ? "Yes" : "No";
        } else {
          val = rawV;
        }
      }

      while (cells.length <= colIdx) cells.push("");
      cells[colIdx] = val;
    }
    matrix.push(cells);
  }

  return matrix;
}
