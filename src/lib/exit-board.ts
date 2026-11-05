import type { AppLocale } from "@/lib/types";

export const EXIT_BOARD_STORAGE_KEY = "bloom:exit-board-sim:v1";
export const MAX_WORKING_AGE = 74;
export const DEFAULT_HC_DISCOUNT_RATE = 0.04;
export const TARGET_SAVING_RATE_PCT = 80;
export const BASELINE_SAVING_RATE_PCT = 25;

export const ASSET_RUNG_IDS = ["cash", "obligasi", "properti", "saham", "kripto"] as const;
export type AssetRungId = (typeof ASSET_RUNG_IDS)[number];

export type ExitBoardLocaleOverride = AppLocale | null;

export const DEFAULT_ASSET_RETURNS_PCT: Record<AssetRungId, number> = {
  cash: 3,
  obligasi: 6,
  properti: 8,
  saham: 10,
  kripto: 18,
};

export type ExitBoardState = {
  step: number;
  localeOverride?: ExitBoardLocaleOverride;
  monthlyIncomeJuta: number;
  initialFcJuta: number;
  savingRatePct: number;
  startAge: number;
  selectedAsset: AssetRungId;
  assetReturnsPct: Record<AssetRungId, number>;
};

export const DEFAULT_EXIT_BOARD_STATE: ExitBoardState = {
  step: 4,
  localeOverride: null,
  monthlyIncomeJuta: 20,
  initialFcJuta: 0,
  savingRatePct: 25,
  startAge: 20,
  selectedAsset: "saham",
  assetReturnsPct: { ...DEFAULT_ASSET_RETURNS_PCT },
};

export type ExitBoardCurvePoint = {
  age: number;
  hcJuta: number;
  fcCurrentJuta: number;
  fcTargetJuta: number;
  fcBaseline25Juta: number;
};

export type CrossoverPoint = {
  /** Exact continuous age where FC crosses HC, or null if not reached by age 74. */
  exactAge: number | null;
  /** Rounded display age, or null if not reached by age 74. */
  displayAge: number | null;
  /** Value (in juta Rupiah) at crossover. */
  valueJuta: number | null;
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
  baseline25Crossover: CrossoverPoint;
  fcAt65CurrentJuta: number;
  fcAt65Target80Juta: number;
  maxChartValueJuta: number;
};

export type ExitBoardStepCopy = {
  step: number;
  title: string;
  body: string;
  keyLabel: string;
  keyValue: string;
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
  const step = Math.round(clampNumber(Number(obj.step ?? DEFAULT_EXIT_BOARD_STATE.step), 1, 8));
  let localeOverride: ExitBoardLocaleOverride =
    obj.localeOverride === "id" || obj.localeOverride === "en" ? obj.localeOverride : null;
  if (!localeOverride && typeof obj.voiceMode === "string") {
    if (obj.voiceMode === "en") localeOverride = "en";
    else if (obj.voiceMode.startsWith("id")) localeOverride = "id";
  }

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
    step,
    localeOverride,
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
  const r = annualReturnPct / 100;
  const sCurrent = savingRatePct / 100;
  const sTarget = TARGET_SAVING_RATE_PCT / 100;
  const sBase25 = BASELINE_SAVING_RATE_PCT / 100;

  // Backward recursion for Human Capital: HC_74 = 0, HC_t = (HC_{t+1} + Y) / (1 + d)
  const hcByAge: Record<number, number> = { [endAge]: 0 };
  for (let age = endAge - 1; age >= startAge; age--) {
    hcByAge[age] = (hcByAge[age + 1] + annualIncomeJuta) / (1 + hcDiscountRate);
  }

  const points: ExitBoardCurvePoint[] = [];
  let fcCurrent = initialFcJuta;
  let fcTarget = initialFcJuta;
  let fcBase25 = initialFcJuta;

  for (let age = startAge; age <= endAge; age++) {
    points.push({
      age,
      hcJuta: Number(hcByAge[age].toFixed(2)),
      fcCurrentJuta: Number(fcCurrent.toFixed(2)),
      fcTargetJuta: Number(fcTarget.toFixed(2)),
      fcBaseline25Juta: Number(fcBase25.toFixed(2)),
    });
    fcCurrent = fcCurrent * (1 + r) + sCurrent * annualIncomeJuta;
    fcTarget = fcTarget * (1 + r) + sTarget * annualIncomeJuta;
    fcBase25 = fcBase25 * (1 + r) + sBase25 * annualIncomeJuta;
  }

  const currentCrossover = findCrossover(
    points.map((p) => ({ age: p.age, hc: p.hcJuta, fc: p.fcCurrentJuta })),
  );
  const target80Crossover = findCrossover(
    points.map((p) => ({ age: p.age, hc: p.hcJuta, fc: p.fcTargetJuta })),
  );
  const baseline25Crossover = findCrossover(
    points.map((p) => ({ age: p.age, hc: p.hcJuta, fc: p.fcBaseline25Juta })),
  );

  const age65Point = points.find((p) => p.age === 65) ?? points[points.length - 1];
  const hcStart = points[0]?.hcJuta ?? annualIncomeJuta * 20;
  const maxRef = Math.max(
    hcStart * 1.32,
    (currentCrossover.valueJuta ?? 0) * 1.45,
    (target80Crossover.valueJuta ?? 0) * 1.45,
    annualIncomeJuta * 10,
  );

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
    baseline25Crossover,
    fcAt65CurrentJuta: age65Point ? Number(age65Point.fcCurrentJuta.toFixed(1)) : 0,
    fcAt65Target80Juta: age65Point ? Number(age65Point.fcTargetJuta.toFixed(1)) : 0,
    maxChartValueJuta: Number(maxRef.toFixed(1)),
  };
}

