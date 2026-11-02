import type { AppLocale, Trade, TradingAccount } from "@/lib/types";
import { getStats, tradeRMultiple } from "@/lib/format";
import { evaluateTradeProcess, groupTrades, maxRealizedDrawdown, type TradeGroupRow } from "@/lib/analytics";
import { translateMarket, translateMood } from "@/lib/i18n";
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
  | { kind: "num"; value: number; style?: number }
  | { kind: "formula"; formula: string; value: number; style?: number };

// Style indices in xl/styles.xml (strictly compliant with ECMA-376 OpenXML):
// 0  = Normal default
// 1  = Report Banner Title (13pt bold white on deep botanical green #1F4330, v-center)
// 2  = Report Subtitle Strip (9.5pt italic/medium #2E5339 on soft sage #EDF5EE, v-center)
// 3  = Section Header (11pt bold #1F4330, bottom accent border)
// 4  = Table Header Left (10pt bold white on #2E5339, wrap, thin border)
// 5  = Table Header Center (10pt bold white on #2E5339, center, wrap, thin border)
// 6  = Table Header Right (10pt bold white on #2E5339, right, wrap, thin border)
// 7  = KPI Label (9.5pt bold #2E5339 on #F2F7F3, thin border)
// 8  = KPI Value Text/Int (10.5pt bold #1F2922 on #FFFFFF, right, thin border)
// 9  = KPI Value USD Neutral (10.5pt bold #1F2922, $#,##0.00, right, thin border)
// 10 = KPI Value USD Positive (10.5pt bold #1B6535, +$#,##0.00, right, thin border)
// 11 = KPI Value USD Negative (10.5pt bold #A63222, -$#,##0.00, right, thin border)
// 12 = Data Text Odd (#FFFFFF, thin border)
// 13 = Data Text Even (#F8FBF8, thin border)
// 14 = Data Center Odd (#FFFFFF, center, thin border)
// 15 = Data Center Even (#F8FBF8, center, thin border)
// 16 = Data Price/Qty Odd (#FFFFFF, 0.00####, right, thin border)
// 17 = Data Price/Qty Even (#F8FBF8, 0.00####, right, thin border)
// 18 = Data USD Neutral Odd (#FFFFFF, $#,##0.00, right, thin border)
// 19 = Data USD Neutral Even (#F8FBF8, $#,##0.00, right, thin border)
// 20 = Data USD Positive (bold #1B6535, +$#,##0.00, right, thin border)
// 21 = Data USD Negative (bold #A63222, -$#,##0.00, right, thin border)
// 22 = Data R Positive (bold #1B6535, +0.00"R", right, thin border)
// 23 = Data R Negative (bold #A63222, -0.00"R", right, thin border)
// 24 = Win Pill (bold #1B6535 on #E7F4E8, center, thin border)
// 25 = Loss Pill (bold #9E2F20 on #FBEBE7, center, thin border)
// 26 = Breakeven Pill (bold #6E6545 on #F7F3E6, center, thin border)
// 27 = Total Footer Text/Label (bold #1F4330 on #EAF3EC, top medium + bottom double border)
// 28 = Total Footer Center (bold #1F4330 on #EAF3EC, center, top medium + bottom double border)
// 29 = Total Footer USD Neutral (bold #1F4330 on #EAF3EC, $#,##0.00, right, top+double border)
// 30 = Total Footer USD Positive (bold #1B6535 on #EAF3EC, +$#,##0.00, right, top+double border)
// 31 = Total Footer USD Negative (bold #A63222 on #EAF3EC, -$#,##0.00, right, top+double border)
// 32 = Wrapped Notes Odd (#FFFFFF, wrapText, thin border)
// 33 = Wrapped Notes Even (#F8FBF8, wrapText, thin border)

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="4">
    <numFmt numFmtId="164" formatCode="$#,##0.00;-$#,##0.00;&quot;$0.00&quot;"/>
    <numFmt numFmtId="165" formatCode="+$#,##0.00;-$#,##0.00;&quot;$0.00&quot;"/>
    <numFmt numFmtId="166" formatCode="+0.00&quot;R&quot;;-0.00&quot;R&quot;;0.00&quot;R&quot;"/>
    <numFmt numFmtId="167" formatCode="0.00####"/>
  </numFmts>
  <fonts count="10">
    <font><sz val="10"/><color rgb="FF1F2922"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="9.5"/><color rgb="FF2E5339"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF1F4330"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="9.5"/><color rgb="FF2E5339"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF1F2922"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF1B6535"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFA63222"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF6E6545"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="10">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4330"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2E5339"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEDF5EE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F7F3"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FBF8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE7F4E8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFBEBE7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7F3E6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="4">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD8E2D9"/></left>
      <right style="thin"><color rgb="FFD8E2D9"/></right>
      <top style="thin"><color rgb="FFD8E2D9"/></top>
      <bottom style="thin"><color rgb="FFD8E2D9"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left/><right/><top/>
      <bottom style="medium"><color rgb="FF2E5339"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFB7CBB9"/></left>
      <right style="thin"><color rgb="FFB7CBB9"/></right>
      <top style="medium"><color rgb="FF1F4330"/></top>
      <bottom style="double"><color rgb="FF1F4330"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="34">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="8" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="167" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="8" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="166" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="166" fontId="8" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="8" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="9" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="4" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="4" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="4" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="7" fillId="4" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="8" fillId="4" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

