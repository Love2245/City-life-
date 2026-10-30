import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import type { GameState } from "../src/game/types";
import { TAKEOUT_MENU, placeTakeout, claimOrder as claimTakeout } from "../src/game/core/takeout";
import { getApp, TAKEOUT_APP_DESCRIPTION } from "../src/game/core/apps";
import { SHOP_CATALOG, getShopItemPrices, placeShopOrder, claimOrder as claimShop } from "../src/game/core/shop";
import { canLive, startLive, liveToday } from "../src/game/core/live";
import { tickForum, postToForum, forumPosts } from "../src/game/core/forum";
import { tickMoments, momentsPostsOf, createPost } from "../src/game/core/moments";
import { tickOrders } from "../src/game/core/orders";
import { allCitizens } from "../src/game/core/citizens";
import { smsContact, addContact, addContactFromNpc } from "../src/game/core/contacts";
import { gameDay } from "../src/game/core/calendar";
import { COMMON_MOMENTS, NPC_MOMENTS } from "../src/game/data/npcMoments";

function fresh(): GameState {
  const s = createInitialState();
  s.orders = [];
  s.live = { streaming: false, lastStreamDay: -1, totalFameGain: 0 };
  s.player.money = 10000;
  return s;
}

describe("v1.3 外卖到家", () => {
  it("统一说明与即时送达、手动领取入包的实际流程一致", () => {
    expect(getApp("app_takeout")).toBeUndefined();
    expect(TAKEOUT_APP_DESCRIPTION).toContain("即时送达");
    expect(TAKEOUT_APP_DESCRIPTION).toContain("付款后可立即领取");
    expect(TAKEOUT_APP_DESCRIPTION).not.toMatch(/约\s*1\s*小时|跨天到达/);
  });

  it("菜单来自可即食消耗品且非空", () => {
    expect(TAKEOUT_MENU.length).toBeGreaterThan(0);
    expect(TAKEOUT_MENU.every((m) => m.price > 0)).toBe(true);
  });

  it("下单扣款并写入订单（eta 0，立即到达）", () => {
    const s = fresh();
    const item = TAKEOUT_MENU[0];
    const r = placeTakeout(s, item.id);
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(10000 - item.price);
    expect(s.orders?.length).toBe(1);
    expect(s.orders?.[0].arrived).toBe(true); // eta 0
    expect(r.text).toContain("即时送达");
  });

  it("钱不够下单失败", () => {
    const s = fresh();
    s.player.money = 0;
    const r = placeTakeout(s, TAKEOUT_MENU[0].id);
    expect(r.ok).toBe(false);
  });

  it("领取外卖入包（不即时食用，可在背包吃）", () => {
    const s = fresh();
    const item = TAKEOUT_MENU[0];
    const before = s.player.attrs.satiety;
    placeTakeout(s, item.id);
    const orderId = s.orders![0].id;
    const invBefore = Object.keys(s.inventory).length;
    const r = claimTakeout(s, orderId);
    expect(r.ok).toBe(true);
    // 入包后订单清空
    expect(s.orders?.length).toBe(0);
    // v1.3b7：外卖改为入包（不即时食用），背包 +1、饱腹不变
    expect(Object.keys(s.inventory).length).toBe(invBefore + 1);
    expect(s.player.attrs.satiety).toBe(before);
  });
});

describe("v1.3 网购商城", () => {
  it("目录非空且含分类", () => {
    expect(SHOP_CATALOG.length).toBeGreaterThan(0);
    const cats = new Set(SHOP_CATALOG.map((m) => m.cat));
    expect(cats.size).toBeGreaterThan(1);
  });

  it("下单写入订单（eta 3，未到达）", () => {
    const s = fresh();
    const item = SHOP_CATALOG[0];
    const r = placeShopOrder(s, item.id);
    expect(r.ok).toBe(true);
    expect(s.orders?.[0].etaDays).toBe(3);
    expect(s.orders?.[0].arrived).toBe(false);
  });

  it("跨天 tick 达 3 天标记到达，领取入包", () => {
    const s = fresh();
    const item = SHOP_CATALOG.find((m) => m.id === "shirt")!;
    placeShopOrder(s, item.id);
    const orderId = s.orders![0].id;
    // 模拟跨 3 天（推进日期，gameDay 线性 +1/天）
    for (let d = 0; d < 3; d++) {
      s.time.day += 1;
      tickOrders(s);
    }
    expect(s.orders?.[0].arrived).toBe(true);
    const invBefore = Object.keys(s.inventory).length;
    const r = claimShop(s, orderId);
    expect(r.ok).toBe(true);
    expect(Object.keys(s.inventory).length).toBe(invBefore + 1);
  });
});

