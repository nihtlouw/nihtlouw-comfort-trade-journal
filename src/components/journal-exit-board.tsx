"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import {
  BASELINE_SAVING_RATE_PCT,
  DEFAULT_ASSET_RETURNS_PCT,
  DEFAULT_EXIT_BOARD_STATE,
  formatRupiahJuta,
  getAssetRungMeta,
  getExitBoardSteps,
  loadExitBoardState,
  MAX_WORKING_AGE,
  saveExitBoardState,
  simulateExitBoard,
  TARGET_SAVING_RATE_PCT,
  type AssetRungId,
  type ExitBoardState,
  type ExitBoardTone,
  type ExitBoardVoiceMode,
} from "@/lib/exit-board";
import type { AppLocale } from "@/lib/types";

type VoiceMode = ExitBoardVoiceMode;

const UI_STRINGS = {
  id: {
    eyebrow: "papan tulis jalan keluar",
    heroTitle: "Satu gambar besar untuk uangmu",
    heroSub: "Ikuti materi papan tulisnya langkah demi langkah, lalu simulasikan angkamu sendiri di bawah.",
    voiceGroupAria: "Pilihan bahasa dan nada sapaan materi",
    boardTitle: "human capital dan financial capital",
    legendHc: "HC: kapasitas kerja",
    legendFcCurrent: (s: number) => `FC dengan S ${s}%`,
    legendFcTarget: "FC dengan S 80%",
    axisMoney: "nilai uang",
    axisPullBack: "tarik mundur titik silang",
    hoverHint: "Arahkan atau sentuh grafik untuk melihat nilai per umur",
    hoverReadout: (age: number, hc: string, fcCur: string, fc80: string, s: number) =>
      `Umur ${age} · HC ${hc} · FC (S ${s}%) ${fcCur} · FC (S 80%) ${fc80}`,
    stepCounter: (step: number) => `langkah ${step} dari 8`,
    stepDotAria: (step: number) => `Buka langkah ${step} dari 8`,
    replayStart: "ulang dari awal",
    prevBtn: "sebelumnya",
    nextBtn: "berikutnya",
    focusSimBtn: "atur angkamu",
    skipBtn: "lewati narasi",
    simTitle: "Atur angkamu",
    resetDefault: "Contoh awal",
    incomeLabel: "total income per bulan",
    incomeInputAria: "Nominal income per bulan dalam juta Rupiah",
    savingRateLabel: (s: number, saveText: string, incText: string) =>
      `saving rate (S) · S = ${saveText} ÷ ${incText} = ${s}%`,
    preset25: "25% contoh papan tulis",
    preset80: "80% target",
    startAgeLabel: "umur mulai",
    ageYears: (age: number) => `${age} tahun`,
    initialFcLabel: "modal FC awal (opsional)",
    assetLadderLabel: "posisi di tangga aset",
    returnPrefix: "return asumsi",
    returnSuffix: "% per tahun, bisa diubah langsung",
    returnReset: "reset %",
    returnInputAria: "Persentase asumsi return tahunan",
    resCurrentLabel: "titik silang saat ini",
    resCurrentAge: (age: number | null) => (age !== null ? `umur ${age}` : `belum tercapai s/d ${MAX_WORKING_AGE}`),
    resCurrentSub: (s: number, saveText: string, asset: string, r: number) =>
      `dengan S ${s}% (${saveText}/bln) di ${asset} ${r}%/thn`,
    resTargetLabel: "titik silang dengan target",
    resTargetSub: (asset: string, r: number, savedYears: number | null) =>
      savedYears !== null && savedYears > 0
        ? `dengan S 80% di ${asset} ${r}%/thn · maju ${savedYears} tahun`
        : `dengan S 80% di ${asset} ${r}%/thn`,
    resCapLabel: (s: number) => (s === 80 ? "batas belanja di 80%" : `batas belanja di 80% (vs S ${s}%)`),
    resCapSub: (incText: string, s: number, curCapText: string) =>
      s === 80
        ? `per bulan, dari income ${incText}`
        : `target 80% dari ${incText} · pada S ${s}% saat ini: ${curCapText}/bln`,
    contextSalaryTag: "KONTEKS GAJI TETAP",
    contextSalaryTitle: "Gaji bulanan stabil = HC tenang",
    contextSalaryBody:
      "Saat penghasilan bulanan stabil, human capital berperan seperti arus kas tetap sehingga porsi tabungan FC dapat difokuskan pada tangga aset bertumbuh jangka panjang.",
    contextTraderTag: "KONTEKS TRADER AKTIF",
    contextTraderTitle: "Trading aktif = melatih skill (HC)",
    contextTraderBody:
      "Kemampuan trading harian adalah bagian dari human capital (skill). Pisahkan tabungan financial capital jangka panjangmu agar tidak ikut terpakai saat melatih eksekusi.",
    chalkSpendBadge: (cap80: string) => `Batas belanja S 80%: ${cap80}/bln`,
    chalkRungBadge: (asset: string, r: number) => `Tangga aktif: ${asset} (${r}%/thn)`,
  },
  en: {
    eyebrow: "exit chalkboard",
    heroTitle: "One big picture for your money",
    heroSub: "Step through the 8 chalkboard lessons at your own pace, then simulate your numbers below.",
    voiceGroupAria: "Lesson language and voice style",
    boardTitle: "human capital and financial capital",
    legendHc: "HC: earning capacity",
    legendFcCurrent: (s: number) => `FC at S ${s}%`,
    legendFcTarget: "FC at S 80%",
    axisMoney: "money value",
    axisPullBack: "pull crossover earlier",
    hoverHint: "Hover or tap along the board to inspect values by age",
    hoverReadout: (age: number, hc: string, fcCur: string, fc80: string, s: number) =>
      `Age ${age} · HC ${hc} · FC (S ${s}%) ${fcCur} · FC (S 80%) ${fc80}`,
    stepCounter: (step: number) => `step ${step} of 8`,
    stepDotAria: (step: number) => `Go to step ${step} of 8`,
    replayStart: "replay from step 1",
    prevBtn: "previous",
    nextBtn: "next",
    focusSimBtn: "simulate below",
    skipBtn: "skip to simulator",
    simTitle: "Simulate your numbers",
    resetDefault: "Reset example",
    incomeLabel: "monthly total income",
    incomeInputAria: "Monthly income in million Rupiah",
    savingRateLabel: (s: number, saveText: string, incText: string) =>
      `saving rate (S) · S = ${saveText} ÷ ${incText} = ${s}%`,
    preset25: "25% board example",
    preset80: "80% target",
    startAgeLabel: "starting age",
    ageYears: (age: number) => `age ${age}`,
    initialFcLabel: "starting FC savings (optional)",
    assetLadderLabel: "position on the asset ladder",
    returnPrefix: "assumed return",
    returnSuffix: "% per year, editable right here",
    returnReset: "reset %",
    returnInputAria: "Assumed annual return percentage",
    resCurrentLabel: "current crossover point",
    resCurrentAge: (age: number | null) => (age !== null ? `age ${age}` : `beyond age ${MAX_WORKING_AGE}`),
    resCurrentSub: (s: number, saveText: string, asset: string, r: number) =>
      `at S ${s}% (${saveText}/mo) in ${asset} (${r}%/yr)`,
    resTargetLabel: "crossover with 80% target",
    resTargetSub: (asset: string, r: number, savedYears: number | null) =>
      savedYears !== null && savedYears > 0
        ? `at S 80% in ${asset} (${r}%/yr) · ${savedYears} yrs earlier`
        : `at S 80% in ${asset} (${r}%/yr)`,
    resCapLabel: (s: number) => (s === 80 ? "spending cap at 80%" : `spending cap at 80% (vs S ${s}%)`),
    resCapSub: (incText: string, s: number, curCapText: string) =>
      s === 80
        ? `per month, from ${incText} income`
        : `target 80% on ${incText} · at current S ${s}%: ${curCapText}/mo`,
    contextSalaryTag: "SALARIED CONTEXT",
    contextSalaryTitle: "Steady paycheck = calm HC base",
    contextSalaryBody:
      "When monthly salary is predictable, your human capital acts like a bond-like cashflow—allowing long-term financial capital savings to compound up the asset ladder.",
    contextTraderTag: "ACTIVE TRADER CONTEXT",
    contextTraderTitle: "Active trading = training HC skill",
    contextTraderBody:
      "Day-to-day trading is human capital (skill execution). Keep long-term financial capital ring-fenced separately so learning drawdowns never touch your compounding nest egg.",
    chalkSpendBadge: (cap80: string) => `80% Spending Cap: ${cap80}/mo`,
    chalkRungBadge: (asset: string, r: number) => `Active rung: ${asset} (${r}%/yr)`,
  },
} as const;

