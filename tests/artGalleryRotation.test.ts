import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ART_GALLERY_SHOWS, EXHIBITIONS, getDistrictExhibition } from "../src/game/data/districtExhibitions";
import { gameDay, fromLinearDay, START_EPOCH } from "../src/game/core/calendar";

describe("art gallery seven-day rotation", () => {
  it("keeps the original twenty works as A and ten new local cat paintings as B", () => {
    expect(ART_GALLERY_SHOWS[0]).toBe(EXHIBITIONS.dev_art_gallery);
    expect(ART_GALLERY_SHOWS.map(s => s.exhibits.length)).toEqual([20, 10]);
    const all = ART_GALLERY_SHOWS.flatMap(s => s.exhibits);
    expect(new Set(all.map(e => e.id)).size).toBe(30);
    for (const [index, entry] of ART_GALLERY_SHOWS[1].exhibits.entries()) {
      expect(entry.rank).toBe(index + 1);
      expect(entry.caption.length).toBeGreaterThan(20);
      const name = entry.image!.split("/").at(-1)!.split("?")[0];
      expect(existsSync(resolve("src/assets/exhibitions/abstract-cats-1498", name))).toBe(true);
    }
  });
  it.each([[0,"A",7],[6,"A",1],[7,"B",7],[13,"B",1],[14,"A",7],[21,"B",7],[30,"A",5],[153,"B",1],[154,"A",7]] as const)("day %i uses show %s and rotates in %i days across month/year boundaries", (day,label,left) => {
    const time = fromLinearDay(START_EPOCH + day);
    const show = getDistrictExhibition("dev_art_gallery", time.month, gameDay(time))!;
    expect(show.rotation).toMatchObject({ label, daysUntilChange: left });
    const reloaded = JSON.parse(JSON.stringify(time));
    expect(getDistrictExhibition("dev_art_gallery", reloaded.month, gameDay(reloaded))!.id).toBe(show.id);
  });
  it("does not rotate other museums or reset by calendar month, and sanitizes invalid days", () => {
    expect(getDistrictExhibition("dev_museum", 1, 7)!.id).toBe(EXHIBITIONS.dev_museum.id);
    expect(getDistrictExhibition("dev_museum", 1, 7)!.rotation).toBeUndefined();
    for (const day of [NaN, Infinity, -7]) expect(getDistrictExhibition("dev_art_gallery", 1, day)!.rotation!.label).toBe("A");
    expect(getDistrictExhibition("dev_art_gallery", 2, 35)!.rotation!.label).toBe("B");
  });
});
