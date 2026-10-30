import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightPath = process.env.QA_PW;
const playwrightUrl = playwrightPath ? pathToFileURL(playwrightPath).href : "playwright-core";
const playwright = await import(playwrightUrl);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error("无法解析 playwright-core 的 chromium 导出");

const baseUrl = process.env.QA_URL ?? "http://localhost:5199/";
const outputDir = join(resolve(process.cwd()), "qa-shots", "v1462-stability");
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {}),
});
const context = await browser.newContext({ viewport: { width: 1169, height: 1432 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
let mainNavigations = 0;
page.on("pageerror", (error) => errors.push(String(error).slice(0, 240)));
page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) mainNavigations += 1; });
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("urban-life-arcade-mode", "true");
  localStorage.setItem("urban-life-ui-gamemode", "pc");
  localStorage.setItem("urban-life-ui-zoom", "1");
});

async function clickButton(container, pattern, timeout = 8000) {
  const button = container.locator("button").filter({ hasText: pattern }).first();
  await button.waitFor({ state: "visible", timeout });
  const label = (await button.innerText()).trim().replace(/\s+/g, " ").slice(0, 80);
  await button.click({ timeout: 4000 });
  return label;
}

async function metrics() {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10) / 10);
    };
    return {
      viewport: [innerWidth, innerHeight],
      document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      arcadeStage: rect(document.querySelector(".arcade-stage")),
      gameStage: rect(document.querySelector(".mgh-game, .arcade-phone-scene")),
    };
  });
}

async function restaurantGeometry(game) {
  return game.evaluate((root) => {
    const box = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10);
    };
    return {
      container: box(root.querySelector(".rg-ing")),
      categories: [...root.querySelectorAll(".rg-ing-cat")].map((category) => ({
        label: category.querySelector(".rg-ing-label")?.textContent?.trim() ?? "",
        rect: box(category),
        row: box(category.querySelector(".rg-ing-row")),
        items: [...category.querySelectorAll(".rg-ing-btn")].map((button) => ({
          label: button.querySelector(".rg-ing-name")?.textContent?.trim() ?? "",
          rect: box(button),
          icon: box(button.querySelector(".rg-ing-icon")),
          art: box(button.querySelector(".food-art, svg")),
        })),
      })),
    };
  });
}

function measuredChange(label, before, after) {
  return {
    label,
    before: before.gameStage,
    after: after.gameStage,
    delta: before.gameStage && after.gameStage
      ? before.gameStage.map((value, axis) => Math.round((after.gameStage[axis] - value) * 10) / 10)
      : null,
  };
}

async function completeRestaurantOrder(game) {
  const customer = game.locator(".rg-cust:not(:disabled)").first();
  await customer.waitFor({ state: "visible", timeout: 5000 });
  const before = await metrics();
  const ingredientGeometryBefore = await restaurantGeometry(game);
  await customer.click();
  const afterSelect = await metrics();
  const recipeNames = await game.locator(".rg-recipe-row").evaluateAll((rows) =>
    rows.map((row) => row.children[2]?.textContent?.trim() ?? "").filter(Boolean),
  );
  const extras = await game.locator(".rg-ticket-item").evaluateAll((items) =>
    items.slice(1).map((item) => [...item.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent?.trim() ?? "")
      .find(Boolean) ?? "").filter(Boolean),
  );
  if (!recipeNames.length) throw new Error("选中餐厅顾客后没有显示原料清单");
  const allIngredients = game.locator(".rg-ing-btn");
  const selectByName = async (name) => {
    for (let index = 0; index < await allIngredients.count(); index += 1) {
      if ((await allIngredients.nth(index).locator(".rg-ing-name").innerText()).trim() === name) {
        await allIngredients.nth(index).click();
        return;
      }
    }
    throw new Error(`食材栏找不到订单所需项目：${name}`);
  };
  for (const name of [...recipeNames, ...extras]) await selectByName(name);
  const afterAssembly = await metrics();
  await game.locator(".rg-ing-btn.action").click();
  await page.waitForFunction(() => document.querySelector(".work-notice")?.textContent?.includes("出餐成功"), undefined, { timeout: 3000 });
  const afterServe = await metrics();
  return {
    action: `按小票制作并完成订单（${recipeNames.length} 种主品原料，${extras.length} 份配餐）`,
    steps: [
      measuredChange("选中订单并显示小票", before, afterSelect),
      measuredChange("按订单加入全部原料及配餐", afterSelect, afterAssembly),
      measuredChange("出餐并切换顾客", afterAssembly, afterServe),
    ],
    recipeNames,
    extras,
    servedNotice: await game.locator(".work-notice").innerText(),
    ingredientGeometryBefore,
    ingredientGeometryAfter: await restaurantGeometry(game),
  };
}

