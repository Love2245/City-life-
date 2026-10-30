// @vitest-environment jsdom
import './helpers/instantDialogue';
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import NpcTalkModal from "../src/components/layout/NpcTalkModal.svelte";
import PortraitStack from "../src/components/layout/PortraitStack.svelte";
import { createInitialState } from "../src/game/core/state";
import { allNpcs, npcPresenceAt } from "../src/game/core/npcs";
import { ensureRelationship } from "../src/game/core/relationships";
import { NPC_DIALOGUE_REMASTER } from "../src/game/data/npcDialogueRemaster";
import { weekdayOf } from "../src/game/core/calendar";
import { writeFileSync,mkdirSync } from 'node:fs';
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { closeNpcTalk, uiState } from "../src/stores/uiStore.svelte";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

function revealChoices(target: HTMLElement): void {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (target.querySelectorAll(".choice-btn").length > 0) return;
    target.querySelector<HTMLElement>(".dialogue-box")?.click();
    flushSync();
  }
  throw new Error("台词播放完毕后仍未显示回答选项");
}

function finishDisplayedReply(target: HTMLElement, expectedNode: string): void {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (target.querySelector<HTMLElement>(".character-layout")?.dataset.nodeId !== expectedNode) return;
    target.querySelector<HTMLElement>(".dialogue-box")?.click();
    flushSync();
  }
  throw new Error("主角回应播放完毕后仍未进入下一节点");
}

beforeAll(() => {
  if (!Element.prototype.animate) {
    Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  }
});

afterEach(() => {
  for (const item of mounted.splice(0)) {
    unmount(item.component);
    item.target.remove();
  }
  closeNpcTalk();
  replaceState(createInitialState(99));
});

