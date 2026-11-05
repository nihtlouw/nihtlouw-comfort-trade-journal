"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  ASSET_RUNG_IDS,
  BASELINE_SAVING_RATE_PCT,
  DEFAULT_ASSET_RETURNS_PCT,
  DEFAULT_EXIT_BOARD_STATE,
  formatRupiahJuta,
  getAssetComparisonRows,
  getAssetRungMeta,
  loadExitBoardState,
  MAX_WORKING_AGE,
  resolveComparisonEvalAge,
  saveExitBoardState,
  simulateExitBoard,
  TARGET_SAVING_RATE_PCT,
  type AssetRungId,
  type ComparisonHorizonMode,
  type ExitBoardState,
} from "@/lib/exit-board";
import type { AppLocale } from "@/lib/types";

const UI_COPY_BOARD = {
  id: {
    langGroupAria: "Bahasa simulasi HC vs FC",
    simTitle: "Parameter Simulasi",
    resetBtn: "Reset",
    incomeLabel: "Penghasilan / bulan",
    incomeInputAria: "Penghasilan bulanan dalam juta Rupiah",
    savingRateLabel: (saveText: string, capText: string) =>
      `Saving rate · Tabung ${saveText}/bln · Belanja ${capText}/bln`,
    preset25: "S 25%",
    preset50: "S 50%",
    preset80: "S 80%",
    startAgeLabel: "Usia mulai",
    ageYears: (age: number) => `${age} thn`,
    initialFcLabel: "Modal awal saat ini",
    assetLadderLabel: "Instrumen utama",
    returnPrefix: "Asumsi return:",
    returnSuffix: "% / thn",
    returnReset: "reset",
    returnInputAria: "Persentase asumsi return tahunan",

    // 4 Advisor KPI Cards
    kpiCrossLabel: (isCross: boolean) =>
      isCross ? "Usia Titik Silang (FC ≥ HC)" : "Proyeksi Usia Pensiun",
    kpiCrossVal: (age: number) => `Usia ${age}`,
    kpiCrossSub: (years: number, s: number, targetAge: number | null) =>
      s !== 80 && targetAge !== null
        ? `${years} thn menabung · Target S 80%: Usia ${targetAge}`
        : `${years} thn durasi akumulasi`,
    kpiPrincipalLabel: (age: number) => `Modal Pokok Disetor (s/d Usia ${age})`,
    kpiPrincipalSub: (initText: string, saveText: string, years: number) =>
      `Awal ${initText} + (${saveText}/bln × ${years} thn)`,
    kpiGainLabel: (asset: string, r: number) => `Keuntungan Compounding (${asset} ${r}%)`,
    kpiGainBadge: (pct: number, mult: number) => `+${pct}% (${mult}× modal)`,
    kpiGainSub: "Profit bersih murni di luar uang setoranmu",
    kpiTotalLabel: (age: number) => `Total Dana Terkumpul (Usia ${age})`,
    kpiTotalSub: (passiveMo: string, capMo: string) =>
      `Hasil pasif ±${passiveMo}/bln · Biaya hidup ${capMo}/bln`,

    // Chart 1
    chart1Title: "Grafik 1 · Peta Titik Silang (HC vs FC) & Modal vs Profit",
    legHc: "HC (Kapasitas Kerja)",
    legPrincipal: "Modal Pokok (0%)",
    legFcCur: (s: number) => `FC Pilihanmu (S ${s}%)`,
    legFc80: "FC Target (S 80%)",
    axisValue: "Nilai",
    pullLabel: "Tarik maju titik silang",
    chart1IdleFoot: (snowballAge: number | null, crossAge: number, gainText: string) =>
      snowballAge !== null
        ? `Bola salju mulai Usia ${snowballAge} (profit tahunan > setoran gaji) · Profit di Usia ${crossAge}: +${gainText}`
        : `Sentuh grafik untuk rincian per usia · Profit di Usia ${crossAge}: +${gainText}`,
    chart1HoverFoot: (age: number, principal: string, gain: string, total: string, hc: string) =>
      `Usia ${age} · Modal Pokok ${principal} + Profit ${gain} = Total FC ${total} (HC: ${hc})`,

    // Chart 2
    chart2Title: "Grafik 2 · Perbandingan Hasil di 5 Kelas Aset",
    horizonAria: "Horizon waktu perbandingan aset",
    horizons: {
      "10y": "10 Thn",
      "20y": "20 Thn",
      crossover: "Titik Silang",
      age60: "Usia 60",
    } as Record<ComparisonHorizonMode, string>,
    chart2Sub: (evalAge: number, years: number, principal: string) =>
      `Usia ${evalAge} (${years} thn) · Modal pokok disetor sama persis: ${principal}`,
    chart2HoverFoot: (age: number, asset: string, total: string, gain: string) =>
      `Usia ${age} · ${asset}: Total ${total} (Profit +${gain})`,
    colCrossAge: (age: number | null) => (age !== null ? `Silang ${age}` : `>74`),
    profitWord: "Profit",
    totalWord: "Total",

    // Milestones
    milestoneTitle: "Pertumbuhan Bertahap dari Modal Pokok ke Bola Salju",
    milestoneLabels: {
      early: "5 Tahun Pertama",
      mid: "Tahun ke-10",
      crossover: "Titik Silang",
      retirement: "Jangka Panjang",
    },
    milestonePrincipal: "Modal",
    milestoneProfit: "Profit",
    milestoneShare: (pct: number) => `${pct}% dari total adalah profit`,

    // Bottom Advisor Explanation + Real Case Analogy
    caseTag: "ANALOGI & STUDI KASUS NYATA",
    caseTitle: "Ibarat Pesawat Dua Mesin: Bagaimana Uang Mengambil Alih Kerjamu",
    caseAnalogyP1:
      "Bayangkan hidup finansialmu punya 2 mesin. Mesin 1 adalah Human Capital (HC): tenaga, waktu, dan skill kerjamu yang kuat di usia muda namun pasti menurun menuju nol di usia tua (±74). Mesin 2 adalah Financial Capital (FC): uang tabungan yang kamu tanam agar beranak-pinak sendiri lewat efek compounding.",
    caseBoxTitle: (inc: string, save: string, years: number, principal: string) =>
      `Studi Kasus Nyata dari Angkamu (Gaji ${inc}/bln · Sisihkan ${save}/bln selama ${years} thn → Modal Keringat Sama: ${principal}):`,
    caseBulletCash: (r: number, gain: string, total: string, cross: string) =>
      `1. Jika parkir di Cash/Deposito (${r}%/thn): Modal ${"pokokmu"} cuma bertambah profit +${gain} menjadi ${total}. Titik silang baru tercapai di ${cross}.`,
    caseBulletSelected: (asset: string, r: number, gain: string, total: string, cross: string) =>
      `2. Jika diputar di ${asset} (${r}%/thn — Pilihanmu): Dengan modal setoran yang sama persis, keuntungan murninya melonjak +${gain} menjadi ${total}, dan titik silang maju ke ${cross}.`,
    caseBulletTarget80: (cap80: string, age80: number, total80: string, gain80: string) =>
      `3. Jika mengunci biaya hidup di ${cap80}/bln (Target S 80%): Mesin 2 langsung menyalip Mesin 1 di Usia ${age80} dengan dana ${total80} (profit murni +${gain80}).`,

    schemeTag: "SKEMA CARA KERJA SIMULASI",
    schemeTitle: "4 Poin Inti yang Perlu Kamu Pegang",
    schemeItems: (snowballAge: number | null) => [
      {
        head: "1. Modal Pokok vs Keuntungan Compounding",
        body:
          snowballAge !== null
            ? `Garis abu-abu putus-putus adalah uang keringatmu sendiri (0%). Area di atasnya adalah murni keuntungan investasi. Pada skemamu, mulai Usia ${snowballAge} hasil profit tahunan aset sudah lebih besar dari setoran gajimu.`
            : "Garis abu-abu putus-putus adalah uang setoran pokokmu sendiri (0%). Seluruh selisih kurva di atasnya adalah keuntungan murni hasil gulungan bunga majemuk.",
      },
      {
        head: "2. Arti Titik Silang (FC ≥ HC)",
        body: "Kurva HC menghitung sisa nilai ekonomi masa kerjamu hingga usia 74 (diskon 4%/thn). Saat kurva FC memotong HC, hasil kerja asetmu sudah sanggup menutup biaya hidup tanpa paksaan menukar jam kerja.",
      },
      {
        head: "3. Efek Ganda Spending Cap = Income × (1 − S)",
        body: "Menaikkan saving rate (S) bekerja dua arah sekaligus: memperbesar peluru setoran bulanan ke Mesin 2 dan otomatis mengecilkan beban pengeluaran bulanan yang wajib ditanggung asetmu.",
      },
      {
        head: "4. Pemisahan Trading Aktif (HC) vs Kantong Aset (FC)",
        body: "Gaji bulanan maupun trading harian berstatus Human Capital (eksekusi skill). Pisahkan modal kerja trading dari kantong investasi FC jangka panjang agar fluktuasi harian tidak merusak gulungan modal utamamu.",
      },
    ],
  },
  en: {
    langGroupAria: "HC vs. FC simulation language",
    simTitle: "Simulation Parameters",
    resetBtn: "Reset",
    incomeLabel: "Monthly income",
    incomeInputAria: "Monthly income in million Rupiah",
    savingRateLabel: (saveText: string, capText: string) =>
      `Saving rate · Save ${saveText}/mo · Spend cap ${capText}/mo`,
    preset25: "S 25%",
    preset50: "S 50%",
    preset80: "S 80%",
    startAgeLabel: "Starting age",
    ageYears: (age: number) => `Age ${age}`,
    initialFcLabel: "Current initial capital",
    assetLadderLabel: "Primary asset class",
    returnPrefix: "Assumed return:",
    returnSuffix: "% / yr",
    returnReset: "reset",
    returnInputAria: "Assumed annual return percentage",

    // 4 Advisor KPI Cards
    kpiCrossLabel: (isCross: boolean) =>
      isCross ? "Crossover Age (FC ≥ HC)" : "Retirement Projection Age",
    kpiCrossVal: (age: number) => `Age ${age}`,
    kpiCrossSub: (years: number, s: number, targetAge: number | null) =>
      s !== 80 && targetAge !== null
        ? `${years} yrs saving · At S 80%: Age ${targetAge}`
        : `${years} yrs accumulation span`,
    kpiPrincipalLabel: (age: number) => `Out-of-Pocket Principal (by Age ${age})`,
    kpiPrincipalSub: (initText: string, saveText: string, years: number) =>
      `Start ${initText} + (${saveText}/mo × ${years} yrs)`,
    kpiGainLabel: (asset: string, r: number) => `Compounding Profit (${asset} ${r}%)`,
    kpiGainBadge: (pct: number, mult: number) => `+${pct}% (${mult}× principal)`,
    kpiGainSub: "Pure investment gain above your own deposits",
    kpiTotalLabel: (age: number) => `Total Portfolio Value (Age ${age})`,
    kpiTotalSub: (passiveMo: string, capMo: string) =>
      `Est. yield ±${passiveMo}/mo · Living cap ${capMo}/mo`,

    // Chart 1
    chart1Title: "Chart 1 · HC vs. FC Crossover & Principal vs. Profit",
    legHc: "HC (Earning Capacity)",
    legPrincipal: "Principal Paid (0%)",
    legFcCur: (s: number) => `Your FC (S ${s}%)`,
    legFc80: "Target FC (S 80%)",
    axisValue: "Value",
    pullLabel: "Pull crossover earlier",
    chart1IdleFoot: (snowballAge: number | null, crossAge: number, gainText: string) =>
      snowballAge !== null
        ? `Snowball inflection at Age ${snowballAge} (annual gain > annual deposit) · Profit at Age ${crossAge}: +${gainText}`
        : `Hover chart for age breakdown · Net profit at Age ${crossAge}: +${gainText}`,
    chart1HoverFoot: (age: number, principal: string, gain: string, total: string, hc: string) =>
      `Age ${age} · Principal ${principal} + Profit ${gain} = Total FC ${total} (HC: ${hc})`,

    // Chart 2
    chart2Title: "Chart 2 · Wealth Comparison Across 5 Asset Classes",
    horizonAria: "Asset comparison horizon",
    horizons: {
      "10y": "10 Yrs",
      "20y": "20 Yrs",
      crossover: "Crossover",
      age60: "Age 60",
    } as Record<ComparisonHorizonMode, string>,
    chart2Sub: (evalAge: number, years: number, principal: string) =>
      `At Age ${evalAge} (${years} yrs) · Exact same principal contributed: ${principal}`,
    chart2HoverFoot: (age: number, asset: string, total: string, gain: string) =>
      `Age ${age} · ${asset}: Total ${total} (Profit +${gain})`,
    colCrossAge: (age: number | null) => (age !== null ? `Cross ${age}` : `>74`),
    profitWord: "Profit",
    totalWord: "Total",

    // Milestones
    milestoneTitle: "Step-by-Step Capital Growth (From Sweat Deposits to Snowball)",
    milestoneLabels: {
      early: "Year 5",
      mid: "Year 10",
      crossover: "Crossover",
      retirement: "Long Term",
    },
    milestonePrincipal: "Principal",
    milestoneProfit: "Profit",
    milestoneShare: (pct: number) => `${pct}% of total comes from profit`,

    // Bottom Advisor Explanation + Real Case Analogy
    caseTag: "REAL-CASE ANALOGY & ADVISOR BRIEF",
    caseTitle: "The Twin-Engine Plane: How Capital Takes Over Your Labor",
    caseAnalogyP1:
      "Think of your finances as a twin-engine aircraft. Engine 1 is Human Capital (HC): your time, energy, and active skill—strong early on, but naturally winding down toward zero around age 74. Engine 2 is Financial Capital (FC): the savings you plant so compounding returns eventually outrun your paycheck.",
    caseBoxTitle: (inc: string, save: string, years: number, principal: string) =>
      `Real-World Case on Your Numbers (${inc}/mo income · Save ${save}/mo for ${years} yrs → Same Principal Paid: ${principal}):`,
    caseBulletCash: (r: number, gain: string, total: string, cross: string) =>
      `1. Parked in Cash/Deposits (${r}%/yr): Your deposits only add +${gain} in profit (total ${total}). Crossover waits until ${cross}.`,
    caseBulletSelected: (asset: string, r: number, gain: string, total: string, cross: string) =>
      `2. Compounded in ${asset} (${r}%/yr — Selected): On the exact same out-of-pocket deposits, pure profit jumps to +${gain} (total ${total}), pulling crossover to ${cross}.`,
    caseBulletTarget80: (cap80: string, age80: number, total80: string, gain80: string) =>
      `3. Locking a ${cap80}/mo Spending Cap (S 80% target): Engine 2 overtakes Engine 1 by Age ${age80} with ${total80} (+${gain80} net profit).`,

    schemeTag: "HOW THIS SIMULATION WORKS",
    schemeTitle: "4 Core Advisor Mechanics",
    schemeItems: (snowballAge: number | null) => [
      {
        head: "1. Out-of-Pocket Principal vs. Compounding Gain",
        body:
          snowballAge !== null
            ? `The dashed grey line is your raw cash deposits (0%). Everything above it is pure compounding profit. In your setup, starting at Age ${snowballAge} your portfolio earns more per year than you deposit from income.`
            : "The dashed grey line tracks your raw cash deposits (0%). Every Rupiah above that line is pure compounding profit working on your behalf.",
      },
      {
        head: "2. What the Crossover Point (FC ≥ HC) Means",
        body: "HC discounts your remaining career earnings through age 74 (at 4%/yr). Once FC crosses above HC, your productive assets outweigh remaining mandatory labor—work becomes optional.",
      },
      {
        head: "3. Dual Leverage of Spending Cap = Income × (1 − S)",
        body: "Raising your saving rate (S) works from both ends: it feeds larger monthly capital into Engine 2 while permanently lowering the monthly living cost your portfolio must cover.",
      },
      {
        head: "4. Active Trading (HC) vs. Long-Term Reserve (FC)",
        body: "Salary and day-to-day trading are both Human Capital (skill execution). Keep active trading capital strictly separated from your long-term FC compounding bucket.",
      },
    ],
  },
} as const;

