/** 探针：page 内 import 的 store 模块与应用是否同一实例 */
import { pathToFileURL } from "node:url";
const pwMod = await import(process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core");
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } });
const page = await ctx.newPage();
await page.goto(process.env.QA_URL || "http://localhost:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
// 先进入游戏视图（Toast / 弹窗都挂在 GameView）
await page.locator("button").filter({ hasText: "开始新生活" }).first().click();
await page.waitForTimeout(500);
await page.locator("button").filter({ hasText: "下一步" }).first().click();
await page.waitForTimeout(500);
await page.locator("button").filter({ hasText: "开始生活" }).first().click();
await page.waitForTimeout(1200);
const r = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stores = await import("/src/stores/uiStore.svelte.ts");
  const before = stores.uiState.toast;
  stores.uiState.toast = "QA-INSTANCE-PROBE";
  await sleep(300);
  const bodyText = document.body.innerText;
  const toastShown = bodyText.includes("QA-INSTANCE-PROBE");
  // 再测 modal
  stores.uiState.toast = null;
  stores.uiState.modal = "settings";
  await sleep(300);
  const settingsShown = !!document.querySelector(".overlay .modal");
  stores.uiState.modal = null;
  // uiState 引用是否出现在 window.app 链上（粗查）：比较两份模块的 zoom 值与 UI 是否一致
  return { before, toastShown, settingsShown };
});
console.log(JSON.stringify(r));
await browser.close();