describe("直播暂停开放", () => {
  it("即使已安装软件与高端电脑也不产生新收益，保留旧收益", () => {
    const s = fresh();
    s.flags.app_live = true;
    s.flags.item_laptop_pro = true;
    s.live.totalFameGain = 35;
    const before = JSON.stringify(s.player);
    expect(canLive(s).ok).toBe(false);
    expect(startLive(s)).toMatchObject({ ok: false, text: "自媒体直播暂未开放，等待后续开发" });
    expect(JSON.stringify(s.player)).toBe(before);
    expect(s.live.totalFameGain).toBe(35);
    expect(liveToday(s)).toBe(false);
  });
});

describe("v1.3 城市论坛", () => {
  it("跨天 tick 生成市民论坛帖（hint=forum）", () => {
    const s = fresh();
    tickForum(s, allCitizens());
    const posts = forumPosts(s);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => p.hint === "forum" || p.author === "citizen")).toBe(true);
    // 同一天不重复生成
    const before = forumPosts(s).length;
    tickForum(s, allCitizens());
    expect(forumPosts(s).length).toBe(before);
  });

  it("主角可发论坛帖（标记 hint=forum）", () => {
    const s = fresh();
    const p = postToForum(s, "二手市场周末开张，有摆摊货车！");
    expect(p).not.toBeNull();
    expect(p!.hint).toBe("forum");
    expect(forumPosts(s).some((x) => x.id === p!.id)).toBe(true);
  });

  it("空内容不发帖", () => {
    const s = fresh();
    expect(postToForum(s, "   ")).toBeNull();
  });
});

describe("v1.3 网购商城价格（回归：线上应为线下约 9 折，而非 1/10）", () => {
  it("线上价低于线下且约为 9 折", () => {
    for (const m of SHOP_CATALOG) {
      expect(m.price).toBeLessThan(m.offline);
      // 折扣在 0.85~0.95 之间（取整到 10 元）
      const ratio = m.price / m.offline;
      expect(ratio).toBeGreaterThan(0.85);
      expect(ratio).toBeLessThan(0.95);
    }
  });
  it("价格对齐线下实体店（衬衫 199→约 180，名表 10000→约 9000）", () => {
    const shirt = SHOP_CATALOG.find((m) => m.id === "shirt")!;
    const watch = SHOP_CATALOG.find((m) => m.id === "luxury_watch")!;
    expect(shirt.offline).toBe(199);
    expect(shirt.price).toBe(180);
    expect(watch.offline).toBe(10000);
    expect(watch.price).toBe(9000);
  });

  it("按当前物价倍率缩放展示价与扣款，线上仍约为线下 9 折", () => {
    const s = fresh();
    s.economy.priceIndex = 1.25;
    const prices = getShopItemPrices(s, "shirt")!;
    expect(prices.offline).toBe(249);
    expect(prices.price).toBe(225);
    expect(prices.price / prices.offline).toBeCloseTo(0.9);

    const before = s.player.money;
    const r = placeShopOrder(s, "shirt");
    expect(r.ok).toBe(true);
    expect(s.orders?.[0].price).toBe(prices.price);
    expect(s.player.money).toBe(before - prices.price);
  });
});

describe("v1.3 通讯真正互通（回归：发短信→对方回信进入收件箱）", () => {
  it("给联系人发短信会写入 out+in 两条消息", () => {
    const s = fresh();
    addContact(s, "parent_mother");
    const before = s.smsInbox.length;
    const r = smsContact(s, "parent_mother");
    expect(r.ok).toBe(true);
    // 应新增 2 条：主角发出(dir:out) + 对方回信(dir:in)
    expect(s.smsInbox.length).toBe(before + 2);
    const last = s.smsInbox[s.smsInbox.length - 1];
    expect(last.dir).toBe("in");
    expect(last.contactId).toBe("parent_mother");
  });
});

