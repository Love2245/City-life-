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
import { applyForJob, checkJobRequirements, getJobDef } from "../src/game/core/jobs";
import type { GameState } from "../src/game/types";

function fresh(): GameState {
  const s = createInitialState(1);
  return s;
}

describe("v0.978 联系人系统", () => {
  it("开局默认联系人为父母两人", () => {
    const s = fresh();
    expect(s.contacts).toHaveLength(2);
    expect(s.contacts.map((c) => c.id).sort()).toEqual(["parent_father", "parent_mother"]);
    expect(defaultContacts()).toHaveLength(2);
  });

  it("addContact 幂等 + 发欢迎短信 + 保留内推记录", () => {
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

  it("内推保留社交标记，可免证书但仍需满足属性和技能要求", () => {
    const s = fresh();
    const job = getJobDef("job_cafe_staff")!;
    s.player.attrs.health = 100;
    s.player.skills.service = 3;
    expect(checkJobRequirements(s, job)).toMatchObject({ ok: false, intern: false });
    addContact(s, "cafe_clerk");
    expect(isReferred(s, job.id)).toBe(true);
    const r = checkJobRequirements(s, job);
    expect(r.ok).toBe(true);
    expect(r.intern).toBe(false);
    expect(applyForJob(s, job).ok).toBe(true);
    expect(s.career.jobId).toBe(job.id);
  });

  it("无内推时必须满足岗位技能与证书要求，达标后正式录用", () => {
    const s = fresh();
    const job = getJobDef("job_cafe_staff")!;
    const r = checkJobRequirements(s, job);
    expect(r.ok).toBe(false);
    expect(r.intern).toBe(false);
    expect(applyForJob(s, job).ok).toBe(false);
    expect(s.career.jobId).toBeNull();

    s.player.attrs.health = 100;
    s.player.skills.service = 3;
    s.flags.item_certificate = true;
    expect(checkJobRequirements(s, job).ok).toBe(true);
    expect(applyForJob(s, job).ok).toBe(true);
    expect(s.career.kind).toBe("weekly");
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
    const job = getJobDef("job_factory_qc")!;
    const res = applyForJob(s, job);
    expect(res.ok).toBe(true);
    expect(s.career.jobId).toBe(job.id);
    expect(hasContact(s, "factory_leader")).toBe(true);
  });

  it("给联系人打电话返回结算结果", () => {
    const s = fresh();
    const r = callContact(s, "parent_mother");
    expect(r.ok).toBe(true);
    expect(r.text.length).toBeGreaterThan(0);
  });
});
