export const ARCHIVE_ONLY_SAVE_FAILURE = "游戏进度已保存，永久图鉴保存失败，请重试";

export function saveFailureCopy(error: string): { label: string; headline: string } {
  const archiveOnly = error.startsWith("游戏进度已保存，永久图鉴保存失败")
    || error.includes("永久图鉴保存失败，请返回游戏后重试");
  return archiveOnly
    ? { label: "图鉴待保存 · 查看原因", headline: "当前生活已保存，永久图鉴待重试" }
    : { label: "保存失败 · 查看原因", headline: "最新进度尚未保存到本机" };
}
