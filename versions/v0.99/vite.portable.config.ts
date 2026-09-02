import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * 便携版构建配置：产出单个自包含 HTML 文件（双击即玩，零依赖）。
 * 用法：pnpm build:portable  →  dist-portable/index.html
 */
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: {
    target: "es2021",
    outDir: "dist-portable",
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    // 单文件必须内联所有动态导入
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
