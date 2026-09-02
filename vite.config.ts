import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri 开发时固定端口，避免随机端口导致 Rust 侧配置失效
const host = process.env.TAURI_DEV_HOST;

// 测试环境下 vitest2 + vite6 的 preprocessCSS 存在兼容崩溃；本项目所有
// .svelte 仅用纯 CSS（无 scss/less），关闭预处理可安全绕开该问题。
const isTest = "VITEST" in process.env;

export default defineConfig({
  plugins: [svelte(isTest ? { preprocess: [] } : {})],
  // 测试环境需要 browser 条件才能从 "svelte" 解析到客户端（含 mount）入口
  resolve: isTest ? { conditions: ["browser"] } : {},
  // 开发/测试缓存写入工作区本地目录（node_modules 可能为外部联接，避免写穿到只读目录）
  cacheDir: ".vite-cache",
  // Vite 选项参考 Tauri 2 官方模板
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 忽略 src-tauri，避免 Rust 文件改动触发前端重载
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