describe("v1.3b4 朋友圈 vs 论坛严格分家", () => {
  it("朋友圈（momentsPostsOf）只含 self/contact，绝不含 citizen 帖", () => {
    const s = fresh();
    // 主角发一条朋友圈
    createPost(s, { text: "今天开始养花", category: "daily" });
    // 跨天 tick 触发论坛帖（市民城市资讯）
    tickForum(s, allCitizens());
    const moments = momentsPostsOf(s);
    expect(moments.some((p) => p.author === "self" && p.text === "今天开始养花")).toBe(true);
    // 关键不变量：moments 中不含 hint===forum 的帖，也不含 author===citizen 的帖
    expect(moments.some((p) => p.hint === "forum")).toBe(false);
    expect(moments.some((p) => p.author === "citizen")).toBe(false);
  });

  it("论坛（forumPosts）只含 hint=forum，绝不含 self/contact 帖", () => {
    const s = fresh();
    // 主角发给朋友圈
    createPost(s, { text: "今日份的好心情", category: "daily" });
    // 论坛 tick
    tickForum(s, allCitizens());
    const forum = forumPosts(s);
    expect(forum.length).toBeGreaterThan(0);
    expect(forum.every((p) => p.hint === "forum")).toBe(true);
    expect(forum.some((p) => p.author === "self" && p.text === "今日份的好心情")).toBe(false);
    // 主角发到论坛
    const fp = postToForum(s, "郊区跳蚤市场周末开！");
    expect(fp).not.toBeNull();
    expect(forumPosts(s).some((p) => p.id === fp!.id)).toBe(true);
    expect(momentsPostsOf(s).some((p) => p.id === fp!.id)).toBe(false);
  });

  it("旧存档里的朋友圈图片占位不再显示，且读取时不改写存档", () => {
    const s = fresh();
    const post = createPost(s, { text: "旧动态", category: "daily" });
    post.image = "【该图片暂时无法查看】";

    const visiblePost = momentsPostsOf(s).find((entry) => entry.id === post.id);
    expect(visiblePost?.image).toBeUndefined();
    expect(post.image).toBe("【该图片暂时无法查看】");
  });

  it("tickMoments 仅生成联系人的动态；不混入市民帖", () => {
    const s = fresh();
    // 加一个联系人让其发帖被允许
    addContact(s, "parent_mother");
    s.time.day = gameDay(s.time) + 1; // 推进一天以解除同天去重限制
    tickMoments(s, allCitizens());
    const moments = momentsPostsOf(s);
    expect(moments.some((p) => p.author === "self")).toBe(false); // 主角未发帖
    // 随机性：联系人不一定发，但市民帖一定不在 moments 中
    expect(moments.every((p) => p.author === "contact")).toBe(true);
  });
});

describe("v1.45 NPC 朋友圈内容与解锁", () => {
  it("每个 NPC 有10条专属动态，另有20条通用动态，无图片时以纯文字显示", () => {
    const npcPools = Object.values(NPC_MOMENTS);
    expect(npcPools).toHaveLength(9);
    expect(npcPools.every((pool) => pool.length === 10)).toBe(true);
    expect(COMMON_MOMENTS).toHaveLength(20);
    expect(npcPools.flat().every((post) => post.image === undefined)).toBe(true);
  });

  it("高好感联系人按顺序发布专属动态，单条不重复且不生成图片占位", () => {
    const s = createInitialState(145);
    expect(addContactFromNpc(s, "npc_lin_xiaoyu")).toBe(true);
    s.relationships.push({
      npcId: "npc_lin_xiaoyu",
      affinity: 70,
      state: "close_friend",
      lastInteractionDay: 0,
    });

    // 专属记录可能已被120条显示上限清出；在整个长时间窗口计数，不能靠重发凑够10条。
    const published=new Map<string,string>();const templateIds:string[]=[];
    for (let i = 0; i < 1000; i++) {
      s.time.day += 1;
      tickMoments(s, []);
      for(const post of momentsPostsOf(s).filter(p=>p.npcId==='npc_lin_xiaoyu'&&p.momentSource==='dedicated')){
        if(!published.has(post.id)){published.set(post.id,post.momentTemplateId!);templateIds.push(post.momentTemplateId!);}
        expect(post.image).toBeUndefined();
      }
    }
    expect(templateIds).toHaveLength(10);expect(new Set(templateIds).size).toBe(10);
  });
});
