import { describe, expect, it } from "vitest";
import { BOOKS } from "../src/game/data/books";
import { LIBRARY_BOOK_PAGES } from "../src/game/data/libraryBookPages";
import { READABLE_DOCUMENTS, getReadableDocument, loadReadableDocument, migrateReadableDocumentProgress } from "../src/game/data/readableDocuments";
import { RECIPES } from "../src/game/core/cooking";
import { getItem } from "../src/game/core/items";
import { getScripturePages } from "../src/game/data/scripture";

describe("书籍阅读文档", () => {
  it("所有书籍都有封面、前言、目录和后记", async () => {
    await Promise.all(["bible_old_testament", "bible_new_testament"].map(loadReadableDocument));
    const books = READABLE_DOCUMENTS.filter((document) => document.kind === "book");
    expect(books.length).toBeGreaterThan(0);
    for (const book of books) {
      expect(book.cover, `${book.title} 缺少封面`).toBeTruthy();
      expect(book.pages[0], `${book.title} 缺少前言`).toMatch(/^(?:前言|编者说明|版本与整理说明)/);
      expect(book.pages.some((page) => /^(?:目录|目录（续）)/.test(page)), `${book.title} 缺少目录`).toBe(true);
      expect(book.pages.some((page) => /^(?:后记|编者后记|整理后记)/.test(page)), `${book.title} 缺少后记`).toBe(true);
    }
  });

  it("便民指南宣传页仍是末页，书籍进度记录保留正文位置", () => {
    const guide = getReadableDocument("doc_city_guide")!;
    expect(guide.pages[guide.pages.length - 1]).toContain("末页　喵喵对决宣传页");
    expect(guide.bodyStartPage).toBeGreaterThan(1);
  });

  it("便民指南使用商品卡查询动态价格和效果，保留办理与购买入口", () => {
    const guide = getReadableDocument("doc_city_guide")!;
    const text = guide.pages.join("\n");
    expect(text).toContain("第八章　临时住宿");
    expect(text).toContain("第九章　购买饮料并在背包使用");
    expect(text).toContain("商品的价格与实际效果以物品卡为准");
    expect(text).not.toContain("伯月新区快捷酒店：城市地图");
    expect(text).not.toContain("泊月夜市快捷酒店：城市地图");
    expect(text).not.toMatch(/普通饮料售价\s*5 元|饱腹 \+4|体力 \+10|体力 \+20|心情 \+3/);
    expect(text).not.toMatch(/普通猫粮\s*10 元|优质猫粮\s*30 元|豪华猫粮\s*80 元|鱼竿\s*80 元|鱼桶\s*25 元|鱼饵\s*20 元/);
    for (const entry of ["办理工业通行证", "花鸟市场", "宠物用品店", "食品", "野营基地", "湖边垂钓"]) {
      expect(text).toContain(entry);
    }
    expect(text).toContain("连续三个游戏日每天上 1 堂可结业");
    expect(text).toContain("累计上满 5 堂同样结业");
  });

  it("九本原创馆藏各有七个完整主题，并按续页保存原有物理页数", () => {
    expect(Object.keys(LIBRARY_BOOK_PAGES).sort()).toEqual(BOOKS.map((book) => book.id).sort());
    for (const book of BOOKS) {
      const pages = LIBRARY_BOOK_PAGES[book.id];
      expect(pages, `${book.name} 应保留十四个主题页`).toHaveLength(14);
      for (let page = 0; page < pages.length; page += 2) {
        const heading = pages[page].split("\n", 1)[0];
        expect(heading, `${book.name} 第 ${page / 2 + 1} 个主题缺少标题`).toMatch(/^第(?:[一二三四五六七八九十]+|\d+)章｜/);
        expect(pages[page + 1].split("\n", 1)[0]).toBe(`${heading}（续）`);
        const body = `${pages[page]}\n${pages[page + 1]}`.replace(/^第[^\n]+\n/gm, "");
        const hanCount = Array.from(body).filter((char) => /\p{Script=Han}/u.test(char)).length;
        expect(hanCount, `${book.name} ${heading} 正文过短`).toBeGreaterThanOrEqual(300);
        expect(hanCount, `${book.name} ${heading} 正文超过建议长度`).toBeLessThanOrEqual(600);
      }
      const document = getReadableDocument(book.id)!;
      expect(document.pages.filter((text) => /^第(?:[一二三四五六七八九十]+|\d+)章｜/.test(text)).length).toBe(14);
    }
  });

  it("烹饪书保留全部配方并提示按食材安全要求处理", () => {
    const book = getReadableDocument("book_cooking")!;
    expect(RECIPES).toHaveLength(25);
    for (const recipe of RECIPES) {
      expect(book.pages.some((page) => page.includes(`家常食谱`) && page.includes(recipe.name))).toBe(true);
    }
    expect(book.pages.some((page) => page.includes("食品温度计"))).toBe(true);
    expect(book.pages.some((page) => page.includes("当地食品安全指南"))).toBe(true);
  });

  it("旧烹饪书的菜谱位置映射六页且只迁移一次", () => {
    const flags: Record<string, boolean | number> = { reader_book_cooking_page: 11 };
    expect(migrateReadableDocumentProgress(flags, "book_cooking", 11)).toBe(17);
    expect(flags.reader_book_cooking_page).toBe(17);
    expect(migrateReadableDocumentProgress(flags, "book_cooking", 17)).toBe(17);
    expect(flags.reader_book_cooking_page).toBe(17);
    expect(migrateReadableDocumentProgress(flags, "book_sports", 12)).toBe(12);
  });

  it("经文及随附注释保持原文件内容，导读说明编辑边界", async () => {
    for (const id of ["bible_old_testament", "bible_new_testament"] as const) {
      const document = (await loadReadableDocument(id))!;
      const sourcePages = getScripturePages(id);
      expect(document.pages[document.bodyStartPage! - 1]).toBe(sourcePages[0]);
      expect(document.pages[0]).toContain("经文和原有注释均保持文件中的次序与文字");
      expect(document.pages[0]).toContain("所用纸本版本及出版资料");
    }
  });

  it("结缘院三部经书可读、注明底本并按正文与原件附录分页", () => {
    const amita = getReadableDocument("doc_sutra_amita")!;
    const diamond = getReadableDocument("doc_sutra_diamond")!;
    const heart = getReadableDocument("doc_sutra_heart")!;

    for (const [id, document] of [
      ["doc_sutra_amita", amita],
      ["doc_sutra_diamond", diamond],
      ["doc_sutra_heart", heart],
    ] as const) {
      expect(getItem(id), `${id} 的背包物品缺失`).toBeTruthy();
      expect(document.cover, `${id} 缺少封面`).toBeTruthy();
      expect(document.pages[0]).toMatch(/^版本与整理说明/);
      expect(document.pages[0]).toContain("CBETA");
      expect(document.pages[0]).toContain("non-commercial use");
      expect(document.pages[1]).toMatch(/^目录/);
      expect(document.pages.every((page) => page.length < 520), `${id} 有未分页的长页`).toBe(true);
      expect(document.pages.join("\n")).not.toContain("缺字符号");
    }

    expect(amita.pages.join("\n")).toContain("阿㝹楼驮");
    expect(amita.pages.join("\n")).toContain("车磲");
    expect(amita.pages.some((page) => page.includes("非T12n0366正文"))).toBe(true);
    expect(diamond.pages.some((page) => page.includes("非T08n0235正文"))).toBe(true);
    expect(heart.pages.some((page) => page.includes("大明太祖高皇帝御制序"))).toBe(true);
    expect(heart.pages.some((page) => page.includes("唐释慧忠撰"))).toBe(true);
    expect(heart.pages.join("\n")).not.toContain("非T08n0251正文");
  });

  it("结缘院新增画印可查看，旧存档晨读抄本 ID 继续可读", () => {
    for (const id of [
      "doc_temple_deer_king_art",
      "doc_temple_guide_bodhisattva_art",
      "doc_temple_maha_vairocana_art",
    ]) {
      expect(getItem(id)).toBeTruthy();
      expect(getReadableDocument(id)?.image).toBeTruthy();
    }
    expect(getItem("doc_temple_sutra_booklet")).toBeTruthy();
    expect(getReadableDocument("doc_temple_sutra_booklet")?.pages[0]).toContain("仅为旧存档保留");
  });
});
