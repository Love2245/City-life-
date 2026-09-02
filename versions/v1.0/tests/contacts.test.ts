import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  defaultContacts,
  addContact,
  hasContact,
  isReferred,
  tickContactBenefits,
  callContact,
} from "../src/game/core/contacts";
import { checkJobRequirements, getJobDef } from "../src/game/core/jobs";
import { applyJob } from "../src/game/core/career";
import type { GameState } from "../src/game/types";

function fresh(): GameState {
  const s = createInitialState(1);
  // 给足属性以便就业/加联系人判定
  s.player.attrs.health = 100;
  s.player.attrs.stamina = 100;
  s.player.stats.intelligence = 60;
  s.player.stats.charm = 60;
  s.player.skills.service = 3; // 满足咖啡店/便利店固定岗技能门槛，便于测试证书豁免
  return s;
}

describe("v0.978 联系人系统", () => {
  it("开局默认联系人为父母两人", () => {
    const s = fresh();
    expect(s.contacts).toHaveLength(2);
    expect(s.contacts.map((c) => c.id).sort()).toEqual(["parent_father", "parent_mother"]);
    expect(defaultContacts()).toHaveLength(2);
  });

  it("addContact 幂等 + 发欢迎短信 + 内推免证书", () => {
    const s = fresh();
    const before = s.smsInbox.length;
    expect(addContact(s, "cafe_clerk")).toBe(true);
    expect(addContact(s, "cafe_clerk")).toBe(false); // 幂等
    expect(hasContact(s, "cafe_clerk")).toBe(true);
    expect(s.smsInbox.length).toBe(before + 1); // 欢迎短信
    expect(isReferred(s, "job_cafe_staff")).toBe(true); // 内推 flag
  });

  it("书法大爷赠送手稿 + 内推便利店（convenience_clerk）", () => {
    const s = fresh();
    addContact(s, "park_calligraphy_grandpa");
    // v0.99 修复：赠物进背包计数 inventory（原误入 ownedItems 开局选品字段，物品永远无法使用）
    expect(s.inventory["item_manuscript"]).toBe(1);
    addContact(s, "convenience_clerk");
    expect(isReferred(s, "job_convenience_clerk")).toBe(true);
  });

  it("内推后可免证书直接正式入职（intern=false）", () => {
    const s = fresh();
    const job = getJobDef("job_cafe_staff")!;
    // 内推前：无证可实习（ok:true, intern:true）
    const base = checkJobRequirements(s, job);
    expect(base.ok).toBe(true);
    expect(base.intern).toBe(true);
    // 内推后：免证书直接正式入职（intern:false）
    addContact(s, "cafe_clerk");
    const r = checkJobRequirements(s, job);
    expect(r.ok).toBe(true);
    expect(r.intern).toBe(false);
  });

  it("无内推时无证进入证书岗为实习态（intern=true）", () => {
    const s = fresh();
    const job = getJobDef("job_cafe_staff")!;
    const r = checkJobRequirements(s, job);
    expect(r.ok).toBe(true);
    expect(r.intern).toBe(true);
  });

  it("tickContactBenefits 按间隔发送教程短信并结算效果", () => {
    const s = fresh();
    addContact(s, "library_coder"); // tutorial everyDays=12, +programming
    const before = s.player.skills.programming;
    const smsBefore = s.smsInbox.length;
    // 快进到间隔之后
    s.time.day += 13;
    tickContactBenefits(s);
    expect(s.smsInbox.length).toBe(smsBefore + 1);
    expect(s.player.skills.programming).toBe(before + 1);
  });

  it("入职电子厂自动加组长联系人", () => {
    const s = fresh();
    const job = getJobDef("job_factory_line")!;
    const res = applyJob(s, job);
    expect(res.ok).toBe(true);
    expect(hasContact(s, "factory_leader")).toBe(true);
  });

  it("给联系人打电话返回结算结果", () => {
    const s = fresh();
    const r = callContact(s, "parent_mother");
    expect(r.ok).toBe(true);
    expect(r.text.length).toBeGreaterThan(0);
  });
});
