import type {
  StoreOperationsSnapshot,
  StoreStaffAssignments,
  StoreStaffTask,
} from "./storeOperationsEngine.js";

export type StoreStaffPreset = "balanced" | "register" | "replenishment" | "cleaning";

function distribute(total: number, priority: readonly StoreStaffTask[]): StoreStaffAssignments {
  const result: StoreStaffAssignments = { register: 0, replenishment: 0, cleaning: 0 };
  const staffCount = Math.max(1, Math.round(total));
  for (let index = 0; index < staffCount; index += 1) {
    const task = priority[index % priority.length] ?? "register";
    result[task] += 1;
  }
  return result;
}

export function assignmentsForPreset(
  preset: StoreStaffPreset,
  staffCount: number,
): StoreStaffAssignments {
  if (preset === "register") return distribute(staffCount, ["register", "register", "replenishment"]);
  if (preset === "replenishment") {
    return distribute(staffCount, ["replenishment", "replenishment", "register"]);
  }
  if (preset === "cleaning") return distribute(staffCount, ["cleaning", "register", "cleaning"]);
  return distribute(staffCount, ["register", "replenishment", "cleaning"]);
}

export interface StaffingRecommendation {
  preset: StoreStaffPreset;
  label: string;
  reason: string;
  assignments: StoreStaffAssignments;
}

export function recommendStaffing(snapshot: StoreOperationsSnapshot): StaffingRecommendation {
  const staffCount = Math.max(1, snapshot.staff.length);
  if (snapshot.queueCustomerIds.length >= 3 || snapshot.kpis.queueAbandonments > 0) {
    return {
      preset: "register",
      label: "おすすめ：レジ優先",
      reason: `行列${snapshot.queueCustomerIds.length}人。会計担当を増やします。`,
      assignments: assignmentsForPreset("register", staffCount),
    };
  }
  const lowShelves = Object.values(snapshot.inventories).filter(
    (inventory) => inventory.shelfUnits / Math.max(1, inventory.shelfCapacity) < 0.35,
  ).length;
  if (lowShelves >= 2 || snapshot.kpis.stockoutEncounters >= 2) {
    return {
      preset: "replenishment",
      label: "おすすめ：補充優先",
      reason: `在庫の少ない棚が${lowShelves}か所。補充担当を増やします。`,
      assignments: assignmentsForPreset("replenishment", staffCount),
    };
  }
  if (snapshot.litter.length >= 2) {
    return {
      preset: "cleaning",
      label: "おすすめ：清掃優先",
      reason: `店内にゴミが${snapshot.litter.length}個あります。`,
      assignments: assignmentsForPreset("cleaning", staffCount),
    };
  }
  return {
    preset: "balanced",
    label: "おすすめ：バランス",
    reason: "大きな問題はありません。担当を均等にします。",
    assignments: assignmentsForPreset("balanced", staffCount),
  };
}
