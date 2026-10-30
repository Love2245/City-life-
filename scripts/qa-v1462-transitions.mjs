import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const pwPath = process.env.QA_PW;
const playwright = await import(pwPath ? pathToFileURL(pwPath).href : "playwright-core");
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error("无法解析 Playwright Chromium");

const root = resolve(process.cwd());
const outputDir = join(root, "qa-shots", "v1462-transitions");
mkdirSync(outputDir, { recursive: true });
const save = readFileSync(join(root, "qa-fixtures", "base.json"), "utf8");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {}),
});
const errors = [];
let pageNavigations = 0;

async function createGamePage(reducedMotion = "no-preference", fixture = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 240)));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) pageNavigations += 1;
  });
  const fixtureSave = { ...JSON.parse(save), ...fixture };
  await page.addInitScript((payload) => {
    localStorage.clear();
    localStorage.setItem("urban_life_save_auto", JSON.stringify(payload));
    localStorage.setItem("urban-life-ui-gamemode", "pc");
    localStorage.setItem("urban-life-ui-zoom", "1");
  }, fixtureSave);
  await page.goto(process.env.QA_URL ?? "http://localhost:5199/", { waitUntil: "networkidle", timeout: 60000 });
  const start = page.locator("button").filter({ hasText: /继续生活|继续游戏/ }).first();
  await start.waitFor({ state: "visible", timeout: 10000 });
  await start.click();
  await page.locator(".scene").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(450);
  return { context, page };
}

