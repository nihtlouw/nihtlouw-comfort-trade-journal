import type { AppLocale } from "@/lib/types";

export const EXIT_BOARD_STORAGE_KEY = "bloom:exit-board-sim:v1";
export const MAX_WORKING_AGE = 74;
export const DEFAULT_HC_DISCOUNT_RATE = 0.04;
export const TARGET_SAVING_RATE_PCT = 80;
export const BASELINE_SAVING_RATE_PCT = 25;

export const ASSET_RUNG_IDS = ["cash", "obligasi", "properti", "saham", "kripto"] as const;
export type AssetRungId = (typeof ASSET_RUNG_IDS)[number];

export type ExitBoardTone = "kamu" | "lugua";
export type ExitBoardVoiceMode = "id_kamu" | "id_lugua" | "en";

export const DEFAULT_ASSET_RETURNS_PCT: Record<AssetRungId, number> = {
  cash: 3,
  obligasi: 6,
  properti: 8,
  saham: 10,
  kripto: 18,
};

export type ExitBoardState = {
  step: number;
  tone: ExitBoardTone;
  voiceMode?: ExitBoardVoiceMode | null;
  monthlyIncomeJuta: number;
  initialFcJuta: number;
  savingRatePct: number;
  startAge: number;
  selectedAsset: AssetRungId;
  assetReturnsPct: Record<AssetRungId, number>;
};

