import { getProcessMatrix, groupTrades } from "@/lib/analytics";
import { currency, filterTrades, formatRMultiple, getStats, periodStart, shortDate, todayString, tradeRMultiple } from "@/lib/format";
import { weekBounds } from "@/lib/review";
import type { AppLocale, DayJournalEntry, Trade } from "@/lib/types";

export type RecapRange = "week" | "today" | "month" | "all";
export type RecapPrivacyMode = "r_only" | "full" | "process_only";
export type RecapTheme = "sage" | "espresso";

export type RecapTile = {
  label: string;
  value: string;
};

export type RecapSummary = {
  rangeLabel: string;
  headlineLabel: string;
  headlineValue: string;
  headlineTone: "positive" | "negative" | "neutral";
  tiles: RecapTile[];
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnl: number;
  netR: number | null;
  avgR: number | null;
  processScorePct: number | null;
  modelWins: number;
  goodLosses: number;
  restDays: number;
  topSetup: string | null;
  curveValues: number[];
};

export function buildRecapSummary({
  trades,
  dayJournals = [],
  range,
  weekStart,
  privacyMode,
  locale = "en",
}: {
  trades: Trade[];
  dayJournals?: DayJournalEntry[];
  range: RecapRange;
  weekStart?: string;
  privacyMode: RecapPrivacyMode;
  locale?: AppLocale;
}): RecapSummary {
  const today = todayString();
  let selectedTrades: Trade[] = [];
  let selectedDays: DayJournalEntry[] = [];
  let rangeLabel = "";

  if (range === "today") {
    selectedTrades = trades.filter((t) => t.tradeDate === today);
    selectedDays = dayJournals.filter((d) => d.date === today);
    rangeLabel = shortDate(today, true, locale);
  } else if (range === "week") {
    const bounds = weekBounds(weekStart || today);
    selectedTrades = trades.filter((t) => t.tradeDate >= bounds.start && t.tradeDate <= bounds.end);
    selectedDays = dayJournals.filter((d) => d.date >= bounds.start && d.date <= bounds.end);
    rangeLabel = `${shortDate(bounds.start, false, locale)} – ${shortDate(bounds.end, true, locale)}`;
  } else if (range === "month") {
    const startIso = periodStart("1M", trades).toISOString().slice(0, 10);
    selectedTrades = filterTrades(trades, "1M");
    selectedDays = dayJournals.filter((d) => d.date >= startIso && d.date <= today);
    rangeLabel = locale === "id" ? "30 Hari Terakhir" : "Last 30 Days";
  } else {
    selectedTrades = [...trades];
    selectedDays = [...dayJournals];
    rangeLabel = locale === "id" ? "Seluruh Periode" : "All Recorded Trades";
  }

  const ordered = [...selectedTrades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id);
  const stats = getStats(ordered);
  const matrix = getProcessMatrix(ordered);
  const rMultiples = ordered.map(tradeRMultiple).filter((v): v is number => v !== null);
  const netR = rMultiples.length ? rMultiples.reduce((sum, v) => sum + v, 0) : null;
  const avgR = rMultiples.length && netR !== null ? netR / rMultiples.length : null;
  const restDays = selectedDays.filter((d) => d.intentionalNoTrade).length;
  const setupGroups = groupTrades(
    ordered.filter((t) => t.setup.trim() !== ""),
    (t) => t.setup.trim(),
  );
  const topSetup = setupGroups[0]?.name ?? null;

  // Build cumulative curve (uses R when privacyMode === "r_only" and R is available, else normalized P&L shape without axis labels)
  const curveValues: number[] = [0];
  if (privacyMode === "process_only") {
    let score = 0;
    for (const t of ordered) {
      if (t.followedPlan === true) score += 1;
      else if (t.followedPlan === false) score -= 1;
      else if ((t.checklist?.length ?? 0) > 0) {
        const checked = t.checklist!.filter((c) => c.checked).length;
        if (checked > 0) score += checked / t.checklist!.length >= 0.7 ? 1 : -1;
      }
      curveValues.push(score);
    }
  } else if (privacyMode === "r_only" && rMultiples.length > 0) {
    let runningR = 0;
    for (const r of rMultiples) {
      runningR += r;
      curveValues.push(runningR);
    }
  } else {
    let runningNet = 0;
    for (const t of ordered) {
      runningNet += Number(t.pnl);
      curveValues.push(runningNet);
    }
  }

  const winRateStr = stats.wins + stats.losses > 0 ? `${stats.winRate}%` : "—";
  const processStr = matrix.processScorePct !== null ? `${matrix.processScorePct}%` : "—";
  const avgRStr = avgR !== null ? formatRMultiple(avgR) : "—";
  const netRStr = netR !== null ? formatRMultiple(netR) : "—";

  let headlineLabel = "";
  let headlineValue = "";
  let headlineTone: "positive" | "negative" | "neutral" = "neutral";
  let tiles: RecapTile[] = [];

  if (privacyMode === "full") {
    headlineLabel = locale === "id" ? "P&L BERSIH TEREALISASI" : "REALIZED NET P&L";
    headlineValue = ordered.length ? currency(stats.net, stats.net > 0, false) : "$0.00";
    headlineTone = stats.net > 0 ? "positive" : stats.net < 0 ? "negative" : "neutral";
    tiles = [
      { label: locale === "id" ? "Rasio menang" : "Win rate", value: winRateStr },
      { label: locale === "id" ? "Rata-rata R" : "Average R", value: avgRStr },
      { label: locale === "id" ? "Kepatuhan rencana" : "Plan discipline", value: processStr },
      {
        label: locale === "id" ? "Trade · Hari tenang" : "Trades · Rest days",
        value: `${stats.count} · ${restDays}`,
      },
    ];
  } else if (privacyMode === "process_only") {
    headlineLabel = locale === "id" ? "DISIPLIN PROSES" : "PROCESS DISCIPLINE";
    headlineValue = matrix.processScorePct !== null ? `${matrix.processScorePct}%` : `${stats.count} ${locale === "id" ? "Trade" : "Trades"}`;
    headlineTone = (matrix.processScorePct ?? 0) >= 70 ? "positive" : "neutral";
    tiles = [
      { label: locale === "id" ? "Menang ideal" : "Model wins", value: String(matrix.modelWin.count) },
      { label: locale === "id" ? "Rugi terukur" : "Good losses", value: String(matrix.goodLoss.count) },
      { label: locale === "id" ? "Hari tenang" : "Rest days", value: String(restDays) },
      { label: locale === "id" ? "Trade tercatat" : "Trades logged", value: String(stats.count) },
    ];
  } else {
    // Default: "r_only" — 100% dollar-free!
    const pfStr = stats.profitFactor || "—";
    if (netR !== null) {
      headlineLabel = locale === "id" ? "TOTAL R TEREALISASI" : "NET R-MULTIPLE";
      headlineValue = netRStr;
      headlineTone = netR > 0 ? "positive" : netR < 0 ? "negative" : "neutral";
      tiles = [
        { label: locale === "id" ? "Rasio menang" : "Win rate", value: winRateStr },
        { label: locale === "id" ? "Rata-rata R" : "Average R", value: avgRStr },
        { label: locale === "id" ? "Kepatuhan rencana" : "Plan discipline", value: processStr },
        {
          label: locale === "id" ? "Trade · Hari tenang" : "Trades · Rest days",
          value: `${stats.count} · ${restDays}`,
        },
      ];
    } else {
      headlineLabel = locale === "id" ? "RASIO MENANG" : "WIN RATE";
      headlineValue = winRateStr;
      headlineTone = (stats.winRate ?? 0) >= 50 && stats.wins + stats.losses > 0 ? "positive" : "neutral";
      tiles = [
        { label: locale === "id" ? "Faktor profit" : "Profit factor", value: pfStr },
        { label: locale === "id" ? "Menang · Kalah" : "Wins · Losses", value: `${stats.wins} · ${stats.losses}` },
        { label: locale === "id" ? "Kepatuhan rencana" : "Plan discipline", value: processStr },
        {
          label: locale === "id" ? "Trade · Hari tenang" : "Trades · Rest days",
          value: `${stats.count} · ${restDays}`,
        },
      ];
    }
  }

  return {
    rangeLabel,
    headlineLabel,
    headlineValue,
    headlineTone,
    tiles,
    count: stats.count,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.wins + stats.losses > 0 ? stats.winRate : null,
    netPnl: stats.net,
    netR,
    avgR,
    processScorePct: matrix.processScorePct,
    modelWins: matrix.modelWin.count,
    goodLosses: matrix.goodLoss.count,
    restDays,
    topSetup,
    curveValues,
  };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function renderRecapCanvas(
  canvas: HTMLCanvasElement,
  summary: RecapSummary,
  options: {
    theme: RecapTheme;
    accountLabel: string;
    mantra: string;
    locale: AppLocale;
    privacyMode: RecapPrivacyMode;
  },
) {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const isDark = options.theme === "espresso";
  const palette = isDark
    ? {
        bgStart: "#1c1916",
        bgEnd: "#24201c",
        card: "#27231e",
        cardAlt: "#201c18",
        border: "#3b342c",
        ink: "#efe6da",
        muted: "#a99d8e",
        soft: "#7d7265",
        accent: "#8ab892",
        accentBg: "#253127",
        accentBorder: "#48604b",
        positive: "#95c79d",
        negative: "#de9580",
        leafStroke: "rgba(138, 184, 146, 0.11)",
        curveLine: "#8ab892",
        curveFillTop: "rgba(138, 184, 146, 0.28)",
        curveFillBottom: "rgba(138, 184, 146, 0.01)",
      }
    : {
        bgStart: "#f5f8f2",
        bgEnd: "#eaf2e6",
        card: "#ffffff",
        cardAlt: "#f7faf5",
        border: "#dce7da",
        ink: "#233b2c",
        muted: "#6d8372",
        soft: "#93a796",
        accent: "#4e7f5b",
        accentBg: "#e8f3e8",
        accentBorder: "#c6dec8",
        positive: "#467c56",
        negative: "#b56956",
        leafStroke: "rgba(93, 145, 110, 0.12)",
        curveLine: "#5d916e",
        curveFillTop: "rgba(93, 145, 110, 0.26)",
        curveFillBottom: "rgba(93, 145, 110, 0.01)",
      };

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, palette.bgStart);
  bg.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle botanical corner arcs
  ctx.save();
  ctx.strokeStyle = palette.leafStroke;
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(W - 40, -20, 140 + i * 44, 0, Math.PI * 1.1);
    ctx.stroke();
  }
  ctx.restore();

  // Main inner editorial frame
  roundRectPath(ctx, 36, 34, W - 72, H - 68, 26);
  ctx.fillStyle = palette.card;
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const sans = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const serif = '"DM Serif Display", Georgia, serif';

  // Header: Brand sprout badge + bloom.
  roundRectPath(ctx, 76, 68, 44, 44, 13);
  ctx.fillStyle = palette.accentBg;
  ctx.fill();
  ctx.strokeStyle = palette.accentBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Vector sprout leaf inside badge
  ctx.save();
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(98, 101);
  ctx.lineTo(98, 84);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(93, 85, 6, 3.5, -0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(103.5, 82.5, 6, 3.5, 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = palette.ink;
  ctx.font = `700 26px ${serif}`;
  ctx.fillText("bloom.", 134, 95);

  ctx.fillStyle = palette.muted;
  ctx.font = `700 10px ${sans}`;
  ctx.fillText(
    options.locale === "id" ? "JURNAL TRADING TENANG" : "COMFORT TRADING JOURNAL",
    135,
    111,
  );

  // Right header pill: Range + Account
  const pillText = `${summary.rangeLabel}  ·  ${options.accountLabel}`;
  ctx.font = `600 13px ${sans}`;
  const pillWidth = Math.min(480, ctx.measureText(pillText).width + 32);
  const pillX = W - 76 - pillWidth;
  roundRectPath(ctx, pillX, 72, pillWidth, 36, 18);
  ctx.fillStyle = palette.cardAlt;
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.stroke();
  ctx.fillStyle = palette.muted;
  ctx.fillText(pillText, pillX + 16, 95);

  // Left Column: Hero Stat + 2x2 Stat Tiles
  ctx.fillStyle = palette.accent;
  ctx.font = `700 11px ${sans}`;
  ctx.fillText(summary.headlineLabel, 76, 174);

  ctx.fillStyle =
    summary.headlineTone === "positive"
      ? palette.positive
      : summary.headlineTone === "negative"
        ? palette.negative
        : palette.ink;
  ctx.font = `700 64px ${sans}`;
  ctx.fillText(summary.headlineValue, 76, 244);

  // 2x2 Tiles
  const tileStartX = 76;
  const tileStartY = 278;
  const tileW = 246;
  const tileH = 92;
  const tileGap = 14;

  summary.tiles.slice(0, 4).forEach((tile, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = tileStartX + col * (tileW + tileGap);
    const y = tileStartY + row * (tileH + tileGap);

    roundRectPath(ctx, x, y, tileW, tileH, 16);
    ctx.fillStyle = palette.cardAlt;
    ctx.fill();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = palette.muted;
    ctx.font = `600 12px ${sans}`;
    ctx.fillText(tile.label, x + 18, y + 32);

    ctx.fillStyle = palette.ink;
    ctx.font = `700 25px ${sans}`;
    ctx.fillText(tile.value, x + 18, y + 68);
  });

  // Right Column: Framed Progression Curve + Process Strip
  const chartX = 618;
  const chartY = 152;
  const chartW = 506;
  const chartH = 322;

  roundRectPath(ctx, chartX, chartY, chartW, chartH, 20);
  ctx.fillStyle = palette.cardAlt;
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = palette.muted;
  ctx.font = `700 11px ${sans}`;
  ctx.fillText(
    options.privacyMode === "process_only"
      ? options.locale === "id"
        ? "KURVA KONSISTENSI PROSES"
        : "PROCESS CONSISTENCY CURVE"
      : options.privacyMode === "r_only"
        ? options.locale === "id"
          ? "PROGRESI EKSEKUSI (BEBAS NOMINAL $)"
          : "SESSION PROGRESSION ($ HIDDEN)"
        : options.locale === "id"
          ? "KURVA P&L TEREALISASI"
          : "REALIZED EQUITY PROGRESSION",
    chartX + 24,
    chartY + 34,
  );

  if (summary.topSetup) {
    const topLabel = `${options.locale === "id" ? "Setup utama" : "Top setup"}: ${summary.topSetup}`;
    ctx.fillStyle = palette.soft;
    ctx.font = `600 11.5px ${sans}`;
    ctx.fillText(topLabel.slice(0, 42), chartX + 24, chartY + 54);
  }

  // Plot curve inside [chartX+24 .. chartX+chartW-24, chartY+78 .. chartY+chartH-68]
  const plotX = chartX + 26;
  const plotY = chartY + 78;
  const plotW = chartW - 52;
  const plotH = chartH - 144;

  // Subtle dashed midline
  ctx.save();
  ctx.strokeStyle = palette.border;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(plotX, plotY + plotH / 2);
  ctx.lineTo(plotX + plotW, plotY + plotH / 2);
  ctx.stroke();
  ctx.restore();

  const pts = summary.curveValues.length >= 2 ? summary.curveValues : [0, 0];
  const minV = Math.min(...pts);
  const maxV = Math.max(...pts);
  const span = maxV - minV || 1;
  const toCoord = (val: number, i: number) => ({
    x: plotX + (i / (pts.length - 1)) * plotW,
    y: maxV === minV ? plotY + plotH / 2 : plotY + plotH - ((val - minV) / span) * plotH,
  });

  // Step-after fill
  ctx.beginPath();
  const first = toCoord(pts[0], 0);
  ctx.moveTo(first.x, plotY + plotH);
  ctx.lineTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const prev = toCoord(pts[i - 1], i - 1);
    const curr = toCoord(pts[i], i);
    ctx.lineTo(curr.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
  }
  const last = toCoord(pts[pts.length - 1], pts.length - 1);
  ctx.lineTo(last.x, plotY + plotH);
  ctx.closePath();
  const areaGrad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
  areaGrad.addColorStop(0, palette.curveFillTop);
  areaGrad.addColorStop(1, palette.curveFillBottom);
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Step-after stroke
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const prev = toCoord(pts[i - 1], i - 1);
    const curr = toCoord(pts[i], i);
    ctx.lineTo(curr.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
  }
  ctx.strokeStyle = palette.curveLine;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Terminal dot
  ctx.beginPath();
  ctx.arc(last.x, last.y, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = palette.curveLine;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = palette.card;
  ctx.stroke();

  // Process footer strip inside chart box
  const stripText =
    options.locale === "id"
      ? `Menang ideal: ${summary.modelWins}   ·   Rugi terukur: ${summary.goodLosses}   ·   Hari tenang: ${summary.restDays}`
      : `Model wins: ${summary.modelWins}   ·   Good losses: ${summary.goodLosses}   ·   Rest days: ${summary.restDays}`;
  ctx.fillStyle = palette.muted;
  ctx.font = `600 12px ${sans}`;
  ctx.fillText(stripText, chartX + 26, chartY + chartH - 24);

  // Bottom Mantra / Reflection Quote + Privacy Stamp
  const cleanMantra = options.mantra.trim().slice(0, 110);
  if (cleanMantra) {
    ctx.fillStyle = palette.ink;
    ctx.font = `italic 400 18px ${serif}`;
    ctx.fillText(`“${cleanMantra}”`, 76, 542);
  }

  const stamp =
    options.privacyMode === "full"
      ? options.locale === "id"
        ? "bloom. · catatan realisasi pribadi"
        : "bloom. · personal realized journal"
      : options.locale === "id"
        ? "bloom. · kartu aman-privasi (nominal $ disembunyikan)"
        : "bloom. · privacy-safe recap ($ amounts hidden)";
  ctx.fillStyle = palette.soft;
  ctx.font = `600 11.5px ${sans}`;
  const stampW = ctx.measureText(stamp).width;
  ctx.fillText(stamp, W - 76 - stampW, 542);
}