export function formatRupiahJuta(juta: number, locale: AppLocale = "id"): string {
  const safe = Number.isFinite(juta) ? Math.max(0, juta) : 0;
  if (safe >= 1000) {
    const miliar = safe / 1000;
    const formatted = miliar >= 100
      ? Math.round(miliar).toLocaleString(locale === "id" ? "id-ID" : "en-US")
      : Number(miliar.toFixed(1)).toLocaleString(locale === "id" ? "id-ID" : "en-US");
    return locale === "id" ? `Rp${formatted} M` : `Rp${formatted}B`;
  }
  const rounded = safe % 1 === 0 ? Math.round(safe) : Number(safe.toFixed(1));
  const formatted = rounded.toLocaleString(locale === "id" ? "id-ID" : "en-US");
  return `Rp${formatted} jt`;
}

export function getAssetRungMeta(locale: AppLocale) {
  if (locale === "en") {
    return [
      { id: "cash" as const, label: "Cash" },
      { id: "obligasi" as const, label: "Bonds" },
      { id: "properti" as const, label: "Property" },
      { id: "saham" as const, label: "Stocks" },
      { id: "kripto" as const, label: "Crypto" },
    ];
  }
  return [
    { id: "cash" as const, label: "Cash" },
    { id: "obligasi" as const, label: "Obligasi" },
    { id: "properti" as const, label: "Properti" },
    { id: "saham" as const, label: "Saham" },
    { id: "kripto" as const, label: "Kripto" },
  ];
}

