import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * 便携版构建配置：产出单个自包含 HTML 文件（双击即玩，零依赖）。
 * 用法：pnpm build:portable  →  dist-portable/index.html
 */
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  // 外置图片走相对路径，保证 file:// 双击可加载
  base: "./",
  build: {
    target: "es2021",
    outDir: "dist-portable",
    // 仅内联 JS/CSS（让 file:// 双击可运行）；图片资源保持为外部文件（<img> 不受模块 CORS 限制），
    // 避免把数百 MB 图片拼进单个超长字符串导致 V8 内存上限崩溃。
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 100000000,
    // 单文件必须内联所有动态导入
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
