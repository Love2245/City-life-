// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { mkdirSync, writeFileSync } from 'node:fs';
import NpcTalkModal from '../src/components/layout/NpcTalkModal.svelte';
import { createInitialState } from '../src/game/core/state';
import { ensureRelationship } from '../src/game/core/relationships';
import { allNpcs, npcPresenceAt, type NpcTalkStage } from '../src/game/core/npcs';
import { gameDay, weekdayOf } from '../src/game/core/calendar';
import { markGreeted } from '../src/game/data/npcGreetings';
import { NPC_DIALOGUE_REMASTER, remasterDailyConversationStart } from '../src/game/data/npcDialogueRemaster';
import {NPC_CONTEXT_DIALOGUES,contextDialogueDayFlag} from '../src/game/data/npcContextDialogues';
import { beginNpcConversation, npcConversationView } from '../src/game/core/npcTalk';
import { preloadUnmaskedPortraits } from '../src/game/core/npcPortraits';
import { replaceState } from '../src/stores/gameStore.svelte';
import { closeNpcTalk, uiState } from '../src/stores/uiStore.svelte';

let mounted: ReturnType<typeof mount> | undefined;
let target: HTMLElement | undefined;
beforeAll(async () => {
  if (!Element.prototype.animate) Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  await preloadUnmaskedPortraits();
});
afterEach(() => {
  if (mounted) unmount(mounted);
  target?.remove(); mounted = undefined; target = undefined;
  closeNpcTalk(); replaceState(createInitialState(99));
});

// 只构造独立测试存档的正常日常入口，不替换 NPC 稿件、会话节点或立绘选择器。
function dailyState(npcId: string, sceneId: string) {
  const state = createInitialState(105), npc = allNpcs().find(n => n.id === npcId)!;
  let placed = false;
  for (let day = 3; day <= 9 && !placed; day++) for (let hour = 0; hour < 24 && !placed; hour++) {
    const time = { ...state.time, day, hour, minute: 0, seed: state.rng.seed };
    const presence = npcPresenceAt(npc, { ...time, weekday: weekdayOf(time) });
    const scene=NPC_DIALOGUE_REMASTER[npcId].scenes[sceneId];
    if (presence && (!scene.locationId||scene.locationId===presence.locationId)) { Object.assign(state.time, time); state.locationId = presence.locationId; state.region = presence.regionId!; placed = true; }
  }
  expect(placed).toBe(true);
  ensureRelationship(state, npcId).affinity = 10;
  state.flags[`npc_portrait_revealed_${npcId}`] = true;
  for (const scene of Object.values(NPC_DIALOGUE_REMASTER[npcId].scenes)) if (scene.kind === 'event') state.flags[`npc_remaster_event_seen_${npcId}_${scene.id}`] = true;
  markGreeted(state, npcId, gameDay(state.time));
  // 这里只检查既有日常的文本与表情；先将优先播放的活动短稿设为当天已读。
  for(const scene of Object.values(NPC_CONTEXT_DIALOGUES))state.flags[contextDialogueDayFlag(scene.id)]=gameDay(state.time);
  state.flags[`npc_remaster_hint_day_${npcId}`] = gameDay(state.time);
  for (let visit = 0; visit < 40; visit++) {
    state.flags[`npc_remaster_talks_${npcId}`] = visit;
    if (remasterDailyConversationStart(state, npcId, 'acquaintance', 10)?.sceneId === sceneId) return state;
  }
  throw Error('找不到日常场景：' + sceneId);
}

