import type { AppLocale } from "@/lib/types";

export const EXIT_BOARD_STORAGE_KEY = "bloom:exit-board-sim:v1";
export const MAX_WORKING_AGE = 74;
export const DEFAULT_HC_DISCOUNT_RATE = 0.04;
export const TARGET_SAVING_RATE_PCT = 80;
export const BASELINE_SAVING_RATE_PCT = 25;

export const ASSET_RUNG_IDS = ["cash", "obligasi", "properti", "saham", "kripto"] as const;
export type AssetRungId = (typeof ASSET_RUNG_IDS)[number];

export type ExitBoardLocaleOverride = AppLocale | null;
export type ComparisonHorizonMode = "10y" | "20y" | "crossover" | "age60";

export const DEFAULT_ASSET_RETURNS_PCT: Record<AssetRungId, number> = {
  cash: 3,
  obligasi: 6,
  properti: 8,
  saham: 10,
  kripto: 18,
};

export type ExitBoardState = {
  localeOverride?: ExitBoardLocaleOverride;
  horizonMode?: ComparisonHorizonMode;
  monthlyIncomeJuta: number;
  initialFcJuta: number;
  savingRatePct: number;
  startAge: number;
  selectedAsset: AssetRungId;
  assetReturnsPct: Record<AssetRungId, number>;
};

export const DEFAULT_EXIT_BOARD_STATE: ExitBoardState = {
  localeOverride: null,
  horizonMode: "20y",
  monthlyIncomeJuta: 20,
  initialFcJuta: 0,
  savingRatePct: 25,
  startAge: 20,
  selectedAsset: "saham",
  assetReturnsPct: { ...DEFAULT_ASSET_RETURNS_PCT },
};

export type ExitBoardCurvePoint = {
  age: number;
  yearsElapsed: number;
  hcJuta: number;
  principalCurrentJuta: number;
  gainCurrentJuta: number;
  fcCurrentJuta: number;
  principalTargetJuta: number;
  fcTargetJuta: number;
  byAssetJuta: Record<AssetRungId, number>;
};

export type CrossoverPoint = {
  /** Exact continuous age where FC crosses HC, or null if not reached by age 74. */
  exactAge: number | null;
  /** Rounded display age, or null if not reached by age 74. */
  displayAge: number | null;
  /** Value (in juta Rupiah) at crossover. */
  valueJuta: number | null;
};

export type WealthBreakdownSnapshot = {
  age: number;
  yearsElapsed: number;
  isCrossover: boolean;
  principalJuta: number;
  gainJuta: number;
  totalJuta: number;
  gainPct: number;
  multiple: number;
  monthlyPassiveJuta: number;
};

export type AssetComparisonItem = {
  id: AssetRungId;
  returnPct: number;
  crossoverAge: number | null;
  evalAge: number;
  evalYears: number;
  principalJuta: number;
  gainJuta: number;
  totalJuta: number;
  gainPct: number;
  multiple: number;
};

export type ExitBoardMilestone = {
  id: "early" | "mid" | "crossover" | "retirement";
  age: number;
  yearsElapsed: number;
  principalJuta: number;
  gainJuta: number;
  totalJuta: number;
  gainPct: number;
  profitSharePct: number;
};

