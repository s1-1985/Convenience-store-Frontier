import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../data/loaders/loadScenario.js";
import { validateProducts, validateStore } from "../data/validation/validate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = resolve(__dirname, "../../data/scenarios/vertical_slice_30d.json");

describe("loadScenario", () => {
  it("loads and validates the vertical slice scenario bundle", () => {
    const bundle = loadScenario(SCENARIO_PATH);

    expect(bundle.scenario.totalDays).toBe(30);
    expect(bundle.cohorts).toHaveLength(6);
    expect(bundle.categories).toHaveLength(6);
    expect(bundle.products).toHaveLength(12);
    expect(bundle.playerStore.isPlayerControlled).toBe(true);
    expect(bundle.competitorStores).toHaveLength(1);
    expect(bundle.timeBlocks).toHaveLength(4);
  });

  it("throws when a store's category area does not sum to the expected total", () => {
    const bundle = loadScenario(SCENARIO_PATH);
    const brokenStore = { ...bundle.playerStore, categoryArea: { category_ready_to_eat: 5 } };
    expect(() => validateStore(brokenStore, bundle.categories, bundle.economy)).toThrow();
  });

  it("throws when a product references an unknown category", () => {
    const bundle = loadScenario(SCENARIO_PATH);
    const brokenProduct = { ...bundle.products[0]!, categoryId: "category_does_not_exist" };
    expect(() => validateProducts([brokenProduct], bundle.categories)).toThrow();
  });
});