export const DEFAULT_EXIT_BOARD_STATE: ExitBoardState = {
  step: 4,
  tone: "kamu",
  voiceMode: null,
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
  const obj = raw as Partial<ExitBoardState>;
  const step = Math.round(clampNumber(Number(obj.step ?? DEFAULT_EXIT_BOARD_STATE.step), 1, 8));
  const tone: ExitBoardTone = obj.tone === "lugua" ? "lugua" : "kamu";
  const voiceMode: ExitBoardVoiceMode | null =
    obj.voiceMode === "id_kamu" || obj.voiceMode === "id_lugua" || obj.voiceMode === "en"
      ? obj.voiceMode
      : null;
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
    tone,
    voiceMode,
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

export function getAssetRungMeta(locale: AppLocale, tone: ExitBoardTone) {
  if (locale === "en") {
    return [
      { id: "cash" as const, label: "Cash", riskNote: "Lowest volatility · purchasing power erodes slowly" },
      { id: "obligasi" as const, label: "Bonds", riskNote: "Steady coupon · moderate capital preservation" },
      { id: "properti" as const, label: "Property", riskNote: "Tangible asset · illiquid for small starting capital" },
      { id: "saham" as const, label: "Stocks", riskNote: "Productive equity · strong long-term compounding" },
      { id: "kripto" as const, label: "Crypto", riskNote: "Highest volatility · steep swings up and down" },
    ];
  }
  const pronoun = tone === "lugua" ? "lu" : "kamu";
  return [
    { id: "cash" as const, label: "cash", riskNote: `Paling stabil, tapi daya beli uang ${pronoun} pelan-pelan tergerus inflasi` },
    { id: "obligasi" as const, label: "obligasi", riskNote: "Imbal hasil kupon terukur, cocok untuk menjaga nilai" },
    { id: "properti" as const, label: "properti", riskNote: "Aset fisik berwujud, kurang likuid saat modal awal masih kecil" },
    { id: "saham" as const, label: "saham", riskNote: "Kepemilikan bisnis produktif dengan gulungan jangka panjang kuat" },
    { id: "kripto" as const, label: "kripto", riskNote: "Paling tinggi di tangga risiko-imbal hasil, fluktuasi tajam" },
  ];
}

export function getExitBoardSteps(
  locale: AppLocale,
  tone: ExitBoardTone,
  startAge: number,
  monthlyIncomeJuta: number,
): ExitBoardStepCopy[] {
  const incText = formatRupiahJuta(monthlyIncomeJuta, locale);
  const save25Text = formatRupiahJuta(monthlyIncomeJuta * 0.25, locale);
  const cap80Text = formatRupiahJuta(monthlyIncomeJuta * 0.2, locale);

  if (locale === "en") {
    return [
      {
        step: 1,
        title: "A blank board",
        body: `The horizontal line tracks your age starting at ${startAge}. Above it, we draw two curves that decide when you no longer have to trade hours for survival.`,
        keyLabel: "key anchor",
        keyValue: `age ${startAge}`,
      },
      {
        step: 2,
        title: "Human capital",
        body: "Your ability to work, energy, remaining time, and earning capacity decline toward roughly age 74. Everything on this curve rests on one word: skill.",
        keyLabel: "key anchor",
        keyValue: "age ±74",
      },
      {
        step: 3,
        title: "Financial capital",
        body: "The capital you keep and compound across life. It starts tiny at the bottom-left and bends upward over decades. Human capital is not financial capital.",
        keyLabel: "key anchor",
        keyValue: "FC starts small",
      },
      {
        step: 4,
        title: "The crossover point",
        body: "When financial capital crosses human capital, your invested assets can carry your living costs. Average people cross near 65. The real question: how do you pull it back into your 30s?",
        keyLabel: "key anchor",
        keyValue: "65 → 30s",
      },
      {
        step: 5,
        title: "Saving rate (S)",
        body: `Saving rate S = savings ÷ total income. On ${incText}/month, saving ${save25Text} is 25%. Pulling the crossover forward comes from pushing S toward an aggressive 80% target.`,
        keyLabel: "key anchor",
        keyValue: "25% → 80%",
      },
      {
        step: 6,
        title: "Spending cap",
        body: `Replace loose 50/30/20 habits with one clean ceiling: Spending Cap = Income × (1 − S). At ${incText} income and 80% saving rate, monthly living stays capped at ${cap80Text}.`,
        keyLabel: "key anchor",
        keyValue: "income × (1 − S)",
      },
      {
        step: 7,
        title: "Risk-return ladder",
        body: "From bottom to top: cash, bonds, property, stocks, crypto. While capital is still small, scattering across five baskets dilutes growth—focus conviction on one primary rung you truly study.",
        keyLabel: "key anchor",
        keyValue: "one core rung",
      },
      {
        step: 8,
        title: "Three anchors to simulate",
        body: "Test your own numbers in the simulator below. Watch how three levers—your Saving Rate, your Spending Cap, and your chosen Asset Rung—shift your crossover age in real time.",
        keyLabel: "key anchor",
        keyValue: "S% · Cap · Age",
      },
    ];
  }

  if (tone === "lugua") {
    return [
      {
        step: 1,
        title: "Papan tulis kosong",
        body: `Garis mendatar di bawah itu umur lu, mulai dari ${startAge}. Di atas garis ini gua bakal gambar dua kurva yang nentuin kapan lu berhenti kerja demi bertahan hidup.`,
        keyLabel: "angka kunci",
        keyValue: `umur ${startAge}`,
      },
      {
        step: 2,
        title: "Human capital",
        body: "Kapasitas kerja, tenaga, sisa waktu produktif, dan income lu pelan-pelan turun sampai sekitar umur 74. Inti dari kurva ini cuma satu kata: skill.",
        keyLabel: "angka kunci",
        keyValue: "±74 tahun",
      },
      {
        step: 3,
        title: "Financial capital",
        body: "Uang yang beneran lu kumpulin dan gulung sepanjang hidup. Awalnya kecil banget di pojok bawah, lalu melengkung naik. Ingat: skill kerja itu beda sama modal uang.",
        keyLabel: "angka kunci",
        keyValue: "FC mulai kecil",
      },
      {
        step: 4,
        title: "Titik silang",
        body: "Begitu garis financial capital nyalip human capital, aset lu udah sanggup nutup biaya hidup. Rata-rata orang baru ketemu di umur 65. Pertanyaannya: gimana narik titik ini mundur ke 30-an?",
        keyLabel: "angka kunci",
        keyValue: "65 → 30-an",
      },
      {
        step: 5,
        title: "Saving rate",
        body: `Rumusnya S = tabungan ÷ total income. Dari ${incText} kalau lu sisihin ${save25Text}, S lu baru 25%. Buat narik titik silang jauh lebih cepat, target di papan tulis ini adalah S 80%.`,
        keyLabel: "angka kunci",
        keyValue: "25% → 80%",
      },
      {
        step: 6,
        title: "Spending cap",
        body: `Tinggalin pola bagi-bagi 50/30/20, ganti pakai satu batas tegas: Batas Belanja = Income × (1 − S). Kalau income ${incText} dan target S 80%, hidup lu dikunci di ${cap80Text}/bulan.`,
        keyLabel: "angka kunci",
        keyValue: "income × (1 − S)",
      },
      {
        step: 7,
        title: "Tangga risk-return",
        body: "Urutannya dari bawah ke atas: cash, obligasi, properti, saham, kripto. Waktu modal masih kecil, jangan dipecah ke mana-mana—fokus satu posisi utama di aset yang beneran lu pahami.",
        keyLabel: "angka kunci",
        keyValue: "satu posisi utama",
      },
      {
        step: 8,
        title: "Tiga pegangan simulasi",
        body: "Sekarang geser sendiri angka lu di bawah. Lihat langsung gimana tiga tuas ini—Saving Rate, Batas Belanja, dan Tangga Aset—ngubah umur titik silang lu detik ini juga.",
        keyLabel: "angka kunci",
        keyValue: "S% · Cap · Umur",
      },
    ];
  }

  return [
    {
      step: 1,
      title: "Papan tulis kosong",
      body: `Garis mendatar di bawah adalah umurmu, dimulai dari ${startAge}. Di atasnya kita menggambar dua kurva yang menentukan kapan hidupmu tidak lagi bergantung pada menukar jam kerja.`,
      keyLabel: "angka kunci",
      keyValue: `umur ${startAge}`,
    },
    {
      step: 2,
      title: "Human capital",
      body: "Kemampuan kerja, energi, sisa waktu produktif, dan kapasitas penghasilanmu menurun alami hingga sekitar umur 74. Inti dari kurva ini hanya satu kata: skill.",
      keyLabel: "angka kunci",
      keyValue: "±74 tahun",
    },
    {
      step: 3,
      title: "Financial capital",
      body: "Uang yang benar-benar kamu sisihkan dan gulung sepanjang hidup. Mulainya kecil di kiri bawah, lalu tumbuh melengkung naik. Human capital tidak sama dengan financial capital.",
      keyLabel: "angka kunci",
      keyValue: "FC mulai kecil",
    },
    {
      step: 4,
      title: "Titik silang",
      body: "Saat kurva financial capital bertemu human capital, uangmu sudah sanggup menanggung biaya hidup. Rata-rata orang bertemu di umur sekitar 65. Pertanyaannya: bagaimana menariknya mundur ke 30-an?",
      keyLabel: "angka kunci",
      keyValue: "65 → 30-an",
    },
    {
      step: 5,
      title: "Saving rate",
      body: `Rumusnya S = tabungan ÷ total income. Dari ${incText}, menabung ${save25Text} berarti S = 25%. Untuk menarik titik silang jauh lebih maju, target percepatan di papan tulis ini adalah 80%.`,
      keyLabel: "angka kunci",
      keyValue: "25% → 80%",
    },
    {
      step: 6,
      title: "Spending cap",
      body: `Ganti kebiasaan 50/30/20 dengan satu pagar sederhana: Batas Belanja = Income × (1 − S). Dengan income ${incText} dan target S 80%, batas belanjamu terjaga di ${cap80Text}/bulan.`,
      keyLabel: "angka kunci",
      keyValue: "income × (1 − S)",
    },
    {
      step: 7,
      title: "Tangga risk-return",
      body: "Dari paling bawah ke atas: cash, obligasi, properti, saham, kripto. Saat modal masih kecil, memecah uang ke terlalu banyak tempat memperlambat laju—fokus pada satu posisi utama yang kamu kuasai.",
      keyLabel: "angka kunci",
      keyValue: "satu posisi utama",
    },
    {
      step: 8,
      title: "Tiga pegangan simulasi",
      body: "Silakan uji angkamu sendiri pada simulator di bawah. Amati bagaimana Saving Rate, Batas Belanja, dan pilihan Tangga Aset menggeser umur titik silangmu secara langsung.",
      keyLabel: "angka kunci",
      keyValue: "S% · Cap · Umur",
    },
  ];
}
