import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { ensureRelationship, findRelationship } from '../src/game/core/relationships';
import { advanceNpcConversation, beginNpcFormalConversation, beginNpcConversation, commitNpcConversation, npcCasualTopics, npcFormalTopics, npcChatCountToday } from '../src/game/core/npcTalk';
import { executeNpcTaskAction, getNpcTaskQuest, npcTaskNow } from '../src/game/core/npcTasks';
import { getItem, inventoryGroupOf, useItem } from '../src/game/core/items';
import { storageLocationOf } from '../src/game/core/storage';
import { isGiftable } from '../src/game/core/romance';
import { advanceHours, tickNpcCommissions } from '../src/game/core/time';
import { gameDay } from '../src/game/core/calendar';
import { refreshDailyQuests } from '../src/game/core/quests';
import { migrateSave, SAVE_VERSION } from '../src/game/core/migrate';
import { todoSummaryOf } from '../src/game/core/todoSummary';
import { progressCityCommission, canAccessCityCommission, getCityCommission } from '../src/game/core/cityCommissions';
import type { GameState } from '../src/game/types';

function fresh(): GameState {
  const s = createInitialState(1492);
  Object.assign(s.time, { day: 3, hour: 9, minute: 0 });
  s.locationId = 'labor_market'; s.region = 'downtown_industrial'; s.player.money = 1000;
  ensureRelationship(s, 'npc_zhao_gang').affinity = 20;
  return s;
}
function accept(s = fresh()): GameState {
  const t = npcFormalTopics(s, 'npc_zhao_gang').find(t => t.npcTaskTopicId)!;
  const start = beginNpcFormalConversation(s, 'npc_zhao_gang', t.id);
  expect(start.ok, start.reason).toBe(true);
  const choice = advanceNpcConversation(s, start.session!, 0);
  const result = commitNpcConversation(s, choice.session!);
  expect(result.ok, result.reason).toBe(true);
  return result.state!;
}
function obtained(): GameState {
  let s = accept();
  s.locationId = 'boyue_fast_food'; s.region = 'boyue_mall';
  const purchased = executeNpcTaskAction(s, null, { taskId: 'zhao_toy', action: 'buy_toy' });
  expect(purchased.ok).toBe(true); s = purchased.state!;
  s.locationId = 'labor_market'; s.region = 'downtown_industrial';
  return s;
}

