import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game/types';
import { createInitialState } from '../src/game/core/state';
import { allNpcs, npcPresenceAt } from '../src/game/core/npcs';
import { ensureRelationship, findRelationship } from '../src/game/core/relationships';
import { START_EPOCH, fromLinearDay, gameDay, weekdayOf } from '../src/game/core/calendar';
import { executeNpcTaskAction, getNpcTaskQuest, getNpcTaskTopics, npcTaskNow, npcTaskSummary, tickNpcTasks } from '../src/game/core/npcTasks';
import { advanceNpcConversation, beginNpcConversation, beginNpcFormalConversation, commitNpcConversation, npcCasualTopics, npcConversationView, npcFormalTopics, npcChatCountToday } from '../src/game/core/npcTalk';
import { NPC_STAFF_RULES as RULES } from '../src/game/data/npcStaffTaskData';
import { INTRO_FIRST_COMPLETE, INTRO_SECOND_COMPLETE } from '../src/game/data/npcIntroductionProgress';
import { advanceHours } from '../src/game/core/time';
import { migrateSave } from '../src/game/core/migrate';
import { refreshDailyQuests } from '../src/game/core/quests';
import { npcDialogueBeats } from '../src/game/core/npcDialoguePlayback';
import { npcStaffResultReadyAt } from '../src/game/core/npcStaffTask';

const TASK = 'zhao_staff' as const, ZHAO = 'npc_zhao_gang', KEJIE = 'npc_fan_kejie', JACK = 'npc_jack_fanma', BOSS = 'npc_netbar_boss';
function fresh(): GameState {
  const s = createInitialState(149202);
  Object.assign(s.time, { day: 3, hour: 9, minute: 0 });
  s.locationId = 'labor_market'; s.region = 'downtown_industrial'; s.player.money = 1000;
  for (const npc of allNpcs()) ensureRelationship(s, npc.id).affinity = 20;
  ensureRelationship(s, ZHAO).affinity = RULES.zhaoMinAffinity;
  s.flags[INTRO_FIRST_COMPLETE] = true; s.flags[INTRO_SECOND_COMPLETE] = true;
  return s;
}
function place(s: GameState, npcId: string): void {
  const today = gameDay(s.time);
  for (let offset = 0; offset < 7; offset++) for (let hour = offset ? 8 : Math.ceil(s.time.hour + s.time.minute / 60); hour < 24; hour++) {
    const date = fromLinearDay(START_EPOCH + today + offset);
    const time = { ...date, hour, minute: 0, weekday: weekdayOf(date), seed: s.rng.seed };
    const presence = npcPresenceAt(npcId, time);
    if (presence) { Object.assign(s.time, date, { hour, minute: 0 }); s.locationId = presence.locationId; s.region = presence.regionId; return; }
  }
  throw new Error(`No actual schedule for ${npcId}`);
}
function act(s: GameState, npcId: string, action: string): GameState {
  const r = executeNpcTaskAction(s, npcId, { taskId: TASK, action });
  expect(r.ok, `${action}: ${r.reason}`).toBe(true); return r.state!;
}
function accepted(): GameState { return act(fresh(), ZHAO, 'accept'); }
function hired(wage = 200, affinity = 20): GameState {
  const s = accepted(); ensureRelationship(s, KEJIE).affinity = affinity; place(s, KEJIE);
  return act(s, KEJIE, `staff_offer_${wage}`);
}
function staff(s: GameState) { return getNpcTaskQuest(s, TASK)!.npcTask!.data.staff!; }
function resultDay(s: GameState): void {
  const day = Math.max(Math.floor(npcTaskNow(s) / 1440), Math.floor(npcStaffResultReadyAt(getNpcTaskQuest(s, TASK)!.npcTask!) / 1440));
  Object.assign(s.time, fromLinearDay(START_EPOCH + day), { hour: 9, minute: 0 });
  tickNpcTasks(s); place(s, ZHAO);
}
function beginOwner(s: GameState) {
  const topic = npcFormalTopics(s, ZHAO).find(t => t.npcTaskTopicId?.includes(TASK))!;
  return beginNpcFormalConversation(s, ZHAO, topic.id).session!;
}

