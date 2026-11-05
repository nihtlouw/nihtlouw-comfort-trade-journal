import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSET_RUNG_IDS,
  DEFAULT_ASSET_RETURNS_PCT,
  DEFAULT_EXIT_BOARD_STATE,
  EXIT_BOARD_STORAGE_KEY,
  formatRupiahJuta,
  getAssetComparisonRows,
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
    // Out-of-pocket principal + pure compounding gain equals total FC
    assert.ok(
      Math.abs(
        result.points[i].principalCurrentJuta +
          result.points[i].gainCurrentJuta -
          result.points[i].fcCurrentJuta,
      ) < 1e-6,
    );
  }

  // Target S=80% pulls crossover into early 30s (~33), significantly earlier than S=25% (~42)
  assert.equal(result.target80Crossover.displayAge, 33);
  assert.ok(result.currentCrossover.displayAge !== null);
  assert.ok(result.currentCrossover.displayAge >= 41 && result.currentCrossover.displayAge <= 44);
  assert.ok(result.currentCrossover.displayAge - result.target80Crossover.displayAge >= 8);

  // Advisor snapshot separates out-of-pocket principal vs compounding profit
  assert.equal(result.primarySnapshot.isCrossover, true);
  assert.equal(result.primarySnapshot.principalJuta, 22 * 60); // Rp5 jt/mo * 12 * 22 yrs = 1320 jt
  assert.ok(result.primarySnapshot.gainJuta > result.primarySnapshot.principalJuta * 2);
  assert.ok(result.primarySnapshot.gainPct > 200);
  assert.ok(result.primarySnapshot.multiple >= 3);

  // Snowball inflection age occurs when annual portfolio yield exceeds annual savings
  assert.ok(result.snowballAge !== null && result.snowballAge >= 26 && result.snowballAge <= 32);
  assert.equal(result.milestones.length, 4);
});

test("simulateExitBoard pulls crossover earlier and increases wealth across all 5 asset rungs", () => {
  const sim = simulateExitBoard(DEFAULT_EXIT_BOARD_STATE);
  const rows20 = getAssetComparisonRows(sim, DEFAULT_ASSET_RETURNS_PCT, "20y");

  assert.equal(rows20.length, 5);
  // Every asset row at 20y shares the exact same out-of-pocket principal (Rp1.200 jt)
  for (const row of rows20) {
    assert.equal(row.evalYears, 20);
    assert.equal(row.principalJuta, 1200);
    assert.ok(row.crossoverAge !== null);
  }

  for (let i = 1; i < rows20.length; i++) {
    assert.ok(
      rows20[i].totalJuta > rows20[i - 1].totalJuta,
      `expected ${rows20[i].id} total (${rows20[i].totalJuta}) > ${rows20[i - 1].id} (${rows20[i - 1].totalJuta})`,
    );
    assert.ok(
      rows20[i].gainJuta > rows20[i - 1].gainJuta,
      `expected ${rows20[i].id} gain > ${rows20[i - 1].id}`,
    );
    assert.ok(
      (rows20[i].crossoverAge ?? 99) < (rows20[i - 1].crossoverAge ?? 0),
      `expected ${rows20[i].id} to cross earlier than ${rows20[i - 1].id}`,
    );
  }

  for (const mode of ["10y", "20y", "crossover", "age60"] as const) {
    const modeRows = getAssetComparisonRows(sim, DEFAULT_ASSET_RETURNS_PCT, mode);
    assert.equal(modeRows.length, ASSET_RUNG_IDS.length);
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
    localeOverride: "id",
    monthlyIncomeJuta: -50,
    savingRatePct: 999,
    startAge: 5,
    selectedAsset: "unknown",
    horizonMode: "invalid",
  });
  assert.equal(clamped.localeOverride, "id");
  assert.equal(clamped.monthlyIncomeJuta, 1);
  assert.equal(clamped.savingRatePct, 90);
  assert.equal(clamped.startAge, 18);
  assert.equal(clamped.selectedAsset, "saham");
  assert.equal(clamped.horizonMode, "20y");

  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  saveExitBoardState(storage, {
    ...DEFAULT_EXIT_BOARD_STATE,
    localeOverride: "id",
    savingRatePct: 80,
    horizonMode: "crossover",
  });
  const loaded = loadExitBoardState(storage);
  assert.equal(loaded.localeOverride, "id");
  assert.equal(loaded.savingRatePct, 80);
  assert.equal(loaded.horizonMode, "crossover");

  mem.set(EXIT_BOARD_STORAGE_KEY, "{broken-json");
  const fallback = loadExitBoardState(storage);
  assert.equal(fallback.monthlyIncomeJuta, 20);
  assert.equal(fallback.savingRatePct, 25);

  assert.equal(formatRupiahJuta(20, "id"), "Rp20 jt");
  assert.equal(formatRupiahJuta(2500, "id"), "Rp2,5 M");
  assert.equal(formatRupiahJuta(2500, "en"), "Rp2.5B");
});
