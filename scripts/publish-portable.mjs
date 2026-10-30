import fs from "node:fs";
import path from "node:path";

// Keep the build directory disposable while publishing one self-contained
// artifact next to the launcher.  This is the file users can double-click
// without Node.js, npm, or a local development server.
const rootDir = path.resolve(process.cwd());
const outDir = path.resolve(process.env.PORTABLE_OUT_DIR ?? "dist-portable");
const sourcePath = path.join(outDir, "index.html");

// 发布文件名只使用 src/version.ts 中的玩家版本号，避免产物名与游戏版本脱节。
const versionSource = fs.readFileSync(path.join(rootDir, "src/version.ts"), "utf8");
const versionMatch = /export const VERSION = "([^"]+)"/.exec(versionSource);
if (!versionMatch) {
  throw new Error("无法从 src/version.ts 解析 VERSION 常量");
}
const version = versionMatch[1];
const releasePaths = [
  path.join(rootDir, `${version}.html`),
];

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Portable build output not found: ${sourcePath}`);
}

for (const releasePath of releasePaths) {
  fs.copyFileSync(sourcePath, releasePath);
}
const sizeMiB = fs.statSync(releasePaths[0]).size / 1024 / 1024;
console.log(`Portable release HTML published: ${releasePaths.join(" and ")} (${sizeMiB.toFixed(1)} MiB)`);
