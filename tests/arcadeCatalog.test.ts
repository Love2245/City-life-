import { describe, expect, it } from "vitest";
import { uniqueMiniGameEntries } from "../src/lib/arcadeCatalog";
import { configuredMiniGameKeys, getMiniGameConfig } from "../src/game/core/minigame";

describe("小游戏合集目录", () => {
  it("去除相同配置时保留第一个 canonical 入口", () => {
    const config = { title: "咖啡师出杯", type: "restaurant" };
    expect(uniqueMiniGameEntries([
      { key: "cafe_a", cfg: config },
      { key: "cafe_b", cfg: { ...config } },
      { key: "cafe_c", cfg: { ...config, title: "西餐上菜" } },
    ]).map(({ key }) => key)).toEqual(["cafe_a", "cafe_c"]);
  });

  it("当前工作与行动配置里确实有重复项，目录会保留不同玩法配置", () => {
    const source = configuredMiniGameKeys()
      .map((key) => ({ key, cfg: getMiniGameConfig(key) }))
      .filter((entry): entry is { key: string; cfg: NonNullable<ReturnType<typeof getMiniGameConfig>> } => Boolean(entry.cfg));
    const catalog = uniqueMiniGameEntries(source);
    expect(catalog.length).toBeLessThan(source.length);
    expect(new Set(catalog.map(({ cfg }) => JSON.stringify(cfg))).size).toBe(catalog.length);
    expect(catalog[0].key).toBe(source[0].key);
  });
});