describe('赵刚任务2：委托与人物自己的反应', () => {
  it('改稿中的旁白和主角插话按明确说话人播放，听完或退出都不自动接取', () => {
    const s = fresh(), before = JSON.stringify(s), session = beginOwner(s);
    const view = npcConversationView(s, session)!;
    const beats = npcDialogueBeats(view.text, ZHAO, view.speeches);
    expect(beats[0].speakerId).toBeNull();
    const playerIndex = beats.findIndex(beat => beat.speakerId === 'player');
    expect(playerIndex).toBeGreaterThan(1);
    expect(beats.filter(beat => beat.speakerId === 'player')).toHaveLength(1);
    expect(beats[playerIndex].text).toBe('『然后呢』');
    expect(beats[playerIndex - 1].speakerId).toBe(ZHAO);
    expect(beats[playerIndex + 1].speakerId).toBe(ZHAO);
    expect(beats.some(beat => /^(主角|赵刚)$/.test(beat.text))).toBe(false);
    // 播放按句分页，拼回后仍是作者原文；不能再把一个物理换行固定当成一屏。
    expect(beats.map(beat => beat.text).join('')).toEqual(view.text.split(/\n+/).filter(Boolean).join(''));
    const left = commitNpcConversation(s, { ...session, status: 'ended', endReason: 'leave' });
    expect(left.ok, left.reason).toBe(true); expect(left.summary!.timeCost).toBe(0);
    expect(getNpcTaskQuest(left.state!, TASK)).toBeUndefined();
    expect(JSON.stringify(s)).toBe(before);
  });
  it('好感更高才开放，拒绝0消耗；独立于玩具任务且不凭空创建人物', () => {
    const s = fresh(); ensureRelationship(s, ZHAO).affinity = 39;
    expect(getNpcTaskTopics(s, ZHAO, 'formal').some(t => t.taskId === TASK)).toBe(false);
    ensureRelationship(s, ZHAO).affinity = 40;
    const now = npcTaskNow(s), original = JSON.stringify(s), count = s.relationships.length;
    const declined = act(s, ZHAO, 'decline');
    expect(npcTaskNow(declined)).toBe(now); expect(getNpcTaskQuest(declined, TASK)).toBeUndefined();
    const started = act(s, ZHAO, 'accept');
    expect(JSON.stringify(s)).toBe(original); expect(npcTaskNow(started)).toBe(now + 30);
    expect(getNpcTaskQuest(started, TASK)!.npcTask!.deadlineAt).toBe(now + 10080);
    expect(getNpcTaskQuest(started, 'zhao_toy')).toBeUndefined(); expect(started.relationships).toHaveLength(count);
    expect(findRelationship(started, ZHAO)!.affinity).toBe(40);
  });
  it.each(['staff_self', 'staff_wait'])('%s不替玩家通过体格要求，不暗送人手或奖励', action => {
    let s = accepted(); const money = s.player.money; s = act(s, ZHAO, action);
    expect(staff(s).kejieAgreed).toBeUndefined(); expect(staff(s).jackAgreed).toBeUndefined();
    expect(s.player.money).toBe(money); expect(getNpcTaskQuest(s, TASK)!.status).toBe('active');
    expect(findRelationship(s, ZHAO)!.affinity).toBe(40);
  });
  it('陈叔笑着拒绝；只有问过马师傅后待办才写入泊月线索', () => {
    let s = accepted();
    expect(npcTaskSummary(s, getNpcTaskQuest(s, TASK)!).lines.join()).not.toContain('马师傅的线索');
    place(s, 'npc_suburb_farmer');
    expect(getNpcTaskTopics(s, 'npc_suburb_farmer', 'chat').find(t => t.taskId === TASK)!.text).toContain('别拿我开玩笑');
    s = act(s, 'npc_suburb_farmer', 'staff_ask'); expect(staff(s).clueBoyue).toBeUndefined();
    place(s, 'npc_snack_street_vendor'); s = act(s, 'npc_snack_street_vendor', 'staff_ask');
    expect(npcTaskSummary(s, getNpcTaskQuest(s, TASK)!).lines.join()).toContain('马师傅的线索');
  });
  it.each(allNpcs().filter(n => n.gender === 'female').map(n => n.id))('%s只给主角心想提示，没有NPC交互、进度或时间变化', npcId => {
    const s = accepted(); place(s, npcId); const before = JSON.stringify(s);
    const t = npcCasualTopics(s, npcId).find(t => t.id.includes(TASK))!;
    expect(t.playerThought).toBe('找个女生过来太不像话了。');
    expect(beginNpcConversation(s, npcId, 'chat', t.id).session).toBeUndefined();
    expect(executeNpcTaskAction(s, npcId, { taskId: TASK, action: 'staff_ask' }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('所有现有人物都有明确性别，公园王叔也按年纪笑着拒绝，不登记成任务人手', () => {
    expect(allNpcs().every(n => n.gender === 'male' || n.gender === 'female')).toBe(true);
    let s = accepted(); place(s, 'npc_wang_lei');
    const t = getNpcTaskTopics(s, 'npc_wang_lei', 'chat').find(t => t.taskId === TASK)!;
    expect(t.text).toContain('王磊'); expect(t.text).toContain('别拿我开玩笑'); expect(t.text).not.toContain('陈守田');
    const before = npcTaskNow(s), affinity = findRelationship(s, 'npc_wang_lei')!.affinity;
    const result = executeNpcTaskAction(s, 'npc_wang_lei', { taskId: TASK, action: 'staff_ask' });
    expect(result.ok, result.reason).toBe(true); expect(result.text).toContain('王磊'); expect(result.text).not.toContain('陈守田');
    s = result.state!; expect(npcTaskNow(s)).toBe(before + 30);
    expect(findRelationship(s, 'npc_wang_lei')!.affinity).toBe(affinity);
    expect(staff(s).askedNpcIds).toContain('npc_wang_lei'); expect(staff(s).kejieAgreed).toBeUndefined();
    expect(staff(s).jackAgreed).toBeUndefined(); expect(staff(s).clueBoyue).toBeUndefined();
  });
});

describe('范柯杰、杰克：真实约定与玩家不垫付工资', () => {
  it('从100加到150，先谈妹妹的饭约，继续请求后才谈车费；确认前退出不登记人手', () => {
    const s = accepted(); place(s, KEJIE); const before = JSON.stringify(s);
    const t = npcCasualTopics(s, KEJIE).find(t => t.id.includes(TASK))!;
    let session = beginNpcConversation(s, KEJIE, 'chat', t.id).session!;
    session = advanceNpcConversation(s, session, 0).session!;
    expect(npcConversationView(s, session)!.text).toContain('想给自己放个假');
    session = advanceNpcConversation(s, session, 0).session!;
    expect(npcConversationView(s, session)!.text).toContain('员工餐券');
    expect(npcConversationView(s, session)!.text).not.toContain('二十块');
    session = advanceNpcConversation(s, session, 0).session!;
    expect(npcConversationView(s, session)!.text).toContain('车费');
    expect(npcConversationView(s, session)!.text).toContain('她还不如这一百五');
    expect(JSON.stringify(s)).toBe(before); expect(session.pending).toEqual([]);
    const result = commitNpcConversation(s, { ...session, status: 'ended', endReason: 'leave' });
    expect(result.ok).toBe(true); expect(result.summary!.timeCost).toBe(0);
    expect(staff(result.state!).kejieAgreed).toBeUndefined(); expect(result.state!.player.money).toBe(s.player.money);
  });
  it('可以让他赴妹妹的约，正常结束协商不报人、不加好感', () => {
    const s = accepted(); place(s, KEJIE);
    const t = npcCasualTopics(s, KEJIE).find(t => t.id.includes(TASK))!;
    const start = beginNpcConversation(s, KEJIE, 'chat', t.id).session!;
    const sister = advanceNpcConversation(s, start, 1).session!;
    const result = commitNpcConversation(s, advanceNpcConversation(s, sister, 3).session!);
    expect(result.ok).toBe(true); expect(result.summary!.timeCost).toBe(.5);
    expect(staff(result.state!).kejieAgreed).toBeUndefined(); expect(findRelationship(result.state!, KEJIE)!.affinity).toBe(20);
    expect(getNpcTaskQuest(result.state!, TASK)!.status).toBe('active');
  });
  it.each([[200, 1, 2], [300, 2, 5]])('150协商中改报%s，最终只按新报价结算一次', (wage, index, bonus) => {
    const s = accepted(); place(s, KEJIE);
    const t = npcCasualTopics(s, KEJIE).find(t => t.id.includes(TASK))!;
    const start = beginNpcConversation(s, KEJIE, 'chat', t.id).session!;
    const sister = advanceNpcConversation(s, start, 1).session!;
    const ended = advanceNpcConversation(s, sister, index).session!;
    const result = commitNpcConversation(s, ended);
    expect(result.ok, result.reason).toBe(true);
    expect(staff(result.state!).kejieDailyWage).toBe(wage); expect(staff(result.state!).kejieTravelCost).toBe(0);
    expect(!!staff(result.state!).jackAgreed).toBe(wage === 300);
    expect(findRelationship(result.state!, KEJIE)!.affinity).toBe(20 + bonus);
    expect(result.state!.player.money).toBe(s.player.money);
    expect(commitNpcConversation(result.state!, ended).ok).toBe(false);
  });
  it.each([[100, 80, false], [150, 19, false], [150, 20, true], [200, 0, true], [300, 0, true]] as const)('%s元、好感%s → 是否答应%s', (wage, affinity, agreed) => {
    const s = hired(wage, affinity);
    expect(!!staff(s).kejieAgreed).toBe(agreed); expect(s.player.money).toBe(1000);
    if (wage === 150 && agreed) expect(staff(s).kejieTravelCost).toBe(20);
    if (wage === 300) expect(staff(s).jackAgreed && staff(s).jackInvitedByKejie).toBe(true);
  });
  it.each([[200, 2], [300, 5]])('%s元增加%s好感，已经答应后不能再刷报价好感', (wage, bonus) => {
    const s = hired(wage, 20); const before = JSON.stringify(s);
    expect(findRelationship(s, KEJIE)!.affinity).toBe(20 + bonus);
    expect(executeNpcTaskAction(s, KEJIE, { taskId: TASK, action: `staff_offer_${wage}` }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('一百元被拒后仍可重新报更高价，不预先扣玩家现金', () => {
    let s = hired(100); s.player.money = 0; s = act(s, KEJIE, 'staff_offer_200');
    expect(staff(s).kejieAgreed).toBe(true); expect(s.player.money).toBe(0);
  });
  it('杰克低好感拒绝，高好感可直接答应；只找到杰克不能假装交了两人', () => {
    let s = accepted(); place(s, JACK); ensureRelationship(s, JACK).affinity = 39;
    expect(getNpcTaskTopics(s, JACK, 'chat').find(t => t.taskId === TASK)!.text).toContain('周末要加练');
    s = act(s, JACK, 'staff_ask'); expect(staff(s).jackAgreed).toBeUndefined();
    ensureRelationship(s, JACK).affinity = 40; s = act(s, JACK, 'staff_hire_jack'); place(s, ZHAO);
    expect(getNpcTaskTopics(s, ZHAO, 'formal').find(t => t.taskId === TASK)!.choices[0].disabledReason).toContain('只有杰克');
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_submit_pair' }).ok).toBe(false);
  });
  it.each([[150, 65, 165], [200, 50, 150]] as const)('单人%s元报价，当天只介绍朋友，次日差价分%s元、合计%s元一次到账', (wage, share, total) => {
    let s = hired(wage); place(s, ZHAO); const before = s.player.money;
    const result = executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_submit_kejie' });
    expect(result.ok).toBe(true); s = result.state!;
    expect(result.text).toContain('一会儿联系'); expect(result.text).not.toContain('递给');
    expect(s.player.money).toBe(before); expect(getNpcTaskQuest(s, TASK)!.status).toBe('active');
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_claim_commission' }).ok).toBe(false);
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_submit_kejie' }).ok).toBe(false);
    resultDay(s);
    const paid = executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_claim_commission' });
    expect(paid.ok, paid.reason).toBe(true); s = paid.state!;
    expect(paid.text).toContain(`主动加上${share}元`); expect(s.player.money - before).toBe(total);
    expect(staff(s).commission).toBe(100); expect(staff(s).marginShare).toBe(share);
    expect(findRelationship(s, ZHAO)!.affinity).toBe(40);
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_claim_commission' }).ok).toBe(false);
  });
  it.each([[150, 185], [200, 170], [300, 120]] as const)('双人%s元报价合计%s元，并对三个人分别结算结局好感', (wage, total) => {
    let s = hired(wage);
    if (wage < 300) { place(s, JACK); ensureRelationship(s, JACK).affinity = 40; s = act(s, JACK, 'staff_hire_jack'); }
    place(s, ZHAO); const affinities = [ZHAO, KEJIE, JACK].map(id => findRelationship(s, id)!.affinity);
    const money = s.player.money; s = act(s, ZHAO, 'staff_submit_pair');
    expect(s.player.money).toBe(money);
    expect([ZHAO, KEJIE, JACK].map(id => findRelationship(s, id)!.affinity)).toEqual(affinities);
    const sameDay = getNpcTaskTopics(s, ZHAO, 'formal').find(t => t.taskId === TASK)!;
    expect(sameDay.text).toContain('明天再来'); expect(sameDay.text).not.toContain('零食');
    expect(sameDay.choices.some(c => c.action.action === 'staff_claim_commission')).toBe(false);
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_claim_commission' }).ok).toBe(false);
    resultDay(s); s = act(s, ZHAO, 'staff_claim_commission');
    expect(s.player.money - money).toBe(total);
    expect([ZHAO, KEJIE, JACK].map(id => findRelationship(s, id)!.affinity)).toEqual(affinities.map(a => a + 5));
    expect(getNpcTaskQuest(s, TASK)!.npcTask!.outcome).toBe('pair');
  });
});

describe('网咖店员路线、存档与会话提交', () => {
  it('老板69时不出人；70时出两人，当天报人、次日赵刚反馈后，老板才给100元', () => {
    let s = accepted(); place(s, BOSS); ensureRelationship(s, BOSS).affinity = 69;
    expect(getNpcTaskTopics(s, BOSS, 'chat').find(t => t.taskId === TASK)!.choices.some(c => c.action.action === 'staff_hire_netbar')).toBe(false);
    ensureRelationship(s, BOSS).affinity = 70; s = act(s, BOSS, 'staff_hire_netbar');
    expect(s.player.money).toBe(1000); place(s, ZHAO); s = act(s, ZHAO, 'staff_submit_netbar');
    expect(s.player.money).toBe(1000); expect(getNpcTaskQuest(s, TASK)!.status).toBe('active');
    expect(getNpcTaskQuest(s, TASK)!.npcTask!.stage).toBe('await_staff_result');
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_review_netbar_result' }).ok).toBe(false);
    place(s, BOSS); expect(executeNpcTaskAction(s, BOSS, { taskId: TASK, action: 'staff_claim_netbar_bonus' }).ok).toBe(false);
    s = migrateSave(JSON.parse(JSON.stringify(s)));
    // 只检验绝对日期和待结账阶段；不让八天不吃不睡的生存结局干扰此断言。
    Object.assign(s.time, fromLinearDay(START_EPOCH + gameDay(s.time) + 8)); tickNpcTasks(s); refreshDailyQuests(s);
    expect(getNpcTaskQuest(s, TASK)!.status).toBe('active'); place(s, ZHAO);
    s = act(s, ZHAO, 'staff_review_netbar_result'); expect(s.player.money).toBe(1000);
    expect(getNpcTaskQuest(s, TASK)!.npcTask!.stage).toBe('await_netbar_bonus'); place(s, BOSS);
    const result = executeNpcTaskAction(s, BOSS, { taskId: TASK, action: 'staff_claim_netbar_bonus' });
    expect(result.ok, result.reason).toBe(true); s = result.state!;
    expect(s.player.money).toBe(1100); expect(staff(s).marginShare).toBe(0);
    expect(result.text).toContain('八十块'); expect(getNpcTaskQuest(s, TASK)!.status).toBe('done');
    expect(executeNpcTaskAction(s, BOSS, { taskId: TASK, action: 'staff_claim_netbar_bonus' }).ok).toBe(false);
  });
  it('交人菜单只展开和返回；确认具体人手只登记安排，次日另开会话才能结算', () => {
    const s = hired(200); place(s, ZHAO); const before = JSON.stringify(s);
    const start = beginOwner(s);
    expect(npcConversationView(s, start)!.options).toHaveLength(3);
    const menu = advanceNpcConversation(s, start, 0).session!;
    expect(menu.status).toBe('active'); expect(menu.pending).toEqual([]); expect(menu.npcTaskBranch).toBe('roster');
    expect(JSON.stringify(s)).toBe(before);
    const left = commitNpcConversation(s, { ...menu, status: 'ended', endReason: 'leave' });
    expect(left.ok).toBe(true); expect(left.summary!.timeCost).toBe(0); expect(getNpcTaskQuest(left.state!, TASK)!.status).toBe('active');
    const back = advanceNpcConversation(s, menu, 1).session!;
    expect(back.npcTaskBranch).toBeUndefined(); expect(npcConversationView(s, back)!.options).toHaveLength(3);
    const selected = advanceNpcConversation(s, menu, 0).session!;
    const done = commitNpcConversation(s, selected);
    expect(done.ok, done.reason).toBe(true); expect(done.state!.player.money).toBe(s.player.money);
    expect(getNpcTaskQuest(done.state!, TASK)!.npcTask!.stage).toBe('await_staff_result');
    expect(commitNpcConversation(done.state!, selected).ok).toBe(false);
    const next = done.state!; resultDay(next);
    const payout = advanceNpcConversation(next, beginOwner(next), 0).session!;
    const paid = commitNpcConversation(next, payout);
    expect(paid.ok, paid.reason).toBe(true); expect(paid.state!.player.money - s.player.money).toBe(150);
    expect(commitNpcConversation(paid.state!, payout).ok).toBe(false);
  });
  it('满额闲聊仍能报价，不消耗闲聊次数；前置共同初见仍必须完成', () => {
    const s = accepted(); place(s, KEJIE); const day = gameDay(s.time);
    s.flags[`npc_chat_day_${KEJIE}`] = day; s.flags[`npc_chat_count_${KEJIE}`] = 5;
    const topic = npcCasualTopics(s, KEJIE).find(t => t.id.includes(TASK))!;
    const start = beginNpcConversation(s, KEJIE, 'chat', topic.id).session!;
    expect(start.greetingNode).toBeUndefined(); expect(start.chatLimitNotice).toBeUndefined();
    const selected = advanceNpcConversation(s, start, 2).session!;
    const done = commitNpcConversation(s, selected);
    expect(done.ok).toBe(true); expect(npcChatCountToday(done.state!, KEJIE)).toBe(5);
    s.flags[INTRO_SECOND_COMPLETE] = false;
    expect(beginNpcConversation(s, KEJIE, 'chat', topic.id).ok).toBe(false);
  });
  it('人手已确认后的会话副本、篡改动作和过时进度都不能套取奖励', () => {
    let s = hired(200); place(s, ZHAO);
    const menu = advanceNpcConversation(s, beginOwner(s), 0).session!;
    const selected = advanceNpcConversation(s, menu, 0).session!;
    const forged = structuredClone(selected); forged.pending[0].option.npcTaskAction!.action = 'staff_submit_pair';
    expect(commitNpcConversation(s, forged).ok).toBe(false);
    s = act(s, ZHAO, 'staff_wait'); expect(commitNpcConversation(s, selected).ok).toBe(false);
  });
  it('招人逾期仅扣赵刚5一次，失败、成功都跨日保存且不能重接', () => {
    let s = accepted(); const q = getNpcTaskQuest(s, TASK)!; q.npcTask!.deadlineAt = npcTaskNow(s) + 1;
    advanceHours(s, 2 / 60); tickNpcTasks(s); expect(q.status).toBe('failed');
    expect(findRelationship(s, ZHAO)!.affinity).toBe(35);
    s = migrateSave(JSON.parse(JSON.stringify(s))); refreshDailyQuests(s); tickNpcTasks(s);
    expect(getNpcTaskQuest(s, TASK)!.status).toBe('failed'); expect(findRelationship(s, ZHAO)!.affinity).toBe(35);
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'accept' }).ok).toBe(false);
  });
  it('期限前最后5分钟可报人，等待次日不再超期；少于5分钟不登记安排', () => {
    let s = hired(200); place(s, ZHAO); const p = getNpcTaskQuest(s, TASK)!.npcTask!;
    p.deadlineAt = npcTaskNow(s) + 4; const before = JSON.stringify(s);
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_submit_kejie' }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before); p.deadlineAt += 1;
    s = act(s, ZHAO, 'staff_submit_kejie'); expect(getNpcTaskQuest(s, TASK)!.status).toBe('active');
    expect(s.player.money).toBe(1000); resultDay(s); tickNpcTasks(s); refreshDailyQuests(s);
    expect(getNpcTaskQuest(s, TASK)!.status).toBe('active');
    s = act(s, ZHAO, 'staff_claim_commission'); expect(getNpcTaskQuest(s, TASK)!.status).toBe('done');
  });
  it('已报人中间档保存准备结算的日期和报价，读回后当天仍不能领、次日只领一次', () => {
    let s = hired(150); place(s, ZHAO); s = act(s, ZHAO, 'staff_submit_kejie');
    const ready = staff(s).settlementReadyAt;
    s = migrateSave(JSON.parse(JSON.stringify(s))); refreshDailyQuests(s);
    expect(staff(s).settlementReadyAt).toBe(ready); expect(staff(s).kejieDailyWage).toBe(150);
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_claim_commission' }).ok).toBe(false);
    resultDay(s); s = act(s, ZHAO, 'staff_claim_commission'); expect(s.player.money).toBe(1165);
    // 已结算的旧v34结果保持兑现，不因为缺少新字段而重开或再次发钱。
    delete staff(s).settlementReadyAt; delete staff(s).resultReviewedAt;
    s = migrateSave(JSON.parse(JSON.stringify(s))); tickNpcTasks(s);
    expect(getNpcTaskQuest(s, TASK)!.status).toBe('done'); expect(s.player.money).toBe(1165);
    expect(executeNpcTaskAction(s, ZHAO, { taskId: TASK, action: 'staff_claim_commission' }).ok).toBe(false);
  });
  it('旧v34网咖待领款档按原submittedAt算次日，保留路线，先回赵刚确认结果再找老板', () => {
    let s = accepted(); place(s, BOSS); ensureRelationship(s, BOSS).affinity = 70;
    s = act(s, BOSS, 'staff_hire_netbar'); place(s, ZHAO); s = act(s, ZHAO, 'staff_submit_netbar');
    const p = getNpcTaskQuest(s, TASK)!.npcTask!; p.stage = 'await_netbar_bonus'; delete staff(s).settlementReadyAt;
    const ready = (Math.floor(staff(s).submittedAt! / 1440) + 1) * 1440;
    s = migrateSave(JSON.parse(JSON.stringify(s))); expect(npcStaffResultReadyAt(getNpcTaskQuest(s, TASK)!.npcTask!)).toBe(ready);
    expect(npcTaskSummary(s, getNpcTaskQuest(s, TASK)!).stageLabel).toBe('等待次日结果');
    resultDay(s); s = act(s, ZHAO, 'staff_review_netbar_result'); place(s, BOSS);
    s = act(s, BOSS, 'staff_claim_netbar_bonus'); expect(s.player.money).toBe(1100);
  });
  it.each([[2026, 8, 30], [2026, 12, 30]])('报人在%s年%s月%s日，跨月或跨年按绝对游戏日期在次日起结算', (year, month, day) => {
    let s = hired(200); Object.assign(s.time, { year, month, day, hour: 9, minute: 0 }); place(s, ZHAO);
    const p = getNpcTaskQuest(s, TASK)!.npcTask!; p.acceptedAt = npcTaskNow(s) - 30; p.deadlineAt = npcTaskNow(s) + 7 * 1440;
    const submittedDay = gameDay(s.time); s = act(s, ZHAO, 'staff_submit_kejie');
    expect(staff(s).settlementReadyAt).toBe((submittedDay + 1) * 1440);
    resultDay(s); expect(gameDay(s.time)).toBeGreaterThan(submittedDay);
    s = act(s, ZHAO, 'staff_claim_commission'); expect(s.player.money).toBe(1150);
  });
});
