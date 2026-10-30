import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightPath = process.env.QA_PW;
const playwrightUrl = playwrightPath ? pathToFileURL(playwrightPath).href : "playwright-core";
const playwright = await import(playwrightUrl);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error("无法解析 playwright-core 的 chromium 导出");

const outDir = join(resolve(process.cwd()), "qa-shots", "v1462-new-save");
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {}),
});
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(60000);
const errors = [];
let stages = [];
let socialized = false;
let adoptedCat = false;
let allowCatAdoption = false;
page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("urban-life-ui-gamemode", "pc");
  localStorage.setItem("urban-life-ui-zoom", "1");
});

const readUi = async () => page.evaluate(() => ({
  title: document.title,
  body: (document.body?.innerText ?? "").slice(0, 9000),
  buttons: [...document.querySelectorAll("button")].map((button) => (button.innerText ?? "").trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 120),
  location: [...document.querySelectorAll("[data-location], .location-name, .scene-title")].map((el) => el.textContent?.trim()).filter(Boolean),
  storageKeys: Object.keys(localStorage),
}));

async function saveScreenshot(filename) {
  if (process.env.QA_SCREENSHOTS === "0") return;
  await page.screenshot({ path: join(outDir, filename), fullPage: false });
}

async function closeActionOverlays() {
  for (let i = 0; i < 5; i++) {
    const eventModal = page.locator(".event-modal");
    if (await eventModal.isVisible().catch(() => false)) {
      const eventText = await eventModal.innerText();
      const choices = eventModal.locator(".e-choice:not(.disabled)");
      const catAdoption = eventText.includes("蹭腿的流浪猫") && allowCatAdoption
        ? choices.filter({ hasText: /带回家收养/ })
        : page.locator(".never-match");
      const choice = await catAdoption.count() ? catAdoption.first() : choices.first();
      if (await choice.count()) {
        if (eventText.includes("蹭腿的流浪猫") && allowCatAdoption && (await choice.innerText()).includes("带回家收养")) adoptedCat = true;
        await choice.click();
        await page.waitForTimeout(250);
        const done = eventModal.locator(".e-done:visible");
        if (await done.count()) await done.click();
        await page.waitForTimeout(350);
        continue;
      }
    }
    const buttons = page.locator("button:visible").filter({ hasText: /继续|确定|知道了|关闭/ });
    if (!(await buttons.count())) return;
    await buttons.last().click();
    await page.waitForTimeout(350);
  }
}

async function finishNpcConversation() {
  const overlay = page.locator(".npc-overlay");
  await overlay.waitFor({ state: "visible" });
  for (let step = 0; step < 80; step++) {
    if (!(await overlay.isVisible().catch(() => false))) return;
    const resultContinue = overlay.locator(".result-actions .continue-btn:visible");
    if (await resultContinue.count()) {
      await resultContinue.click();
      await page.waitForTimeout(250);
      continue;
    }
    const choices = overlay.locator(".choice-btn:visible");
    if (await choices.count()) {
      const nonLeave = choices.filter({ hasNot: page.locator(".leave-choice") });
      await (await nonLeave.count() ? nonLeave.first() : choices.first()).click();
      await page.waitForTimeout(100);
      continue;
    }
    const advance = overlay.locator('.dialogue-box[aria-label="点击任意处继续播放台词"]:visible');
    if (await advance.count()) {
      await advance.click();
      await page.waitForTimeout(100);
      continue;
    }
    throw new Error(`NPC 对话没有可继续的 UI 控件：${(await overlay.innerText()).slice(0, 600)}`);
  }
  throw new Error("NPC 对话超过 80 步仍未结束");
}

async function socializeIfAvailable() {
  if (socialized) return true;
  const meet = page.locator(".npc-panel .npc-row-btn.meet:visible");
  const anyTalk = page.locator(".npc-panel .npc-row-btn:visible");
  const button = await meet.count() ? meet.first() : anyTalk.first();
  if (!(await button.count())) return false;
  await button.click();
  await finishNpcConversation();
  socialized = true;
  return true;
}