export function ExitBoardView({ locale }: { locale: AppLocale }) {
  const simHeadingId = useId();

  const [state, setState] = useState<ExitBoardState>(() => ({
    ...DEFAULT_EXIT_BOARD_STATE,
    assetReturnsPct: { ...DEFAULT_ASSET_RETURNS_PCT },
  }));
  const [hydrated, setHydrated] = useState(false);
  const [hoverAge1, setHoverAge1] = useState<number | null>(null);
  const [hoverAge2, setHoverAge2] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const loaded = loadExitBoardState(typeof window !== "undefined" ? window.localStorage : null);
      setState(loaded);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    saveExitBoardState(window.localStorage, state);
  }, [hydrated, state]);

  const effectiveLocale: AppLocale = state.localeOverride ?? locale;
  const t = UI_COPY_BOARD[effectiveLocale];
  const horizonMode: ComparisonHorizonMode = state.horizonMode ?? "20y";

  const sim = useMemo(() => simulateExitBoard(state), [state]);
  const assetRungs = useMemo(() => getAssetRungMeta(effectiveLocale), [effectiveLocale]);
  const activeRungMeta = assetRungs.find((item) => item.id === state.selectedAsset) ?? assetRungs[3];

  const comparisonRows = useMemo(
    () => getAssetComparisonRows(sim, state.assetReturnsPct, horizonMode),
    [horizonMode, sim, state.assetReturnsPct],
  );
  const evalAge2 = useMemo(
    () => resolveComparisonEvalAge(sim, horizonMode),
    [horizonMode, sim],
  );

  // 20-year (or max available) concrete comparison for the Real Case story box
  const case20Rows = useMemo(
    () => getAssetComparisonRows(sim, state.assetReturnsPct, "20y"),
    [sim, state.assetReturnsPct],
  );
  const cashCase20 = case20Rows.find((r) => r.id === "cash") ?? case20Rows[0];
  const selectedCase20 = case20Rows.find((r) => r.id === state.selectedAsset) ?? case20Rows[3];

  function updateSimField(patch: Partial<ExitBoardState>) {
    setState((prev) => ({
      ...prev,
      ...patch,
    }));
  }

  function resetToExample() {
    setHoverAge1(null);
    setHoverAge2(null);
    setState((prev) => ({
      ...DEFAULT_EXIT_BOARD_STATE,
      localeOverride: prev.localeOverride,
      assetReturnsPct: { ...DEFAULT_ASSET_RETURNS_PCT },
    }));
  }

  // =========================================================
  // CHART 1 GEOMETRY (HC vs FC + Principal vs Profit)
  // =========================================================
  const cLeft = 46;
  const cRight = 532;
  const cTop = 24;
  const cBottom = 192;
  const cWidth = cRight - cLeft;
  const cHeight = cBottom - cTop;
  const ageSpan = Math.max(1, sim.endAge - sim.startAge);

  const chart1Geom = useMemo(() => {
    const projectX = (age: number) => cLeft + ((age - sim.startAge) / ageSpan) * cWidth;
    const hcCeiling = Math.max(sim.points[0]?.hcJuta ?? 1, sim.annualIncomeJuta * 6) * 1.06;
    const lastPt = sim.points[sim.points.length - 1];
    const peakFc = Math.max(
      hcCeiling * 1.5,
      lastPt?.fcTargetJuta ?? 0,
      lastPt?.fcCurrentJuta ?? 0,
    );
    const maxExcess = Math.max(1, (peakFc - hcCeiling) / hcCeiling);
    const linearShare = 0.62;
    const headroomShare = 1 - linearShare;
    const projectY = (valJuta: number) => {
      const safe = Math.max(0, valJuta);
      if (safe <= hcCeiling) {
        return cBottom - (safe / hcCeiling) * (cHeight * linearShare);
      }
      const excessRatio = (safe - hcCeiling) / hcCeiling;
      const softHeadroom = Math.min(1, Math.log1p(excessRatio) / Math.log1p(maxExcess * 1.12));
      return cBottom - cHeight * (linearShare + headroomShare * softHeadroom);
    };

    const hcPath = sim.points
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${projectX(pt.age).toFixed(1)} ${projectY(pt.hcJuta).toFixed(1)}`)
      .join(" ");
    const principalPath = sim.points
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${projectX(pt.age).toFixed(1)} ${projectY(pt.principalCurrentJuta).toFixed(1)}`)
      .join(" ");
    const fcCurPath = sim.points
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${projectX(pt.age).toFixed(1)} ${projectY(pt.fcCurrentJuta).toFixed(1)}`)
      .join(" ");
    const fcTgtPath = sim.points
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${projectX(pt.age).toFixed(1)} ${projectY(pt.fcTargetJuta).toFixed(1)}`)
      .join(" ");

    // Shaded profit area between FC Current and Out-of-Pocket Principal
    let profitAreaPath = "";
    if (sim.points.length >= 2) {
      const top = sim.points
        .map((pt, i) => `${i === 0 ? "M" : "L"} ${projectX(pt.age).toFixed(1)} ${projectY(pt.fcCurrentJuta).toFixed(1)}`)
        .join(" ");
      const bot = [...sim.points]
        .reverse()
        .map((pt) => `L ${projectX(pt.age).toFixed(1)} ${projectY(pt.principalCurrentJuta).toFixed(1)}`)
        .join(" ");
      profitAreaPath = `${top} ${bot} Z`;
    }

    return {
      xForAge: projectX,
      yForVal: projectY,
      hcPath,
      principalPath,
      fcCurPath,
      fcTgtPath,
      profitAreaPath,
    };
  }, [ageSpan, cBottom, cHeight, cLeft, cWidth, sim]);

  // =========================================================
  // CHART 2 GEOMETRY (Multi-Asset Growth Curves up to evalAge2)
  // =========================================================
  const chart2EndAge = Math.max(sim.startAge + 5, evalAge2);
  const chart2Span = Math.max(1, chart2EndAge - sim.startAge);

  const chart2Geom = useMemo(() => {
    const subPoints = sim.points.filter((p) => p.age <= chart2EndAge);
    const lastSub = subPoints[subPoints.length - 1] ?? sim.points[sim.points.length - 1];
    const maxAssetVal = Math.max(
      10,
      ...ASSET_RUNG_IDS.map((id) => lastSub.byAssetJuta[id]),
    );
    const c2Bottom = 152;
    const c2SpanY = 126;
    const projectX2 = (age: number) => cLeft + ((age - sim.startAge) / chart2Span) * cWidth;
    const projectY2 = (valJuta: number) => {
      const safe = Math.max(0, valJuta);
      const norm = Math.pow(safe / (maxAssetVal * 1.06), 0.68);
      return c2Bottom - Math.min(1, norm) * c2SpanY;
    };

    const principalPath2 = subPoints
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${projectX2(pt.age).toFixed(1)} ${projectY2(pt.principalCurrentJuta).toFixed(1)}`)
      .join(" ");

    const assetPaths: Record<AssetRungId, string> = {} as Record<AssetRungId, string>;
    const assetEndY: Record<AssetRungId, number> = {} as Record<AssetRungId, number>;
    for (const id of ASSET_RUNG_IDS) {
      assetPaths[id] = subPoints
        .map((pt, i) => `${i === 0 ? "M" : "L"} ${projectX2(pt.age).toFixed(1)} ${projectY2(pt.byAssetJuta[id]).toFixed(1)}`)
        .join(" ");
      assetEndY[id] = projectY2(lastSub.byAssetJuta[id]);
    }

    return {
      subPoints,
      lastSub,
      xForAge2: projectX2,
      yForVal2: projectY2,
      principalPath2,
      assetPaths,
      assetEndY,
    };
  }, [cLeft, cWidth, chart2EndAge, chart2Span, sim]);

  const showTargetCurveDistinct = state.savingRatePct !== TARGET_SAVING_RATE_PCT;
  const curCrossX =
    sim.currentCrossover.exactAge !== null ? chart1Geom.xForAge(sim.currentCrossover.exactAge) : null;
  const curCrossY =
    sim.currentCrossover.valueJuta !== null ? chart1Geom.yForVal(sim.currentCrossover.valueJuta) : null;
  const tgtCrossX =
    sim.target80Crossover.exactAge !== null ? chart1Geom.xForAge(sim.target80Crossover.exactAge) : null;
  const tgtCrossY =
    sim.target80Crossover.valueJuta !== null ? chart1Geom.yForVal(sim.target80Crossover.valueJuta) : null;

  const hoveredPt1 = useMemo(
    () => (hoverAge1 !== null ? sim.points.find((p) => p.age === hoverAge1) ?? null : null),
    [hoverAge1, sim.points],
  );
  const hoveredPt2 = useMemo(
    () => (hoverAge2 !== null ? chart2Geom.subPoints.find((p) => p.age === hoverAge2) ?? null : null),
    [chart2Geom.subPoints, hoverAge2],
  );

  function scrubChart1(clientX: number, rect: DOMRect) {
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * 560;
    const ratio = Math.min(1, Math.max(0, (svgX - cLeft) / cWidth));
    setHoverAge1(Math.round(sim.startAge + ratio * ageSpan));
  }

  function scrubChart2(clientX: number, rect: DOMRect) {
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * 560;
    const ratio = Math.min(1, Math.max(0, (svgX - cLeft) / cWidth));
    setHoverAge2(Math.round(sim.startAge + ratio * chart2Span));
  }

  const incFormatted = formatRupiahJuta(sim.monthlyIncomeJuta, effectiveLocale);
  const saveFormatted = formatRupiahJuta(sim.monthlySavingJuta, effectiveLocale);
  const capCurFormatted = formatRupiahJuta(sim.monthlySpendingCapCurrentJuta, effectiveLocale);
  const cap80Formatted = formatRupiahJuta(sim.monthlySpendingCapTarget80Juta, effectiveLocale);
  const initFcFormatted = formatRupiahJuta(sim.initialFcJuta, effectiveLocale);
  const defaultRungReturn = DEFAULT_ASSET_RETURNS_PCT[state.selectedAsset];

  const snap = sim.primarySnapshot;
  const maxComparisonTotal = Math.max(1, ...comparisonRows.map((r) => r.totalJuta));

  const cashCrossLabel =
    sim.assetCrossovers.cash.displayAge !== null
      ? effectiveLocale === "en"
        ? `Age ${sim.assetCrossovers.cash.displayAge}`
        : `Usia ${sim.assetCrossovers.cash.displayAge}`
      : effectiveLocale === "en"
        ? `beyond Age ${MAX_WORKING_AGE}`
        : `di atas Usia ${MAX_WORKING_AGE}`;

  const selCrossLabel =
    sim.currentCrossover.displayAge !== null
      ? effectiveLocale === "en"
        ? `Age ${sim.currentCrossover.displayAge}`
        : `Usia ${sim.currentCrossover.displayAge}`
      : effectiveLocale === "en"
        ? `beyond Age ${MAX_WORKING_AGE}`
        : `di atas Usia ${MAX_WORKING_AGE}`;

  return (
    <div className="view-stack exit-board-view">
      {/* =========================================================
          ROW 1: SIMULATOR CONTROLS + 4 ADVISOR WEALTH KPI CARDS
          ========================================================= */}
      <section className="card exit-sim-card" aria-labelledby={simHeadingId}>
        <div className="exit-top-grid">
          <div className="exit-sim-controls">
            <div className="exit-sim-head">
              <h2 id={simHeadingId}>{t.simTitle}</h2>
              <div className="exit-narasi-tools">
                <button type="button" className="exit-reset-btn" onClick={resetToExample}>
                  <RotateCcw size={12} /> {t.resetBtn}
                </button>
                <div className="segment-control exit-lang-mini" role="group" aria-label={t.langGroupAria}>
                  <button
                    type="button"
                    className={effectiveLocale === "id" ? "selected" : ""}
                    aria-pressed={effectiveLocale === "id"}
                    onClick={() => updateSimField({ localeOverride: "id" })}
                  >
                    ID
                  </button>
                  <button
                    type="button"
                    className={effectiveLocale === "en" ? "selected" : ""}
                    aria-pressed={effectiveLocale === "en"}
                    onClick={() => updateSimField({ localeOverride: "en" })}
                  >
                    EN
                  </button>
                </div>
              </div>
            </div>

            {/* 1. Monthly Income */}
            <div className="exit-control-block">
              <div className="exit-control-label-row">
                <label htmlFor="exit-income-range">{t.incomeLabel}</label>
                <div className="exit-inline-num-wrap">
                  <span>Rp</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    aria-label={t.incomeInputAria}
                    value={state.monthlyIncomeJuta}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val) && val > 0) {
                        updateSimField({ monthlyIncomeJuta: Math.min(500, Math.max(1, val)) });
                      }
                    }}
                  />
                  <span>jt</span>
                </div>
              </div>
              <input
                id="exit-income-range"
                type="range"
                className="exit-range"
                min={2}
                max={150}
                step={1}
                value={Math.min(150, Math.max(2, state.monthlyIncomeJuta))}
                onChange={(e) => updateSimField({ monthlyIncomeJuta: Number(e.target.value) })}
              />
            </div>

            {/* 2. Saving Rate */}
            <div className="exit-control-block">
              <div className="exit-control-label-row">
                <label htmlFor="exit-saving-range">
                  {t.savingRateLabel(saveFormatted, capCurFormatted)}
                </label>
                <strong>{sim.savingRatePct}%</strong>
              </div>
              <input
                id="exit-saving-range"
                type="range"
                className="exit-range"
                min={5}
                max={90}
                step={1}
                value={state.savingRatePct}
                onChange={(e) => updateSimField({ savingRatePct: Number(e.target.value) })}
              />
              <div className="exit-preset-row">
                <button
                  type="button"
                  className={`exit-preset-pill ${state.savingRatePct === BASELINE_SAVING_RATE_PCT ? "active" : ""}`}
                  aria-pressed={state.savingRatePct === BASELINE_SAVING_RATE_PCT}
                  onClick={() => updateSimField({ savingRatePct: BASELINE_SAVING_RATE_PCT })}
                >
                  {t.preset25}
                </button>
                <button
                  type="button"
                  className={`exit-preset-pill ${state.savingRatePct === 50 ? "active" : ""}`}
                  aria-pressed={state.savingRatePct === 50}
                  onClick={() => updateSimField({ savingRatePct: 50 })}
                >
                  {t.preset50}
                </button>
                <button
                  type="button"
                  className={`exit-preset-pill ${state.savingRatePct === TARGET_SAVING_RATE_PCT ? "active" : ""}`}
                  aria-pressed={state.savingRatePct === TARGET_SAVING_RATE_PCT}
                  onClick={() => updateSimField({ savingRatePct: TARGET_SAVING_RATE_PCT })}
                >
                  {t.preset80}
                </button>
              </div>
            </div>

            {/* 3. Starting Age & Initial Capital */}
            <div className="exit-dual-sliders">
              <div className="exit-control-block">
                <div className="exit-control-label-row">
                  <label htmlFor="exit-age-range">{t.startAgeLabel}</label>
                  <strong>{t.ageYears(sim.startAge)}</strong>
                </div>
                <input
                  id="exit-age-range"
                  type="range"
                  className="exit-range"
                  min={18}
                  max={60}
                  step={1}
                  value={state.startAge}
                  onChange={(e) => updateSimField({ startAge: Number(e.target.value) })}
                />
              </div>

              <div className="exit-control-block">
                <div className="exit-control-label-row">
                  <label htmlFor="exit-initfc-range">{t.initialFcLabel}</label>
                  <strong>{initFcFormatted}</strong>
                </div>
                <input
                  id="exit-initfc-range"
                  type="range"
                  className="exit-range"
                  min={0}
                  max={1000}
                  step={10}
                  value={Math.min(1000, state.initialFcJuta)}
                  onChange={(e) => updateSimField({ initialFcJuta: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* 4. Asset Class Selector + Editable Return */}
            <div className="exit-control-block exit-ladder-block">
              <span className="exit-sub-label">{t.assetLadderLabel}</span>
              <div className="exit-asset-pills" role="radiogroup" aria-label={t.assetLadderLabel}>
                {assetRungs.map((rung) => {
                  const selected = rung.id === state.selectedAsset;
                  return (
                    <button
                      key={rung.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`exit-asset-pill ${selected ? "selected" : ""}`}
                      onClick={() => updateSimField({ selectedAsset: rung.id as AssetRungId })}
                    >
                      {rung.short}
                    </button>
                  );
                })}
              </div>

              <div className="exit-return-editor">
                <span>{t.returnPrefix}</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  aria-label={t.returnInputAria}
                  value={sim.annualReturnPct}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 0) {
                      updateSimField({
                        assetReturnsPct: {
                          ...state.assetReturnsPct,
                          [state.selectedAsset]: Math.min(50, Math.max(0, val)),
                        },
                      });
                    }
                  }}
                />
                <span>{t.returnSuffix}</span>
                {sim.annualReturnPct !== defaultRungReturn && (
                  <button
                    type="button"
                    className="exit-inline-reset"
                    onClick={() =>
                      updateSimField({
                        assetReturnsPct: {
                          ...state.assetReturnsPct,
                          [state.selectedAsset]: defaultRungReturn,
                        },
                      })
                    }
                  >
                    ({t.returnReset})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: 2x2 Financial Advisor Wealth Breakdown Cards */}
          <div className="exit-advisor-kpis">
            <div className="exit-res-card">
              <small>{t.kpiCrossLabel(snap.isCrossover)}</small>
              <strong>{t.kpiCrossVal(snap.age)}</strong>
              <span>
                {t.kpiCrossSub(
                  snap.yearsElapsed,
                  sim.savingRatePct,
                  sim.target80Crossover.displayAge,
                )}
              </span>
            </div>

            <div className="exit-res-card">
              <small>{t.kpiPrincipalLabel(snap.age)}</small>
              <strong>{formatRupiahJuta(snap.principalJuta, effectiveLocale)}</strong>
              <span>{t.kpiPrincipalSub(initFcFormatted, saveFormatted, snap.yearsElapsed)}</span>
            </div>

            <div className="exit-res-card highlight">
              <div className="exit-res-top-line">
                <small>{t.kpiGainLabel(activeRungMeta.short, sim.annualReturnPct)}</small>
                <em className="exit-gain-chip">{t.kpiGainBadge(snap.gainPct, snap.multiple)}</em>
              </div>
              <strong className="exit-profit-num">
                +{formatRupiahJuta(snap.gainJuta, effectiveLocale)}
              </strong>
              <span>{t.kpiGainSub}</span>
            </div>

            <div className="exit-res-card">
              <small>{t.kpiTotalLabel(snap.age)}</small>
              <strong>{formatRupiahJuta(snap.totalJuta, effectiveLocale)}</strong>
              <span>
                {t.kpiTotalSub(
                  formatRupiahJuta(snap.monthlyPassiveJuta, effectiveLocale),
                  capCurFormatted,
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          ROW 2: TWO COMPLETE CHARTS SIDE-BY-SIDE (NO STEP-BY-STEP)
          ========================================================= */}
      <div className="exit-dual-charts">
        {/* CHART 1: HC vs FC + Principal vs Profit */}
        <section className="exit-chalkboard" aria-label={t.chart1Title}>
          <div className="exit-chalk-head">
            <strong>{t.chart1Title}</strong>
            <div className="exit-chalk-legend">
              <span>
                <i className="exit-leg-swatch hc" />
                {t.legHc}
              </span>
              <span>
                <i className="exit-leg-swatch principal" />
                {t.legPrincipal}
              </span>
              <span>
                <i className="exit-leg-swatch fc-cur" />
                {t.legFcCur(sim.savingRatePct)}
              </span>
              {showTargetCurveDistinct && (
                <span>
                  <i className="exit-leg-swatch fc-tgt" />
                  {t.legFc80}
                </span>
              )}
            </div>
          </div>

          <div className="exit-chalk-svg-wrap">
            <svg
              viewBox="0 0 560 236"
              className="exit-chalk-svg"
              role="img"
              aria-label={t.chart1Title}
              onMouseMove={(e) => scrubChart1(e.clientX, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => setHoverAge1(null)}
              onClick={(e) => scrubChart1(e.clientX, e.currentTarget.getBoundingClientRect())}
            >
              <defs>
                <linearGradient id="exitProfitZone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8cc0e8" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#8cc0e8" stopOpacity="0.03" />
                </linearGradient>
              </defs>

              <line x1={cLeft} y1={76} x2={cRight} y2={76} stroke="rgba(189, 214, 195, 0.10)" strokeDasharray="3 5" />
              <line x1={cLeft} y1={134} x2={cRight} y2={134} stroke="rgba(189, 214, 195, 0.10)" strokeDasharray="3 5" />

              <line x1={cLeft} y1={cTop - 4} x2={cLeft} y2={cBottom} stroke="#bfd6c4" strokeWidth="1.6" />
              <line x1={cLeft} y1={cBottom} x2={cRight + 6} y2={cBottom} stroke="#bfd6c4" strokeWidth="1.6" />
              <text x={cLeft + 7} y={cTop + 5} fill="#adc8b3" fontSize="10" fontWeight="600">
                {t.axisValue}
              </text>

              {/* Shaded Compounding Profit Area (FC Current minus Out-of-Pocket Principal) */}
              {chart1Geom.profitAreaPath && (
                <path d={chart1Geom.profitAreaPath} fill="url(#exitProfitZone)" />
              )}

              {/* Out-of-Pocket Principal (0% growth) */}
              <path
                d={chart1Geom.principalPath}
                fill="none"
                stroke="#9eb5a6"
                strokeWidth="1.8"
                strokeDasharray="4 4"
              />

              {/* HC Curve */}
              <path
                d={chart1Geom.hcPath}
                fill="none"
                stroke="#eb9c86"
                strokeWidth="2.9"
                strokeLinecap="round"
              />
              <text
                x={cLeft + 7}
                y={Math.max(cTop + 20, chart1Geom.yForVal(sim.points[0]?.hcJuta ?? 0) - 7)}
                fill="#f2aa96"
                fontSize="11.5"
                fontWeight="800"
              >
                HC
              </text>

              {/* FC Current Curve */}
              <path
                d={chart1Geom.fcCurPath}
                fill="none"
                stroke="#8cc0e8"
                strokeWidth="2.9"
                strokeLinecap="round"
              />
              <text
                x={cRight - 20}
                y={Math.min(cBottom - 10, chart1Geom.yForVal(sim.points[sim.points.length - 1]?.fcCurrentJuta ?? 0) + 15)}
                fill="#9bcbf0"
                fontSize="11"
                fontWeight="800"
              >
                FC
              </text>

              {/* FC Target S=80% Curve */}
              {showTargetCurveDistinct && (
                <path
                  d={chart1Geom.fcTgtPath}
                  fill="none"
                  stroke="#8fe5aa"
                  strokeWidth="2.5"
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                />
              )}

              {/* Current Crossover Marker */}
              {curCrossX !== null && curCrossY !== null && sim.currentCrossover.displayAge !== null && (
                <g>
                  <line x1={curCrossX} y1={curCrossY} x2={curCrossX} y2={cBottom} stroke="#8cc0e8" strokeWidth="1.3" strokeDasharray="3 3" />
                  <circle cx={curCrossX} cy={curCrossY} r="5.5" fill="#edd88b" stroke="#1b2f22" strokeWidth="1.5" />
                  <g transform={`translate(${curCrossX.toFixed(1)}, 206)`}>
                    <circle r="10.5" fill="#1e3847" stroke="#8cc0e8" strokeWidth="1.3" />
                    <text textAnchor="middle" y="3.5" fill="#e6f4ff" fontSize="9.5" fontWeight="800">
                      {sim.currentCrossover.displayAge}
                    </text>
                  </g>
                </g>
              )}

              {/* Target 80% Crossover Marker */}
              {showTargetCurveDistinct &&
                tgtCrossX !== null &&
                tgtCrossY !== null &&
                sim.target80Crossover.displayAge !== null &&
                (sim.currentCrossover.displayAge === null ||
                  Math.abs(sim.currentCrossover.displayAge - sim.target80Crossover.displayAge) >= 3) && (
                  <g>
                    <line x1={tgtCrossX} y1={tgtCrossY} x2={tgtCrossX} y2={cBottom} stroke="#8fe5aa" strokeWidth="1.3" strokeDasharray="3 3" />
                    <circle cx={tgtCrossX} cy={tgtCrossY} r="5.5" fill="#8fe5aa" stroke="#1b2f22" strokeWidth="1.5" />
                    <g transform={`translate(${tgtCrossX.toFixed(1)}, 206)`}>
                      <circle r="10.5" fill="#2c5c3e" stroke="#8fe5aa" strokeWidth="1.4" />
                      <text textAnchor="middle" y="3.5" fill="#ffffff" fontSize="9.5" fontWeight="800">
                        {sim.target80Crossover.displayAge}
                      </text>
                    </g>
                  </g>
                )}

              {/* Pull-back arrow when S < 80% */}
              {showTargetCurveDistinct &&
                curCrossX !== null &&
                tgtCrossX !== null &&
                curCrossX - tgtCrossX > 36 && (
                  <g>
                    <line x1={curCrossX - 14} y1={224} x2={tgtCrossX + 15} y2={224} stroke="#edd88b" strokeWidth="1.7" />
                    <polygon
                      points={`${(tgtCrossX + 13).toFixed(1)},224 ${(tgtCrossX + 20).toFixed(1)},220.5 ${(tgtCrossX + 20).toFixed(1)},227.5`}
                      fill="#edd88b"
                    />
                    <text
                      x={((curCrossX + tgtCrossX) / 2).toFixed(1)}
                      y={233}
                      textAnchor="middle"
                      fill="#edd88b"
                      fontSize="9"
                      fontWeight="700"
                    >
                      {t.pullLabel}
                    </text>
                  </g>
                )}

              {/* Hover Scrubber */}
              {hoveredPt1 && (
                <g>
                  <line
                    x1={chart1Geom.xForAge(hoveredPt1.age)}
                    y1={cTop}
                    x2={chart1Geom.xForAge(hoveredPt1.age)}
                    y2={cBottom}
                    stroke="rgba(255,255,255,0.48)"
                    strokeWidth="1.2"
                    strokeDasharray="2 3"
                  />
                  <circle cx={chart1Geom.xForAge(hoveredPt1.age)} cy={chart1Geom.yForVal(hoveredPt1.fcCurrentJuta)} r="4.5" fill="#8cc0e8" />
                  <circle cx={chart1Geom.xForAge(hoveredPt1.age)} cy={chart1Geom.yForVal(hoveredPt1.principalCurrentJuta)} r="3.5" fill="#cbd8cf" />
                </g>
              )}

              <g transform={`translate(${cLeft}, 206)`}>
                <circle r="10.5" fill="#1b2f22" stroke="#9ec7a8" strokeWidth="1.3" />
                <text textAnchor="middle" y="3.5" fill="#ebf7ee" fontSize="9.5" fontWeight="700">
                  {sim.startAge}
                </text>
              </g>
              <text x={cRight - 6} y={209} textAnchor="middle" fill="#adc8b3" fontSize="10" fontWeight="700">
                {sim.endAge}
              </text>
            </svg>
          </div>

          <div className="exit-chalk-strip">
            <div>
              <small>{t.legPrincipal}</small>
              <strong>{formatRupiahJuta(snap.principalJuta, effectiveLocale)}</strong>
            </div>
            <div className="is-profit">
              <small>{effectiveLocale === "en" ? "Blue Profit Zone" : "Zona Profit Biru"}</small>
              <strong>+{formatRupiahJuta(snap.gainJuta, effectiveLocale)} (+{snap.gainPct}%)</strong>
            </div>
            <div>
              <small>{effectiveLocale === "en" ? "Snowball Starts" : "Mulai Bola Salju"}</small>
              <strong>
                {sim.snowballAge !== null
                  ? effectiveLocale === "en"
                    ? `Age ${sim.snowballAge}`
                    : `Usia ${sim.snowballAge}`
                  : "—"}
              </strong>
            </div>
          </div>

          <div className="exit-chalk-foot" aria-live="polite">
            {hoveredPt1
              ? t.chart1HoverFoot(
                  hoveredPt1.age,
                  formatRupiahJuta(hoveredPt1.principalCurrentJuta, effectiveLocale),
                  `+${formatRupiahJuta(hoveredPt1.gainCurrentJuta, effectiveLocale)}`,
                  formatRupiahJuta(hoveredPt1.fcCurrentJuta, effectiveLocale),
                  formatRupiahJuta(hoveredPt1.hcJuta, effectiveLocale),
                )
              : t.chart1IdleFoot(
                  sim.snowballAge,
                  snap.age,
                  formatRupiahJuta(snap.gainJuta, effectiveLocale),
                )}
          </div>
        </section>

        {/* CHART 2: Multi-Asset Wealth Comparison (All 5 Asset Classes) */}
        <section className="card exit-comp-card" aria-label={t.chart2Title}>
          <div className="exit-comp-head">
            <div>
              <h3>{t.chart2Title}</h3>
              <p>
                {t.chart2Sub(
                  evalAge2,
                  Math.max(0, evalAge2 - sim.startAge),
                  formatRupiahJuta(comparisonRows[0]?.principalJuta ?? 0, effectiveLocale),
                )}
              </p>
            </div>
            <div className="segment-control exit-horizon-switch" role="group" aria-label={t.horizonAria}>
              {(["10y", "20y", "crossover", "age60"] as ComparisonHorizonMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={horizonMode === mode ? "selected" : ""}
                  aria-pressed={horizonMode === mode}
                  onClick={() => updateSimField({ horizonMode: mode })}
                >
                  {t.horizons[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-Line Comparative SVG */}
          <div className="exit-comp-chart-box">
            <svg
              viewBox="0 0 560 176"
              className="exit-chalk-svg"
              role="img"
              aria-label={t.chart2Title}
              onMouseMove={(e) => scrubChart2(e.clientX, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => setHoverAge2(null)}
              onClick={(e) => scrubChart2(e.clientX, e.currentTarget.getBoundingClientRect())}
            >
              <line x1={cLeft} y1={62} x2={cRight} y2={62} stroke="rgba(189, 214, 195, 0.10)" strokeDasharray="3 5" />
              <line x1={cLeft} y1={107} x2={cRight} y2={107} stroke="rgba(189, 214, 195, 0.10)" strokeDasharray="3 5" />
              <line x1={cLeft} y1={20} x2={cLeft} y2={152} stroke="#bfd6c4" strokeWidth="1.4" />
              <line x1={cLeft} y1={152} x2={cRight + 6} y2={152} stroke="#bfd6c4" strokeWidth="1.4" />

              {/* Principal 0% dashed baseline */}
              <path
                d={chart2Geom.principalPath2}
                fill="none"
                stroke="rgba(186, 206, 192, 0.65)"
                strokeWidth="1.6"
                strokeDasharray="4 4"
              />

              {/* All 5 Asset Curves */}
              {assetRungs.map((rung) => {
                const isSelected = rung.id === state.selectedAsset;
                const lastSub = chart2Geom.lastSub;
                const endY = chart2Geom.assetEndY[rung.id] ?? 152;

                return (
                  <g key={rung.id} opacity={isSelected ? 1 : 0.66}>
                    <path
                      d={chart2Geom.assetPaths[rung.id]}
                      fill="none"
                      stroke={rung.color}
                      strokeWidth={isSelected ? "3.2" : "1.8"}
                      strokeLinecap="round"
                    />
                    {lastSub && (
                      <circle
                        cx={chart2Geom.xForAge2(lastSub.age)}
                        cy={endY}
                        r={isSelected ? "4.8" : "3"}
                        fill={rung.color}
                      />
                    )}
                  </g>
                );
              })}

              {hoveredPt2 && (
                <line
                  x1={chart2Geom.xForAge2(hoveredPt2.age)}
                  y1={20}
                  x2={chart2Geom.xForAge2(hoveredPt2.age)}
                  y2={152}
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth="1.1"
                  strokeDasharray="2 3"
                />
              )}

              <text x={cLeft} y={168} textAnchor="middle" fill="#b8d1be" fontSize="9.5" fontWeight="700">
                {sim.startAge}
              </text>
              <text x={cRight} y={168} textAnchor="middle" fill="#edd88b" fontSize="9.5" fontWeight="800">
                {chart2EndAge}
              </text>
            </svg>

            {hoveredPt2 && (
              <div className="exit-comp-hover-pill">
                {t.chart2HoverFoot(
                  hoveredPt2.age,
                  activeRungMeta.short,
                  formatRupiahJuta(hoveredPt2.byAssetJuta[state.selectedAsset], effectiveLocale),
                  formatRupiahJuta(
                    Math.max(0, hoveredPt2.byAssetJuta[state.selectedAsset] - hoveredPt2.principalCurrentJuta),
                    effectiveLocale,
                  ),
                )}
              </div>
            )}
          </div>

          {/* Interactive 5-Asset Comparison Rows (Principal vs Net Gain vs Total) */}
          <div className="exit-comp-rows">
            {comparisonRows.map((row) => {
              const meta = assetRungs.find((m) => m.id === row.id) ?? assetRungs[0];
              const isSelected = row.id === state.selectedAsset;
              const principalWidthPct = Math.max(3, (row.principalJuta / maxComparisonTotal) * 100);
              const gainWidthPct = Math.max(1, (row.gainJuta / maxComparisonTotal) * 100);

              return (
                <button
                  key={row.id}
                  type="button"
                  className={`exit-comp-row ${isSelected ? "selected" : ""}`}
                  onClick={() => updateSimField({ selectedAsset: row.id })}
                >
                  <div className="exit-comp-row-top">
                    <span className="exit-comp-asset-name">
                      <i style={{ background: meta.color }} />
                      <strong>{meta.short}</strong>
                      <small>{row.returnPct}%/thn</small>
                    </span>
                    <span className="exit-comp-numbers">
                      <em className="gain">
                        {t.profitWord} +{formatRupiahJuta(row.gainJuta, effectiveLocale)}
                      </em>
                      <b>
                        {t.totalWord} {formatRupiahJuta(row.totalJuta, effectiveLocale)}
                      </b>
                      <small className="cross-tag">{t.colCrossAge(row.crossoverAge)}</small>
                    </span>
                  </div>
                  <div className="exit-comp-bar-track" aria-hidden="true">
                    <span className="principal-seg" style={{ width: `${principalWidthPct}%` }} />
                    <span
                      className="gain-seg"
                      style={{ width: `${gainWidthPct}%`, background: meta.color }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* =========================================================
          ROW 3: 4 MILESTONES — HOW PRINCIPAL TURNS INTO A SNOWBALL
          ========================================================= */}
      <section className="card exit-milestones-card">
        <h3>{t.milestoneTitle}</h3>
        <div className="exit-milestones-grid">
          {sim.milestones.map((ms) => {
            const principalPct = ms.totalJuta > 0 ? Math.max(6, 100 - ms.profitSharePct) : 100;
            return (
              <div key={ms.id} className={`exit-ms-box ${ms.id === "crossover" ? "is-cross" : ""}`}>
                <div className="exit-ms-head">
                  <span>{t.milestoneLabels[ms.id]}</span>
                  <b>{effectiveLocale === "en" ? `Age ${ms.age}` : `Usia ${ms.age}`}</b>
                </div>
                <strong className="exit-ms-total">
                  {formatRupiahJuta(ms.totalJuta, effectiveLocale)}
                </strong>
                <div className="exit-ms-split">
                  <span>
                    {t.milestonePrincipal}: {formatRupiahJuta(ms.principalJuta, effectiveLocale)}
                  </span>
                  <em className="ms-gain">
                    +{formatRupiahJuta(ms.gainJuta, effectiveLocale)}
                  </em>
                </div>
                <div className="exit-ms-bar" aria-hidden="true">
                  <i className="ms-p" style={{ width: `${principalPct}%` }} />
                  <i className="ms-g" style={{ width: `${100 - principalPct}%` }} />
                </div>
                <small>{t.milestoneShare(ms.profitSharePct)}</small>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================
          ROW 4: ADVISOR REAL-CASE ANALOGY & TO-THE-POINT SCHEME
          ========================================================= */}
      <div className="exit-advisor-notes-grid">
        <section className="card exit-advisor-card">
          <span className="exit-adv-tag">{t.caseTag}</span>
          <h3>{t.caseTitle}</h3>
          <p className="exit-adv-lead">{t.caseAnalogyP1}</p>

          <div className="exit-realcase-box">
            <strong>
              {t.caseBoxTitle(
                incFormatted,
                saveFormatted,
                selectedCase20.evalYears,
                formatRupiahJuta(selectedCase20.principalJuta, effectiveLocale),
              )}
            </strong>
            <ul>
              <li>
                {t.caseBulletCash(
                  cashCase20.returnPct,
                  formatRupiahJuta(cashCase20.gainJuta, effectiveLocale),
                  formatRupiahJuta(cashCase20.totalJuta, effectiveLocale),
                  cashCrossLabel,
                )}
              </li>
              <li className="active-case">
                {t.caseBulletSelected(
                  activeRungMeta.short,
                  selectedCase20.returnPct,
                  formatRupiahJuta(selectedCase20.gainJuta, effectiveLocale),
                  formatRupiahJuta(selectedCase20.totalJuta, effectiveLocale),
                  selCrossLabel,
                )}
              </li>
              <li>
                {t.caseBulletTarget80(
                  cap80Formatted,
                  sim.target80Snapshot.age,
                  formatRupiahJuta(sim.target80Snapshot.totalJuta, effectiveLocale),
                  formatRupiahJuta(sim.target80Snapshot.gainJuta, effectiveLocale),
                )}
              </li>
            </ul>
          </div>
        </section>

        <section className="card exit-advisor-card">
          <span className="exit-adv-tag">{t.schemeTag}</span>
          <h3>{t.schemeTitle}</h3>
          <div className="exit-scheme-list">
            {t.schemeItems(sim.snowballAge).map((item) => (
              <div key={item.head} className="exit-scheme-item">
                <strong>{item.head}</strong>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