export type ExitBoardSimulationResult = {
  startAge: number;
  endAge: number;
  monthlyIncomeJuta: number;
  annualIncomeJuta: number;
  initialFcJuta: number;
  savingRatePct: number;
  monthlySavingJuta: number;
  monthlySpendingCapCurrentJuta: number;
  monthlySpendingCapTarget80Juta: number;
  annualReturnPct: number;
  points: ExitBoardCurvePoint[];
  currentCrossover: CrossoverPoint;
  target80Crossover: CrossoverPoint;
  assetCrossovers: Record<AssetRungId, CrossoverPoint>;
  primarySnapshot: WealthBreakdownSnapshot;
  target80Snapshot: WealthBreakdownSnapshot;
  snowballAge: number | null;
  milestones: ExitBoardMilestone[];
  fcAt65CurrentJuta: number;
  fcAt65Target80Juta: number;
};

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeExitBoardState(raw: unknown): ExitBoardState {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_EXIT_BOARD_STATE,
      assetReturnsPct: { ...DEFAULT_ASSET_RETURNS_PCT },
    };
  }
  const obj = raw as Partial<ExitBoardState> & { voiceMode?: string };
  let localeOverride: ExitBoardLocaleOverride =
    obj.localeOverride === "id" || obj.localeOverride === "en" ? obj.localeOverride : null;
  if (!localeOverride && typeof obj.voiceMode === "string") {
    if (obj.voiceMode === "en") localeOverride = "en";
    else if (obj.voiceMode.startsWith("id")) localeOverride = "id";
  }

  const horizonMode: ComparisonHorizonMode =
    obj.horizonMode === "10y" ||
    obj.horizonMode === "20y" ||
    obj.horizonMode === "crossover" ||
    obj.horizonMode === "age60"
      ? obj.horizonMode
      : "20y";

  const monthlyIncomeJuta = Number(
    clampNumber(Number(obj.monthlyIncomeJuta ?? DEFAULT_EXIT_BOARD_STATE.monthlyIncomeJuta), 1, 500).toFixed(1),
  );
  const initialFcJuta = Number(
    clampNumber(Number(obj.initialFcJuta ?? DEFAULT_EXIT_BOARD_STATE.initialFcJuta), 0, 10000).toFixed(1),
  );
  const savingRatePct = Math.round(
    clampNumber(Number(obj.savingRatePct ?? DEFAULT_EXIT_BOARD_STATE.savingRatePct), 5, 90),
  );
  const startAge = Math.round(
    clampNumber(Number(obj.startAge ?? DEFAULT_EXIT_BOARD_STATE.startAge), 18, 65),
  );
  const selectedAsset: AssetRungId = ASSET_RUNG_IDS.includes(obj.selectedAsset as AssetRungId)
    ? (obj.selectedAsset as AssetRungId)
    : DEFAULT_EXIT_BOARD_STATE.selectedAsset;

  const rawReturns = (obj.assetReturnsPct && typeof obj.assetReturnsPct === "object"
    ? obj.assetReturnsPct
    : {}) as Partial<Record<AssetRungId, number>>;

  const assetReturnsPct: Record<AssetRungId, number> = {
    cash: Number(clampNumber(Number(rawReturns.cash ?? DEFAULT_ASSET_RETURNS_PCT.cash), 0, 40).toFixed(1)),
    obligasi: Number(clampNumber(Number(rawReturns.obligasi ?? DEFAULT_ASSET_RETURNS_PCT.obligasi), 0, 40).toFixed(1)),
    properti: Number(clampNumber(Number(rawReturns.properti ?? DEFAULT_ASSET_RETURNS_PCT.properti), 0, 40).toFixed(1)),
    saham: Number(clampNumber(Number(rawReturns.saham ?? DEFAULT_ASSET_RETURNS_PCT.saham), 0, 40).toFixed(1)),
    kripto: Number(clampNumber(Number(rawReturns.kripto ?? DEFAULT_ASSET_RETURNS_PCT.kripto), 0, 50).toFixed(1)),
  };

  return {
    localeOverride,
    horizonMode,
    monthlyIncomeJuta,
    initialFcJuta,
    savingRatePct,
    startAge,
    selectedAsset,
    assetReturnsPct,
  };
}

export function loadExitBoardState(storage: Pick<Storage, "getItem"> | null | undefined): ExitBoardState {
  if (!storage) {
    return normalizeExitBoardState(null);
  }
  try {
    const raw = storage.getItem(EXIT_BOARD_STORAGE_KEY);
    if (!raw) return normalizeExitBoardState(null);
    return normalizeExitBoardState(JSON.parse(raw));
  } catch {
    return normalizeExitBoardState(null);
  }
}

export function saveExitBoardState(
  storage: Pick<Storage, "setItem"> | null | undefined,
  state: ExitBoardState,
): void {
  if (!storage) return;
  try {
    storage.setItem(EXIT_BOARD_STORAGE_KEY, JSON.stringify(normalizeExitBoardState(state)));
  } catch {
    // Ignore storage quota or private-browsing write failures.
  }
}

function findCrossover(
  points: { age: number; hc: number; fc: number }[],
): CrossoverPoint {
  if (!points.length) {
    return { exactAge: null, displayAge: null, valueJuta: null };
  }
  if (points[0].fc >= points[0].hc) {
    return {
      exactAge: points[0].age,
      displayAge: points[0].age,
      valueJuta: Number(points[0].fc.toFixed(1)),
    };
  }
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const prevDiff = prev.fc - prev.hc;
    const currDiff = curr.fc - curr.hc;
    if (currDiff >= 0) {
      const denom = currDiff - prevDiff;
      const ratio = denom > 0 ? Math.min(1, Math.max(0, -prevDiff / denom)) : 0;
      const exactAge = Number((prev.age + ratio).toFixed(2));
      const valueJuta = Number((prev.hc + (curr.hc - prev.hc) * ratio).toFixed(1));
      return {
        exactAge,
        displayAge: Math.round(exactAge),
        valueJuta,
      };
    }
  }
  return { exactAge: null, displayAge: null, valueJuta: null };
}

