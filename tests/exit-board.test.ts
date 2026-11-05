import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSET_RUNG_IDS,
  DEFAULT_ASSET_RETURNS_PCT,
  DEFAULT_EXIT_BOARD_STATE,
  EXIT_BOARD_STORAGE_KEY,
  formatRupiahJuta,
  getExitBoardSteps,
  loadExitBoardState,
  MAX_WORKING_AGE,
  normalizeExitBoardState,
  saveExitBoardState,
  simulateExitBoard,
} from "../src/lib/exit-board";

test("simulateExitBoard matches chalkboard baseline math (Rp20 jt, S=25% vs 80%, age 20, saham 10%)", () => {
  const result = simulateExitBoard(DEFAULT_EXIT_BOARD_STATE);

  assert.equal(result.monthlyIncomeJuta, 20);
  assert.equal(result.monthlySavingJuta, 5);
  assert.equal(result.monthlySpendingCapCurrentJuta, 15);
  assert.equal(result.monthlySpendingCapTarget80Juta, 4);

  // HC descends monotonically from age 20 down to 0 at age 74
  assert.equal(result.points[0].age, 20);
  assert.equal(result.points[result.points.length - 1].age, MAX_WORKING_AGE);
  assert.equal(result.points[result.points.length - 1].hcJuta, 0);
  for (let i = 1; i < result.points.length; i++) {
    assert.ok(result.points[i].hcJuta < result.points[i - 1].hcJuta);
    assert.ok(result.points[i].fcCurrentJuta > result.points[i - 1].fcCurrentJuta);
    assert.ok(result.points[i].fcTargetJuta > result.points[i].fcCurrentJuta);
  }

  // Target S=80% pulls crossover into early 30s (~33), significantly earlier than S=25% (~42)
  assert.equal(result.target80Crossover.displayAge, 33);
  assert.ok(result.currentCrossover.displayAge !== null);
  assert.ok(result.currentCrossover.displayAge >= 41 && result.currentCrossover.displayAge <= 44);
  assert.ok(result.currentCrossover.displayAge - result.target80Crossover.displayAge >= 8);
});

test("simulateExitBoard pulls crossover earlier as user climbs the 5-rung asset ladder", () => {
  const ages: number[] = [];
  for (const rung of ASSET_RUNG_IDS) {
    const sim = simulateExitBoard({
      ...DEFAULT_EXIT_BOARD_STATE,
      selectedAsset: rung,
    });
    assert.ok(sim.currentCrossover.exactAge !== null, `expected crossover for ${rung}`);
    ages.push(sim.currentCrossover.exactAge);
  }

  for (let i = 1; i < ages.length; i++) {
    assert.ok(
      ages[i] < ages[i - 1],
      `expected higher rung ${ASSET_RUNG_IDS[i]} (${ages[i]}) to cross earlier than ${ASSET_RUNG_IDS[i - 1]} (${ages[i - 1]})`,
    );
  }
});

test("simulateExitBoard honors custom editable return % and starting FC savings", () => {
  const base = simulateExitBoard(DEFAULT_EXIT_BOARD_STATE);
  const higherReturn = simulateExitBoard({
    ...DEFAULT_EXIT_BOARD_STATE,
    assetReturnsPct: { ...DEFAULT_ASSET_RETURNS_PCT, saham: 15 },
  });
  const withInitialSavings = simulateExitBoard({
    ...DEFAULT_EXIT_BOARD_STATE,
    initialFcJuta: 500,
  });

  assert.ok(
    (higherReturn.currentCrossover.exactAge ?? 99) < (base.currentCrossover.exactAge ?? 99),
  );
  assert.ok(
    (withInitialSavings.currentCrossover.exactAge ?? 99) < (base.currentCrossover.exactAge ?? 99),
  );
});

test("normalizeExitBoardState and storage helpers clamp invalid values and survive corrupt JSON", () => {
  const clamped = normalizeExitBoardState({
    step: 99,
    localeOverride: "id",
    monthlyIncomeJuta: -50,
    savingRatePct: 999,
    startAge: 5,
    selectedAsset: "unknown",
  });
  assert.equal(clamped.step, 8);
  assert.equal(clamped.localeOverride, "id");
  assert.equal(clamped.monthlyIncomeJuta, 1);
  assert.equal(clamped.savingRatePct, 90);
  assert.equal(clamped.startAge, 18);
  assert.equal(clamped.selectedAsset, "saham");

  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  saveExitBoardState(storage, { ...DEFAULT_EXIT_BOARD_STATE, step: 6, localeOverride: "id", savingRatePct: 80 });
  const loaded = loadExitBoardState(storage);
  assert.equal(loaded.step, 6);
  assert.equal(loaded.localeOverride, "id");
  assert.equal(loaded.savingRatePct, 80);

  mem.set(EXIT_BOARD_STORAGE_KEY, "{broken-json");
  const fallback = loadExitBoardState(storage);
  assert.equal(fallback.monthlyIncomeJuta, 20);
  assert.equal(fallback.savingRatePct, 25);
});

test("getExitBoardSteps provides 8 concise technical steps in Indonesian and English", () => {
  const idSteps = getExitBoardSteps("id", 22, 30);
  const enSteps = getExitBoardSteps("en", 22, 30);

  assert.equal(idSteps.length, 8);
  assert.equal(enSteps.length, 8);

  assert.match(idSteps[0].keyValue, /22/);
  assert.match(idSteps[5].body, /Rp6 jt/); // 20% of Rp30 jt spending cap
  assert.match(enSteps[3].title, /Crossover/i);
  assert.match(idSteps[7].keyValue, /Skill \(HC\)/);

  assert.equal(formatRupiahJuta(20, "id"), "Rp20 jt");
  assert.equal(formatRupiahJuta(2500, "id"), "Rp2,5 M");
  assert.equal(formatRupiahJuta(2500, "en"), "Rp2.5B");
});