const cases = [
  { title: "保龄球馆", play: async (game) => {
    const before = await metrics();
    await clickButton(game, "投球");
    await page.waitForTimeout(2600);
    return { action: "投球", steps: [measuredChange("投球反馈", before, await metrics())] };
  } },
  { title: "夜间巡逻", play: async (game) => {
    await clickButton(game, "领取巡查单");
    await page.waitForTimeout(100);
    const beforeInspect = await metrics();
    await game.locator(".campus button").first().click();
    await page.waitForTimeout(100);
    const afterInspect = await metrics();
    const beforeReport = afterInspect;
    await clickButton(game, /登记正常|上报异常/);
    await page.waitForTimeout(250);
    return {
      action: "领取巡查单 → 检查首个路线点 → 登记现场",
      steps: [
        measuredChange("打开现场检查", beforeInspect, afterInspect),
        measuredChange("登记现场", beforeReport, await metrics()),
      ],
    };
  } },
  { title: "文件归档", play: async (game) => {
    const beforeStart = await metrics();
    await clickButton(game, "开始归档");
    await page.waitForTimeout(100);
    const afterStart = await metrics();
    const beforeAnswer = afterStart;
    await game.locator(".options button").first().click();
    await page.waitForTimeout(100);
    const afterAnswer = await metrics();
    await page.screenshot({ path: join(outputDir, "3-文件归档-answer-feedback.png") });
    await clickButton(game, "继续");
    await page.waitForTimeout(250);
    return {
      action: "开始归档 → 选择一个档案夹 → 继续下一题",
      steps: [
        measuredChange("开始游戏", beforeStart, afterStart),
        measuredChange("选择答案", beforeAnswer, afterAnswer),
        measuredChange("切换下一题", afterAnswer, await metrics()),
      ],
    };
  } },
  { title: "市场大扫除", play: async (game) => {
    await clickButton(game, "开始工作");
    const object = game.locator(".yard button.object").first();
    await object.waitFor({ state: "visible", timeout: 2500 });
    const before = await metrics();
    await object.click();
    await page.waitForTimeout(250);
    return { action: "点击首个清理目标", steps: [measuredChange("目标反馈", before, await metrics())] };
  } },
  { title: "收银找零", play: async (game) => {
    const steps = [];
    const checkoutPanels = async () => page.evaluate(() => {
      const selectors = [".cg", ".cg-main", ".cg-basket", ".cg-scan", ".cg-pay", ".cg-pay-info", ".cg-notes", ".cg-pad"];
      return Object.fromEntries(selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return [selector, null];
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return [selector, {
          rect: [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10) / 10),
          scrollHeight: element.scrollHeight,
          minHeight: style.minHeight,
          height: style.height,
          visibility: style.visibility,
        }];
      }));
    });
    const panelsBefore = await checkoutPanels();
    const beforeScan = await metrics();
    let basket = game.locator(".cg-item");
    await basket.first().waitFor({ state: "visible", timeout: 4000 });
    while (await basket.count()) {
      await basket.first().click();
      await page.waitForTimeout(40);
      basket = game.locator(".cg-item");
    }
    await game.locator(".cg-pay").waitFor({ state: "visible", timeout: 3000 });
    await page.waitForTimeout(180);
    const beforeInput = await metrics();
    const panelsAfterScan = await checkoutPanels();
    steps.push(measuredChange("扫码完成并进入付款", beforeScan, beforeInput));

    const rows = game.locator(".cg-calc-row b");
    const paidText = await rows.nth(0).innerText();
    const totalText = await rows.nth(1).innerText();
    const paid = Number(paidText.replace(/[^\d.]/g, ""));
    const total = Number(totalText.replace(/[^\d.]/g, ""));
    const change = (paid - total).toFixed(2);
    for (const digit of change) {
      const key = game.locator(".cg-key").filter({ hasText: new RegExp(`^${digit.replace(".", "\\.")}$`) }).first();
      await key.click();
    }
    await page.waitForTimeout(100);
    const afterInput = await metrics();
    steps.push(measuredChange("输入找零金额", beforeInput, afterInput));
    const entered = await game.locator(".cg-screen-val").innerText();
    if (Number(entered) !== Number(change)) throw new Error(`找零输入不一致：${entered} != ${change}`);
    await game.locator(".cg-clear").click();
    await page.waitForTimeout(100);
    steps.push(measuredChange("清空输入", afterInput, await metrics()));
    await game.locator(".cg-submit").waitFor({ state: "visible", timeout: 2000 });
    for (const digit of change) {
      const key = game.locator(".cg-key").filter({ hasText: new RegExp(`^${digit.replace(".", "\\.")}$`) }).first();
      await key.click();
    }
    const beforeSubmit = await metrics();
    await game.locator(".cg-submit").click();
    await page.waitForTimeout(250);
    return { action: "逐项扫码 → 输入正确找零 → 清空 → 再输入并确认", steps, checkoutPanels: { before: panelsBefore, afterScan: panelsAfterScan }, finish: await metrics(), beforeSubmit };
  } },
  { title: "流水线装配", play: async (game) => {
    const steps = [];
    await game.locator(".fg-slot.active").waitFor({ state: "visible", timeout: 3000 });
    for (let index = 0; index < 4; index += 1) {
      const targetText = (await game.locator(".fg-slot.active").innerText()).replace(/^\s*\d+\s*/, "").trim();
      const targetPart = game.locator(".fg-part").filter({ hasText: targetText }).first();
      await targetPart.waitFor({ state: "visible", timeout: 6000 });
      await page.waitForTimeout(230);
      const before = await metrics();
      // Conveyor parts intentionally move every animation frame, so Playwright's
      // stationary-pointer clickability check would wait until the game times out.
      // Dispatching click on the visible, matching item exercises the same handler.
      await targetPart.dispatchEvent("click");
      await page.waitForTimeout(220);
      steps.push(measuredChange(`按工单顺序抓取第 ${index + 1} 件`, before, await metrics()));
    }
    return { action: "连续抓取四件与当前工单匹配的传送带零件", steps };
  } },
  { title: "咖啡师出杯", play: async (game) => {
    return await completeRestaurantOrder(game);
  } },
  { title: "西餐上菜", play: async (game) => {
    return await completeRestaurantOrder(game);
  } },
  { title: "快餐配餐", play: async (game) => {
    return await completeRestaurantOrder(game);
  } },
  { title: "居家训练", play: async (game) => {
    const steps = [];
    const beforeStart = await metrics();
    await clickButton(game, "开始训练");
    await page.waitForTimeout(100);
    let beforeRep = await metrics();
    for (let repetition = 0; repetition < 2; repetition += 1) {
      const control = game.locator(".training button");
      await control.waitFor({ state: "visible", timeout: 3000 });
      const box = await control.boundingBox();
      if (!box) throw new Error("训练按钮没有可操作的边界框");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForFunction(() => Number.parseFloat(document.querySelector(".training .meter i")?.style.left ?? "0") >= 72, null, { timeout: 3000, polling: 16 });
      await page.mouse.up();
      await page.waitForFunction(() => !document.querySelector(".training button")?.disabled, null, { timeout: 3000, polling: 50 });
      const afterRep = await metrics();
      steps.push(measuredChange(`按住发力并在金色区松开第 ${repetition + 1} 次`, beforeRep, afterRep));
      beforeRep = afterRep;
    }
    return { action: "开始训练 → 按住发力两次并在金色区松手", steps: [measuredChange("开始训练", beforeStart, steps.length ? { gameStage: steps[0].before } : await metrics()), ...steps] };
  } },
  { title: "街头演唱", play: async (game) => {
    const steps = [];
    const beforeStart = await metrics();
    await clickButton(game, "▶ 开始");
    await page.waitForTimeout(100);
    const afterStart = await metrics();
    steps.push(measuredChange("开始节奏游戏", beforeStart, afterStart));
    const pattern = [0, 1, 2, 1];
    for (let index = 0; index < pattern.length; index += 1) {
      const track = pattern[index];
      await page.waitForFunction((trackIndex) => {
        const lane = document.querySelectorAll(".rh-lane")[trackIndex];
        return lane && [...lane.querySelectorAll(".rh-note")].some((note) => {
          const position = Number.parseFloat(note.style.top);
          return position >= 76 && position <= 81;
        });
      }, track, { timeout: 8000, polling: 16 });
      const beforeHit = await metrics();
      await game.locator(".rh-lane").nth(track).click({ force: true, timeout: 3000 });
      await page.waitForTimeout(60);
      steps.push(measuredChange(`按节拍击打第 ${index + 1} 个音符`, beforeHit, await metrics()));
    }
    return { action: "开始演唱 → 按节拍完成四个音符判定", steps, score: await game.locator(".rh-score").innerText() };
  } },
  { title: "象棋对弈", play: async (game) => {
    const before = await metrics();
    const firstPiece = game.locator(".cell.red.has").first();
    await firstPiece.waitFor({ state: "visible", timeout: 3000 });
    await firstPiece.click();
    const legalTarget = game.locator(".cell.target").first();
    await legalTarget.waitFor({ state: "visible", timeout: 3000 });
    await legalTarget.click();
    await page.waitForTimeout(300);
    return { action: "选中红方棋子 → 走一步合法着法", steps: [measuredChange("棋子选择与落子", before, await metrics())] };
  } },
  { title: "农活流程", play: async (game) => {
    const steps = [];
    const beforeStart = await metrics();
    await clickButton(game, "开始工作");
    await page.waitForTimeout(80);
    steps.push(measuredChange("开始农活", beforeStart, await metrics()));
    for (let index = 0; index < 4; index += 1) {
      const before = await metrics();
      await game.locator(".tools button").nth(index).click();
      await game.locator(".plot-target").click();
      await page.waitForTimeout(60);
      steps.push(measuredChange(`完成第 ${index + 1} 项田间工序`, before, await metrics()));
    }
    return { action: "开始农活 → 依序选锄头、种子袋、土耙和浇水壶完成一轮工序", steps };
  } },
  { title: "牧场挤奶", play: async (game) => {
    const steps = [];
    const holdToComplete = async (label) => {
      const before = await metrics();
      const button = game.locator(".shift .hold");
      const box = await button.boundingBox();
      if (!box) throw new Error("挤奶工序按钮没有可操作的边界框");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(920);
      await page.mouse.up();
      await page.waitForTimeout(80);
      steps.push(measuredChange(label, before, await metrics()));
    };
    const beforeStart = await metrics();
    await clickButton(game, "开始工作");
    await page.waitForTimeout(80);
    steps.push(measuredChange("开始牧场工作", beforeStart, await metrics()));
    await holdToComplete("安抚奶牛并完成工序");
    await holdToComplete("清洗乳房并完成工序");
    for (let index = 0; index < 6; index += 1) {
      const before = await metrics();
      await game.locator(".tools button").nth(index % 2).click();
      await page.waitForTimeout(35);
      steps.push(measuredChange(`左右交替挤奶 ${index + 1}/6`, before, await metrics()));
    }
    await holdToComplete("过滤装桶并进入下一轮");
    return { action: "开始工作 → 按住完成两步 → 左右交替挤奶六次 → 按住过滤装桶", steps };
  } },
  { title: "寺中出坡", play: async (game) => {
    const steps = [];
    const beforeStart = await metrics();
    await clickButton(game, "开始工作");
    await page.waitForTimeout(80);
    steps.push(measuredChange("开始寺院作业", beforeStart, await metrics()));
    for (let index = 0; index < 4; index += 1) {
      const before = await metrics();
      const button = game.locator(".shift .hold");
      const box = await button.boundingBox();
      if (!box) throw new Error("寺院作业按钮没有可操作的边界框");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(920);
      await page.mouse.up();
      await page.waitForTimeout(80);
      steps.push(measuredChange(`按住完成寺院工序 ${index + 1}/4`, before, await metrics()));
    }
    return { action: "开始寺院作业 → 按住并完成四项工序", steps };
  } },
  { title: "套圈", play: async (game) => {
    const before = await metrics();
    await game.locator(".target:not(:disabled)").first().click();
    await page.waitForTimeout(500);
    return { action: "向首个奖品目标投出一个圈", steps: [measuredChange("投掷及命中反馈", before, await metrics())] };
  } },
  { title: "2048", play: async (game) => {
    const steps = [];
    for (const [index, direction] of ["↑", "←", "↓", "→"].entries()) {
      const before = await metrics();
      const button = game.locator(".g2-pad .g2-btn").nth(index);
      await button.click();
      await page.waitForTimeout(80);
      steps.push(measuredChange(`滑动方向 ${direction}`, before, await metrics()));
    }
    return { action: "依次按上、左、下、右方向键按钮移动数字方块", steps };
  } },
  { title: "扫雷", play: async (game) => {
    const steps = [];
    const flagButton = game.locator(".ms-head .ms-btn");
    let before = await metrics();
    await flagButton.click();
    await game.locator(".ms-cell").first().click();
    await page.waitForTimeout(80);
    steps.push(measuredChange("开启插旗并标记第一格", before, await metrics()));
    before = await metrics();
    await flagButton.click();
    await game.locator(".ms-cell").nth(1).click();
    await page.waitForTimeout(80);
    for (let attempt = 0; attempt < 4 && await game.locator(".ms-foot .ms-bad").count(); attempt += 1) {
      await game.locator(".ms-foot .ms-btn").click();
      await page.waitForTimeout(50);
      await game.locator(".ms-cell").nth(attempt + 2).click();
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(80);
    steps.push(measuredChange("切回翻格并揭开一格", before, await metrics()));
    return { action: "插旗 → 取消旗标 → 揭开未标记格", steps };
  } },
  { title: "贪吃蛇", play: async (game) => {
    const before = await metrics();
    await clickButton(game, "开始");
    const beforeTurn = await metrics();
    await game.locator(".sn-pad .sn-btn").first().click();
    await game.locator(".sn-msg").waitFor({ state: "visible", timeout: 5000 });
    return {
      action: "开始贪吃蛇 → 向上移动并完成一轮边界碰撞结算",
      steps: [measuredChange("开始游戏", before, beforeTurn), measuredChange("转向并结算", beforeTurn, await metrics())],
    };
  } },
  { title: "推箱子", play: async (game) => {
    const before = await metrics();
    await game.locator(".sk-head").waitFor({ state: "visible", timeout: 3000 });
    const firstLevel = await game.locator(".sk-head").innerText();
    if (!firstLevel.includes("1/4")) throw new Error(`推箱子没有从第一关开始：${firstLevel}`);
    await game.locator(".sk-pad .sk-row .sk-btn").last().click();
    await page.waitForFunction(() => document.querySelector(".sk-head")?.textContent?.includes("2/4"), undefined, { timeout: 3000 });
    return { action: "向右推箱完成第一关的一步教学关 → 自动进入第二关", steps: [measuredChange("完成第一关", before, await metrics())] };
  } },
  { title: "外卖配送", play: async (game) => {
    const steps = [];
    await game.locator(".dg-card").first().waitFor({ state: "visible", timeout: 4000 });
    await page.waitForFunction(() => document.querySelector(".dg-card .dg-state")?.textContent?.includes("取餐"), undefined, { timeout: 6000 });
    let before = await metrics();
    await game.locator(".dg-card").first().click();
    await page.waitForFunction(() => document.querySelector(".dg-card .dg-state")?.textContent?.includes("送餐中"), undefined, { timeout: 12000 });
    steps.push(measuredChange("导航到取餐点并取货", before, await metrics()));
    before = await metrics();
    await game.locator(".dg-card").first().click();
    await page.waitForFunction(() => /^1\//.test(document.querySelectorAll(".mg-hud-item b")[1]?.textContent?.trim() ?? ""), undefined, { timeout: 15000 });
    steps.push(measuredChange("导航送达并完成订单", before, await metrics()));
    return { action: "等待首笔订单备好 → 导航取餐 → 导航送达并完成一单", steps };
  } },
  { title: "驾校排课", play: async (game) => {
    const guests = game.locator(".dg-guest");
    const roomButtons = game.locator(".dg-room");
    await guests.first().waitFor({ state: "visible", timeout: 4000 });
    const roomCapacities = [];
    for (let index = 0; index < await roomButtons.count(); index += 1) {
      const text = await roomButtons.nth(index).locator(".dg-room-foot").innerText();
      roomCapacities.push(Number(text.match(/(\d+)位/)?.[1] ?? 0));
    }
    let guestIndex = -1;
    let people = 0;
    for (let index = 0; index < await guests.count(); index += 1) {
      const text = await guests.nth(index).locator(".dg-people").innerText();
      const count = Number(text.match(/\d+/)?.[0] ?? 0);
      if (roomCapacities.some((capacity) => capacity >= count)) { guestIndex = index; people = count; break; }
    }
    if (guestIndex < 0) throw new Error("当前驾校学员没有可容纳的训练项目");
    const roomIndex = roomCapacities.findIndex((capacity) => capacity >= people);
    const before = await metrics();
    await guests.nth(guestIndex).click();
    await roomButtons.nth(roomIndex).click();
    await game.locator(".dg-room.occupied").waitFor({ state: "visible", timeout: 2000 });
    return { action: "选择驾校学员 → 分配可容纳其人数的训练项目", steps: [measuredChange("分配学员并占用训练项目", before, await metrics())] };
  } },
];

const report = { baseUrl, viewport: [1169, 1432], games: [], errors, failures: null };
let failures = [];
let fatalError = null;
try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(900);
  await clickButton(page, "小游戏");
  await page.waitForSelector(".arcade-card", { state: "visible", timeout: 10000 });
  report.mainMenu = await metrics();

  for (let index = 0; index < cases.length; index += 1) {
    const test = cases[index];
    const card = page.locator(".arcade-card").filter({ hasText: test.title }).first();
    await card.waitFor({ state: "visible", timeout: 10000 });
    if (test.title === "流水线装配") {
      await page.evaluate(() => {
        window.__qaMathRandom = Math.random;
        Math.random = () => 0;
      });
    }
    await card.click();
    const game = page.locator(".mgh-game, .arcade-phone-scene").last();
    await game.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(420);
    const before = await metrics();
    await page.screenshot({ path: join(outputDir, `${index + 1}-${test.title}.png`) });
    const interaction = await test.play(game);
    if (test.title === "流水线装配") {
      await page.evaluate(() => {
        if (window.__qaMathRandom) Math.random = window.__qaMathRandom;
        delete window.__qaMathRandom;
      });
    }
    const after = await metrics();
    const delta = before.gameStage && after.gameStage
      ? before.gameStage.map((value, axis) => Math.round((after.gameStage[axis] - value) * 10) / 10)
      : null;
    const result = {
      title: test.title,
      action: interaction.action,
      layoutSteps: interaction.steps,
      restaurantGeometry: Object.fromEntries(Object.entries(interaction).filter(([key]) => /Geometry/.test(key))),
      details: Object.fromEntries(Object.entries(interaction).filter(([key]) => !["action", "steps"].includes(key) && !/Geometry/.test(key))),
      before,
      after,
      gameStageDelta: delta,
      mainNavigations: mainNavigations - 1,
      ariaLiveNodes: await game.locator("[aria-live]").count(),
    };
    report.games.push(result);
    await page.screenshot({ path: join(outputDir, `${index + 1}-${test.title}-after.png`) });
    await clickButton(page, "返回列表");
    await page.waitForTimeout(260);
  }

} catch (error) {
  fatalError = String(error).slice(0, 500);
  errors.push(`Fatal QA flow: ${fatalError}`);
  throw error;
} finally {
  failures = report.games.filter((game) =>
    game.mainNavigations !== 0 || !game.before.gameStage || !game.after.gameStage || game.ariaLiveNodes !== 0 ||
    game.gameStageDelta.some((value) => Math.abs(value) > 2) ||
    game.layoutSteps.some((step) => step.delta?.some((value) => Math.abs(value) > 2)),
  );
  report.errors = errors;
  report.failures = failures.length + (fatalError ? 1 : 0);
  writeFileSync(join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
}

console.log(JSON.stringify({ games: report.games, errors: report.errors, outputDir, failures: failures.length }, null, 2));
if (failures.length || errors.length) process.exitCode = 1;
