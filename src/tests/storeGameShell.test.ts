import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("store game shell controls", () => {
  const source = readFileSync(new URL("../ui/storeGameRuntime.ts", import.meta.url), "utf8");

  it("keeps primary time controls available without leaving the store", () => {
    expect(source).toContain('data-time-command="play"');
    expect(source).toContain('data-time-command="slot"');
    expect(source).toContain('data-time-command="day"');
    expect(source).toContain('data-time-speed="20"');
    expect(source).toContain("auto-stop-checkbox");
  });

  it("offers opening-hour presets and gated layout editing in the store panel", () => {
    expect(source).toContain('data-opening-hours="8,20"');
    expect(source).toContain('data-opening-hours="6,24"');
    expect(source).toContain("data-open-layout-editor");
    expect(source).toContain("snapshot.customers.length === 0");
  });

  it("shows live incidents and connects critical incidents to auto-stop", () => {
    expect(source).toContain("data-live-incident");
    expect(source).toContain("detectStoreIncidents(snapshot)");
    expect(source).toContain('incident.severity === "critical"');
    expect(source).toContain('optional<HTMLButtonElement>("play-button")?.click()');
  });

  it("surfaces the real Simulation's day-level diagnosis (buildDashboardAlerts) on the canvas, not only behind the hidden 詳細 dashboard", () => {
    expect(source).toContain("data-day-alert");
    expect(source).toContain("buildDashboardAlerts(latest)");
    expect(source).toContain("renderDayAlert(shell)");
  });

  it("offers category price controls in the product panel", () => {
    expect(source).toContain("data-price-category");
    expect(source).toContain("setCategoryPrice");
    expect(source).toContain("product-price-controls");
  });
});
