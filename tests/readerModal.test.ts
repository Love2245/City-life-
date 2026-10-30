// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import ReaderModal from "../src/components/ReaderModal.svelte";
import { gameState } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";
import { getReadableDocument, readableDocumentChapterLinks } from "../src/game/data/readableDocuments";

describe("阅读器页码迁移", () => {
  it("旧进度迁移后直接关闭并重开仍保留新页码", () => {
    const id = "book_sports";
    const readableDocument = getReadableDocument(id)!;
    const savedKey = `reader_${id}_page`;
    const migrationKey = `reader_${id}_editorial_v1`;
    const previousSaved = gameState.flags[savedKey];
    const previousMigration = gameState.flags[migrationKey];
    const oldPage = 3;
    const migratedPage = oldPage + (readableDocument.bodyStartPage ?? 1) - 1;
    const expectedPage = migratedPage % 2 === 0 ? migratedPage - 1 : migratedPage;
    const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLDivElement }> = [];

    const openReader = () => {
      uiState.readerId = id;
      uiState.modal = "reader";
      const target = document.createElement("div");
      document.body.appendChild(target);
      const component = mount(ReaderModal, { target });
      mounted.push({ component, target });
      flushSync();
      return target;
    };

    try {
      gameState.flags[savedKey] = oldPage;
      delete gameState.flags[migrationKey];

      const firstTarget = openReader();
      expect(gameState.flags[savedKey]).toBe(expectedPage);
      expect(firstTarget.querySelector(".page-jump strong")?.textContent)
        .toContain(`第 ${expectedPage}–${expectedPage + 1}`);

      firstTarget.querySelector<HTMLButtonElement>(".close")!.click();
      flushSync();

      const secondTarget = openReader();
      expect(secondTarget.querySelector(".page-jump strong")?.textContent)
        .toContain(`第 ${expectedPage}–${expectedPage + 1}`);
    } finally {
      uiState.readerId = null;
      uiState.modal = null;
      for (const item of mounted.splice(0)) {
        unmount(item.component);
        item.target.remove();
      }
      if (previousSaved === undefined) delete gameState.flags[savedKey];
      else gameState.flags[savedKey] = previousSaved;
      if (previousMigration === undefined) delete gameState.flags[migrationKey];
      else gameState.flags[migrationKey] = previousMigration;
    }
  });

  it("便民指南目录和章节选择都能定位到真实正文页", () => {
    const id = "doc_city_guide";
    const guide = getReadableDocument(id)!;
    const targetPage = readableDocumentChapterLinks(guide).find((entry) => entry.title.startsWith("第六章"))!.page;
    const savedKey = `reader_${id}_page`;
    const migrationKey = `reader_${id}_editorial_v1`;
    const previousSaved = gameState.flags[savedKey];
    const previousMigration = gameState.flags[migrationKey];
    const target = document.createElement("div");
    document.body.appendChild(target);
    let component: ReturnType<typeof mount> | undefined;

    try {
      delete gameState.flags[savedKey];
      gameState.flags[migrationKey] = true;
      uiState.readerId = id;
      uiState.modal = "reader";
      component = mount(ReaderModal, { target });
      flushSync();

      const select = target.querySelector<HTMLSelectElement>('.chapter-jump select[aria-label="选择指南章节"]')!;
      select.value = String(targetPage);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      flushSync();
      const expectedPage = targetPage % 2 === 0 ? targetPage - 1 : targetPage;
      expect(gameState.flags[savedKey]).toBe(expectedPage);
      expect(target.querySelector(".page-jump strong")?.textContent).toContain(`第 ${expectedPage}`);
    } finally {
      if (component) unmount(component);
      uiState.readerId = null;
      uiState.modal = null;
      target.remove();
      if (previousSaved === undefined) delete gameState.flags[savedKey];
      else gameState.flags[savedKey] = previousSaved;
      if (previousMigration === undefined) delete gameState.flags[migrationKey];
      else gameState.flags[migrationKey] = previousMigration;
    }
  });
});
