import { describe, expect, it } from "vitest";
import { allNpcs } from "../src/game/core/npcs";
import { npcWeatherOutfitForConditions } from "../src/game/core/npcOutfits";
import {
  dialogueLines,
  npcPortraitForContext,
  npcPortraitForDialogue,
  preloadUnmaskedPortraits,
  playerPortraitForReply,
  playerReplyText,
} from "../src/game/core/npcPortraits";

describe("NPC 对话立绘", () => {
  it("解除马赛克后，常态和缺少天气差分的场景都不会回退到模糊服装立绘", async () => {
    await preloadUnmaskedPortraits();
    const combinedEmotions = [
      "emotion_happy",
      "emotion_disappointed",
      "emotion_angry",
      "emotion_surprised",
    ] as const;
    for (const npc of allNpcs()) {
      for (const context of ["service", "casual", "market", "outdoor"] as const) {
        const p=npcPortraitForContext(npc.id, context, "default", true, null);
        const authored=(context==='service'&&npc.id==='npc_fan_kexi')||(context==='outdoor'&&npc.id==='npc_jack_fanma');
        expect(p.source).toContain(authored?'npc_dialogue/':'unmasked-clean/');
        if(authored)expect(p.atlas).toBeDefined();
      }
      for (const emotion of combinedEmotions) {
        expect(npcPortraitForContext(npc.id, "casual", emotion, true, null).source)
          .toContain(`unmasked-clean/${npc.id}/${emotion}.png`);
      }
    }
    expect(npcPortraitForContext("npc_chen_jie", "service", "default", true, "summer").source).toContain("unmasked-clean/");
  });
  it("所有当前 NPC 与主角都有可用的默认立绘资源", () => {
    for (const npc of allNpcs()) {
      const stage = npc.talk?.meet;
      const node = stage?.nodes[stage.start];
      const portrait = npcPortraitForDialogue(npc.id, node?.text ?? "", "meet", node?.id ?? "meet");
      expect(portrait.source, `${npc.id} 默认立绘缺失`).toBeTruthy();
    }
    expect(playerPortraitForReply().source).toBeTruthy();
  });

  it("优先用台词中的动作和情绪选择 NPC 立绘", () => {
    expect(npcPortraitForDialogue("npc_lin_xiaoyu", "（她想了想，把草图收好。）", "meet", "meet_1").variant)
      .toBe("expression_thinking");
    expect(npcPortraitForDialogue("npc_chen_jie", "（陈姐笑着把盒饭推过来。）", "friend", "friend_1").variant)
      .toBe("expression_smile");
    expect(npcPortraitForDialogue("npc_wang_lei", "（王爷爷皱起眉，认真提醒你。）", "friend", "friend_1").variant)
      .toBe("default");
    expect(npcPortraitForDialogue("npc_zhao_gang", "（他把手一摊。）", "friend", "friend_1").variant)
      .toBe("action_shrug");
    const concealed = npcPortraitForDialogue(
      "npc_chen_jie", "（陈姐笑着把盒饭推过来。）", "friend", "friend_1",
    );
    expect(concealed.assetVariant).toBe("default");
    expect(concealed.atlas).toBeTruthy();
    expect(concealed).not.toHaveProperty('faceOverlay');
  });

  it("主角仅根据已选回答切换动作，不调用不存在的表情差分", () => {
    expect(playerPortraitForReply("（叉腰。）交给我就行。").variant).toBe("action_hands_on_hips");
    expect(playerPortraitForReply("（托腮。）我想先听听你的判断。").variant).toBe("action_thinking");
    expect(playerPortraitForReply("（抱臂。）我暂时想自己处理。").variant).toBe("action_arms_crossed");
    expect(playerPortraitForReply("（耸肩。）谢谢你提醒我。").variant).toBe("action_shrug");
  });

  it("按对白方向翻转指定 NPC，并把长回应拆成逐行播放", () => {
    expect(npcPortraitForDialogue("npc_flower_market_owner", "默认台词", "friend", "friend_1").flipX)
      .toBe(true);
    expect(npcPortraitForDialogue("npc_lin_xiaoyu", "默认台词", "friend", "friend_1").flipX)
      .toBe(false);
    expect(dialogueLines("第一句\n\n第二句\r\n第三句")).toEqual(["第一句", "第二句", "第三句"]);
    expect(dialogueLines("……今天不冷。\n就……想听听你的看法。。。")).toEqual(["今天不冷。", "就想听听你的看法"]);
    expect(playerReplyText({ label: "谢谢你。" })).toBe("谢谢你。");
    expect(playerReplyText({ label: "" })).toBe("");
    expect(playerReplyText({ label: "结束交流" })).toBe("");
    expect(playerReplyText({ label: "结束对话" })).toBe("");
  });

  it("清理上帝视角括号，预加载和联系人状态不改变清晰立绘", async () => {
    expect(dialogueLines("（她心里觉得有点遗憾。）谢谢你。")).toEqual(["谢谢你。"]);
    expect(dialogueLines("（她抬头。）店就在前面。")).toEqual(["（她抬头。）店就在前面。"]);
    expect(dialogueLines("（她沉默地看着窗外，没有说话。）")).toEqual(["（她沉默地看着窗外，没有说话。）"]);
    expect(playerReplyText({ label: "谢谢你。" })).not.toContain("认真听完");

    const masked = npcPortraitForDialogue("npc_lin_xiaoyu", "默认台词", "friend", "friend_1");
    await preloadUnmaskedPortraits();
    const unmasked = npcPortraitForDialogue("npc_lin_xiaoyu", "默认台词", "friend", "friend_1", true);
    expect(masked.source).toBeTruthy();
    expect(unmasked.source).toBeTruthy();
    expect(unmasked.source).toBe(masked.source);
  });

  it("天气穿搭按冬季、雨天、酷暑、常态的顺序选择", () => {
    expect(npcWeatherOutfitForConditions("winter", "rain")).toBe("winter");
    expect(npcWeatherOutfitForConditions("winter", "heatwave")).toBe("winter");
    expect(npcWeatherOutfitForConditions("autumn", "coldwave")).toBe("winter");
    expect(npcWeatherOutfitForConditions("spring", "snow")).toBe("winter");
    expect(npcWeatherOutfitForConditions("autumn", "rain")).toBe("rain");
    expect(npcWeatherOutfitForConditions("spring", "heatwave")).toBe("summer");
    expect(npcWeatherOutfitForConditions("summer", "sunny")).toBe("summer");
    expect(npcWeatherOutfitForConditions("summer", "cloudy")).toBeNull();
    expect(npcWeatherOutfitForConditions("autumn", "cloudy")).toBe('autumn');
  });

  it("九位 NPC 的天气立绘与联系人清晰版成对加载", async () => {
    const expected = [
      ["npc_lin_xiaoyu", "summer"],
      ["npc_lin_xiaoyu", "rain"],
      ["npc_lin_xiaoyu", "winter"],
      ["npc_zhao_gang", "summer"],
      ["npc_zhao_gang", "rain"],
      ["npc_zhao_gang", "winter"],
      ["npc_chen_jie", "winter"],
      ["npc_wang_lei", "summer"],
      ["npc_wang_lei", "rain"],
      ["npc_wang_lei", "winter"],
      ["npc_librarian", "summer"],
      ["npc_librarian", "rain"],
      ["npc_librarian", "winter"],
      ["npc_netbar_boss", "winter"],
      ["npc_flower_market_owner", "winter"],
      ["npc_snack_street_vendor", "winter"],
      ["npc_suburb_farmer", "summer"],
      ["npc_suburb_farmer", "rain"],
      ["npc_suburb_farmer", "winter"],
    ] as const;

    await preloadUnmaskedPortraits();
    for (const [npcId, weatherOutfit] of expected) {
      const scene = npcPortraitForContext(npcId, "casual", "default", false, weatherOutfit);
      const dialogue = npcPortraitForDialogue(
        npcId, "你好。", "meet", "meet_1", true, "casual", weatherOutfit,
      );
      expect(scene.source, `${npcId}/${weatherOutfit} 普通立绘缺失`).toContain(
        `npc_weather/${npcId}/${weatherOutfit}/default.png`,
      );
      expect(dialogue.source, `${npcId}/${weatherOutfit} 清晰立绘缺失`).toContain(
        `npc_dialogue/${npcId}/${weatherOutfit}_20261015.png`,
      );
    }

    const chenFallback = npcPortraitForContext("npc_chen_jie", "service", "default", false, "summer");
    expect(chenFallback.source).toBeTruthy();
    expect(chenFallback.source).not.toContain("npc_weather/");
  });

});
