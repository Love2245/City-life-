import { defineConfig } from "vitest/config";
import base from "./vite.config";

export default defineConfig({
  ...base,
  cacheDir: "C:/Users/Administrator/AppData/Local/Temp/vitest-cache",
});