export function ExitBoardView({ locale }: { locale: AppLocale }) {
  const simHeadingId = useId();
  const simSectionRef = useRef<HTMLElement | null>(null);

  const [state, setState] = useState<ExitBoardState>(() => ({
    ...DEFAULT_EXIT_BOARD_STATE,
    assetReturnsPct: { ...DEFAULT_ASSET_RETURNS_PCT },
  }));
  const [hydrated, setHydrated] = useState(false);
  const [hoverAge, setHoverAge] = useState<number | null>(null);

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

  const activeVoice: VoiceMode =
    state.voiceMode ?? (locale === "id" ? (state.tone === "lugua" ? "id_lugua" : "id_kamu") : "en");
  const effectiveLocale: AppLocale = activeVoice === "en" ? "en" : "id";
  const effectiveTone: ExitBoardTone = activeVoice === "id_lugua" ? "lugua" : "kamu";
  const t = UI_STRINGS[effectiveLocale];

  const sim = useMemo(() => simulateExitBoard(state), [state]);
  const steps = useMemo(
    () => getExitBoardSteps(effectiveLocale, effectiveTone, sim.startAge, sim.monthlyIncomeJuta),
    [effectiveLocale, effectiveTone, sim.monthlyIncomeJuta, sim.startAge],
  );
  const currentStepCopy = steps[state.step - 1] ?? steps[3];
  const assetRungs = useMemo(
    () => getAssetRungMeta(effectiveLocale, effectiveTone),
    [effectiveLocale, effectiveTone],
  );
  const activeRungMeta = assetRungs.find((item) => item.id === state.selectedAsset) ?? assetRungs[3];

  function updateSimField(patch: Partial<ExitBoardState>, revealCurves = true) {
    setState((prev) => ({
      ...prev,
      ...patch,
      step: revealCurves && prev.step < 4 ? 4 : (patch.step ?? prev.step),
    }));
  }

  function selectVoice(next: VoiceMode) {
    setState((prev) => ({
      ...prev,
      voiceMode: next,
      tone: next === "id_lugua" ? "lugua" : next === "id_kamu" ? "kamu" : prev.tone,
    }));
  }

  function resetToExample() {
    setHoverAge(null);
    setState((prev) => ({
      ...DEFAULT_EXIT_BOARD_STATE,
      tone: prev.tone,
      voiceMode: prev.voiceMode,
      step: Math.max(4, prev.step),
      assetReturnsPct: { ...DEFAULT_ASSET_RETURNS_PCT },
    }));
  }

  // SVG coordinate projection (viewBox 560 x 244)
  const chartLeft = 48;
  const chartRight = 528;
  const chartTop = 26;
  const chartBottom = 192;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const ageSpan = Math.max(1, sim.endAge - sim.startAge);

  const { xForAge, yForVal, hcPath, fcCurrentPath, fcTarget80Path, accelAreaPath } = useMemo(() => {
    const projectX = (age: number) =>
      chartLeft + ((age - sim.startAge) / ageSpan) * chartWidth;
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
        return chartBottom - (safe / hcCeiling) * (chartHeight * linearShare);
      }
      const excessRatio = (safe - hcCeiling) / hcCeiling;
      const softHeadroom = Math.min(1, Math.log1p(excessRatio) / Math.log1p(maxExcess * 1.12));
      return chartBottom - chartHeight * (linearShare + headroomShare * softHeadroom);
    };

    const hc = sim.points
      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${projectX(pt.age).toFixed(1)} ${projectY(pt.hcJuta).toFixed(1)}`)
      .join(" ");
    const fcCur = sim.points
      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${projectX(pt.age).toFixed(1)} ${projectY(pt.fcCurrentJuta).toFixed(1)}`)
      .join(" ");
    const fcTgt = sim.points
      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${projectX(pt.age).toFixed(1)} ${projectY(pt.fcTargetJuta).toFixed(1)}`)
      .join(" ");

    let accel = "";
    if (sim.points.length >= 2) {
      const forward = sim.points
        .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${projectX(pt.age).toFixed(1)} ${projectY(pt.fcTargetJuta).toFixed(1)}`)
        .join(" ");
      const backward = [...sim.points]
        .reverse()
        .map((pt) => `L ${projectX(pt.age).toFixed(1)} ${projectY(pt.fcCurrentJuta).toFixed(1)}`)
        .join(" ");
      accel = `${forward} ${backward} Z`;
    }

    return {
      xForAge: projectX,
      yForVal: projectY,
      hcPath: hc,
      fcCurrentPath: fcCur,
      fcTarget80Path: fcTgt,
      accelAreaPath: accel,
    };
  }, [ageSpan, chartBottom, chartHeight, chartLeft, chartWidth, sim]);

  const showHcCurve = state.step >= 2;
  const showFcCurrentCurve = state.step >= 3;
  const showTargetAndCrossover = state.step >= 4;
  const showTargetCurveDistinct = showTargetAndCrossover && state.savingRatePct !== TARGET_SAVING_RATE_PCT;

  const curCrossX =
    sim.currentCrossover.exactAge !== null ? xForAge(sim.currentCrossover.exactAge) : null;
  const curCrossY =
    sim.currentCrossover.valueJuta !== null ? yForVal(sim.currentCrossover.valueJuta) : null;

  const tgtCrossX =
    sim.target80Crossover.exactAge !== null ? xForAge(sim.target80Crossover.exactAge) : null;
  const tgtCrossY =
    sim.target80Crossover.valueJuta !== null ? yForVal(sim.target80Crossover.valueJuta) : null;

  const ref65X = sim.startAge < 65 ? xForAge(65) : null;
  const pullFromX = state.step === 4 && ref65X !== null ? ref65X : curCrossX;
  const pullToX = tgtCrossX;
  const showPullArrow =
    showTargetAndCrossover &&
    pullFromX !== null &&
    pullToX !== null &&
    pullFromX - pullToX > 36;

  const hoveredPoint = useMemo(() => {
    if (hoverAge === null) return null;
    return sim.points.find((p) => p.age === hoverAge) ?? null;
  }, [hoverAge, sim.points]);

  function handlePointerAge(clientX: number, svgRect: DOMRect) {
    if (svgRect.width <= 0) return;
    const svgX = ((clientX - svgRect.left) / svgRect.width) * 560;
    const ratio = Math.min(1, Math.max(0, (svgX - chartLeft) / chartWidth));
    const age = Math.round(sim.startAge + ratio * ageSpan);
    setHoverAge(age);
  }

  const savedYears =
    sim.currentCrossover.displayAge !== null && sim.target80Crossover.displayAge !== null
      ? sim.currentCrossover.displayAge - sim.target80Crossover.displayAge
      : null;

  const incFormatted = formatRupiahJuta(sim.monthlyIncomeJuta, effectiveLocale);
  const saveFormatted = formatRupiahJuta(sim.monthlySavingJuta, effectiveLocale);
  const cap80Formatted = formatRupiahJuta(sim.monthlySpendingCapTarget80Juta, effectiveLocale);
  const capCurFormatted = formatRupiahJuta(sim.monthlySpendingCapCurrentJuta, effectiveLocale);
  const defaultRungReturn = DEFAULT_ASSET_RETURNS_PCT[state.selectedAsset];

  return (
    <div className="view-stack exit-board-view">
      {/* Header Banner */}
      <section className="card exit-hero-card">
        <div className="exit-hero-copy">
          <span className="exit-eyebrow">{t.eyebrow}</span>
          <h2>{t.heroTitle}</h2>
          <p>{t.heroSub}</p>
        </div>
        <div className="segment-control exit-voice-switch" role="group" aria-label={t.voiceGroupAria}>
          <button
            type="button"
            className={activeVoice === "id_kamu" ? "selected" : ""}
            aria-pressed={activeVoice === "id_kamu"}
            onClick={() => selectVoice("id_kamu")}
          >
            Nada: Kamu
          </button>
          <button
            type="button"
            className={activeVoice === "id_lugua" ? "selected" : ""}
            aria-pressed={activeVoice === "id_lugua"}
            onClick={() => selectVoice("id_lugua")}
          >
            Nada: Lu–Gua
          </button>
          <button
            type="button"
            className={activeVoice === "en" ? "selected" : ""}
            aria-pressed={activeVoice === "en"}
            onClick={() => selectVoice("en")}
          >
            English
          </button>
        </div>
      </section>

      {/* Chalkboard + 8-Step Progressive Narrative */}
      <div className="exit-board-split">
        <section className="exit-chalkboard" aria-label={t.boardTitle}>
          <div className="exit-chalk-head">
            <strong>{t.boardTitle}</strong>
            <div className="exit-chalk-legend">
              {showHcCurve && (
                <span>
                  <i className="exit-leg-swatch hc" />
                  {t.legendHc}
                </span>
              )}
              {showFcCurrentCurve && (
                <span>
                  <i className="exit-leg-swatch fc-cur" />
                  {t.legendFcCurrent(sim.savingRatePct)}
                </span>
              )}
              {showTargetCurveDistinct && (
                <span>
                  <i className="exit-leg-swatch fc-tgt" />
                  {t.legendFcTarget}
                </span>
              )}
            </div>
          </div>

          <div className="exit-chalk-svg-wrap">
            <svg
              viewBox="0 0 560 244"
              className="exit-chalk-svg"
              role="img"
              aria-label={`${t.boardTitle}: ${t.resCurrentLabel} ${t.resCurrentAge(sim.currentCrossover.displayAge)}, ${t.resTargetLabel} ${t.resCurrentAge(sim.target80Crossover.displayAge)}`}
              onMouseMove={(e) => handlePointerAge(e.clientX, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => setHoverAge(null)}
              onClick={(e) => handlePointerAge(e.clientX, e.currentTarget.getBoundingClientRect())}
            >
              <defs>
                <linearGradient id="exitAccelFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8fe5aa" stopOpacity={state.step === 5 ? "0.24" : "0.11"} />
                  <stop offset="100%" stopColor="#8fe5aa" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Subtle horizontal chalk guides */}
              <line x1={chartLeft} y1={78} x2={chartRight} y2={78} stroke="rgba(189, 214, 195, 0.10)" strokeDasharray="3 5" />
              <line x1={chartLeft} y1={135} x2={chartRight} y2={135} stroke="rgba(189, 214, 195, 0.10)" strokeDasharray="3 5" />

              {/* Axes */}
              <line x1={chartLeft} y1={chartTop - 4} x2={chartLeft} y2={chartBottom} stroke="#bfd6c4" strokeWidth="1.7" />
              <line x1={chartLeft} y1={chartBottom} x2={chartRight + 6} y2={chartBottom} stroke="#bfd6c4" strokeWidth="1.7" />
              <text x={chartLeft + 7} y={chartTop + 6} fill="#adc8b3" fontSize="10.5" fontWeight="600">
                {t.axisMoney}
              </text>

              {/* Acceleration zone between current FC and S=80% FC */}
              {showTargetCurveDistinct && accelAreaPath && (
                <path d={accelAreaPath} fill="url(#exitAccelFill)" />
              )}

              {/* HC descending curve */}
              {showHcCurve && (
                <>
                  <path
                    d={hcPath}
                    fill="none"
                    stroke="#eb9c86"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <text
                    x={chartLeft + 7}
                    y={Math.max(chartTop + 21, yForVal(sim.points[0]?.hcJuta ?? 0) - 7)}
                    fill="#f2aa96"
                    fontSize="12"
                    fontWeight="800"
                  >
                    HC
                  </text>
                </>
              )}

              {/* FC current S% curve */}
              {showFcCurrentCurve && (
                <>
                  <path
                    d={fcCurrentPath}
                    fill="none"
                    stroke="#8cc0e8"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <text
                    x={chartRight - 20}
                    y={Math.min(chartBottom - 10, yForVal(sim.points[sim.points.length - 1]?.fcCurrentJuta ?? 0) + 15)}
                    fill="#9bcbf0"
                    fontSize="11.5"
                    fontWeight="800"
                  >
                    FC
                  </text>
                </>
              )}

              {/* FC target 80% curve */}
              {showTargetCurveDistinct && (
                <path
                  d={fcTarget80Path}
                  fill="none"
                  stroke="#8fe5aa"
                  strokeWidth="2.8"
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Step 4 average 65 marker if distinct from current crossover */}
              {state.step === 4 && ref65X !== null && (sim.currentCrossover.displayAge === null || Math.abs(sim.currentCrossover.displayAge - 65) >= 4) && (
                <g>
                  <line x1={ref65X} y1={chartBottom - 36} x2={ref65X} y2={chartBottom} stroke="rgba(237, 216, 139, 0.55)" strokeDasharray="3 3" />
                  <g transform={`translate(${ref65X.toFixed(1)}, 206)`}>
                    <circle r="10.5" fill="#1b2f22" stroke="rgba(237, 216, 139, 0.65)" strokeWidth="1.2" />
                    <text textAnchor="middle" y="3.5" fill="#edd88b" fontSize="9.5" fontWeight="700">
                      65
                    </text>
                  </g>
                </g>
              )}

              {/* Current Crossover Marker */}
              {showTargetAndCrossover && curCrossX !== null && curCrossY !== null && sim.currentCrossover.displayAge !== null && (
                <g>
                  <line
                    x1={curCrossX}
                    y1={curCrossY}
                    x2={curCrossX}
                    y2={chartBottom}
                    stroke="#8cc0e8"
                    strokeWidth="1.3"
                    strokeDasharray="3 3"
                  />
                  <circle cx={curCrossX} cy={curCrossY} r="5.5" fill="#edd88b" stroke="#1b2f22" strokeWidth="1.5" />
                  {Math.abs(sim.currentCrossover.displayAge - sim.startAge) >= 3 &&
                    (sim.target80Crossover.displayAge === null ||
                      Math.abs(sim.currentCrossover.displayAge - sim.target80Crossover.displayAge) >= 3 ||
                      !showTargetCurveDistinct) && (
                      <g transform={`translate(${curCrossX.toFixed(1)}, 206)`}>
                        <circle r="10.5" fill="#1e3847" stroke="#8cc0e8" strokeWidth="1.3" />
                        <text textAnchor="middle" y="3.5" fill="#e6f4ff" fontSize="9.5" fontWeight="800">
                          {sim.currentCrossover.displayAge}
                        </text>
                      </g>
                    )}
                </g>
              )}

              {/* Target 80% Crossover Marker */}
              {showTargetCurveDistinct && tgtCrossX !== null && tgtCrossY !== null && sim.target80Crossover.displayAge !== null && (
                <g>
                  <line
                    x1={tgtCrossX}
                    y1={tgtCrossY}
                    x2={tgtCrossX}
                    y2={chartBottom}
                    stroke="#8fe5aa"
                    strokeWidth="1.4"
                    strokeDasharray="3 3"
                  />
                  <circle cx={tgtCrossX} cy={tgtCrossY} r="6" fill="#8fe5aa" stroke="#1b2f22" strokeWidth="1.5" />
                  <g transform={`translate(${tgtCrossX.toFixed(1)}, 206)`}>
                    <circle r="11" fill="#2c5c3e" stroke="#8fe5aa" strokeWidth="1.5" />
                    <text textAnchor="middle" y="3.5" fill="#ffffff" fontSize="9.5" fontWeight="800">
                      {sim.target80Crossover.displayAge}
                    </text>
                  </g>
                </g>
              )}

              {/* Pull-back arrow */}
              {showPullArrow && pullFromX !== null && pullToX !== null && (
                <g>
                  <line
                    x1={pullFromX - 15}
                    y1={226}
                    x2={pullToX + 16}
                    y2={226}
                    stroke="#edd88b"
                    strokeWidth="1.9"
                  />
                  <polygon
                    points={`${(pullToX + 14).toFixed(1)},226 ${(pullToX + 22).toFixed(1)},222 ${(pullToX + 22).toFixed(1)},230`}
                    fill="#edd88b"
                  />
                  <text
                    x={((pullFromX + pullToX) / 2).toFixed(1)}
                    y={238}
                    textAnchor="middle"
                    fill="#edd88b"
                    fontSize="9.6"
                    fontWeight="700"
                  >
                    {t.axisPullBack}
                  </text>
                </g>
              )}

              {/* Step 6 / Step 7 contextual chalkboard callout */}
              {state.step === 6 && (
                <g transform="translate(310, 26)">
                  <rect width="212" height="26" rx="7" fill="rgba(19, 34, 25, 0.84)" stroke="rgba(143, 229, 170, 0.45)" />
                  <text x="106" y="16.5" textAnchor="middle" fill="#a9f0bf" fontSize="10" fontWeight="700">
                    {t.chalkSpendBadge(cap80Formatted)}
                  </text>
                </g>
              )}
              {state.step === 7 && (
                <g transform="translate(316, 26)">
                  <rect width="206" height="26" rx="7" fill="rgba(19, 34, 25, 0.84)" stroke="rgba(237, 216, 139, 0.48)" />
                  <text x="103" y="16.5" textAnchor="middle" fill="#edd88b" fontSize="10" fontWeight="700">
                    {t.chalkRungBadge(activeRungMeta.label, sim.annualReturnPct)}
                  </text>
                </g>
              )}

              {/* Hover Scrubber Hairline */}
              {hoveredPoint && (
                <g>
                  <line
                    x1={xForAge(hoveredPoint.age)}
                    y1={chartTop}
                    x2={xForAge(hoveredPoint.age)}
                    y2={chartBottom}
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth="1.2"
                    strokeDasharray="2 3"
                  />
                  {showHcCurve && (
                    <circle cx={xForAge(hoveredPoint.age)} cy={yForVal(hoveredPoint.hcJuta)} r="4" fill="#eb9c86" />
                  )}
                  {showFcCurrentCurve && (
                    <circle cx={xForAge(hoveredPoint.age)} cy={yForVal(hoveredPoint.fcCurrentJuta)} r="4" fill="#8cc0e8" />
                  )}
                </g>
              )}

              {/* Start Age & Age 74 End Badges */}
              <g transform={`translate(${chartLeft}, 206)`}>
                <circle r="10.5" fill="#1b2f22" stroke="#9ec7a8" strokeWidth="1.3" />
                <text textAnchor="middle" y="3.5" fill="#ebf7ee" fontSize="9.5" fontWeight="700">
                  {sim.startAge}
                </text>
              </g>
              {showHcCurve && (
                <text x={chartRight - 6} y={209} textAnchor="middle" fill="#adc8b3" fontSize="10" fontWeight="700">
                  {sim.endAge}
                </text>
              )}
            </svg>
          </div>

          <div className="exit-chalk-foot" aria-live="polite">
            {hoveredPoint
              ? t.hoverReadout(
                  hoveredPoint.age,
                  formatRupiahJuta(hoveredPoint.hcJuta, effectiveLocale),
                  formatRupiahJuta(hoveredPoint.fcCurrentJuta, effectiveLocale),
                  formatRupiahJuta(hoveredPoint.fcTargetJuta, effectiveLocale),
                  sim.savingRatePct,
                )
              : t.hoverHint}
          </div>
        </section>

        {/* Right: Step-by-Step Teacher Narrative Card */}
        <section className="card exit-narasi-card" aria-live="polite">
          <div>
            <div className="exit-narasi-top">
              <span>{t.stepCounter(state.step)}</span>
              {state.step > 1 && (
                <button
                  type="button"
                  className="exit-replay-link"
                  onClick={() => setState((prev) => ({ ...prev, step: 1 }))}
                >
                  <RotateCcw size={12} /> {t.replayStart}
                </button>
              )}
            </div>

            <div className="exit-step-dots" role="tablist" aria-label={t.stepCounter(state.step)}>
              {steps.map((item) => {
                const isDone = item.step <= state.step;
                const isCurrent = item.step === state.step;
                return (
                  <button
                    key={item.step}
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    aria-label={t.stepDotAria(item.step)}
                    className={`exit-step-dot ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}`}
                    onClick={() => setState((prev) => ({ ...prev, step: item.step }))}
                  />
                );
              })}
            </div>

            <h3>{currentStepCopy.title}</h3>
            <p className="exit-narasi-body">{currentStepCopy.body}</p>
          </div>

          <div className="exit-narasi-bottom">
            <div className="exit-key-box">
              <small>{currentStepCopy.keyLabel}</small>
              <strong>{currentStepCopy.keyValue}</strong>
            </div>

            <div className="exit-narasi-actions">
              <button
                type="button"
                className="button-secondary exit-nav-btn"
                disabled={state.step <= 1}
                onClick={() => setState((prev) => ({ ...prev, step: Math.max(1, prev.step - 1) }))}
              >
                <ChevronLeft size={15} /> {t.prevBtn}
              </button>

              {state.step < 8 ? (
                <button
                  type="button"
                  className="button-primary exit-nav-btn"
                  onClick={() => setState((prev) => ({ ...prev, step: Math.min(8, prev.step + 1) }))}
                >
                  {t.nextBtn} <ChevronRight size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  className="button-primary exit-nav-btn"
                  onClick={() => simSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  {t.focusSimBtn} <ArrowDown size={15} />
                </button>
              )}

              {state.step < 8 && (
                <button
                  type="button"
                  className="exit-skip-link"
                  onClick={() => setState((prev) => ({ ...prev, step: 8 }))}
                >
                  {t.skipBtn}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Standalone Simulator ("Atur angkamu") */}
      <section ref={simSectionRef} className="card exit-sim-card" aria-labelledby={simHeadingId}>
        <div className="exit-sim-grid">
          <div className="exit-sim-controls">
            <div className="exit-sim-head">
              <h3 id={simHeadingId}>{t.simTitle}</h3>
              <button type="button" className="exit-reset-btn" onClick={resetToExample}>
                <RotateCcw size={12} /> {t.resetDefault}
              </button>
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

            {/* 2. Saving Rate (S) */}
            <div className="exit-control-block">
              <div className="exit-control-label-row">
                <label htmlFor="exit-saving-range">
                  {t.savingRateLabel(sim.savingRatePct, saveFormatted, incFormatted)}
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
                  className={`exit-preset-pill ${state.savingRatePct === TARGET_SAVING_RATE_PCT ? "active" : ""}`}
                  aria-pressed={state.savingRatePct === TARGET_SAVING_RATE_PCT}
                  onClick={() => updateSimField({ savingRatePct: TARGET_SAVING_RATE_PCT })}
                >
                  {t.preset80}
                </button>
              </div>
            </div>

            {/* 3. Starting Age & Optional Initial FC */}
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
                  <strong>{formatRupiahJuta(sim.initialFcJuta, effectiveLocale)}</strong>
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

            {/* 4. Risk-Return Asset Ladder */}
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
                      {rung.label}
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
              <p className="exit-rung-note">{activeRungMeta.riskNote}</p>
            </div>
          </div>

          {/* Right: 3 Live Simulation Output Cards */}
          <div className="exit-sim-results">
            <div className="exit-res-card">
              <small>{t.resCurrentLabel}</small>
              <strong>{t.resCurrentAge(sim.currentCrossover.displayAge)}</strong>
              <span>
                {t.resCurrentSub(sim.savingRatePct, saveFormatted, activeRungMeta.label, sim.annualReturnPct)}
              </span>
            </div>

            <div className="exit-res-card highlight">
              <small>{t.resTargetLabel}</small>
              <strong>{t.resCurrentAge(sim.target80Crossover.displayAge)}</strong>
              <span>{t.resTargetSub(activeRungMeta.label, sim.annualReturnPct, savedYears)}</span>
            </div>

            <div className="exit-res-card">
              <small>{t.resCapLabel(sim.savingRatePct)}</small>
              <strong>{cap80Formatted}</strong>
              <span>{t.resCapSub(incFormatted, sim.savingRatePct, capCurFormatted)}</span>
            </div>
          </div>
        </div>

        {/* Two Calm Context Cards (Salaried vs Active Trader) */}
        <div className="exit-context-strip">
          <div className="exit-context-item">
            <span className="exit-context-tag">{t.contextSalaryTag}</span>
            <strong>{t.contextSalaryTitle}</strong>
            <p>{t.contextSalaryBody}</p>
          </div>
          <div className="exit-context-item">
            <span className="exit-context-tag">{t.contextTraderTag}</span>
            <strong>{t.contextTraderTitle}</strong>
            <p>{t.contextTraderBody}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
