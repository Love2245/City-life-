import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import type { GameState } from "../src/game/types";
import { TAKEOUT_MENU, placeTakeout, claimOrder as claimTakeout } from "../src/game/core/takeout";
import { SHOP_CATALOG, placeShopOrder, claimOrder as claimShop } from "../src/game/core/shop";
import { canLive, startLive, liveToday } from "../src/game/core/live";
import { tickForum, postToForum, forumPosts } from "../src/game/core/forum";
import { tickMoments, momentsPostsOf, createPost } from "../src/game/core/moments";
import { tickOrders } from "../src/game/core/orders";
import { allCitizens } from "../src/game/core/citizens";
import { smsContact, addContact } from "../src/game/core/contacts";
import { gameDay } from "../src/game/core/calendar";

function fresh(): GameState {
  const s = createInitialState();
  s.orders = [];
  s.live = { streaming: false, lastStreamDay: -1, totalFameGain: 0 };
  s.player.money = 10000;
  return s;
}

describe("v1.3 外卖到家", () => {
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

describe("v1.3 自媒体直播", () => {
  it("无笔记本/未安装 App 时不可直播", () => {
    const s = fresh();
    expect(canLive(s).ok).toBe(false); // 未装 app_live
    s.flags["app_live"] = true;
    expect(canLive(s).ok).toBe(false); // 仍无笔记本
  });

  it("装 App + 有笔记本可直播，每天限 1 次，给 fame + money", () => {
    const s = fresh();
    s.flags["app_live"] = true;
    s.flags["item_laptop"] = true;
    expect(canLive(s).ok).toBe(true);
    const fameBefore = s.player.stats.fame;
    const moneyBefore = s.player.money;
    const r = startLive(s);
    expect(r.ok).toBe(true);
    expect(s.player.stats.fame).toBeGreaterThan(fameBefore);
    expect(s.player.money).toBeGreaterThan(moneyBefore);
    expect(liveToday(s)).toBe(true);
    // 当天再播被拒
    const r2 = startLive(s);
    expect(r2.ok).toBe(false);
  });

  it("高端笔记本收益系数更高", () => {
    const low = fresh(); low.flags["app_live"] = true; low.flags["item_laptop"] = true;
    const high = fresh(); high.flags["app_live"] = true; high.flags["item_laptop_pro"] = true;
    // 多次采样取均值，避免 rng 偶发
    let lowSum = 0, highSum = 0;
    for (let i = 0; i < 30; i++) {
      const a = fresh(); a.flags["app_live"] = true; a.flags["item_laptop"] = true; startLive(a); lowSum += a.player.stats.fame;
      const b = fresh(); b.flags["app_live"] = true; b.flags["item_laptop_pro"] = true; startLive(b); highSum += b.player.stats.fame;
    }
    expect(highSum / 30).toBeGreaterThan(lowSum / 30);
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
  it("价格对齐线下实体店（衬衫 800→约 720，名表 10000→约 9000）", () => {
    const shirt = SHOP_CATALOG.find((m) => m.id === "shirt")!;
    const watch = SHOP_CATALOG.find((m) => m.id === "luxury_watch")!;
    expect(shirt.offline).toBe(800);
    expect(shirt.price).toBe(720);
    expect(watch.offline).toBe(10000);
    expect(watch.price).toBe(9000);
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