class SharedStringTable {
  private map = new Map<string, number>();
  private list: string[] = [];
  public totalRefs = 0;

  intern(raw: string): number {
    this.totalRefs += 1;
    const existing = this.map.get(raw);
    if (existing !== undefined) return existing;
    const idx = this.list.length;
    this.list.push(raw);
    this.map.set(raw, idx);
    return idx;
  }

  toXml(): string {
    const items = this.list
      .map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`)
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.totalRefs}" uniqueCount="${this.list.length}">${items}</sst>`;
  }
}

type WorksheetOptions = {
  rows: { cells: CellSpec[]; height?: number }[];
  colWidths: number[];
  merges?: string[];
  freezeRow?: number;
  autoFilterRef?: string;
};

function buildWorksheetXml(opts: WorksheetOptions, sst: SharedStringTable): string {
  const { rows, colWidths, merges = [], freezeRow, autoFilterRef } = opts;
  const maxColIdx = Math.max(
    0,
    colWidths.length - 1,
    ...rows.map((r) => r.cells.length - 1),
  );
  const maxRowNum = Math.max(1, rows.length);
  const dimRef = `A1:${colIndexToLetters(maxColIdx)}${maxRowNum}`;

  const colsXml = colWidths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  const sheetViewXml = freezeRow
    ? `<sheetViews><sheetView showGridLines="1" workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freezeRow + 1}" sqref="A${freezeRow + 1}"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView showGridLines="1" workbookViewId="0"/></sheetViews>`;

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
          if (cell.kind === "formula") {
            const safeVal = Number.isFinite(cell.value) ? cell.value : 0;
            return `<c r="${ref}"${sAttr}><f>${escapeXml(cell.formula)}</f><v>${safeVal}</v></c>`;
          }
          const text =
            cell.kind === "str"
              ? cell.rawSafe
                ? cell.value
                : sanitizeSpreadsheetText(cell.value)
              : "";
          if (!text) {
            return cell.style !== undefined ? `<c r="${ref}"${sAttr}/>` : "";
          }
          const sIdx = sst.intern(text);
          return `<c r="${ref}" t="s"${sAttr}><v>${sIdx}</v></c>`;
        })
        .filter(Boolean)
        .join("");
      return `<row r="${rNum}"${htAttr}>${cellsXml}</row>`;
    })
    .join("");

  const autoFilterXml = autoFilterRef ? `<autoFilter ref="${autoFilterRef}"/>` : "";
  const mergeCellsXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="${dimRef}"/>
  ${sheetViewXml}
  <sheetFormatPr defaultRowHeight="19"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
  ${autoFilterXml}
  ${mergeCellsXml}
  <pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

// Pure CRC-32 & PKZIP builder with valid MS-DOS timestamps (0 external dependencies)
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

