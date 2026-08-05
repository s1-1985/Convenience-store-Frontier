import { describe, expect, it } from "vitest";
import { createStoreOperationsEngine } from "../game/storeOperationsEngine.js";
import { detectStoreIncidents } from "../game/storeIncidents.js";

describe("live store incidents", () => {
  it("stays quiet while the store is healthy", () => {
    expect(detectStoreIncidents(createStoreOperationsEngine(1977).getSnapshot())).toEqual([]);
  });

  it("promotes a severe queue ahead of ordinary warnings", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    snapshot.queueCustomerIds = Array.from({ length: 8 }, (_, index) => `q${index}`);
    snapshot.kpis.stockoutEncounters = 3;

    const incidents = detectStoreIncidents(snapshot);
    expect(incidents[0]).toMatchObject({ id: "queue", severity: "critical" });
    expect(incidents[1]).toMatchObject({ id: "stockout", severity: "warning" });
  });

  it("surfaces repeated price resistance", () => {
    const snapshot = createStoreOperationsEngine(11).getSnapshot();
    snapshot.kpis.priceRefusals = 4;
    expect(detectStoreIncidents(snapshot)).toContainEqual(expect.objectContaining({
      id: "price_resistance",
      severity: "warning",
    }));
  });
});