function buildSnapshotAtAge(
  points: ExitBoardCurvePoint[],
  targetAge: number,
  isCrossover: boolean,
  annualReturnPct: number,
  useTarget80 = false,
): WealthBreakdownSnapshot {
  const pt =
    points.find((p) => p.age === targetAge) ??
    points[points.length - 1];
  const principal = useTarget80 ? pt.principalTargetJuta : pt.principalCurrentJuta;
  const total = useTarget80 ? pt.fcTargetJuta : pt.fcCurrentJuta;
  const gain = Math.max(0, Number((total - principal).toFixed(2)));
  const gainPct = principal > 0 ? Math.round((gain / principal) * 100) : 0;
  const multiple = principal > 0 ? Number((total / principal).toFixed(1)) : 1;
  const monthlyPassiveJuta = Number(((total * (annualReturnPct / 100)) / 12).toFixed(2));

  return {
    age: pt.age,
    yearsElapsed: pt.yearsElapsed,
    isCrossover,
    principalJuta: Number(principal.toFixed(1)),
    gainJuta: Number(gain.toFixed(1)),
    totalJuta: Number(total.toFixed(1)),
    gainPct,
    multiple,
    monthlyPassiveJuta,
  };
}

export function simulateExitBoard(
  input: Pick<
    ExitBoardState,
    | "monthlyIncomeJuta"
    | "initialFcJuta"
    | "savingRatePct"
    | "startAge"
    | "selectedAsset"
    | "assetReturnsPct"
  >,
  hcDiscountRate = DEFAULT_HC_DISCOUNT_RATE,
): ExitBoardSimulationResult {
  const startAge = Math.round(clampNumber(input.startAge, 18, 65));
  const endAge = MAX_WORKING_AGE;
  const monthlyIncomeJuta = clampNumber(input.monthlyIncomeJuta, 1, 500);
  const initialFcJuta = clampNumber(input.initialFcJuta, 0, 10000);
  const savingRatePct = clampNumber(input.savingRatePct, 5, 90);
  const annualIncomeJuta = monthlyIncomeJuta * 12;
  const annualReturnPct = clampNumber(
    input.assetReturnsPct[input.selectedAsset] ?? DEFAULT_ASSET_RETURNS_PCT[input.selectedAsset],
    0,
    50,
  );
  const rSelected = annualReturnPct / 100;
  const sCurrent = savingRatePct / 100;
  const sTarget = TARGET_SAVING_RATE_PCT / 100;

  // Backward recursion for Human Capital: HC_74 = 0, HC_t = (HC_{t+1} + Y) / (1 + d)
  const hcByAge: Record<number, number> = { [endAge]: 0 };
  for (let age = endAge - 1; age >= startAge; age--) {
    hcByAge[age] = (hcByAge[age + 1] + annualIncomeJuta) / (1 + hcDiscountRate);
  }

  const assetTracker: Record<AssetRungId, number> = {
    cash: initialFcJuta,
    obligasi: initialFcJuta,
    properti: initialFcJuta,
    saham: initialFcJuta,
    kripto: initialFcJuta,
  };

  const points: ExitBoardCurvePoint[] = [];
  let fcCurrent = initialFcJuta;
  let fcTarget = initialFcJuta;
  let snowballAge: number | null = null;
  const annualSavingCurrent = sCurrent * annualIncomeJuta;

  for (let age = startAge; age <= endAge; age++) {
    const yearsElapsed = age - startAge;
    const principalCurrent = initialFcJuta + yearsElapsed * annualSavingCurrent;
    const principalTarget = initialFcJuta + yearsElapsed * (sTarget * annualIncomeJuta);
    const gainCurrent = Math.max(0, fcCurrent - principalCurrent);

    if (snowballAge === null && yearsElapsed >= 1 && fcCurrent * rSelected >= annualSavingCurrent && annualSavingCurrent > 0) {
      snowballAge = age;
    }

    points.push({
      age,
      yearsElapsed,
      hcJuta: Number(hcByAge[age].toFixed(2)),
      principalCurrentJuta: Number(principalCurrent.toFixed(2)),
      gainCurrentJuta: Number(gainCurrent.toFixed(2)),
      fcCurrentJuta: Number(fcCurrent.toFixed(2)),
      principalTargetJuta: Number(principalTarget.toFixed(2)),
      fcTargetJuta: Number(fcTarget.toFixed(2)),
      byAssetJuta: {
        cash: Number(assetTracker.cash.toFixed(2)),
        obligasi: Number(assetTracker.obligasi.toFixed(2)),
        properti: Number(assetTracker.properti.toFixed(2)),
        saham: Number(assetTracker.saham.toFixed(2)),
        kripto: Number(assetTracker.kripto.toFixed(2)),
      },
    });

    fcCurrent = fcCurrent * (1 + rSelected) + annualSavingCurrent;
    fcTarget = fcTarget * (1 + rSelected) + sTarget * annualIncomeJuta;

    for (const rung of ASSET_RUNG_IDS) {
      const rungR = clampNumber(input.assetReturnsPct[rung] ?? DEFAULT_ASSET_RETURNS_PCT[rung], 0, 50) / 100;
      assetTracker[rung] = assetTracker[rung] * (1 + rungR) + annualSavingCurrent;
    }
  }

  const currentCrossover = findCrossover(
    points.map((p) => ({ age: p.age, hc: p.hcJuta, fc: p.fcCurrentJuta })),
  );
  const target80Crossover = findCrossover(
    points.map((p) => ({ age: p.age, hc: p.hcJuta, fc: p.fcTargetJuta })),
  );

  const assetCrossovers = {} as Record<AssetRungId, CrossoverPoint>;
  for (const rung of ASSET_RUNG_IDS) {
    assetCrossovers[rung] = findCrossover(
      points.map((p) => ({ age: p.age, hc: p.hcJuta, fc: p.byAssetJuta[rung] })),
    );
  }

  const fallbackAge = Math.min(endAge, Math.max(startAge + 5, 65));
  const primaryEvalAge = currentCrossover.displayAge ?? fallbackAge;
  const target80EvalAge = target80Crossover.displayAge ?? fallbackAge;

  const primarySnapshot = buildSnapshotAtAge(
    points,
    primaryEvalAge,
    currentCrossover.displayAge !== null,
    annualReturnPct,
    false,
  );
  const target80Snapshot = buildSnapshotAtAge(
    points,
    target80EvalAge,
    target80Crossover.displayAge !== null,
    annualReturnPct,
    true,
  );

  // Build 4 progressive wealth milestones
  const earlyAge = Math.min(endAge, startAge + 5);
  const midAge = Math.min(endAge, startAge + 10);
  const crossOrTwentyAge = currentCrossover.displayAge ?? Math.min(endAge, startAge + 20);
  const retireAge = Math.min(endAge, Math.max(crossOrTwentyAge + 5, 60));

  const milestoneSpecs: { id: ExitBoardMilestone["id"]; age: number }[] = [
    { id: "early", age: earlyAge },
    { id: "mid", age: midAge },
    { id: "crossover", age: crossOrTwentyAge },
    { id: "retirement", age: retireAge },
  ];

  const milestones: ExitBoardMilestone[] = milestoneSpecs.map(({ id, age }) => {
    const pt = points.find((p) => p.age === age) ?? points[points.length - 1];
    const principal = Number(pt.principalCurrentJuta.toFixed(1));
    const total = Number(pt.fcCurrentJuta.toFixed(1));
    const gain = Math.max(0, Number((total - principal).toFixed(1)));
    const gainPct = principal > 0 ? Math.round((gain / principal) * 100) : 0;
    const profitSharePct = total > 0 ? Math.round((gain / total) * 100) : 0;
    return {
      id,
      age: pt.age,
      yearsElapsed: pt.yearsElapsed,
      principalJuta: principal,
      gainJuta: gain,
      totalJuta: total,
      gainPct,
      profitSharePct,
    };
  });

  const age65Point = points.find((p) => p.age === 65) ?? points[points.length - 1];
  const monthlySavingJuta = Number(((monthlyIncomeJuta * savingRatePct) / 100).toFixed(2));
  const monthlySpendingCapCurrentJuta = Number((monthlyIncomeJuta - monthlySavingJuta).toFixed(2));
  const monthlySpendingCapTarget80Juta = Number((monthlyIncomeJuta * (1 - sTarget)).toFixed(2));

  return {
    startAge,
    endAge,
    monthlyIncomeJuta,
    annualIncomeJuta,
    initialFcJuta,
    savingRatePct,
    monthlySavingJuta,
    monthlySpendingCapCurrentJuta,
    monthlySpendingCapTarget80Juta,
    annualReturnPct,
    points,
    currentCrossover,
    target80Crossover,
    assetCrossovers,
    primarySnapshot,
    target80Snapshot,
    snowballAge,
    milestones,
    fcAt65CurrentJuta: age65Point ? Number(age65Point.fcCurrentJuta.toFixed(1)) : 0,
    fcAt65Target80Juta: age65Point ? Number(age65Point.fcTargetJuta.toFixed(1)) : 0,
  };
}

