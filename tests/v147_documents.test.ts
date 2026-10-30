import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { performAction } from "../src/game/core/actions";
import { afterTempleVolunteer } from "../src/game/core/religion";
import { migrateSave } from "../src/game/core/migrate";
import { getReadableDocument, loadReadableDocument, READABLE_DOCUMENTS, readableDocumentChapterLinks } from "../src/game/data/readableDocuments";
import { BOOKS } from "../src/game/data/books";
import { getScriptureVolume } from "../src/game/data/scripture";
import { recipeList } from "../src/game/core/cooking";

describe("v1.47 阅读与收藏", () => {
  it("图书馆书有固定正文；打开行动结算一次，翻页进度只记录位置", () => {
    const state = createInitialState(147);
    state.locationId = "library";
    state.time.hour = 10;
    const before = state.player.stats.fitness;
    expect(performAction(state, "book_sports").ok).toBe(true);
    expect(state.player.stats.fitness).toBeGreaterThan(before);
    expect(state.flags.book_book_sports_count).toBe(1);
    state.flags.reader_book_sports_page = 3;
    const loaded = migrateSave(state);
    expect(loaded.flags.reader_book_sports_page).toBe(3);
    expect(loaded.flags.book_book_sports_count).toBe(1);
    expect(getReadableDocument("book_sports")?.pages.length).toBeGreaterThan(5);
  });

  it("单页画像与奖状只有一面，寺庙首次义工只赠一次", () => {
    for (const id of ["doc_guanyin", "doc_cat_award", "doc_employee_award"]) {
      expect(getReadableDocument(id)?.pages).toHaveLength(1);
    }
    const state = createInitialState(148);
    afterTempleVolunteer(state);
    afterTempleVolunteer(state);
    expect(state.inventory.doc_guanyin).toBe(1);
  });

  it("旧存档已经获得初级赛冠军或完成义工时补发收藏", async () => {
    const state = createInitialState(149);
    state.flags.temple_volunteered = 1;
    state.catFlags.tournament_tournament_primary = true;
    const migrated = migrateSave(state);
    expect(migrated.inventory.doc_guanyin).toBe(1);
    expect(migrated.inventory.doc_cat_award).toBe(1);
    expect(migrateSave(migrated).inventory.doc_guanyin).toBe(1);
    await Promise.all(["bible_old_testament", "bible_new_testament"].map(loadReadableDocument));
    expect(READABLE_DOCUMENTS.every((document) => document.pages.length > 0)).toBe(true);
  });

  it("便民指南逐章换页，旧档只补发一次", () => {
    const guide = getReadableDocument("doc_city_guide");
    expect(guide?.pages[0]).toMatch(/^前言/);
    expect(guide?.pages[1]).toMatch(/^目录/);
    expect(guide?.bodyStartPage).toBeGreaterThan(1);
    const bodyPages = guide!.pages.slice(guide!.bodyStartPage! - 1, -2);
    const chapterHeadings = bodyPages
      .map((page) => page.match(/^(第[一二三四五六七八九十]+章)/)?.[1])
      .filter((heading): heading is string => Boolean(heading));
    expect(new Set(chapterHeadings).size).toBe(16);
    expect(chapterHeadings.length).toBeGreaterThan(16);
    expect(guide?.pages.at(-1)).toMatch(/^末页　喵喵对决宣传页/);
    const guideText = guide!.pages.join("\n");
    for (const instruction of ["办理工业通行证", "手机主屏的“招聘”应用", "累计上满 5 堂", "宠物用品店", "花鸟市场", "环湖公园", "奶奶的短信固定在“奶奶”会话里", "手动槽位"]) {
      expect(guideText).toContain(instruction);
    }
    const links = readableDocumentChapterLinks(guide!);
    expect(links).toHaveLength(17);
    expect(links.find((link) => link.title.startsWith("第一章"))?.page).toBe(guide!.bodyStartPage);
    expect(guide!.pages[1]).toContain(`${guide!.bodyStartPage}　第一章　开局先做这三步`);
    for (const link of links) {
      expect(guide!.pages[link.page - 1].split("\n", 1)[0].replace(/（续）$/, "")).toBe(link.title);
    }

    const state = createInitialState(14702);
    expect(state.inventory.doc_city_guide).toBe(1);
    const migrated = migrateSave(state);
    expect(migrateSave(migrated).inventory.doc_city_guide).toBe(1);
  });

  it("馆藏按主题分页、烹饪附录完整，圣经上下册均为完整独立文书", async () => {
    for (const book of BOOKS) {
      const count = (await loadReadableDocument(book.id))?.pages.length ?? 0;
      expect(count).toBe(book.id === "book_cooking" ? 18 + recipeList().length : 17);
    }
    const cookbook = (await loadReadableDocument('book_cooking'))!.pages.join('\n');
    for (const recipe of recipeList()) expect(cookbook).toContain(recipe.name);
    for (const id of ["bible_old_testament", "bible_new_testament"] as const) {
      const document = (await loadReadableDocument(id))!;
      const scripture = getScriptureVolume(id);
      const scriptureStart = document.bodyStartPage! - 1;
      expect(document.pages.slice(scriptureStart, scriptureStart + scripture.pages.length))
        .toEqual(scripture.pages.map((page) => page.text));
      expect(document.pages.length).toBe(scriptureStart + scripture.pages.length + 1);
      expect(document.pages[0]).toMatch(/^编者说明/);
      expect(document.pages.at(-1)).toMatch(/^编者后记/);
    }
  });

  it("改写正文不改变九本馆藏原有耗时与结算奖励", () => {
    const expected: Record<string, { duration: number; effects: Record<string, unknown>; attrBook?: boolean }> = {
      book_sports: { duration: 3, attrBook: true, effects: { fitness: 4, stamina: -8, stress: -3 } },
      book_health: { duration: 3, attrBook: true, effects: { health: 4, stamina: -6 } },
      book_cooking: { duration: 2, effects: { skills: { cooking: 1 }, satiety: 5, stamina: -8 } },
      book_philosophy: { duration: 3, attrBook: true, effects: { intelligence: 4, stress: -4, stamina: -8 } },
      book_charm: { duration: 3, attrBook: true, effects: { charm: 4, mood: 3, stamina: -8 } },
      book_programming: { duration: 2, effects: { skills: { programming: 1 }, intelligence: 1, stamina: -10 } },
      book_design: { duration: 2, effects: { skills: { design: 1 }, charm: 1, stamina: -8 } },
      book_operation: { duration: 2, effects: { skills: { operation: 1 }, intelligence: 1, stamina: -8 } },
      book_stall_tips: { duration: 2, effects: { stamina: -6 } },
    };
    expect(BOOKS).toHaveLength(9);
    for (const book of BOOKS) {
      const baseline = expected[book.id];
      expect(baseline, `缺少 ${book.id} 的原始结算基线`).toBeDefined();
      expect(book.duration).toBe(baseline.duration);
      expect(book.attrBook ?? false).toBe(baseline.attrBook ?? false);
      for (const [key, value] of Object.entries(baseline.effects)) {
        expect(book.effects[key as keyof typeof book.effects]).toEqual(value);
      }
    }
  });
});
