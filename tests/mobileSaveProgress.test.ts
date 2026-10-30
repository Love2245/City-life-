// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { migrateSave } from '../src/game/core/migrate';
import { startNextProgrammingProject, workOnProject, normalizePersonalDevelopment } from '../src/game/core/projects';
import { loadGame, saveGameImmediately } from '../src/lib/save';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';

beforeEach(() => localStorage.clear());

describe('退出游戏后的编程进度', () => {
  for (const id of ['indie_game', 'mobile_app', 'home_design']) {
    it(`${id}首次开发到50%后保存、清空运行态、重新加载可继续推进`, async () => {
      const state = createInitialState(14956);
      state.flags.item_laptop = true;
      state.player.skills.programming = 5;
      state.player.skills.design = 5;
      normalizePersonalDevelopment(state);
      const halfway = id === 'home_design' ? 10 : 50;
      state.career.projects[id] = halfway;
      replaceState(state);
      saveGameImmediately('slot_1', gameState);
      replaceState(createInitialState(14957));
      expect(gameState.career.projects[id]).toBeUndefined();
      const loaded = await loadGame('slot_1');
      expect(loaded).not.toBeNull();
      replaceState(loaded!);
      expect(gameState.career.projects[id]).toBe(halfway);
      expect(workOnProject(gameState, id).ok).toBe(true);
      expect(gameState.career.projects[id]).toBeGreaterThan(halfway);
    });
  }

  it('36版设计50/100点保存后载入为10/20点，重新保存和迁移不会再次缩小', async () => {
    const state = createInitialState(14961);
    state.version = 36;
    state.career.projects.home_design = 50;
    const cash = state.player.money;
    // 模拟旧版已经写入的存档；当前版写入口按设计拒绝写回历史版本。
    localStorage.setItem('urban_life_save_slot_1', JSON.stringify(state));
    const loaded = await loadGame('slot_1');
    expect(loaded!.career.projects.home_design).toBe(10);
    expect(loaded!.player.money).toBe(cash);
    expect(loaded!.developmentHistory!.total).toBe(0);
    expect(migrateSave(loaded).career.projects.home_design).toBe(10);
    saveGameImmediately('slot_1', loaded!);
    expect((await loadGame('slot_1'))!.career.projects.home_design).toBe(10);
  });

  for (const id of ['indie_game', 'mobile_app']) {
    for (const progress of [0, 50, 99]) it(`${id}续作${progress}%不被旧的完成标记覆盖`, async () => {
      const state = createInitialState(14958);
      state.career.projects[id] = 100;
      state.career.passiveIncome = 180;
      state.flags.programming_royalty_persistent_v1 = true;
      expect(startNextProgrammingProject(state, id).ok).toBe(true);
      state.career.projects[id] = progress;
      saveGameImmediately('auto', state);
      replaceState(createInitialState(14959));
      const loaded = await loadGame('auto');
      expect(loaded!.career.projects[id]).toBe(progress);
      expect(loaded!.career.passiveIncome).toBe(180);
      expect(migrateSave(loaded).career.projects[id]).toBe(progress);
    });
    it(`${id}兼容没有续作标记的中途旧档，同时保留早期完成记录`, () => {
      const state = createInitialState(14960);
      state.flags[`project_completed_${id}`] = true;
      state.career.projects[id] = 50;
      expect(migrateSave(state).career.projects[id]).toBe(50);
      state.career.projects[id] = 0;
      expect(migrateSave(state).career.projects[id]).toBe(100);
    });
  }
});
