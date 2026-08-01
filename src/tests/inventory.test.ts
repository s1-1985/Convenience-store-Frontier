import { describe, expect, it } from "vitest";
import {
  consumeFifo,
  expireBatches,
  roundUpToPackage,
  type InventoryBatch,
} from "../simulation/inventory.js";

describe("roundUpToPackage", () => {
  it("rounds up to the nearest package multiple", () => {
    expect(roundUpToPackage(5, 10)).toBe(10);
    expect(roundUpToPackage(10, 10)).toBe(10);
    expect(roundUpToPackage(11, 10)).toBe(20);
  });

  it("returns 0 for non-positive quantities", () => {
    expect(roundUpToPackage(0, 10)).toBe(0);
    expect(roundUpToPackage(-5, 10)).toBe(0);
  });
});

describe("consumeFifo", () => {
  it("consumes the oldest batch first", () => {
    const batches: InventoryBatch[] = [
      { productId: "p", quantity: 10, arrivalSlot: 0, expirySlot: 100 },
      { productId: "p", quantity: 10, arrivalSlot: 10, expirySlot: 110 },
    ];
    const { remaining, soldQuantity } = consumeFifo(batches, 5);
    expect(soldQuantity).toBe(5);
    expect(remaining).toEqual([
      { productId: "p", quantity: 5, arrivalSlot: 0, expirySlot: 100 },
      { productId: "p", quantity: 10, arrivalSlot: 10, expirySlot: 110 },
    ]);
  });

  it("spills over into the next batch once the oldest is exhausted", () => {
    const batches: InventoryBatch[] = [
      { productId: "p", quantity: 5, arrivalSlot: 0, expirySlot: 100 },
      { productId: "p", quantity: 10, arrivalSlot: 10, expirySlot: 110 },
    ];
    const { remaining, soldQuantity } = consumeFifo(batches, 8);
    expect(soldQuantity).toBe(8);
    expect(remaining).toEqual([{ productId: "p", quantity: 7, arrivalSlot: 10, expirySlot: 110 }]);
  });

  it("sells only what is available and reports the shortfall implicitly", () => {
    const batches: InventoryBatch[] = [{ productId: "p", quantity: 3, arrivalSlot: 0, expirySlot: 100 }];
    const { remaining, soldQuantity } = consumeFifo(batches, 10);
    expect(soldQuantity).toBe(3);
    expect(remaining).toEqual([]);
  });
});

describe("expireBatches", () => {
  it("removes batches whose expirySlot has passed and sums the wasted quantity", () => {
    const batches: InventoryBatch[] = [
      { productId: "p", quantity: 4, arrivalSlot: 0, expirySlot: 50 },
      { productId: "p", quantity: 6, arrivalSlot: 10, expirySlot: 200 },
    ];
    const { remaining, wastedQuantity } = expireBatches(batches, 100);
    expect(wastedQuantity).toBe(4);
    expect(remaining).toEqual([{ productId: "p", quantity: 6, arrivalSlot: 10, expirySlot: 200 }]);
  });

  it("keeps batches that expire exactly at the current slot out of remaining inventory", () => {
    const batches: InventoryBatch[] = [{ productId: "p", quantity: 4, arrivalSlot: 0, expirySlot: 100 }];
    const { remaining, wastedQuantity } = expireBatches(batches, 100);
    expect(wastedQuantity).toBe(4);
    expect(remaining).toEqual([]);
  });
});
