/**
 * 小游戏前景精灵 manifest。
 *
 * 精灵是增强层：任何资源缺失、file:// 环境无法解码或构建未包含资源时，
 * SpriteIcon 会自动回退到调用方提供的 emoji/CSS 图形，不影响判定和结算。
 */
const spriteModules = import.meta.glob("/src/assets/ui/v1.42/minigame-sprites/**/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const allModules = spriteModules;

const ALIASES: Record<string, string> = {
  "bowling-ball": "bowling-ball",
  "bowling_pin": "bowling-pin",
  "heart_balloon": "heart-balloon",
  "food_tray": "food-tray",
};

function keyFor(game: string, item: string): string[] {
  const normalizedGame = game.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const normalizedItem = (ALIASES[item] ?? item).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return [
    `/src/assets/ui/v1.42/minigame-sprites/${normalizedGame}/${normalizedItem}.webp`,
    `/src/assets/ui/v1.42/minigame-sprites/generated/${normalizedItem}.webp`,
    `/src/assets/ui/v1.42/minigame-sprites/${normalizedItem}.webp`,
  ];
}

/** 返回游戏/物件对应的静态 URL；找不到时返回 undefined。 */
export function spriteUrl(game: string | undefined, item: string | undefined): string | undefined {
  if (!game || !item) return undefined;
  for (const key of keyFor(game, item)) {
    const url = allModules[key];
    if (url) return url;
  }
  return undefined;
}

/** 用于审计和构建探针的 manifest 快照。 */
export function listSpriteUrls(): Record<string, string> {
  return { ...allModules };
}