async function startSceneCapture(page) {
  await page.evaluate(() => {
    const capture = { active: true, frames: [], events: [] };
    window.__sceneTransitionCapture = capture;
    for (const name of ["introstart", "introend", "outrostart", "outroend"]) {
      document.addEventListener(name, (event) => capture.events.push({ name, time: Math.round(performance.now()), target: event.target?.className ?? "" }), true);
    }
    const sample = () => {
      if (!capture.active) return;
      const elements = [...document.querySelectorAll(".scene-body")];
      capture.frames.push({
        time: Math.round(performance.now()),
        count: elements.length,
        opacity: elements.map((element) => Number.parseFloat(getComputedStyle(element).opacity)),
        rects: elements.map((element) => {
          const box = element.getBoundingClientRect();
          return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10) / 10);
        }),
        animations: elements.map((element) => element.getAnimations()
          .map((animation) => animation.effect?.getComputedTiming().duration)
          .filter((duration) => typeof duration === "number")),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function stopSceneCapture(page) {
  return page.evaluate(() => {
    const capture = window.__sceneTransitionCapture;
    if (!capture) return [];
    capture.active = false;
    return { frames: capture.frames, events: capture.events };
  });
}

async function startPhoneCapture(page) {
  await page.evaluate(() => {
    const capture = { active: true, frames: [] };
    window.__phoneTransitionCapture = capture;
    const sample = () => {
      if (!capture.active) return;
      const elements = [...document.querySelectorAll(".overlay > .phone .p-content")];
      capture.frames.push({
        time: Math.round(performance.now()),
        count: elements.length,
        opacity: elements.map((element) => Number.parseFloat(getComputedStyle(element).opacity)),
        rects: elements.map((element) => {
          const box = element.getBoundingClientRect();
          return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10) / 10);
        }),
        animations: elements.map((element) => element.getAnimations()
          .map((animation) => animation.effect?.getComputedTiming().duration)
          .filter((duration) => typeof duration === "number")),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function stopPhoneCapture(page) {
  return page.evaluate(() => {
    const capture = window.__phoneTransitionCapture;
    if (!capture) return [];
    capture.active = false;
    return capture.frames;
  });
}

async function clickFirstMapPin(page) {
  const mapPin = page.locator(".map-pin:not(:disabled)").first();
  await mapPin.waitFor({ state: "visible", timeout: 10000 });
  const label = (await mapPin.innerText()).trim();
  await mapPin.click({ timeout: 6000 });
  await page.waitForTimeout(50);
  const state = await page.evaluate(() => {
    try {
      const save = JSON.parse(localStorage.getItem("urban_life_save_auto") ?? "{}");
      return { locationId: save.locationId ?? null, region: save.region ?? null, navStack: save.navStack ?? null };
    } catch { return null; }
  });
  return { label, state, sceneClass: await page.locator(".scene-body").last().getAttribute("class") };
}

function summarizeFrames(frames) {
  const overlap = frames.filter((frame) => frame.count >= 2 && frame.opacity.some((value) => value > 0.05) && frame.opacity.some((value) => value < 0.95));
  const blank = frames.filter((frame) => frame.count === 0 || frame.opacity.every((value) => value <= 0.05));
  const misaligned = overlap.filter((frame) => {
    if (frame.rects.length < 2) return false;
    return frame.rects[0].some((value, axis) => Math.abs(frame.rects[1][axis] - value) > 1);
  });
  return {
    overlapFrameCount: overlap.length,
    blankFrameCount: blank.length,
    misalignedOverlapFrameCount: misaligned.length,
    overlapRectDelta: overlap.map((frame) => frame.rects.length >= 2
      ? frame.rects[0].map((value, axis) => Math.round((frame.rects[1][axis] - value) * 10) / 10)
      : null).filter(Boolean),
    maxDurationMs: Math.max(0, ...frames.flatMap((frame) => frame.animations.flat())),
  };
}

const report = {
  url: process.env.QA_URL ?? "http://localhost:5199/",
  viewport: [1280, 900],
  errors,
  transitions: {},
};
let normalContext;
let reducedContext;
let repeatedContext;
try {
  const l1Fixture = { locationId: "map", region: null, area: null, navStack: ["map"] };
  const normal = await createGamePage("no-preference", l1Fixture);
  normalContext = normal.context;
  const { page } = normal;
  const initialNavigations = pageNavigations;
  report.transitions.normal = {
    preference: await page.evaluate(() => ({
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      sceneLevelBefore: document.querySelector(".scene-body")?.className ?? null,
      saveStateBefore: (() => { const state = JSON.parse(localStorage.getItem("urban_life_save_auto") ?? "{}"); return { locationId: state.locationId, region: state.region, navStack: state.navStack }; })(),
      setting: localStorage.getItem("urban-life-scene-transition"),
      sceneSettingL2: localStorage.getItem("urban-life-scene-transition-l2"),
    })),
  };
  const before = await page.locator(".scene").boundingBox();
  await startSceneCapture(page);
  const firstBreadcrumb = await clickFirstMapPin(page);
  await page.waitForTimeout(70);
  await page.screenshot({ path: join(outputDir, "l1-crossfade.png") });
  await page.waitForTimeout(420);
  const l1Capture = await stopSceneCapture(page);
  const l1Frames = l1Capture.frames;

  const l2Target = page.locator(".map-pin:not(:disabled)").first();
  await l2Target.waitFor({ state: "visible", timeout: 10000 });
  await startSceneCapture(page);
  await l2Target.click({ timeout: 6000 });
  await page.waitForTimeout(100);
  const l2Capture = await stopSceneCapture(page);
  const l2Frames = l2Capture.frames;
  const l2State = await page.evaluate(() => {
    try {
      const state = JSON.parse(localStorage.getItem("urban_life_save_auto") ?? "{}");
      return { locationId: state.locationId ?? null, region: state.region ?? null, navStack: state.navStack ?? null };
    } catch { return null; }
  });

  await page.waitForTimeout(360);
  await page.locator(".phone-btn").first().click();
  await page.locator(".overlay > .phone .phone-screen").waitFor({ state: "visible", timeout: 6000 });
  await page.waitForTimeout(360);
  const phoneBefore = await page.locator(".overlay > .phone .phone-screen").boundingBox();
  const phoneInitialNavigations = pageNavigations;
  await startPhoneCapture(page);
  await page.locator(".overlay > .phone .p-content .app").filter({ hasText: "目标" }).first().click();
  await page.waitForTimeout(80);
  await page.screenshot({ path: join(outputDir, "phone-goals-crossfade.png") });
  await page.waitForTimeout(260);
  const phoneFrames = await stopPhoneCapture(page);
  await page.waitForTimeout(20);
  const phoneAfter = await page.locator(".overlay > .phone .phone-screen").boundingBox();
  report.transitions.phoneApp = {
    ...summarizeFrames(phoneFrames),
    frames: phoneFrames,
    phoneScreenBefore: phoneBefore ? [phoneBefore.x, phoneBefore.y, phoneBefore.width, phoneBefore.height] : null,
    phoneScreenAfter: phoneAfter ? [phoneAfter.x, phoneAfter.y, phoneAfter.width, phoneAfter.height] : null,
    goalPageVisible: await page.locator(".overlay > .phone .page-title").filter({ hasText: "目标清单" }).count() === 1,
    settledContentCount: await page.locator(".overlay > .phone .phone-screen .p-content").count(),
    pageNavigations: pageNavigations - phoneInitialNavigations,
  };

  await page.waitForTimeout(30);
  const navigationsBeforeRepeat = pageNavigations;
  const repeatedPage = await createGamePage("no-preference", l1Fixture);
  repeatedContext = repeatedPage.context;
  await startSceneCapture(repeatedPage.page);
  const repeatedBreadcrumb = await clickFirstMapPin(repeatedPage.page);
  await repeatedPage.page.waitForTimeout(420);
  const repeatedL1Capture = await stopSceneCapture(repeatedPage.page);
  const repeatedL1Frames = repeatedL1Capture.frames;
  const l1CountAfterSettled = await repeatedPage.page.locator(".scene-body").count();
  const repeatedNavigationsAfterLoad = pageNavigations;
  const after = await page.locator(".scene").boundingBox();
  report.transitions.normal = {
    ...report.transitions.normal,
      selections: [firstBreadcrumb, repeatedBreadcrumb],
    l1: {
      ...summarizeFrames(l1Frames),
      frames: l1Frames,
      before: before ? [before.x, before.y, before.width, before.height] : null,
      after: after ? [after.x, after.y, after.width, after.height] : null,
      tokenValues: await page.evaluate(() => ({
        fast: getComputedStyle(document.documentElement).getPropertyValue("--dur-fast").trim(),
        base: getComputedStyle(document.documentElement).getPropertyValue("--dur-base").trim(),
        scene: getComputedStyle(document.documentElement).getPropertyValue("--dur-scene").trim(),
        easing: getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim(),
      })),
      transitionEvents: l1Capture.events,
    },
    l2: { ...summarizeFrames(l2Frames), frames: l2Frames, stateAfter: l2State, transitionEvents: l2Capture.events },
    repeatedL1: { ...summarizeFrames(repeatedL1Frames), frames: repeatedL1Frames, transitionEvents: repeatedL1Capture.events, settledSceneBodyCount: l1CountAfterSettled },
    pageNavigations: pageNavigations - initialNavigations - (repeatedNavigationsAfterLoad - navigationsBeforeRepeat),
  };

  const reduced = await createGamePage("reduce", l1Fixture);
  reducedContext = reduced.context;
  const reducePage = reduced.page;
  const reducedInitialNavigations = pageNavigations;
  await reducePage.emulateMedia({ reducedMotion: "reduce" });
  await startSceneCapture(reducePage);
  await clickFirstMapPin(reducePage);
  await reducePage.waitForTimeout(80);
  const reducedCapture = await stopSceneCapture(reducePage);
  const reducedFrames = reducedCapture.frames;
  report.transitions.reducedMotion = {
    ...summarizeFrames(reducedFrames),
    frames: reducedFrames,
    transitionEvents: reducedCapture.events,
    pageNavigations: pageNavigations - reducedInitialNavigations,
    preference: await reducePage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
  };

  const reducedPhoneNavigations = pageNavigations;
  await reducePage.locator(".phone-btn").first().click();
  await reducePage.locator(".overlay > .phone .phone-screen").waitFor({ state: "visible", timeout: 6000 });
  await reducePage.waitForTimeout(360);
  await startPhoneCapture(reducePage);
  await reducePage.locator(".overlay > .phone .p-content .app").filter({ hasText: "目标" }).first().click();
  await reducePage.waitForTimeout(80);
  const reducedPhoneFrames = await stopPhoneCapture(reducePage);
  report.transitions.phoneReducedMotion = {
    ...summarizeFrames(reducedPhoneFrames),
    frames: reducedPhoneFrames,
    preference: await reducePage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    pageNavigations: pageNavigations - reducedPhoneNavigations,
  };
} finally {
  report.errors = errors;
  writeFileSync(join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await reducedContext?.close();
  await repeatedContext?.close();
  await normalContext?.close();
  await browser.close();
}

const normalL1 = report.transitions.normal?.l1;
const normalL2 = report.transitions.normal?.l2;
const repeatedL1 = report.transitions.normal?.repeatedL1;
const reduced = report.transitions.reducedMotion;
const phoneApp = report.transitions.phoneApp;
const phoneReduced = report.transitions.phoneReducedMotion;
console.log(JSON.stringify({
  normal: {
    l1: normalL1 && Object.fromEntries(Object.entries(normalL1).filter(([key]) => key !== "frames")),
    l2: normalL2 && Object.fromEntries(Object.entries(normalL2).filter(([key]) => key !== "frames")),
    repeatedL1: repeatedL1 && Object.fromEntries(Object.entries(repeatedL1).filter(([key]) => key !== "frames")),
    phoneApp: phoneApp && Object.fromEntries(Object.entries(phoneApp).filter(([key]) => key !== "frames")),
    pageNavigations: report.transitions.normal?.pageNavigations,
  },
  reducedMotion: {
    scene: reduced && Object.fromEntries(Object.entries(reduced).filter(([key]) => key !== "frames")),
    phone: phoneReduced && Object.fromEntries(Object.entries(phoneReduced).filter(([key]) => key !== "frames")),
  },
  errors: report.errors,
  outputDir,
}, null, 2));

if (
  !normalL1?.overlapFrameCount || normalL1?.blankFrameCount || normalL1?.misalignedOverlapFrameCount ||
  !repeatedL1?.overlapFrameCount || repeatedL1?.blankFrameCount || repeatedL1?.misalignedOverlapFrameCount ||
  (normalL2?.maxDurationMs ?? 0) > 1 || repeatedL1?.settledSceneBodyCount !== 1 ||
  (reduced?.maxDurationMs ?? 0) > 1 || !reduced?.preference ||
  !phoneApp?.overlapFrameCount || phoneApp?.blankFrameCount || phoneApp?.misalignedOverlapFrameCount ||
  (phoneApp?.maxDurationMs ?? 0) > 240 || phoneApp?.settledContentCount !== 1 || !phoneApp?.goalPageVisible || phoneApp?.pageNavigations !== 0 ||
  !phoneApp?.phoneScreenBefore || !phoneApp?.phoneScreenAfter || phoneApp.phoneScreenBefore.some((value, index) => Math.abs(phoneApp.phoneScreenAfter[index] - value) > 1) ||
  (phoneReduced?.maxDurationMs ?? 0) > 1 || !phoneReduced?.preference || phoneReduced?.pageNavigations !== 0 ||
  (report.transitions.normal?.pageNavigations ?? 0) !== 0 ||
  (reduced?.pageNavigations ?? 0) !== 0 || errors.length
) process.exitCode = 1;