describe("v1.43 NPC 全屏对话界面", () => {
  it.each([
    ['npc_lin_xiaoyu','这里能坐','happy'],['npc_zhao_gang','来看看活','neutral'],
    ['npc_chen_jie','想吃饭还是吃点心','thoughtful'],['npc_wang_lei','影子都没地方落','happy'],
    ['npc_netbar_boss','上机，还是找人','thoughtful'],['npc_librarian','这两种找法不一样','thoughtful'],
    ['npc_flower_market_owner','慢慢看','neutral'],['npc_snack_street_vendor','不是你胆子多大','happy'],
    ['npc_suburb_farmer','你想看也行','happy'],
  ])('实际初见界面接入自然语气：%s', (id,needle,category)=>{
    const npc=allNpcs().find(n=>n.id===id)!;replaceState(createInitialState(105));
    let placed=false;
    for(let day=3;day<=9&&!placed;day++)for(let hour=0;hour<24&&!placed;hour++){
      const time={...gameState.time,day,hour,minute:0,seed:gameState.rng.seed};
      const presence=npcPresenceAt(npc,{...time,weekday:weekdayOf(time)});
      if(presence){gameState.time.day=day;gameState.time.hour=hour;gameState.time.minute=0;gameState.locationId=presence.locationId;gameState.region=presence.regionId!;placed=true;}
    }
    expect(placed).toBe(true);
    if(process.env.NPC_EMOTION_AUDIT){mkdirSync('docs/npc-emotion-visible-20261014/initial-fixtures',{recursive:true});writeFileSync('docs/npc-emotion-visible-20261014/initial-fixtures/'+id+'.json',JSON.stringify(gameState));}
    uiState.npcTalk={npcId:id,entry:'meet'};
    const target=document.createElement('div');document.body.append(target);const component=mount(NpcTalkModal,{target});mounted.push({component,target});flushSync();
    for(let attempt=0;attempt<12&&!target.querySelector('.dialogue-box p')?.textContent?.includes(needle);attempt++){
      target.querySelector<HTMLElement>('.dialogue-box')?.click();flushSync();
    }
    expect(target.querySelector('.dialogue-box p')?.textContent).toContain(needle);
    expect(target.querySelector('.npc-portrait-slot')?.getAttribute('data-portrait-category')).toBe(category);
    expect(target.querySelector('.npc-portrait-slot')?.getAttribute('data-portrait-visual-level')).toBe(category === 'neutral' ? '0' : '1');
    if(category === 'neutral') expect(target.querySelector('.portrait-face-overlay')).toBeNull();
    else {
      expect(target.querySelector('.portrait-face-overlay')?.getAttribute('data-face-emotion')).toBe(category);
      expect(target.querySelectorAll('.portrait-face-overlay rect').length).toBeGreaterThan(0);
    }
  });

  it("实际初见选择后，NPC 的轻微幽默只改脸部、保持原身体，主角说话时不抢先播放 NPC 回应", () => {
    replaceState(createInitialState(104));
    gameState.locationId = "cafe";
    gameState.region = "downtown_residential";
    gameState.time.day = 3;
    gameState.time.hour = 8;
    uiState.npcTalk = { npcId: "npc_lin_xiaoyu", entry: "meet" };
    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(NpcTalkModal, { target });
    mounted.push({ component, target });
    flushSync();
    const variant = () => target.querySelector(".npc-portrait-slot")?.getAttribute("data-portrait-variant");
    expect(variant()).toBe("default");
    expect(target.querySelector(".npc-portrait-slot")?.getAttribute("data-portrait-emotion")).toBe("$0");
    const node = target.querySelector<HTMLElement>(".character-layout")!.dataset.nodeId!;
    revealChoices(target);
    const before = target.querySelector<HTMLImageElement>(".npc-portrait-image")!.src;
    const listeningMood=target.querySelector('.npc-portrait-slot')!.getAttribute('data-portrait-category');
    const reply = [...target.querySelectorAll<HTMLButtonElement>(".choice-btn")]
      .find(button => button.textContent?.includes("鞋为什么这么大"));
    expect(reply).toBeDefined();
    reply!.click();
    flushSync();
    expect(target.textContent).toContain("你的回应");
    expect(target.querySelector('.npc-portrait-slot')!.getAttribute('data-portrait-category')).toBe(listeningMood);
    expect(target.querySelector<HTMLImageElement>(".npc-portrait-image")!.src).toBe(before);
    finishDisplayedReply(target, node);
    expect(target.querySelector(".dialogue-box p")!.textContent).toContain("你这问题问得及时");
    expect(variant()).toBe("expression_smile");
    expect(target.querySelector(".npc-portrait-slot")?.getAttribute("data-portrait-emotion")).toBe("$h");
    expect(target.querySelector(".npc-portrait-slot")?.getAttribute("data-portrait-intensity")).toBe("1");
    expect(target.querySelector<HTMLImageElement>(".npc-portrait-image")!.src).toBe(before);
    // First meetings remain concealed but must actually render the classified
    // emotion, rather than passing a data attribute while displaying nothing.
    expect(target.querySelector('.portrait-face-overlay')?.getAttribute('data-face-emotion')).toBe('happy');
    expect(target.querySelector('.portrait-face-overlay')?.getAttribute('data-face-masked')).toBe('true');
    expect(target.querySelectorAll('.portrait-face-overlay rect').length).toBeGreaterThan(0);
    expect(target.querySelector('.portrait-face-overlay image')).toBeNull();
    target.querySelector<HTMLElement>(".dialogue-box")!.click();
    flushSync();
    expect(target.querySelector('.speaker-name')?.textContent).toBe('旁白');
    expect(variant()).toBe("expression_smile");
    target.querySelector<HTMLElement>(".dialogue-box")!.click();
    flushSync();
    expect(variant()).toBe("expression_smile");
    expect(target.querySelector('.dialogue-box p')?.textContent).toContain('看帽子就行');
    // 临时会话与立绘选择不会提前结算相识、时间、好感或存档。
    expect(gameState.relationships).toHaveLength(0);
  });

  it("透明立绘叠层允许不同槽位复用同一个资源 URL", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(PortraitStack, {
      target,
      props: {
        portrait: {
          variant: "default",
          source: null,
          layers: ["same-layer.png", "same-layer.png"],
        },
      },
    });
    mounted.push({ component, target });
    flushSync();

    expect(target.querySelectorAll(".portrait-stack-image")).toHaveLength(2);
  });

  it("组件先挂载后从场景打开时，会完成初始化而不会一直停在准备中", async () => {
    replaceState(createInitialState(98));
    gameState.locationId = "cafe";
    gameState.region = "downtown_residential";
    gameState.time.day = 3;
    gameState.time.hour = 8;
    closeNpcTalk();

    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(NpcTalkModal, { target });
    mounted.push({ component, target });
    flushSync();
    expect(target.querySelector(".npc-overlay")).toBeNull();

    uiState.npcTalk = { npcId: "npc_lin_xiaoyu", entry: "meet" };
    await tick();
    flushSync();

    expect(target.querySelector(".dialogue-loading")).toBeNull();
    expect(target.querySelector(".dialogue-box")).not.toBeNull();
    expect(target.querySelector(".dialogue-box p")?.textContent?.trim()).toBeTruthy();
  });

  it("已认识 NPC 提供闲聊与正式对话入口；无事项提示不推进时间或存档", async () => {
    replaceState(createInitialState(97));
    gameState.locationId = "cafe";
    gameState.region = "downtown_residential";
    gameState.time.day = 3;
    gameState.time.hour = 8;
    ensureRelationship(gameState, "npc_lin_xiaoyu").affinity = 10;
    for (const scene of Object.values(NPC_DIALOGUE_REMASTER.npc_lin_xiaoyu.scenes)) {
      if (scene.kind === "event") gameState.flags[`npc_remaster_event_seen_npc_lin_xiaoyu_${scene.id}`] = true;
    }
    const before = JSON.stringify(gameState);

    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(NpcTalkModal, { target });
    mounted.push({ component, target });
    uiState.npcTalk = { npcId: "npc_lin_xiaoyu", entry: "choose" };
    await tick();
    flushSync();

    expect(target.textContent).toContain("闲聊");
    expect(target.textContent).toContain("正式对话");
    target.querySelector<HTMLButtonElement>(".interaction-option:nth-of-type(2)")?.click();
    await tick();
    flushSync();

    expect(target.textContent).toContain("似乎没什么重要的事情");
    expect(JSON.stringify(gameState)).toBe(before);
  });

  it("渲染双侧立绘空位、底部台词和中央回答，不显示好感或关闭入口", () => {
    replaceState(createInitialState(99));
    gameState.locationId = "cafe";
    gameState.region = "downtown_residential";
    gameState.time.day = 3;
    gameState.time.hour = 8;
    uiState.npcTalk = { npcId: "npc_lin_xiaoyu", entry: "meet" };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(NpcTalkModal, { target });
    mounted.push({ component, target });
    flushSync();

    expect(target.querySelector(".npc-overlay")).not.toBeNull();
    expect(target.querySelector(".player-portrait-slot")).not.toBeNull();
    expect(target.querySelector(".npc-portrait-slot")).not.toBeNull();
    expect(target.querySelector("[data-portrait-mount=player]")).not.toBeNull();
    expect(target.querySelector("[data-portrait-mount=npc]")).not.toBeNull();
    expect(target.querySelector(".player-portrait-image image")?.getAttribute("href")).toBeTruthy();
    expect(target.querySelector<HTMLImageElement>(".npc-portrait-image")?.src).toBeTruthy();
    expect(target.querySelector(".player-portrait-slot")?.getAttribute("data-portrait-variant")).toBe("default");
    expect(target.querySelector(".npc-portrait-slot")?.getAttribute("data-portrait-variant")).toBeTruthy();
    expect(target.querySelector(".dialogue-box")).not.toBeNull();
    expect(target.querySelectorAll(".choice-btn").length).toBe(0);
    expect(target.querySelector(".character-layout")?.getAttribute("data-conversation-kind")).toBe("meet");
    expect(target.textContent).not.toContain("好感");
    expect(target.textContent).not.toContain("种回应");
    expect(target.textContent).not.toContain("关闭");
    expect(target.textContent).not.toContain("继续");
    expect(target.textContent).not.toContain("/5");
  });

  it("点击背景不会关闭，显式结束未完成初见可返回场景且不消耗时间", () => {
    replaceState(createInitialState(101));
    gameState.locationId = "cafe";
    gameState.region = "downtown_residential";
    gameState.time.day = 3;
    gameState.time.hour = 8;
    const before = JSON.stringify(gameState);
    uiState.npcTalk = { npcId: "npc_lin_xiaoyu", entry: "meet" };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(NpcTalkModal, { target });
    mounted.push({ component, target });
    flushSync();

    target.querySelector<HTMLElement>(".npc-overlay")!.click();
    expect(uiState.npcTalk).not.toBeNull();
    expect(JSON.stringify(gameState)).toBe(before);

    revealChoices(target);
    const leave = target.querySelector<HTMLButtonElement>(".choice-end-btn");
    expect(leave).not.toBeNull();
    leave!.click();
    flushSync();

    expect(uiState.npcTalk).toBeNull();
    expect(gameState.relationships).toHaveLength(0);
    expect(JSON.stringify(gameState)).toBe(before);
  });

  it("按 Escape 可以结束对话，且不额外结算游戏状态", () => {
    replaceState(createInitialState(102));
    gameState.locationId = "cafe";
    gameState.region = "downtown_residential";
    gameState.time.day = 3;
    gameState.time.hour = 8;
    const before = JSON.stringify(gameState);
    uiState.npcTalk = { npcId: "npc_lin_xiaoyu", entry: "meet" };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(NpcTalkModal, { target });
    mounted.push({ component, target });
    flushSync();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flushSync();

    expect(uiState.npcTalk).toBeNull();
    expect(JSON.stringify(gameState)).toBe(before);
  });

  it("逐行播放 NPC 台词，点击普通回答后先播放主角具体回复再推进", () => {
    replaceState(createInitialState(103));
    gameState.locationId = "cafe";
    gameState.region = "downtown_residential";
    gameState.time.day = 3;
    gameState.time.hour = 8;
    uiState.npcTalk = { npcId: "npc_lin_xiaoyu", entry: "meet" };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(NpcTalkModal, { target });
    mounted.push({ component, target });
    flushSync();

    const firstNode = target.querySelector<HTMLElement>(".character-layout")?.dataset.nodeId;
    const firstText = target.querySelector(".dialogue-box p")?.textContent;
    expect(target.querySelectorAll(".choice-btn").length).toBe(0);
    revealChoices(target);
    const answer = target.querySelector<HTMLButtonElement>(".choice-btn:not(.leave-choice)");
    expect(answer).toBeDefined();

    answer!.click();
    flushSync();

    expect(target.querySelector<HTMLElement>(".character-layout")?.dataset.nodeId).toBe(firstNode);
    expect(target.querySelector(".dialogue-box p")?.textContent).not.toBe(firstText);
    expect(target.textContent).toContain("你的回应");
    expect(target.textContent).not.toContain("认真听完对方的话");
    expect(target.querySelectorAll(".choice-btn").length).toBe(0);

    finishDisplayedReply(target, firstNode ?? "");
    expect(target.querySelector<HTMLElement>(".character-layout")?.dataset.nodeId).not.toBe(firstNode);
    expect(target.textContent).not.toContain("种回应");
  });

  it("每位 NPC 的实际排班初见入口都渲染完整对话，不出现空内容提示", () => {
    for (const npc of allNpcs()) {
      if (!NPC_DIALOGUE_REMASTER[npc.id]?.meetSceneId) continue; // Shared openings are exercised separately.
      const entry = npc.weeklySchedule?.[0];
      expect(entry, `${npc.id} 缺少排班`).toBeDefined();
      const found = (() => {
        for (let day = 1; day <= 30; day += 1) {
          for (let hour = 0; hour < 24; hour += 1) {
            const probe = { year: 2026, month: 8, day };
            const presence = npcPresenceAt(npc.id, { weekday: weekdayOf(probe), hour, minute: 0 });
            if (presence?.locationId === entry?.locationId) return { day, hour, regionId: presence.regionId };
          }
        }
        return null;
      })();
      expect(found, `${npc.id} 的排班没有可测试时刻`).not.toBeNull();
      if (!found) continue;

      replaceState(createInitialState(500 + found.day + found.hour));
      gameState.locationId = entry!.locationId;
      gameState.region = found.regionId ?? gameState.region;
      gameState.time.day = found.day;
      gameState.time.hour = found.hour;
      gameState.time.minute = 0;
      uiState.npcTalk = { npcId: npc.id, entry: "meet" };

      const target = document.createElement("div");
      document.body.appendChild(target);
      const component = mount(NpcTalkModal, { target });
      flushSync();

      expect(target.querySelector(".dialogue-box"), `${npc.id} 没有台词框`).not.toBeNull();
      expect(target.querySelector(".dialogue-error"), `${npc.id} 显示了空对话错误`).toBeNull();
      expect(target.querySelector(".dialogue-box p")?.textContent?.trim(), `${npc.id} 台词为空`).toBeTruthy();

      unmount(component);
      target.remove();
      closeNpcTalk();
    }
  });
  it("老工头的当前初见回应能走完，场景失效时显示原因且仍能退出", () => {
    for (const invalidContext of [false, true]) {
      closeNpcTalk();
      const state = createInitialState(948);
      state.locationId = "labor_market"; state.region = "downtown_industrial";
      Object.assign(state.time, { day: 2, hour: 14, minute: 45 });
      replaceState(state);
      uiState.npcTalk = { npcId: "npc_zhao_gang", entry: "meet" };
      const target = document.createElement("div"); document.body.append(target);
      const component = mount(NpcTalkModal, { target }); mounted.push({ component, target }); flushSync();
      revealChoices(target);
      const answer = [...target.querySelectorAll<HTMLButtonElement>(".choice-btn")].find(button => button.textContent?.includes("我自己再看看"))!;
      expect(answer).toBeDefined();
      answer.click(); flushSync();
      finishDisplayedReply(target,target.querySelector<HTMLElement>('.character-layout')!.dataset.nodeId!);
      revealChoices(target);
      if (invalidContext) gameState.locationId = "home";
      [...target.querySelectorAll<HTMLButtonElement>('.choice-btn')].find(button=>button.textContent?.includes('结束交流'))!.click();flushSync();
      if(target.textContent?.includes('你的回应')){target.querySelector<HTMLButtonElement>('.dialogue-box')!.click();flushSync();}
      if (invalidContext) {
        expect(target.querySelector(".choice-error")?.textContent).toContain("失效");
        target.querySelector<HTMLButtonElement>(".end-dialogue-btn")!.click(); flushSync();
      } else {
        if(target.querySelector('.result-panel')){target.querySelector<HTMLButtonElement>(".continue-btn")!.click();flushSync();}
      }
      expect(uiState.npcTalk).toBeNull();
      unmount(component); target.remove(); mounted.pop();
    }
  });

});