async function resumeWeeklyRecap() {
  const resume = page.getByRole("button", { name: /返回游戏/ });
  if (await resume.count() && await resume.last().isVisible().catch(() => false)) {
    await resume.last().click();
    await page.waitForTimeout(300);
  }
}

function currentClock(body) {
  const match = body.match(/2026年8月\d+日\s*\n周[一二三四五六日]\s*\n(\d{2}):(\d{2})/);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

async function socializeAtParkBeforeNine() {
  if (socialized) return;
  await page.getByRole("button", { name: /出门 \/ 回住宅区/ }).click();
  await page.waitForTimeout(250);
  let park = page.getByRole("button", { name: /街心公园/ }).last();
  for (let attempt = 0; attempt < 8 && await park.isDisabled(); attempt++) {
    const waitButton = page.locator(".wait-bar").getByRole("button", { name: /等 30 分钟/ });
    if (!(await waitButton.count())) break;
    await waitButton.click();
    await page.waitForTimeout(300);
    await closeActionOverlays();
    await resumeWeeklyRecap();
  }
  if (await park.isDisabled()) throw new Error("等到公园开门时仍无法进入街心公园");
  await park.click();
  await page.waitForTimeout(400);
  await closeActionOverlays();
  for (let attempt = 0; attempt < 14 && !socialized; attempt++) {
    if (await socializeIfAvailable()) break;
    const clock = currentClock(await page.locator("body").innerText());
    if (!clock || clock.hour >= 9) break;
    const waitButton = page.locator(".wait-bar").getByRole("button", { name: /等 30 分钟/ });
    if (!(await waitButton.count())) break;
    await waitButton.click();
    await page.waitForTimeout(300);
    await closeActionOverlays();
    await resumeWeeklyRecap();
  }
  await page.getByRole("button", { name: /出门 \/ 回住宅区/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /政府免费住宿/ }).last().click();
  await page.waitForTimeout(350);
  await closeActionOverlays();
}

async function waitUntilHour(targetHour) {
  for (let attempt = 0; attempt < 24; attempt++) {
    await resumeWeeklyRecap();
    const clock = currentClock(await page.locator("body").innerText());
    if (!clock || clock.hour >= targetHour) return;
    const waitButton = page.locator(".wait-bar").getByRole("button", { name: /等 30 分钟/ });
    if (!(await waitButton.count())) return;
    await waitButton.click();
    await page.waitForTimeout(300);
    await closeActionOverlays();
  }
}

try {
  await page.goto(process.env.QA_URL ?? "http://127.0.0.1:5199/", { waitUntil: "domcontentloaded" });
  await page.locator(".menu-root").waitFor({ state: "visible" });
  stages = [{ name: "主菜单", ui: await readUi() }];
  await page.getByRole("button", { name: /开始新生活/ }).click();
  await page.getByText(/开局设定/).waitFor({ state: "visible" });
  const moneyRow = page.locator(".alloc-row").filter({ hasText: "金钱" });
  for (let i = 0; i < 10; i++) await moneyRow.locator(".ctrl button").nth(1).click();
  await page.getByRole("button", { name: /下一步：确认/ }).click();
  await page.getByRole("button", { name: /开始生活/ }).click();
  await page.waitForTimeout(500);
  stages.push({ name: "新档开局", ui: await readUi() });
  await saveScreenshot("01-new-game.png");
  await page.getByRole("button", { name: /目标/ }).click();
  await page.locator(".goals-page").waitFor({ state: "visible" });
  stages.push({ name: "打开手机并查看目标", ui: await readUi() });
  await page.locator(".p-close").click();
  await page.getByRole("button", { name: /吃泡面/ }).click();
  await page.waitForTimeout(300);
  await closeActionOverlays();
  await page.waitForTimeout(300);
  stages.push({ name: "完成吃饭", ui: await readUi() });
  await page.getByRole("button", { name: /出门 \/ 回住宅区/ }).click();
  await page.waitForTimeout(250);
  stages.push({ name: "打开出门地点选择", ui: await readUi() });
  await saveScreenshot("02-destination-picker.png");
  await page.getByRole("button", { name: /回市区/ }).click();
  await page.waitForTimeout(250);
  stages.push({ name: "查看市区目的地", ui: await readUi() });
  await saveScreenshot("03-city-districts.png");
  await page.getByRole("button", { name: /工业园区/ }).click();
  await page.waitForTimeout(600);
  stages.push({ name: "进入工业园区", ui: await readUi() });
  await page.getByRole("button", { name: /劳务市场/ }).click();
  await page.waitForTimeout(600);
  stages.push({ name: "抵达劳务市场", ui: await readUi() });
  await saveScreenshot("04-labor-market.png");
  if (await socializeIfAvailable()) {
    stages.push({ name: "在劳务市场认识 NPC", ui: await readUi() });
  }
  let dailyJob;
  for (let refresh = 0; refresh < 5 && !dailyJob; refresh++) {
    const cards = page.locator(".job-card");
    const body = await page.locator("body").innerText();
    const clock = body.match(/2026年8月\d+日\s*\n周[一二三四五六日]\s*\n(\d{2}):(\d{2})/);
    const currentHour = Number(clock?.[1] ?? 0);
    const currentMinute = Number(clock?.[2] ?? 0);
    for (let i = 0; i < (await cards.count()); i++) {
      const candidate = cards.nth(i);
      const action = candidate.getByRole("button", { name: /抢活/ });
      const text = await candidate.innerText();
      const scheduledStart = Number(text.match(/(\d{1,2}):00 开工/)?.[1] ?? 0);
      const isWithinStartWindow = scheduledStart === 9 && currentHour >= 9 && (currentHour < 11 || (currentHour === 11 && currentMinute === 0));
      if (!(await action.isDisabled()) && (text.includes("时间自由") || isWithinStartWindow)) {
        dailyJob = candidate;
        break;
      }
    }
    if (!dailyJob && refresh < 4) {
      await page.locator(".wait-bar").getByRole("button", { name: /等 30 分钟/ }).click();
      await page.waitForTimeout(300);
      await closeActionOverlays();
      if (!socialized) await socializeIfAvailable();
    }
  }
  if (!dailyJob) throw new Error("没有找到可接的时间自由日结岗位");
  await dailyJob.getByRole("button", { name: /抢活/ }).click();
  await page.waitForTimeout(600);
  if (await page.locator(".mg-card").count()) await page.locator(".mg-close").click();
  await page.waitForTimeout(500);
  await closeActionOverlays();
  stages.push({ name: "完成日结工作", ui: await readUi() });
  if (await socializeIfAvailable()) stages.push({ name: "工作后与 NPC 交流", ui: await readUi() });
  await saveScreenshot("05-job-started.png");
  await page.getByRole("button", { name: /⚙️ 菜单/ }).click();
  await page.getByRole("button", { name: /存档 \/ 读档/ }).click();
  await page.locator(".slot-card").first().getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForTimeout(500);
  stages.push({ name: "手动保存", ui: await readUi() });
  await saveScreenshot("06-manual-save.png");
  await page.getByRole("button", { name: /返回/ }).click();
  await page.waitForTimeout(400);
  stages.push({ name: "返回游戏", ui: await readUi() });
  await page.mouse.click(4, 4);
  await page.waitForTimeout(250);
  const leaveWorkplace = page.getByRole("button", { name: /出门 \/ 回工业园区/ });
  if (await leaveWorkplace.count()) {
    await leaveWorkplace.last().click();
    await page.waitForTimeout(300);
  }
  const cityBack = page.getByRole("button", { name: /回市区/ });
  if (await cityBack.count()) await cityBack.last().click();
  await page.waitForTimeout(350);
  await closeActionOverlays();
  await page.getByRole("button", { name: /住宅区/ }).last().click();
  await page.waitForTimeout(400);
  await closeActionOverlays();
  await page.getByRole("button", { name: /政府免费住宿/ }).last().click();
  await page.waitForTimeout(400);
  await closeActionOverlays();
  stages.push({ name: "回到住处", ui: await readUi() });
  await page.locator(".action-card").filter({ hasText: /^.*睡觉/ }).first().click();
  await page.locator(".opts .opt.primary").click();
  await page.waitForTimeout(500);
  await closeActionOverlays();
  stages.push({ name: "新档首次睡眠", ui: await readUi() });
  await socializeAtParkBeforeNine();
  await waitUntilHour(9);
  await page.getByRole("button", { name: /出门 \/ 回住宅区/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /回市区/ }).last().click();
  await page.waitForTimeout(350);
  await closeActionOverlays();
  await page.getByRole("button", { name: /老城区/ }).last().click();
  await page.waitForTimeout(350);
  await closeActionOverlays();
  await page.getByRole("button", { name: /花鸟市场/ }).last().click();
  await page.waitForTimeout(500);
  stages.push({ name: "抵达花鸟市场", ui: await readUi() });
  await page.locator(".pet-shop-facility").click();
  await page.waitForTimeout(250);
  await page.locator(".action-card").filter({ hasText: "领养猫咪" }).click();
  await page.locator(".cat-list").waitFor({ state: "visible" });
  // 本轮刻意不领养，验证计划规定的“第七日无宠物宽限”分支。
  adoptedCat = false;
  await page.waitForTimeout(250);
  await page.locator(".overlay").last().locator(".close-btn").click();
  await page.waitForTimeout(250);
  await page.locator(".facility-back").click();
  await socializeIfAvailable();
  stages.push({ name: adoptedCat ? "领养猫咪并认识 NPC" : "宠物店条件与认识 NPC", ui: await readUi() });
  await saveScreenshot("07-pet-and-social.png");
  await page.getByRole("button", { name: /出门 \/ 回老城区/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /回市区/ }).last().click();
  await page.waitForTimeout(350);
  await closeActionOverlays();
  await page.getByRole("button", { name: /住宅区/ }).last().click();
  await page.waitForTimeout(350);
  await closeActionOverlays();
  await page.getByRole("button", { name: /政府免费住宿/ }).last().click();
  await page.waitForTimeout(400);
  await closeActionOverlays();
  if (!socialized) {
    await page.getByRole("button", { name: /出门 \/ 回住宅区/ }).click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: /街心公园/ }).last().click();
    await page.waitForTimeout(400);
    await closeActionOverlays();
    for (let attempt = 0; attempt < 8 && !socialized; attempt++) {
      await socializeIfAvailable();
      if (socialized) break;
      const waitButton = page.locator(".wait-bar").getByRole("button", { name: /等 30 分钟/ });
      if (!(await waitButton.count())) break;
      await waitButton.click();
      await page.waitForTimeout(300);
      await closeActionOverlays();
    }
    if (!socialized) throw new Error("新档流程中未能在劳务市场、花鸟市场或街心公园遇到可交流 NPC");
    await page.getByRole("button", { name: /出门 \/ 回住宅区/ }).click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: /政府免费住宿/ }).last().click();
    await page.waitForTimeout(350);
    await closeActionOverlays();
  }
  if (adoptedCat) {
    await page.locator(".group-card").filter({ hasText: "猫咪" }).first().click();
    await page.locator(".care-btn").filter({ hasText: "玩耍" }).click();
    await page.waitForTimeout(350);
    await page.locator(".panel-close").click();
  } else {
    for (let turn = 0; turn < 24; turn++) {
      await resumeWeeklyRecap();
      const body = await page.locator("body").innerText();
      const day = Number(body.match(/2026年8月(\d+)日/)?.[1] ?? 1);
      if (day >= 7) break;
      const satiety = Number(body.match(/饱腹\s*(\d+)/)?.[1] ?? 100);
      if (satiety < 48) {
        await page.locator(".action-card").filter({ hasText: "吃泡面" }).first().click();
        await page.waitForTimeout(250);
        await closeActionOverlays();
      }
      await page.locator(".action-card").filter({ hasText: /睡觉/ }).first().click();
      await page.locator(".opts .opt.primary").click();
      await page.waitForTimeout(350);
      await closeActionOverlays();
      await resumeWeeklyRecap();
    }
    const finalDay = Number((await page.locator("body").innerText()).match(/2026年8月(\d+)日/)?.[1] ?? 1);
    if (finalDay < 7) throw new Error(`无猫新手引导宽限未到第 7 天，当前 D${finalDay}`);
  }
  stages.push({ name: adoptedCat ? "照顾猫咪" : "无宠物路径到第七天", ui: await readUi() });
  await saveScreenshot("08-care-or-day7.png");
  await page.getByRole("button", { name: /目标/ }).click();
  await page.locator(".goals-page").waitFor({ state: "visible" });
  stages.push({ name: "完成九步教程并查看目标", ui: await readUi() });
  await saveScreenshot("09-tutorial-complete.png");
  await page.locator(".p-close").click();
  let tutorialBody = stages.at(-1)?.ui.body ?? "";
  if (!/进度\s*9\/9/.test(tutorialBody)) {
    throw new Error(`第七日新档仍未完成全部教程：${tutorialBody.match(/进度\s*\d+\/9/)?.[0] ?? "未找到进度"}`);
  }

  // 通过真实地点购买消耗品，再从背包使用；不直接写入游戏存档。
  await page.getByRole("button", { name: /出门 \/ 回住宅区/ }).click();
  await page.waitForTimeout(250);
  const backToCity = page.getByRole("button", { name: /回市区/ }).last();
  if (await backToCity.count()) {
    await backToCity.click();
    await page.waitForTimeout(350);
    await closeActionOverlays();
  }
  const residentialDistrict = page.getByRole("button", { name: /住宅区/ }).last();
  if (await residentialDistrict.count()) {
    await residentialDistrict.click();
    await page.waitForTimeout(350);
    await closeActionOverlays();
  }
  const convenienceStore = page.getByRole("button", { name: /便利店/ }).last();
  if (!(await convenienceStore.count())) {
    throw new Error(`新档验收找不到便利店入口：${JSON.stringify((await readUi()).buttons)}`);
  }
  await convenienceStore.click();
  await page.waitForTimeout(450);
  await closeActionOverlays();
  const buyDrink = page.locator(".action-card").filter({ hasText: "买饮料" });
  await buyDrink.first().click();
  await page.waitForTimeout(350);
  const packDrink = page.getByRole("button", { name: /打包带走/ });
  if (await packDrink.count()) await packDrink.click();
  await page.waitForTimeout(250);
  await closeActionOverlays();
  await page.getByRole("button", { name: "🎒", exact: true }).click();
  await page.locator(".bag").waitFor({ state: "visible" });
  const consumablesFilter = page.locator(".filter-button").filter({ hasText: "消耗品" });
  await consumablesFilter.click();
  const drinkEntry = page.locator(".bag-item").filter({ hasText: "饮料" });
  await drinkEntry.waitFor({ state: "visible" });
  await drinkEntry.getByRole("button", { name: "使用", exact: true }).click();
  await page.waitForTimeout(250);
  if (await drinkEntry.count()) throw new Error("使用饮料后背包数量未减少");
  stages.push({ name: "从背包分类并使用饮料", ui: await readUi() });
  await saveScreenshot("10-inventory-used.png");
  await page.locator(".bag-close").click();

  // 安装并各操作一款手机游戏，验证成品 App 中真实可玩的输入路径。
  await page.locator(".phone-btn").filter({ hasText: "📱" }).first().click();
  const phone = page.locator(".phone:not(.panel)");
  await phone.waitFor({ state: "visible" });
  await phone.getByRole("button", { name: /应用市场/ }).click();
  await phone.locator(".app-page").filter({ hasText: "应用市场" }).waitFor({ state: "visible" });
  for (const gameName of [/扫雷/, /2048/]) {
    const marketGame = phone.locator(".job-item").filter({ hasText: gameName });
    const download = marketGame.getByRole("button", { name: "下载", exact: true });
    if (await download.count()) await download.click();
  }
  await phone.getByRole("button", { name: /← 返回/ }).click();
  await phone.locator(".p-dock .dock-btn").filter({ hasText: "🎮" }).click();
  await phone.locator(".game-app-page").waitFor({ state: "visible" });
  await phone.getByRole("button", { name: /2048/ }).click();
  await phone.locator(".g2-board").waitFor({ state: "visible" });
  let boardBefore = await phone.locator(".g2-board").innerText();
  let moved2048 = false;
  for (let move = 0; move < 8 && !moved2048; move++) {
    await phone.locator(".g2-pad .g2-btn").nth(move % 4).click();
    await page.waitForTimeout(60);
    const boardAfter = await phone.locator(".g2-board").innerText();
    moved2048 = boardAfter !== boardBefore;
    boardBefore = boardAfter;
  }
  if (!moved2048) throw new Error("2048 四向操作后棋盘没有变化");
  await phone.getByRole("button", { name: /游戏列表/ }).click();
  await phone.getByRole("button", { name: /扫雷/ }).click();
  await phone.locator(".ms-board").waitFor({ state: "visible" });
  let revealedSafeCell = false;
  for (const cellIndex of [40, 4, 36, 44, 13, 67]) {
    await phone.locator(".ms-cell").nth(cellIndex).click();
    await page.waitForTimeout(60);
    if (!(await phone.locator(".ms-cell.mine").count())) {
      revealedSafeCell = true;
      break;
    }
    await phone.getByRole("button", { name: "重新开始", exact: true }).click();
  }
  if (!revealedSafeCell) throw new Error("扫雷新局连续未能揭开安全格");
  stages.push({ name: "操作 2048 与扫雷", ui: await readUi() });
  await saveScreenshot("11-phone-minigames.png");
  if (errors.length) throw new Error(`新档体验出现 JavaScript 异常：${errors.join("; ")}`);

  const result = { stages, errors, screenshotDir: outDir };
  writeFileSync(join(outDir, "probe.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({ stages: stages.map(({ name, ui }) => ({ name, time: ui.body.match(/2026年8月\d+日[^\n]*/)?.[0], has9of9: /进度\s*9\/9/.test(ui.body) })), errors }));
} catch (error) {
  const failure = { stages, currentUi: await readUi().catch(() => null), errors, error: String(error), screenshotDir: outDir };
  writeFileSync(join(outDir, "probe-failure.json"), JSON.stringify(failure, null, 2), "utf8");
  if (process.env.QA_SCREENSHOTS !== "0") await page.screenshot({ path: join(outDir, "probe-failure.png"), fullPage: false }).catch(() => {});
  console.error(JSON.stringify({
    stages: stages.map(({ name, ui }) => ({ name, time: ui.body.match(/2026年8月\d+日[^\n]*/)?.[0] })),
    currentTime: failure.currentUi?.body.match(/2026年8月\d+日[^\n]*/)?.[0],
    currentButtons: failure.currentUi?.buttons,
    errors,
    error: String(error),
    screenshotDir: outDir,
  }, null, 2));
  throw error;
} finally {
  await context.close();
  await browser.close();
}