export function resolveComparisonEvalAge(
  sim: ExitBoardSimulationResult,
  horizonMode: ComparisonHorizonMode,
): number {
  if (horizonMode === "10y") {
    return Math.min(sim.endAge, sim.startAge + 10);
  }
  if (horizonMode === "20y") {
    return Math.min(sim.endAge, sim.startAge + 20);
  }
  if (horizonMode === "crossover") {
    return sim.currentCrossover.displayAge ?? Math.min(sim.endAge, sim.startAge + 20);
  }
  return Math.min(sim.endAge, Math.max(sim.startAge + 5, 60));
}

export function getAssetComparisonRows(
  sim: ExitBoardSimulationResult,
  assetReturnsPct: Record<AssetRungId, number>,
  horizonMode: ComparisonHorizonMode,
): AssetComparisonItem[] {
  const evalAge = resolveComparisonEvalAge(sim, horizonMode);
  const pt = sim.points.find((p) => p.age === evalAge) ?? sim.points[sim.points.length - 1];
  const principal = Number(pt.principalCurrentJuta.toFixed(1));

  return ASSET_RUNG_IDS.map((id) => {
    const total = Number(pt.byAssetJuta[id].toFixed(1));
    const gain = Math.max(0, Number((total - principal).toFixed(1)));
    const gainPct = principal > 0 ? Math.round((gain / principal) * 100) : 0;
    const multiple = principal > 0 ? Number((total / principal).toFixed(1)) : 1;
    return {
      id,
      returnPct: assetReturnsPct[id] ?? DEFAULT_ASSET_RETURNS_PCT[id],
      crossoverAge: sim.assetCrossovers[id].displayAge,
      evalAge: pt.age,
      evalYears: pt.yearsElapsed,
      principalJuta: principal,
      gainJuta: gain,
      totalJuta: total,
      gainPct,
      multiple,
    };
  });
}

