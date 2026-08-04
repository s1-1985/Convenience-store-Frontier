import { describe, expect, it } from "vitest";
import { planStoreStaffTasks } from "../game/storeTaskScheduler.js";

describe("store task scheduler", () => {
  it("keeps a useful priority and sends surplus staff to other pending work", () => {
    expect(
      planStoreStaffTasks(
        ["replenishment", "replenishment", "replenishment"],
        { register: 1, replenishment: 1, cleaning: 1 },
      ),
    ).toEqual(["replenishment", "register", "cleaning"]);
  });

  it("uses priorities when there is no current work", () => {
    expect(
      planStoreStaffTasks(
        ["register", "cleaning"],
        { register: 0, replenishment: 0, cleaning: 0 },
      ),
    ).toEqual(["register", "cleaning"]);
  });

  it("rounds live workload up to whole workers", () => {
    expect(
      planStoreStaffTasks(
        ["cleaning", "cleaning"],
        { register: 0.2, replenishment: 0, cleaning: 0.2 },
      ),
    ).toEqual(["cleaning", "register"]);
  });
});
