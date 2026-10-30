import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { migrateSave } from "../src/game/core/migrate";
import { pushLog } from "../src/game/engine";
import { workOnProject, PROGRAMMING_PASSIVE_CAP, personalDevelopmentRewardQuote,normalizePersonalDevelopment,settlePassiveIncome,programmingPassiveMultiplier } from "../src/game/core/projects";
import { weeklySettlement } from "../src/game/core/weekly";
import {advanceHours} from '../src/game/core/time';

describe("完成编程作品后的持续版税", () => {
  it("多部作品叠加，连续两周自动到账，每周仅发放一次", () => {
    const state = createInitialState(829);
    state.time.day=3;state.time.hour=9;
    state.player.skills.programming = 8;
    state.flags.item_laptop = true;
    state.career.projects.indie_game = 96;
    expect(workOnProject(state, "indie_game").completed).toBe(true);
    expect(state.career.passiveIncome).toBe(150);
    advanceHours(state,16,false,true);
    state.career.projects.mobile_app = 98;
    expect(workOnProject(state, "mobile_app").completed).toBe(true);
    expect(state.career.passiveIncome).toBe(200);

    state.time.day = 9; // 两件作品在不同工作日完成，随后到达周日。
    const money = state.player.money;
    weeklySettlement(state);
    expect(state.player.money).toBe(money + 200);
    expect(state.career.passiveIncome).toBe(180);
    expect(state.weekly.report?.earned).toBe(200);
    weeklySettlement(state);
    expect(state.player.money).toBe(money + 200);
    state.time.day += 7;
    weeklySettlement(state);
    expect(state.player.money).toBe(money + 380);
    expect(state.career.passiveIncome).toBe(162);
  });

  it("已达到每周上限后新作品不再增加版税或发放现金", () => {
    const state = createInitialState(830);
    state.player.skills.programming = 8;
    state.flags.item_laptop = true;
    state.career.passiveIncome = PROGRAMMING_PASSIVE_CAP;
    state.career.projects.indie_game = 96;
    const money = state.player.money;
    workOnProject(state, "indie_game");
    expect(state.player.money).toBe(money);
    expect(state.career.passiveIncome).toBe(PROGRAMMING_PASSIVE_CAP);
  });

  it("版税会逐周衰减至零，读档不会从历史上线标记中恢复已耗尽的收入", () => {
    const state = createInitialState(834);
    state.career.passiveIncome = 2;
    state.flags.programming_royalty_persistent_v1 = true;
    state.flags.project_completed_indie_game = true;
    state.time.day = 2;

    weeklySettlement(state);
    expect(state.player.money).toBe(502);
    expect(state.career.passiveIncome).toBe(1);
    state.time.day += 7;
    weeklySettlement(state);
    expect(state.player.money).toBe(503);
    expect(state.career.passiveIncome).toBe(0);
    expect(migrateSave(state).career.passiveIncome).toBe(0);
  });

  it("已发薪后被旧代码清零的收入，读档时从上线记录恢复且不重复累加", () => {
    const state = createInitialState(831);
    state.flags.project_completed_indie_game = true;
    state.career.passiveIncome = 0;
    pushLog(state, "💻", "【独立游戏开发】大功告成！本周版税池 +500 元（累计 500 元/1500），可以开发下一部作品了");
    const loaded = migrateSave(state);
    expect(loaded.career.passiveIncome).toBe(500);
    expect(migrateSave(loaded).career.passiveIncome).toBe(500);
  });

  it("旧档没有完整上线日志时仍可按已完成作品恢复一份收入", () => {
    const state = createInitialState(832);
    delete state.flags.development_economy_v2;
    state.player.skills.programming = 8;
    state.flags.project_completed_mobile_app = true;
    state.career.passiveIncome = 0;
    expect(migrateSave(state).career.passiveIncome).toBe(450);
  });

  it("旧档刚完成新作品时仍会恢复前几周已被清零的作品版税", () => {
    const state = createInitialState(833);
    state.career.passiveIncome = 350;
    pushLog(state, "💻", "本周版税池 +500 元（累计 500 元/1500）");
    pushLog(state, "💻", "本周版税池 +350 元（累计 350 元/1500）");
    const loaded = migrateSave(state);
    expect(loaded.career.passiveIncome).toBe(850);
    expect(migrateSave(loaded).career.passiveIncome).toBe(850);
  });

  it('新作品上限200按三档折扣，已上线的1500元旧池完整发放后才按10%衰减',()=>{
    expect(PROGRAMMING_PASSIVE_CAP).toBe(200);
    expect([0,67,134,200].map(v=>programmingPassiveMultiplier(v))).toEqual([1,.7,.4,0]);
    const state=createInitialState(835);state.career.passiveIncome=1500;state.flags.programming_royalty_persistent_v1=true;
    const loaded=migrateSave(state),money=loaded.player.money;
    expect(loaded.career.passiveIncome).toBe(1500);
    expect(settlePassiveIncome(loaded)).toBe(1500);
    expect(loaded.player.money).toBe(money+1500);
    expect(loaded.career.passiveIncome).toBe(1350);
    expect(migrateSave(loaded).career.passiveIncome).toBe(1350);
  });

  it('旧日志恢复可高于新上限，现有余额不会被恢复逻辑截断；新作品不消灭历史余额',()=>{
    const state=createInitialState(836);state.player.skills.programming=10;state.flags.item_laptop_pro=true;state.time.day=3;state.time.hour=9;
    state.career.passiveIncome=1200;
    pushLog(state,'💻','本周版税池 +500 元（累计500元/1500）');
    const loaded=migrateSave(state);
    expect(loaded.career.passiveIncome).toBe(1200);
    loaded.career.projects.indie_game=99;
    expect(workOnProject(loaded,'indie_game',{hours:4}).completed).toBe(true);
    expect(loaded.career.passiveIncome).toBe(1200);
    expect(loaded.log.some(row=>row.text.includes('历史权益完整保留'))).toBe(true);
  });

  it('旧在途自研作品兑现450基础及1500上限，交付后开始的新作品采用150基础及200上限',()=>{
    const state=createInitialState(837);delete state.flags.development_economy_v2;state.player.skills.programming=10;state.flags.item_laptop_pro=true;state.time.day=3;state.time.hour=9;
    state.career.projects.indie_game=99;state.career.passiveIncome=1000;
    const before=JSON.stringify(state);
    expect(personalDevelopmentRewardQuote(state,'indie_game')).toMatchObject({royalty:450,royaltyCap:1500,legacy:true});
    expect(JSON.stringify(state)).toBe(before);
    normalizePersonalDevelopment(state);normalizePersonalDevelopment(state);
    expect(personalDevelopmentRewardQuote(state,'indie_game')).toMatchObject({royalty:450,royaltyCap:1500,legacy:true});
    expect(workOnProject(state,'indie_game',{hours:4}).completed).toBe(true);
    expect(state.career.passiveIncome).toBe(1180);
    expect(personalDevelopmentRewardQuote(state,'indie_game')).toMatchObject({royalty:150,royaltyCap:200,legacy:false});
    expect(settlePassiveIncome(state)).toBe(1180);
  });

  it('旧在途现金短单按原1000元交付，连续下一单立即改850元且再次载入不重签旧价',()=>{
    const state=createInitialState(838);delete state.flags.development_economy_v2;state.player.skills.programming=10;state.flags.item_laptop_pro=true;state.time.day=3;state.time.hour=9;
    Object.assign(state.player.attrs,{stamina:100,health:100,mood:100,satiety:100});state.career.projects.personal_programming_order=39.99;
    const before=JSON.stringify(state),money=state.player.money;
    expect(personalDevelopmentRewardQuote(state,'personal_programming_order')).toMatchObject({contractFee:1000,legacy:true});
    expect(JSON.stringify(state)).toBe(before);
    normalizePersonalDevelopment(state);normalizePersonalDevelopment(state);
    expect(workOnProject(state,'personal_programming_order',{hours:4,continuous:true}).completed).toBe(true);
    expect(state.player.money).toBe(money+1000);
    expect(state.career.projects.personal_programming_order).toBeCloseTo(7.49,6);
    expect(personalDevelopmentRewardQuote(state,'personal_programming_order')).toEqual({contractFee:850,legacy:false});
    const loaded=migrateSave(state);
    expect(personalDevelopmentRewardQuote(loaded,'personal_programming_order')).toEqual({contractFee:850,legacy:false});
    loaded.career.projects.personal_programming_order=39;
    expect(workOnProject(loaded,'personal_programming_order',{hours:4}).completed).toBe(true);
    expect(loaded.player.money).toBe(money+1850);
    expect(loaded.developmentHistory!.total).toBe(2);
    expect(loaded.career.passiveIncome).toBe(0);
  });

  it('新单的第一分钟冻结报价，之后技能变化或再次预览都不会改写已开工条款',()=>{
    const state=createInitialState(839);state.time.day=3;state.time.hour=9;state.player.skills.programming=3;state.flags.item_laptop_pro=true;
    expect(workOnProject(state,'indie_game',{hours:4}).ok).toBe(true);
    state.player.skills.programming=10;
    const before=JSON.stringify(state);
    expect(personalDevelopmentRewardQuote(state,'indie_game')).toEqual({royalty:40,royaltyCap:200,legacy:false});
    expect(JSON.stringify(state)).toBe(before);
    state.career.projects.indie_game=99;
    expect(workOnProject(state,'indie_game',{hours:4}).completed).toBe(true);
    expect(state.career.passiveIncome).toBe(40);
  });
});
