import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// 专用测试配置：将缓存目录指向 C: 盘（避开 F: 盘 .vite-cache 的写入权限限制）。
const isTest = true;

export default defineConfig({
  plugins: [svelte(isTest ? { preprocess: [] } : {})],
  resolve: isTest ? { conditions: ["browser"] } : {},
  // 指向 C: 工作区缓存，彻底避开 F: 盘任意 .vite 目录被其他 vite 进程占用的 EPERM 问题。
  cacheDir: "node_modules/.vitetest-cache",
  clearScreen: false,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