describe('实体委托与既有系统的边界', () => {
  it('正式接受在完整状态副本中提交，保留原状态且不附赠聊天好感', () => {
    const before = fresh(), original = JSON.stringify(before), s = accept(before);
    expect(JSON.stringify(before)).toBe(original);
    expect(getNpcTaskQuest(s, 'zhao_toy')?.status).toBe('active');
    expect(findRelationship(s, 'npc_zhao_gang')!.affinity).toBe(20);
    expect(npcChatCountToday(s, 'npc_zhao_gang')).toBe(0);
    expect(npcTaskNow(s) - npcTaskNow(before)).toBe(30);
    expect(getNpcTaskQuest(s, 'zhao_toy')!.commission).toBeUndefined();
    expect(todoSummaryOf(s).tasks.some(t => t.title === '给孩子留一份' && t.detail.includes('快餐'))).toBe(true);
  });

  it('陈姐任务聊天绕过首次问候和满额闲聊，完成后不消耗闲聊次数', () => {
    const s = accept(); s.locationId = 'fast_food'; s.region = 'downtown_mall';
    ensureRelationship(s, 'npc_chen_jie').affinity = 40;
    const day = gameDay(s.time);
    s.flags.npc_chat_day_npc_chen_jie = day; s.flags.npc_chat_count_npc_chen_jie = 5;
    const topic = npcCasualTopics(s, 'npc_chen_jie').find(t => t.id.startsWith('task:'))!;
    expect(topic).toBeDefined();
    const start = beginNpcConversation(s, 'npc_chen_jie', 'chat', topic.id);
    expect(start.ok, start.reason).toBe(true);
    expect(start.session?.greetingNode).toBeUndefined();
    const selection = advanceNpcConversation(s, start.session!, 0);
    const result = commitNpcConversation(s, selection.session!);
    expect(result.ok, result.reason).toBe(true);
    expect(result.state?.inventory.task_toy_ticket).toBe(1);
    expect(npcChatCountToday(result.state!, 'npc_chen_jie')).toBe(5);
    expect(findRelationship(result.state!, 'npc_chen_jie')!.affinity).toBe(40);
  });

  it.each([['quote_free', 10, 0], ['quote_standard', 5, 120], ['quote_150', 0, 150], ['quote_200', 0, 200], ['quote_1000', -10, 0]] as const)('%s 独立结算，无普通聊天上限或附加奖励', (action, affinity, money) => {
    const s = obtained();
    const topic = npcFormalTopics(s, 'npc_zhao_gang').find(t => t.npcTaskTopicId && t.category === 'delivery')!;
    const start = beginNpcFormalConversation(s, 'npc_zhao_gang', topic.id);
    const index = topic.options!.findIndex(option => option.npcTaskAction?.action === action);
    const selected = advanceNpcConversation(s, start.session!, index).session!;
    const result = commitNpcConversation(s, selected);
    expect(result.ok, result.reason).toBe(true);
    expect(result.summary?.affinityDelta).toBe(affinity);
    expect(result.state!.player.money - s.player.money).toBe(money);
    expect(npcChatCountToday(result.state!, 'npc_zhao_gang')).toBe(0);
    expect(commitNpcConversation(result.state!, selected).ok).toBe(false);
    expect(result.state!.inventory.task_toy_bear ?? 0).toBe(action === 'quote_1000' ? 1 : 0);
  });

  it('任务会话不能篡改动作重发物品，也不能提交过期的进度副本', () => {
    const s = obtained();
    const topic = npcFormalTopics(s, 'npc_zhao_gang').find(t => t.npcTaskTopicId && t.category === 'delivery')!;
    const start = beginNpcFormalConversation(s, 'npc_zhao_gang', topic.id).session!;
    const ended = advanceNpcConversation(s, start, 0).session!;
    const forged = structuredClone(ended);
    forged.pending[0].option.npcTaskAction!.action = 'buy_toy';
    expect(commitNpcConversation(s, forged).ok).toBe(false);
    const concurrent = executeNpcTaskAction(s, 'npc_zhao_gang', { taskId: 'zhao_toy', action: 'quote_standard' }).state!;
    expect(commitNpcConversation(concurrent, ended).ok).toBe(false);
  });

  it('未确认退出不会发起任务或消耗时间', () => {
    const s = fresh();
    const topic = npcFormalTopics(s, 'npc_zhao_gang').find(t => t.npcTaskTopicId)!;
    const session = beginNpcFormalConversation(s, 'npc_zhao_gang', topic.id).session!;
    const result = commitNpcConversation(s, { ...session, status: 'ended', endReason: 'leave' });
    expect(result.ok).toBe(true); expect(result.summary?.timeCost).toBe(0);
    expect(getNpcTaskQuest(result.state!, 'zhao_toy')).toBeUndefined();
    expect(result.state!.inventory).toEqual(s.inventory);
  });

  it('任务道具进入随身分类，不能被普通食用或送礼接口消耗', () => {
    const s = obtained(), item = getItem('task_toy_bear')!;
    expect(inventoryGroupOf(item)).toBe('quest_items');
    expect(storageLocationOf(item)).toBe('backpack');
    for (const id of ['task_toy_bear', 'task_print_original', 'task_vegetable_crate', 'task_delivery_receipt']) {
      expect(isGiftable(id)).toBe(false);
      s.inventory[id] = 2;
      expect(useItem(s, id).ok).toBe(false);
      expect(s.inventory[id]).toBe(2);
    }
  });

  it('v33到v34不自动发新任务，清理旧委托且保留关系和资产', () => {
    const old = fresh(); old.version = 33;
    old.quests.push({ id: 'old_contract', type: 'story', title: '旧约定', icon: '📋', desc: '保留约定', day: gameDay(old.time), status: 'active',
      commission: { npcId: 'npc_zhao_gang', days: 2, startDay: gameDay(old.time) - 2, rewardEffects: { money: 77 }, rewardText: '77元' } });
    const original = JSON.stringify(old), s = migrateSave(old);
    expect(SAVE_VERSION).toBe(38); expect(s.version).toBe(SAVE_VERSION);
    expect(JSON.stringify(old)).toBe(original);
    expect(s.relationships).toEqual(old.relationships); expect(s.inventory).toEqual(old.inventory);
    expect(s.quests.some(q => q.npcTask)).toBe(false);
    expect(s.quests.find(q => q.id === 'old_contract')).toBeUndefined();
    const money = s.player.money; tickNpcCommissions(s); tickNpcCommissions(s);
    expect(s.player.money).toBe(money);
    expect(s.quests.find(q => q.id === 'old_contract')).toBeUndefined();
  });

  it('进行和终结记录经每日刷新及存档往返保留，超期只扣一次', () => {
    let s = accept(); refreshDailyQuests(s);
    const p = getNpcTaskQuest(s, 'zhao_toy')!.npcTask!;
    const expired = { ...p, deadlineAt: npcTaskNow(s) + 6 };
    getNpcTaskQuest(s, 'zhao_toy')!.npcTask = expired;
    advanceHours(s, .2);
    expect(getNpcTaskQuest(s, 'zhao_toy')?.status).toBe('failed');
    const affinity = findRelationship(s, 'npc_zhao_gang')!.affinity;
    expect(affinity).toBe(15);
    s = migrateSave(JSON.parse(JSON.stringify(s)));
    advanceHours(s, 24); refreshDailyQuests(s);
    expect(getNpcTaskQuest(s, 'zhao_toy')?.status).toBe('failed');
    expect(findRelationship(s, 'npc_zhao_gang')!.affinity).toBe(affinity);
    expect(executeNpcTaskAction(s, 'npc_zhao_gang', { taskId: 'zhao_toy', action: 'accept' }).ok).toBe(false);
  });

  it('旧城市鲜货记录清理后不能再凭到达地点领奖', () => {
    const s=fresh();
    s.quests.push({id:'old_city',type:'story',title:'新鲜货进城',desc:'旧占位',icon:'📦',day:gameDay(s.time),status:'active',commission:{npcId:'npc_suburb_farmer',days:7,startDay:0,rewardEffects:{money:120},rewardText:'120元',commissionId:'city_fresh_goods_into_town',stepIndex:2}});
    s.cityCommissions.activeId='city_fresh_goods_into_town';
    const loaded=migrateSave(s),before=JSON.stringify(loaded);
    expect(loaded.quests.some(q=>q.id==='old_city')).toBe(false);
    expect(progressCityCommission(loaded,{locationId:'snack_street'}).ok).toBe(false);
    expect(JSON.stringify(loaded)).toBe(before);
    expect(loaded.player.money).toBe(s.player.money);
  });
});