describe('用户截图里的真实日常分支', () => {
  it.each([
    ['npc_lin_xiaoyu', '适合印在饭盒', 'thoughtful'],
    ['npc_zhao_gang', '不是请你来干活的定金', 'happy'],
    ['npc_chen_jie', '酱料台成图书馆了', 'happy'],
    ['npc_wang_lei', '当时他们不敢笑，你可以笑', 'happy'],
    ['npc_netbar_boss', '这一项工作不接受催促', 'happy'],
    ['npc_librarian', '那不叫推理', 'happy'],
    ['npc_flower_market_owner', '这又不是拍卖', 'happy'],
    ['npc_snack_street_vendor', '让我坐着过会儿瘾', 'happy'],
    ['npc_suburb_farmer', '找个圈让它绕着长', 'happy'],
  ])('其余正式稿的日常入口与回答分支保持可达：%s', (id, needle, category) => {
    const npc = allNpcs().find(n => n.id === id)!;
    const stage = npc.talk!.acquaintance as NpcTalkStage;
    const destination = Object.values(stage.nodes).find(node => node.text.includes(needle))!;
    expect(destination).toBeDefined();
    const search = (start: string): number[] | undefined => {
      const queue: Array<{ id:string; path:number[] }> = [{id:start,path:[]}], seen = new Set<string>();
      while (queue.length) {
        const current = queue.shift()!;
        if (current.id === destination.id) return current.path;
        if (seen.has(current.id)) continue; seen.add(current.id);
        stage.nodes[current.id]?.options.forEach((option,index) => { if (option.next) queue.push({id:option.next,path:[...current.path,index]}); });
      }
    };
    const scene = Object.values(NPC_DIALOGUE_REMASTER[id].scenes).find(scene => scene.kind === 'daily' && scene.stageKey === 'acquaintance' && search(scene.startNodeId) !== undefined)!;
    expect(scene).toBeDefined();
    const path = search(scene.startNodeId)!;
    const state = dailyState(id, scene.id);
    const started = beginNpcConversation(state, id, 'chat');
    expect(started.ok).toBe(true); expect(started.session?.nodeId).toBe(scene.startNodeId);
    if (process.env.NPC_PERFORMANCE_FIXTURES) {
      mkdirSync('docs/npc-dialogue-performance-20261014/fixtures', {recursive:true});
      writeFileSync('docs/npc-dialogue-performance-20261014/fixtures/'+id+'.json', JSON.stringify({state, path, needle, category, nodeId:destination.id}));
    }
  });

  it('通过正常闲聊入口进入饭盒配色场景，导出独立浏览器验证所需的状态', () => {
    const state = dailyState('npc_lin_xiaoyu', 'reset_daily_acquaintance_d02');
    const started = beginNpcConversation(state, 'npc_lin_xiaoyu', 'chat');
    expect(started.ok).toBe(true);
    const view = npcConversationView(state, started.session!);
    expect(view?.conversationKind).toBe('daily'); expect(view?.text).toContain('适合印在饭盒');
    if (process.env.NPC_PERFORMANCE_FIXTURES) {
      mkdirSync('docs/npc-dialogue-performance-20261014/fixtures', { recursive: true });
      writeFileSync('docs/npc-dialogue-performance-20261014/fixtures/lin-daily.json', JSON.stringify(state));
      writeFileSync('docs/npc-dialogue-performance-20261014/fixtures/lin-node.json', JSON.stringify(view, null, 2));
    }
  });

  it.each([
    ['最亮的', '幸好今天还没给自己买绿裙子', 'happy'],
    ['分不太出来', '我盯着它们两小时', 'thoughtful'],
  ])('当前文本与表情同步：%s 分支', async (answer, needle, category) => {
    replaceState(dailyState('npc_lin_xiaoyu', 'reset_daily_acquaintance_d02'));
    uiState.npcTalk = { npcId: 'npc_lin_xiaoyu', entry: 'chat' };
    target = document.createElement('div'); document.body.append(target);
    mounted = mount(NpcTalkModal, { target }); flushSync();
    await new Promise(resolve=>setTimeout(resolve,0));flushSync();
    const text = () => target!.querySelector('.dialogue-box p')?.textContent ?? '';
    const categoryNow = () => target!.querySelector('.npc-portrait-slot')?.getAttribute('data-portrait-category');
    const next = () => { target!.querySelector<HTMLElement>('.dialogue-box')!.click(); flushSync(); };
    for (let count = 0; count < 10 && !text().includes('适合印在饭盒'); count++) next();
    expect(text()).toContain('适合印在饭盒');
    expect(categoryNow()).toBe('thoughtful');
    for (let count = 0; count < 10 && !target.querySelector('.choice-btn'); count++) next();
    const choice = [...target.querySelectorAll<HTMLButtonElement>('.choice-btn')].find(button => button.textContent?.includes(answer));
    expect(choice).toBeDefined(); choice!.click(); flushSync();
    // 倾听时保持刚才的思考神态，不能突然变脸或提前播放下一句的情绪。
    expect(categoryNow()).toBe('thoughtful');
    for (let count = 0; count < 14 && !text().includes(needle); count++) next();
    expect(text()).toContain(needle); expect(categoryNow()).toBe(category);
    expect(target.querySelector('.npc-portrait-slot')?.getAttribute('data-portrait-visual-level')).toBe('1');
    const rendered=target.querySelectorAll('.npc-portrait-slot [data-face-rendering="authored-portrait"]');
    // During the short fade, the preceding figure remains first in the DOM.
    expect(rendered[rendered.length-1]?.getAttribute('data-face-emotion')).toBe(category);
  });
});