export function getExitBoardSteps(
  locale: AppLocale,
  startAge: number,
  monthlyIncomeJuta: number,
): ExitBoardStepCopy[] {
  const incText = formatRupiahJuta(monthlyIncomeJuta, locale);
  const save25Text = formatRupiahJuta(monthlyIncomeJuta * 0.25, locale);
  const save80Text = formatRupiahJuta(monthlyIncomeJuta * 0.8, locale);
  const cap80Text = formatRupiahJuta(monthlyIncomeJuta * 0.2, locale);

  if (locale === "en") {
    return [
      {
        step: 1,
        title: "Age & Capital Axes",
        body: `Horizontal axis: productive age (${startAge}–${MAX_WORKING_AGE}). Vertical axis: discounted human capital vs. compounded financial capital.`,
        keyLabel: "horizon",
        keyValue: `${startAge} → ${MAX_WORKING_AGE} yrs`,
      },
      {
        step: 2,
        title: "Human Capital (HC)",
        body: "Present value of remaining future earning capacity (discount rate d = 4%/yr). Declines naturally to 0 near age 74. Core driver: skill.",
        keyLabel: "formula",
        keyValue: "HC → 0 (±74)",
      },
      {
        step: 3,
        title: "Financial Capital (FC)",
        body: "Invested capital compounded annually: FC(t+1) = FC(t)×(1+r) + S×Y. Starts near zero and curves upward exponentially. HC ≠ FC.",
        keyLabel: "formula",
        keyValue: "FC(t)×(1+r) + S×Y",
      },
      {
        step: 4,
        title: "Crossover Point (FC ≥ HC)",
        body: "Age where accumulated FC surpasses remaining HC. Standard baseline crosses near 65; high saving rate + return pulls crossover into the 30s.",
        keyLabel: "target shift",
        keyValue: "65 → 30s",
      },
      {
        step: 5,
        title: "Saving Rate (S)",
        body: `S = savings ÷ monthly income. On ${incText}/mo: S 25% saves ${save25Text}/mo; S 80% target saves ${save80Text}/mo.`,
        keyLabel: "saving rate",
        keyValue: "25% → 80%",
      },
      {
        step: 6,
        title: "Spending Cap",
        body: `Replaces 50/30/20 budgeting with a fixed ceiling: Spending Cap = Income × (1 − S). At ${incText} and S 80%, cap = ${cap80Text}/mo.`,
        keyLabel: "ceiling",
        keyValue: `Income × (1 − S)`,
      },
      {
        step: 7,
        title: "Risk–Return Ladder",
        body: "Cash (3%) → Bonds (6%) → Property (8%) → Stocks (10%) → Crypto (18%). Small capital compounds faster in 1 concentrated rung.",
        keyLabel: "allocation",
        keyValue: "1 Core Rung",
      },
      {
        step: 8,
        title: "HC Skill vs. FC Reserve",
        body: "Salaried income = steady HC cashflow feeding FC. Active trading = HC skill execution; keep learning/trading risk ring-fenced from long-term FC.",
        keyLabel: "separation",
        keyValue: "Skill (HC) ≠ FC",
      },
    ];
  }

  return [
    {
      step: 1,
      title: "Sumbu Usia & Nilai Modal",
      body: `Sumbu horizontal: rentang usia produktif (${startAge}–${MAX_WORKING_AGE} thn). Sumbu vertikal: nilai sekarang HC vs akumulasi majemuk FC.`,
      keyLabel: "rentang",
      keyValue: `${startAge} → ${MAX_WORKING_AGE} thn`,
    },
    {
      step: 2,
      title: "Human Capital (HC)",
      body: "Nilai sekarang dari sisa kapasitas penghasilan masa depan (diskon d = 4%/thn). Menurun alami menuju 0 di usia ±74. Faktor utama: skill.",
      keyLabel: "rumus",
      keyValue: "HC → 0 (±74)",
    },
    {
      step: 3,
      title: "Financial Capital (FC)",
      body: "Akumulasi modal yang digulung tiap tahun: FC(t+1) = FC(t)×(1+r) + S×Y. Mulai dari kecil lalu melengkung eksponensial. HC ≠ FC.",
      keyLabel: "rumus",
      keyValue: "FC(t)×(1+r) + S×Y",
    },
    {
      step: 4,
      title: "Titik Silang (FC ≥ HC)",
      body: "Usia ketika kurva FC melampaui kurva HC. Baseline rata-rata di usia ±65; kenaikan S dan r menarik titik silang maju ke usia 30-an.",
      keyLabel: "target",
      keyValue: "65 → 30-an",
    },
    {
      step: 5,
      title: "Saving Rate (S)",
      body: `S = tabungan ÷ total income. Pada ${incText}/bln: S 25% = ${save25Text}/bln; target S 80% = ${save80Text}/bln.`,
      keyLabel: "rasio simpan",
      keyValue: "25% → 80%",
    },
    {
      step: 6,
      title: "Spending Cap",
      body: `Mengganti pola 50/30/20 dengan batas pengeluaran: Spending Cap = Income × (1 − S). Pada ${incText} & S 80%, cap = ${cap80Text}/bln.`,
      keyLabel: "batas belanja",
      keyValue: "Income × (1 − S)",
    },
    {
      step: 7,
      title: "Tangga Risk–Return",
      body: "Cash (3%) → Obligasi (6%) → Properti (8%) → Saham (10%) → Kripto (18%). Modal kecil difokuskan pada 1 posisi utama yang dikuasai.",
      keyLabel: "alokasi",
      keyValue: "1 Posisi Utama",
    },
    {
      step: 8,
      title: "Pemisahan Skill HC & Modal FC",
      body: "Gaji tetap = arus kas HC stabil pengisi FC. Trading aktif = eksekusi skill (HC); pisahkan modal latihan trading dari tabungan FC jangka panjang.",
      keyLabel: "struktur",
      keyValue: "Skill (HC) ≠ FC",
    },
  ];
}
