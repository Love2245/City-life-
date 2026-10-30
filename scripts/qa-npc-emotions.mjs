import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : 'playwright');
const out = path.resolve('docs/npc-portraits-20261012/browser');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const results = [];
const errors = [];
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['portrait', { width: 393, height: 852 }],
    ['landscape', { width: 852, height: 393 }],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    await page.goto(process.env.QA_URL || 'http://127.0.0.1:14949/');
    await page.getByRole('button', { name: '使用推荐模式并继续' }).click();
    await page.getByRole('button', { name: '开始体验', exact: true }).click();
    await page.getByRole('button', { name: '开始新生活', exact: false }).click();
    await page.getByRole('button', { name: '下一步：确认 →', exact: true }).click();
    await page.getByRole('button', { name: '🌆 开始生活', exact: true }).click();

    // 独立测试场景只调整日期地点；从真实场景的“搭话认识”按钮开始，不预置会话节点。
    const ids = await page.evaluate(async () => {
      const { allNpcs } = await import('/src/game/core/npcs.ts');
      return allNpcs().map(npc => npc.id);
    });
    for (const npcId of ids) {
      const npcRow = await page.evaluate(async id => {
        const { createInitialState } = await import('/src/game/core/state.ts');
        const { replaceState } = await import('/src/stores/gameStore.svelte.ts');
        const { presentNpcs } = await import('/src/game/core/npcTalk.ts');
        const { npcPresenceAt, getNpcDef } = await import('/src/game/core/npcs.ts');
        const { weekdayOf } = await import('/src/game/core/calendar.ts');
        const { uiState, closeNpcTalk } = await import('/src/stores/uiStore.svelte.ts');
        closeNpcTalk();
        uiState.modal = null;
        const state = createInitialState(149);
        for (let day = 1; day <= 31; day += 1) {
          for (let hour = 0; hour < 24; hour += 1) {
            Object.assign(state.time, { year: 2026, month: 8, day, hour, minute: 0 });
            const presence = npcPresenceAt(id, { ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time) });
            if (!presence || presence.locationId !== getNpcDef(id).meetLocation) continue;
            state.locationId = presence.locationId;
            if (presence.regionId) state.region = presence.regionId;
            replaceState(state);
            const present = presentNpcs(state);
            return { index: present.findIndex(npc => npc.id === id), name: present.find(npc => npc.id === id)?.displayName };
          }
        }
        throw new Error(`No presence for ${id}`);
      }, npcId);
      assert.ok(npcRow.name && npcRow.index >= 0, npcId);
      await page.locator('.npc-row').nth(npcRow.index)
        .getByRole('button', { name: '搭话认识', exact: true }).click();
      await page.locator('.npc-portrait-image').waitFor();
      await page.waitForFunction(() => {
        const image = document.querySelector('.npc-portrait-image');
        return image?.complete && image.naturalWidth > 0;
      });
      const read = async () => page.locator('.npc-portrait-image').evaluate(image => ({
        src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight,
        variant: image.closest('.npc-portrait-slot').dataset.portraitVariant,
        mask: image.closest('.npc-portrait-slot').dataset.portraitMask,
        text: document.querySelector('.dialogue-box p')?.textContent,
      }));
      const before = await read();
      assert.equal(before.mask, 'mosaic');
      results.push({ viewport: name, npcId, phase: 'meet', ...before });
      if (npcId === 'npc_lin_xiaoyu') {
        for (let attempt = 0; attempt < 12 && !(await page.locator('.choice-btn').count()); attempt += 1) {
          await page.locator('.dialogue-box').click();
        }
        assert.ok((await page.locator('.choice-btn').allTextContents()).some(text => text.includes('鞋为什么这么大')),
          JSON.stringify({ viewport: name, choices: await page.locator('.choice-btn').allTextContents(), text: await page.locator('.dialogue-box').innerText() }));
        await page.locator('.choice-btn', { hasText: '鞋为什么这么大' }).click();
        assert.equal((await read()).src, before.src);
        for (let attempt = 0; attempt < 12 && !(await page.locator('.dialogue-box p').innerText()).includes('你这问题问得及时'); attempt += 1) {
          await page.locator('.dialogue-box').click();
        }
        await page.waitForFunction(() => {
          const image = document.querySelector('.npc-portrait-image');
          return image?.complete && image.naturalWidth > 0 && image.src.includes('emotion_happy');
        });
        const after = await read();
        assert.equal(after.variant, 'emotion_happy');
        assert.notEqual(after.src, before.src);
        results.push({ viewport: name, npcId, phase: 'reply', ...after });
        await page.evaluate(async () => {
          const { dismissToast } = await import('/src/stores/uiStore.svelte.ts');
          dismissToast();
        });
        await page.screenshot({ path: path.join(out, `${name}-happy-concealed.png`) });
        await page.locator('.dialogue-box').click();
        assert.equal((await read()).variant, 'emotion_happy');
        results.push({ viewport: name, npcId, phase: 'narration-retains-emotion', ...(await read()) });
        // 截图回到当前回应，随后检查清晰图。通过真实再开初见入口，不改写对白。
        await page.keyboard.press('Escape');
        await page.locator('.npc-overlay').waitFor({ state: 'detached' });
        await page.locator('.npc-row').nth(npcRow.index).getByRole('button', { name: '搭话认识', exact: true }).click();
        for (let attempt = 0; attempt < 12 && !(await page.locator('.choice-btn').count()); attempt += 1) {
          await page.locator('.dialogue-box').click();
        }
        await page.locator('.choice-btn', { hasText: '鞋为什么这么大' }).click();
        for (let attempt = 0; attempt < 12 && !(await page.locator('.dialogue-box p').innerText()).includes('你这问题问得及时'); attempt += 1) {
          await page.locator('.dialogue-box').click();
        }
        // 只验证已有解锁存档的清晰资源路径，不声称完成三天相识流程。
        await page.evaluate(async () => {
          const { gameState } = await import('/src/stores/gameStore.svelte.ts');
          gameState.flags.npc_portrait_revealed_npc_lin_xiaoyu = true;
        });
        await page.waitForFunction(() => {
          const image = document.querySelector('.npc-portrait-image');
          return image?.complete && image.naturalWidth > 0 && image.src.includes('unmasked-clean/npc_lin_xiaoyu/emotion_happy');
        });
        results.push({ viewport: name, npcId, phase: 'unlocked-fixture', ...(await read()) });
        await page.screenshot({ path: path.join(out, `${name}-happy-clear.png`) });
      }
      await page.keyboard.press('Escape');
      await page.locator('.npc-overlay').waitFor({ state: 'detached' });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ renderedPortraits: results.length, viewports: 3, errors }));
} finally {
  await browser.close();
}
