import { describe, expect, it } from "vitest";
import {
  applyEnergyTick,
  createStaffRoster,
  rollCleaning,
  rollReplenishment,
  tickStaffRosterSlot,
  type StaffMember,
} from "../simulation/staffAi.js";

function fixedRng(...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)]!;
    index += 1;
    return value;
  };
}

describe("createStaffRoster", () => {
  it("指定人数分、活力満タンの店員を生成する", () => {
    const roster = createStaffRoster(3, () => 0.5);
    expect(roster).toHaveLength(3);
    expect(roster.every((member) => member.energy === 100 && !member.resting)).toBe(true);
  });
});

describe("applyEnergyTick", () => {
  it("活動中、R&3==0(1/4)相当で活力-1する", () => {
    const member: StaffMember = { id: 0, refillAbility: 50, cleaningAbility: 50, energy: 100, resting: false };
    applyEnergyTick(member, false, fixedRng(0));
    expect(member.energy).toBe(99);
  });

  it("活動中、1/4に当たらなければ活力は変わらない", () => {
    const member: StaffMember = { id: 0, refillAbility: 50, cleaningAbility: 50, energy: 100, resting: false };
    applyEnergyTick(member, false, fixedRng(0.9));
    expect(member.energy).toBe(100);
  });

  it("活力は0未満にならない", () => {
    const member: StaffMember = { id: 0, refillAbility: 50, cleaningAbility: 50, energy: 0, resting: false };
    applyEnergyTick(member, false, fixedRng(0));
    expect(member.energy).toBe(0);
  });

  it("休憩中は無条件で+1し、100を超えない", () => {
    const member: StaffMember = { id: 0, refillAbility: 50, cleaningAbility: 50, energy: 100, resting: true };
    applyEnergyTick(member, true, fixedRng(0.9));
    expect(member.energy).toBe(100);

    member.energy = 50;
    applyEnergyTick(member, true, fixedRng(0.9));
    expect(member.energy).toBe(51);
  });
});

describe("rollReplenishment", () => {
  it("roll<=補充能力なら成功し、floor(能力/10)+1を要求する", () => {
    const member: StaffMember = { id: 0, refillAbility: 50, cleaningAbility: 0, energy: 100, resting: false };
    const result = rollReplenishment(member, fixedRng(0));
    expect(result).toEqual({ success: true, requestedUnits: 6 });
  });

  it("roll>補充能力なら失敗する", () => {
    const member: StaffMember = { id: 0, refillAbility: 10, cleaningAbility: 0, energy: 100, resting: false };
    const result = rollReplenishment(member, fixedRng(0.99));
    expect(result).toEqual({ success: false, requestedUnits: 0 });
  });

  it("能力100なら要求量は11", () => {
    const member: StaffMember = { id: 0, refillAbility: 100, cleaningAbility: 0, energy: 100, resting: false };
    const result = rollReplenishment(member, fixedRng(0));
    expect(result.requestedUnits).toBe(11);
  });
});

describe("rollCleaning", () => {
  it("1段目(1/5)の関門で失敗したら成功しない", () => {
    const member: StaffMember = { id: 0, refillAbility: 0, cleaningAbility: 100, energy: 100, resting: false };
    expect(rollCleaning(member, fixedRng(0.5, 0))).toBe(false);
  });

  it("1段目を通過し、roll<=清掃能力なら成功する", () => {
    const member: StaffMember = { id: 0, refillAbility: 0, cleaningAbility: 50, energy: 100, resting: false };
    expect(rollCleaning(member, fixedRng(0, 0))).toBe(true);
  });

  it("1段目を通過しても、roll>清掃能力なら失敗する", () => {
    const member: StaffMember = { id: 0, refillAbility: 0, cleaningAbility: 10, energy: 100, resting: false };
    expect(rollCleaning(member, fixedRng(0, 0.99))).toBe(false);
  });
});

describe("tickStaffRosterSlot", () => {
  it("店舗が閉まっていれば稼働人数は0で、活力は変化しない(独自設計: 閉店中は凍結)", () => {
    const roster: StaffMember[] = [
      { id: 0, refillAbility: 50, cleaningAbility: 50, energy: 30, resting: true },
      { id: 1, refillAbility: 50, cleaningAbility: 50, energy: 80, resting: false },
    ];
    const working = tickStaffRosterSlot(roster, 2, false, () => 0);
    expect(working).toBe(0);
    expect(roster[0]!.energy).toBe(30);
    expect(roster[0]!.resting).toBe(true);
    expect(roster[1]!.energy).toBe(80);
  });

  it("活力が十分ならnominalStaffCountどおり稼働する", () => {
    const roster = createStaffRoster(3, () => 0.5);
    const working = tickStaffRosterSlot(roster, 2, true, () => 0.9);
    expect(working).toBe(2);
  });

  it("活力が尽きた要員は休憩入りし、稼働人数が減る", () => {
    const roster: StaffMember[] = [
      { id: 0, refillAbility: 50, cleaningAbility: 50, energy: 1, resting: false },
      { id: 1, refillAbility: 50, cleaningAbility: 50, energy: 100, resting: false },
    ];
    // roll===0 (1/4相当) を全員に当てて、energy=1の要員を0まで減らす
    const working = tickStaffRosterSlot(roster, 2, true, () => 0);
    expect(roster[0]!.resting).toBe(true);
    expect(roster[0]!.energy).toBe(0);
    expect(working).toBe(1);
  });

  it("nominalStaffCountを超える要員は待機し、活力が変化しない", () => {
    const roster = createStaffRoster(3, () => 0.5);
    tickStaffRosterSlot(roster, 1, true, () => 0.9);
    expect(roster[2]!.energy).toBe(100);
  });
});