export function formatRupiahJuta(juta: number, locale: AppLocale = "id"): string {
  const safe = Number.isFinite(juta) ? Math.max(0, juta) : 0;
  if (safe >= 1000) {
    const miliar = safe / 1000;
    const formatted =
      miliar >= 100
        ? Math.round(miliar).toLocaleString(locale === "id" ? "id-ID" : "en-US")
        : Number(miliar.toFixed(2)).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          });
    return locale === "id" ? `Rp${formatted} M` : `Rp${formatted}B`;
  }
  const rounded = safe % 1 === 0 ? Math.round(safe) : Number(safe.toFixed(1));
  const formatted = rounded.toLocaleString(locale === "id" ? "id-ID" : "en-US");
  return `Rp${formatted} jt`;
}

export function getAssetRungMeta(locale: AppLocale) {
  if (locale === "en") {
    return [
      { id: "cash" as const, label: "Cash / Deposit", short: "Cash", color: "#94a89b" },
      { id: "obligasi" as const, label: "Bonds (Obligasi)", short: "Bonds", color: "#7db4dc" },
      { id: "properti" as const, label: "Property", short: "Property", color: "#5ec4b6" },
      { id: "saham" as const, label: "Stocks (Saham)", short: "Stocks", color: "#7ce09c" },
      { id: "kripto" as const, label: "Crypto", short: "Crypto", color: "#edd377" },
    ];
  }
  return [
    { id: "cash" as const, label: "Cash / Deposito", short: "Cash", color: "#94a89b" },
    { id: "obligasi" as const, label: "Obligasi / SBN", short: "Obligasi", color: "#7db4dc" },
    { id: "properti" as const, label: "Properti", short: "Properti", color: "#5ec4b6" },
    { id: "saham" as const, label: "Saham", short: "Saham", color: "#7ce09c" },
    { id: "kripto" as const, label: "Kripto", short: "Kripto", color: "#edd377" },
  ];
}