function getValidDosDateTime(now = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, Math.min(2107, now.getUTCFullYear()));
  const month = Math.max(1, Math.min(12, now.getUTCMonth() + 1));
  const day = Math.max(1, Math.min(31, now.getUTCDate()));
  const hours = Math.max(0, Math.min(23, now.getUTCHours()));
  const mins = Math.max(0, Math.min(59, now.getUTCMinutes()));
  const secs = Math.floor(Math.max(0, Math.min(59, now.getUTCSeconds())) / 2);
  return {
    dosTime: (hours << 11) | (mins << 5) | secs,
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function buildZipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const { dosTime, dosDate } = getValidDosDateTime();
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
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
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
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
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

function signedUsdStyle(val: number, evenRow: boolean, isKpi = false, isTotal = false): number {
  if (isTotal) return val > 0 ? 30 : val < 0 ? 31 : 29;
  if (isKpi) return val > 0 ? 10 : val < 0 ? 11 : 9;
  if (val > 0) return 20;
  if (val < 0) return 21;
  return evenRow ? 19 : 18;
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
  const totalFeesAll = sorted.reduce((s, t) => {
    const f = t.fees ? Number(t.fees) : 0;
    return s + (Number.isFinite(f) && f > 0 ? f : 0);
  }, 0);
  const today = new Date().toISOString().slice(0, 10);
  const dateRange = sorted.length
    ? `${sorted[0].tradeDate} s/d ${sorted[sorted.length - 1].tradeDate}`
    : "—";
  const dateRangeEn = sorted.length
    ? `${sorted[0].tradeDate} to ${sorted[sorted.length - 1].tradeDate}`
    : "—";

  // =========================================================================
  // SHEET 1: EXECUTIVE SUMMARY & PERFORMANCE BREAKDOWN (Presentation Sheet)
  // =========================================================================
  const summaryRows: { cells: CellSpec[]; height?: number }[] = [];
  const summaryMerges: string[] = ["A1:G1", "A2:G2"];

  summaryRows.push({
    cells: [
      {
        kind: "str",
        value: isId
          ? "BLOOM TRADING JOURNAL — LAPORAN EKSEKUTIF PERFORMA TRADING"
          : "BLOOM TRADING JOURNAL — EXECUTIVE TRADING PERFORMANCE REPORT",
        style: 1,
        rawSafe: true,
      },
      ...Array.from({ length: 6 }, () => ({ kind: "empty" as const, style: 1 })),
    ],
    height: 30,
  });

  summaryRows.push({
    cells: [
      {
        kind: "str",
        value: isId
          ? `Periode: ${dateRange}   •   Total Transaksi: ${sorted.length} Trade   •   Tanggal Cetak: ${today}   •   Mata Uang: USD`
          : `Period: ${dateRangeEn}   •   Total Trades: ${sorted.length}   •   Generated: ${today}   •   Currency: USD`,
        style: 2,
        rawSafe: true,
      },
      ...Array.from({ length: 6 }, () => ({ kind: "empty" as const, style: 2 })),
    ],
    height: 22,
  });

  summaryRows.push({ cells: [], height: 10 });
  summaryMerges.push("A4:G4");
  summaryRows.push({
    cells: [
      {
        kind: "str",
        value: isId ? "1. IKHTISAR METRIK UTAMA (KEY PERFORMANCE INDICATORS)" : "1. KEY PERFORMANCE INDICATORS",
        style: 3,
        rawSafe: true,
      },
      ...Array.from({ length: 6 }, () => ({ kind: "empty" as const, style: 3 })),
    ],
    height: 23,
  });

  const kpiPairs: [CellSpec, CellSpec, CellSpec, CellSpec][] = [
    [
      { kind: "str", value: isId ? "Total Trade" : "Total Trades", style: 7, rawSafe: true },
      { kind: "num", value: sorted.length, style: 8 },
      { kind: "str", value: isId ? "P&L Bersih Realisasi (USD)" : "Net Realized P&L (USD)", style: 7, rawSafe: true },
      { kind: "num", value: Number(stats.net.toFixed(2)), style: signedUsdStyle(stats.net, false, true) },
    ],
    [
      { kind: "str", value: isId ? "Menang / Rugi / Impas" : "Wins / Losses / Breakeven", style: 7, rawSafe: true },
      { kind: "str", value: `${stats.wins}W / ${stats.losses}L / ${stats.breakeven}BE`, style: 8, rawSafe: true },
      { kind: "str", value: isId ? "Profit Kotor (Gross Profit)" : "Gross Profit (USD)", style: 7, rawSafe: true },
      { kind: "num", value: Number(grossWins.toFixed(2)), style: signedUsdStyle(grossWins, false, true) },
    ],
    [
      { kind: "str", value: isId ? "Rasio Menang (Win Rate)" : "Win Rate", style: 7, rawSafe: true },
      { kind: "str", value: stats.winRate === null ? "—" : `${stats.winRate}%`, style: 8, rawSafe: true },
      { kind: "str", value: isId ? "Rugi Kotor (Gross Loss)" : "Gross Loss (USD)", style: 7, rawSafe: true },
      { kind: "num", value: Number(grossLosses.toFixed(2)), style: signedUsdStyle(grossLosses, false, true) },
    ],
    [
      { kind: "str", value: "Profit Factor", style: 7, rawSafe: true },
      { kind: "str", value: stats.profitFactor, style: 8, rawSafe: true },
      { kind: "str", value: isId ? "Rata-rata Menang (Avg Win)" : "Average Win (USD)", style: 7, rawSafe: true },
      stats.avgWin === null
        ? { kind: "str", value: "—", style: 8, rawSafe: true }
        : { kind: "num", value: Number(stats.avgWin.toFixed(2)), style: signedUsdStyle(stats.avgWin, false, true) },
    ],
    [
      { kind: "str", value: isId ? "Rata-rata R-Multiple" : "Average R-Multiple", style: 7, rawSafe: true },
      stats.avgR !== null
        ? { kind: "num", value: Number(stats.avgR.toFixed(2)), style: stats.avgR >= 0 ? 22 : 23 }
        : { kind: "str", value: "—", style: 8, rawSafe: true },
      { kind: "str", value: isId ? "Rata-rata Rugi (Avg Loss)" : "Average Loss (USD)", style: 7, rawSafe: true },
      stats.avgLoss === null
        ? { kind: "str", value: "—", style: 8, rawSafe: true }
        : { kind: "num", value: Number((-Math.abs(stats.avgLoss)).toFixed(2)), style: 11 },
    ],
    [
      { kind: "str", value: "Expectancy / Trade (USD)", style: 7, rawSafe: true },
      stats.expectancy === null
        ? { kind: "str", value: "—", style: 8, rawSafe: true }
        : { kind: "num", value: Number(stats.expectancy.toFixed(2)), style: signedUsdStyle(stats.expectancy, false, true) },
      { kind: "str", value: isId ? "Max Realized Drawdown (USD)" : "Max Realized Drawdown (USD)", style: 7, rawSafe: true },
      { kind: "num", value: Number((-Math.abs(maxDd)).toFixed(2)), style: maxDd > 0 ? 11 : 9 },
    ],
    [
      { kind: "str", value: isId ? "Total Biaya / Komisi (USD)" : "Total Recorded Fees (USD)", style: 7, rawSafe: true },
      { kind: "num", value: Number(totalFeesAll.toFixed(2)), style: 9 },
      { kind: "str", value: isId ? "Jumlah Akun Tercatat" : "Accounts Covered", style: 7, rawSafe: true },
      { kind: "num", value: new Set(sorted.map((t) => t.accountId ?? "main")).size || accounts.length, style: 8 },
    ],
  ];

  for (const [l1, v1, l2, v2] of kpiPairs) {
    const rNum = summaryRows.length + 1;
    summaryMerges.push(`B${rNum}:C${rNum}`, `E${rNum}:F${rNum}`);
    summaryRows.push({
      cells: [
        l1,
        v1,
        { kind: "empty", style: v1.style },
        l2,
        v2,
        { kind: "empty", style: v2.style },
        { kind: "empty" },
      ],
      height: 21,
    });
  }

  let sectionCounter = 2;
  const appendBreakdownSection = (sectionTitle: string, groups: TradeGroupRow[]) => {
    summaryRows.push({ cells: [], height: 10 });
    const secRowNum = summaryRows.length + 1;
    summaryMerges.push(`A${secRowNum}:G${secRowNum}`);
    summaryRows.push({
      cells: [
        { kind: "str", value: `${sectionCounter++}. ${sectionTitle}`, style: 3, rawSafe: true },
        ...Array.from({ length: 6 }, () => ({ kind: "empty" as const, style: 3 })),
      ],
      height: 23,
    });
    summaryRows.push({
      cells: [
        { kind: "str", value: isId ? "Kategori" : "Category", style: 4, rawSafe: true },
        { kind: "str", value: isId ? "Trade" : "Trades", style: 5, rawSafe: true },
        { kind: "str", value: isId ? "Menang" : "Wins", style: 5, rawSafe: true },
        { kind: "str", value: isId ? "Rugi" : "Losses", style: 5, rawSafe: true },
        { kind: "str", value: isId ? "Rasio Menang" : "Win Rate", style: 5, rawSafe: true },
        { kind: "str", value: isId ? "Rata-rata R" : "Average R", style: 6, rawSafe: true },
        { kind: "str", value: isId ? "P&L Bersih (USD)" : "Net P&L (USD)", style: 6, rawSafe: true },
      ],
      height: 23,
    });
    groups.forEach((g, idx) => {
      const even = idx % 2 === 1;
      const wr = g.wins + g.losses > 0 ? Math.round((g.wins / (g.wins + g.losses)) * 100) : null;
      summaryRows.push({
        cells: [
          { kind: "str", value: g.name, style: even ? 13 : 12 },
          { kind: "num", value: g.count, style: even ? 15 : 14 },
          { kind: "num", value: g.wins, style: even ? 15 : 14 },
          { kind: "num", value: g.losses, style: even ? 15 : 14 },
          { kind: "str", value: wr === null ? "—" : `${wr}%`, style: even ? 15 : 14, rawSafe: true },
          g.avgR !== null
            ? { kind: "num", value: Number(g.avgR.toFixed(2)), style: g.avgR >= 0 ? 22 : 23 }
            : { kind: "str", value: "—", style: even ? 15 : 14, rawSafe: true },
          { kind: "num", value: Number(g.pnl.toFixed(2)), style: signedUsdStyle(g.pnl, even) },
        ],
        height: 20,
      });
    });
  };

  // Monthly Breakdown (chronological YYYY-MM)
  const monthGroups = groupTrades(sorted, (t) => t.tradeDate.slice(0, 7), "—").sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  appendBreakdownSection(isId ? "REKAP PERFORMA BULANAN" : "MONTHLY PERFORMANCE", monthGroups);

  appendBreakdownSection(
    isId ? "PERFORMA PER AKUN TRADING" : "PERFORMANCE BY TRADING ACCOUNT",
    groupTrades(
      sorted,
      (t) => accounts.find((a) => a.id === (t.accountId ?? "main"))?.name ?? "Main account",
      "Main account",
    ),
  );
  appendBreakdownSection(
    isId ? "PERFORMA PER SETUP" : "PERFORMANCE BY SETUP",
    groupTrades(sorted, (t) => t.setup, isId ? "Tanpa setup" : "No setup"),
  );
  appendBreakdownSection(
    isId ? "PERFORMA PER PASAR" : "PERFORMANCE BY MARKET",
    groupTrades(
      sorted,
      (t) => (isId ? translateMarket(t.market, "id") : t.market),
      isId ? "Lainnya" : "Other",
    ),
  );
  appendBreakdownSection(
    isId ? "PERFORMA PER SESI" : "PERFORMANCE BY SESSION",
    groupTrades(sorted, (t) => t.session ?? "", isId ? "Tanpa sesi" : "No session"),
  );
  appendBreakdownSection(
    isId ? "KEPATUHAN RENCANA TRADING" : "PLAN ADHERENCE BREAKDOWN",
    groupTrades(
      sorted,
      (t) => {
        const st = evaluateTradeProcess(t).status;
        if (st === "followed") return isId ? "Patuh Rencana" : "Followed Plan";
        if (st === "broken") return isId ? "Langgar Rencana" : "Broke Plan";
        return isId ? "Belum Dinilai" : "Unrated";
      },
      isId ? "Belum Dinilai" : "Unrated",
    ),
  );

  const summaryWidths = [30, 14, 14, 28, 16, 16, 20];

  // =========================================================================
  // SHEET 2: COMPLETE TRADE LEDGER (Round-Trip Importable Master Table)
  // =========================================================================
  const ledgerRows: { cells: CellSpec[]; height?: number }[] = [];
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

  const lastColLetter = colIndexToLetters(headers.length - 1);
  const ledgerMerges = [`A1:${lastColLetter}1`, `A2:${lastColLetter}2`];

  ledgerRows.push({
    cells: [
      {
        kind: "str",
        value: isId
          ? "BLOOM TRADING JOURNAL — DAFTAR TRANSAKSI LENGKAP (TRADE LEDGER)"
          : "BLOOM TRADING JOURNAL — COMPLETE TRADE LEDGER",
        style: 1,
        rawSafe: true,
      },
      ...Array.from({ length: headers.length - 1 }, () => ({ kind: "empty" as const, style: 1 })),
    ],
    height: 29,
  });

  const wrBanner = stats.winRate === null ? "—" : `${stats.winRate}%`;
  const avgRBanner = stats.avgR !== null ? `${stats.avgR >= 0 ? "+" : ""}${stats.avgR.toFixed(2)}R` : "—";
  const netBanner = `${stats.net >= 0 ? "+" : "-"}$${Math.abs(stats.net).toFixed(2)}`;
  ledgerRows.push({
    cells: [
      {
        kind: "str",
        value: isId
          ? `Periode: ${dateRange}   •   Total: ${sorted.length} Trade (${stats.wins}W / ${stats.losses}L / ${stats.breakeven}BE)   •   Win Rate: ${wrBanner}   •   Profit Factor: ${stats.profitFactor}   •   Avg R: ${avgRBanner}   •   P&L Bersih: ${netBanner}`
          : `Period: ${dateRangeEn}   •   Total: ${sorted.length} Trades (${stats.wins}W / ${stats.losses}L / ${stats.breakeven}BE)   •   Win Rate: ${wrBanner}   •   Profit Factor: ${stats.profitFactor}   •   Avg R: ${avgRBanner}   •   Net P&L: ${netBanner}`,
        style: 2,
        rawSafe: true,
      },
      ...Array.from({ length: headers.length - 1 }, () => ({ kind: "empty" as const, style: 2 })),
    ],
    height: 21,
  });

  // Row 3: Clean spacer
  ledgerRows.push({ cells: [], height: 8 });

  // Row 4: Frozen Table Header
  const centerHeaderCols = new Set([0, 1, 3, 5, 8, 17, 20, 21, 23]);
  const rightHeaderCols = new Set([9, 10, 11, 12, 13, 14, 15, 16, 18, 19]);
  ledgerRows.push({
    cells: headers.map((h, cIdx) => ({
      kind: "str" as const,
      value: h,
      style: centerHeaderCols.has(cIdx) ? 5 : rightHeaderCols.has(cIdx) ? 6 : 4,
      rawSafe: true,
    })),
    height: 26,
  });

  const maxColChars = headers.map((h) => h.length + 2);
  const trackLen = (colIdx: number, str: string) => {
    if (str.length > maxColChars[colIdx]) maxColChars[colIdx] = str.length;
  };

  let runningPnl = 0;
  let totalRisk = 0;
  let totalFees = 0;

  sorted.forEach((trade, index) => {
    const even = index % 2 === 1;
    const txtStyle = even ? 13 : 12;
    const ctrStyle = even ? 15 : 14;
    const numStyle = even ? 17 : 16;
    const usdBaseStyle = even ? 19 : 18;
    const wrapStyle = even ? 33 : 32;

    const optNumCell = (raw: string | undefined, colIdx: number, isUsd = false): CellSpec => {
      const trimmed = String(raw ?? "").trim();
      if (!trimmed) return { kind: "empty", style: isUsd ? usdBaseStyle : numStyle };
      trackLen(colIdx, trimmed);
      const n = Number(trimmed);
      return Number.isFinite(n)
        ? { kind: "num", value: n, style: isUsd ? usdBaseStyle : numStyle }
        : { kind: "str", value: trimmed, style: txtStyle };
    };

    const pnl = Number(trade.pnl);
    runningPnl += pnl;
    const riskVal = trade.initialRisk ? Number(trade.initialRisk) : NaN;
    if (Number.isFinite(riskVal) && riskVal > 0) totalRisk += riskVal;
    const feeVal = trade.fees ? Number(trade.fees) : NaN;
    if (Number.isFinite(feeVal) && feeVal > 0) totalFees += feeVal;

    const rMult = tradeRMultiple(trade);
    const accountName = accounts.find((a) => a.id === (trade.accountId ?? "main"))?.name ?? "Main account";
    const marketLabel = isId ? translateMarket(trade.market, "id") : trade.market;
    const moodLabel = isId ? translateMood(trade.mood, "id") : trade.mood;
    const resultLabel = pnl > 0 ? (isId ? "Untung" : "Win") : pnl < 0 ? (isId ? "Rugi" : "Loss") : isId ? "Impas" : "Breakeven";
    const resultStyle = pnl > 0 ? 24 : pnl < 0 ? 25 : 26;
    const planText =
      trade.followedPlan === true
        ? isId
          ? "Ya"
          : "Yes"
        : trade.followedPlan === false
          ? isId
            ? "Tidak"
            : "No"
          : "";
    const checklistArr = trade.checklist ?? [];
    const checklistScore = checklistArr.length
      ? `${checklistArr.filter((c) => c.checked).length}/${checklistArr.length}`
      : "";
    const checklistStr = serializeChecklist(checklistArr);
    const tagsStr = (trade.tags ?? []).join(" | ");

    trackLen(1, trade.tradeDate);
    trackLen(2, accountName);
    trackLen(3, trade.symbol);
    trackLen(4, marketLabel);
    trackLen(5, trade.side);
    trackLen(6, trade.setup);
    trackLen(7, trade.session ?? "");
    trackLen(16, pnl.toFixed(2));
    trackLen(17, resultLabel);
    trackLen(19, runningPnl.toFixed(2));
    trackLen(23, moodLabel);
    trackLen(24, tagsStr);

    ledgerRows.push({
      cells: [
        { kind: "num", value: index + 1, style: ctrStyle },
        { kind: "str", value: trade.tradeDate, style: ctrStyle, rawSafe: true },
        { kind: "str", value: accountName, style: txtStyle },
        { kind: "str", value: trade.symbol, style: ctrStyle },
        { kind: "str", value: marketLabel, style: txtStyle, rawSafe: true },
        { kind: "str", value: trade.side, style: ctrStyle, rawSafe: true },
        { kind: "str", value: trade.setup, style: txtStyle },
        { kind: "str", value: trade.session ?? "", style: txtStyle },
        { kind: "str", value: trade.timeframe ?? "", style: ctrStyle },
        optNumCell(trade.entryPrice, 9, false),
        optNumCell(trade.exitPrice, 10, false),
        optNumCell(trade.stopLoss, 11, false),
        optNumCell(trade.takeProfit, 12, false),
        optNumCell(trade.positionSize, 13, false),
        optNumCell(trade.initialRisk, 14, true),
        optNumCell(trade.fees, 15, true),
        { kind: "num", value: Number(pnl.toFixed(2)), style: signedUsdStyle(pnl, even) },
        { kind: "str", value: resultLabel, style: resultStyle, rawSafe: true },
        rMult !== null
          ? { kind: "num", value: Number(rMult.toFixed(2)), style: rMult >= 0 ? 22 : 23 }
          : { kind: "empty", style: ctrStyle },
        { kind: "num", value: Number(runningPnl.toFixed(2)), style: signedUsdStyle(runningPnl, even) },
        { kind: "str", value: planText, style: ctrStyle, rawSafe: true },
        { kind: "str", value: checklistScore, style: ctrStyle, rawSafe: true },
        { kind: "str", value: checklistStr, style: wrapStyle },
        { kind: "str", value: moodLabel, style: ctrStyle, rawSafe: true },
        { kind: "str", value: tagsStr, style: txtStyle },
        { kind: "str", value: trade.notes, style: wrapStyle },
      ],
      height: 21,
    });
  });

  const firstDataRow = 5;
  const lastDataRow = 4 + sorted.length;

  // Footer Summary Row with real Excel SUM formulas + pre-computed cached values
  if (sorted.length > 0) {
    const footerCells: CellSpec[] = Array.from({ length: headers.length }, () => ({
      kind: "empty" as const,
      style: 27,
    }));
    footerCells[0] = { kind: "str", value: "TOTAL", style: 28, rawSafe: true };
    footerCells[1] = {
      kind: "str",
      value: isId ? `${sorted.length} trade` : `${sorted.length} trades`,
      style: 28,
      rawSafe: true,
    };
    footerCells[14] = {
      kind: "formula",
      formula: `SUM(O${firstDataRow}:O${lastDataRow})`,
      value: Number(totalRisk.toFixed(2)),
      style: 29,
    };
    footerCells[15] = {
      kind: "formula",
      formula: `SUM(P${firstDataRow}:P${lastDataRow})`,
      value: Number(totalFees.toFixed(2)),
      style: 29,
    };
    footerCells[16] = {
      kind: "formula",
      formula: `SUM(Q${firstDataRow}:Q${lastDataRow})`,
      value: Number(stats.net.toFixed(2)),
      style: signedUsdStyle(stats.net, false, false, true),
    };
    footerCells[17] = {
      kind: "str",
      value: stats.winRate === null ? "—" : `${stats.winRate}% WR`,
      style: 28,
      rawSafe: true,
    };
    footerCells[18] =
      stats.avgR !== null
        ? { kind: "num", value: Number(stats.avgR.toFixed(2)), style: stats.avgR >= 0 ? 22 : 23 }
        : { kind: "empty", style: 28 };
    footerCells[19] = {
      kind: "num",
      value: Number(runningPnl.toFixed(2)),
      style: signedUsdStyle(runningPnl, false, false, true),
    };
    ledgerRows.push({ cells: footerCells, height: 24 });
  }

  const minWidths = [
    7, 14, 18, 12, 13, 10, 22, 14, 11, 13, 13, 13, 13, 13, 16, 13, 16, 12, 12, 18, 14, 14, 34, 12, 22, 44,
  ];
  const maxWidths = [
    10, 16, 26, 16, 18, 12, 30, 18, 13, 16, 16, 16, 16, 16, 18, 16, 18, 14, 14, 20, 16, 16, 42, 15, 28, 52,
  ];
  const ledgerWidths = minWidths.map((minW, idx) =>
    Math.min(maxWidths[idx], Math.max(minW, (maxColChars[idx] ?? minW) + 3)),
  );

  const sst = new SharedStringTable();
  const sheet1Xml = buildWorksheetXml(
    {
      rows: summaryRows,
      colWidths: summaryWidths,
      merges: summaryMerges,
    },
    sst,
  );
  const sheet2Xml = buildWorksheetXml(
    {
      rows: ledgerRows,
      colWidths: ledgerWidths,
      merges: ledgerMerges,
      freezeRow: 4,
      autoFilterRef: sorted.length > 0 ? `A4:${lastColLetter}${lastDataRow}` : undefined,
    },
    sst,
  );
  const sstXml = sst.toXml();

  const encoder = new TextEncoder();
  const sheet1Name = isId ? "Ringkasan Laporan" : "Executive Summary";
  const sheet2Name = isId ? "Catatan Trade" : "Trade Ledger";
  const nowIso = new Date().toISOString();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(isId ? "Laporan Performa Trading Bloom" : "Bloom Trading Performance Report")}</dc:title>
  <dc:creator>Bloom Trading Journal</dc:creator>
  <cp:lastModifiedBy>Bloom Trading Journal</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>
</cp:coreProperties>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Bloom Trading Journal</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>Bloom</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0300</AppVersion>
</Properties>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14400" activeTab="0"/>
  </bookViews>
  <sheets>
    <sheet name="${escapeXml(sheet1Name)}" sheetId="1" r:id="rId1"/>
    <sheet name="${escapeXml(sheet2Name)}" sheetId="2" r:id="rId2"/>
  </sheets>
  <calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  return buildZipStore([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "docProps/core.xml", data: encoder.encode(coreXml) },
    { name: "docProps/app.xml", data: encoder.encode(appXml) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/styles.xml", data: encoder.encode(buildStylesXml()) },
    { name: "xl/sharedStrings.xml", data: encoder.encode(sstXml) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheet1Xml) },
    { name: "xl/worksheets/sheet2.xml", data: encoder.encode(sheet2Xml) },
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
  const safeCopy = new Uint8Array(compressed.byteLength);
  safeCopy.set(compressed);
  const stream = new Blob([safeCopy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
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

function parseSheetXmlToMatrix(sheetXml: string, sharedStrings: string[]): string[][] {
  const rowMatches = sheetXml.match(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g) ?? [];
  const matrix: string[][] = [];

  for (const rowXml of rowMatches) {
    if (rowXml.endsWith("/>")) {
      matrix.push([]);
      continue;
    }
    const cells: string[] = [];
    const cellMatches = rowXml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? [];
    let nextCol = 0;
    for (const cellXml of cellMatches) {
      const refMatch = cellXml.match(/\br="([A-Za-z]+)\d+"/);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : nextCol;
      nextCol = colIdx + 1;

      if (cellXml.endsWith("/>")) {
        while (cells.length <= colIdx) cells.push("");
        continue;
      }

      const typeMatch = cellXml.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : "";
      let val = "";

      if (cellType === "inlineStr") {
        const tParts = [...cellXml.matchAll(/<t(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/t>)/g)];
        val = tParts.map((m) => decodeXmlEntities(m[1] ?? "")).join("");
      } else {
        const vMatch = cellXml.match(/<v(?:\s[^>]*?)?>([\s\S]*?)<\/v>/);
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

function scoreMatrixForTradeLedger(matrix: string[][]): number {
  const symSet = new Set(["symbol", "asset", "instrument", "ticker", "pair", "simbol", "aset", "simbolaset"]);
  const dateSet = new Set(["tradedate", "date", "closedate", "exitdate", "tanggaltrade", "tanggal"]);
  const pnlSet = new Set(["pnl", "pl", "netpnl", "netpl", "netpnlusd", "netplusd", "netprofit", "profitloss", "profit", "pnlbersih", "plbersih", "pnlbersihusd", "plbersihusd"]);
  const norm = (s: string) => s.toLowerCase().replace(/p\s*&\s*l/g, "pnl").replace(/[^a-z0-9]/g, "");

  const limit = Math.min(matrix.length, 30);
  let best = 0;
  for (let i = 0; i < limit; i++) {
    const tokens = new Set((matrix[i] ?? []).map((c) => norm(String(c ?? ""))));
    const hasSym = [...symSet].some((a) => tokens.has(a));
    const hasDate = [...dateSet].some((a) => tokens.has(a));
    const hasPnl = [...pnlSet].some((a) => tokens.has(a));
    if (hasSym && hasDate && hasPnl) {
      best = Math.max(best, 100 + tokens.size);
    }
  }
  return best;
}

/** Parse the trade ledger worksheet of an .xlsx file into a 2D string matrix for CSV/table import. */
export async function parseXlsxBuffer(buffer: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength > 5_000_000) throw new Error("Excel files must be under 5 MB.");
  const entries = await extractZipEntries(bytes);
  const decoder = new TextDecoder("utf-8");

  const sharedStrings: string[] = [];
  const sstBytes = entries.get("xl/sharedStrings.xml");
  if (sstBytes) {
    const sstXml = decoder.decode(sstBytes);
    const siMatches = sstXml.match(/<si\b[^>]*?(?:\/>|>[\s\S]*?<\/si>)/g) ?? [];
    for (const si of siMatches) {
      if (si.endsWith("/>")) {
        sharedStrings.push("");
        continue;
      }
      const tMatches = [...si.matchAll(/<t(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/t>)/g)];
      sharedStrings.push(tMatches.map((m) => decodeXmlEntities(m[1] ?? "")).join(""));
    }
  }

  const worksheetEntries = [...entries.entries()]
    .filter(([k]) => /^xl\/worksheets\/[^/]+\.xml$/i.test(k))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  if (!worksheetEntries.length) {
    throw new Error("Could not find a worksheet inside this Excel file.");
  }

  let bestMatrix: string[][] | null = null;
  let bestScore = -1;

  for (const [, sheetBytes] of worksheetEntries) {
    const matrix = parseSheetXmlToMatrix(decoder.decode(sheetBytes), sharedStrings);
    const score = scoreMatrixForTradeLedger(matrix);
    if (score > bestScore) {
      bestScore = score;
      bestMatrix = matrix;
    }
  }

  return bestMatrix ?? [];
}
