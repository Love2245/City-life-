#!/usr/bin/env node
/**
 * 从 src/version.ts 的 VERSION 派生构建脚本使用的版本号。
 * 启动脚本按都市生活_v*.html 查找便携版，因此升版时不会再绑定旧文件名；
 * APK 默认参数、Node/Tauri 元数据仍由本脚本统一刷新。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveVersionMetadata, deriveTapVersionMetadata } from "./version-metadata.js";

export function syncVersion(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
  const write = (relative, content) => fs.writeFileSync(path.join(root, relative), content, "utf8");

  const versionSource = read("src/version.ts");
  const match = versionSource.match(/export const VERSION\s*=\s*["']([^"']+)["']/);
  if (!match) throw new Error("src/version.ts 中找不到 VERSION");
  const version = match[1];
  const buildRevision=Number(versionSource.match(/export const ANDROID_BUILD_REVISION\s*=\s*(\d+)/)?.[1]??0);
  const { buildVersion, versionCode } = deriveVersionMetadata(version,buildRevision);
  const tap=deriveTapVersionMetadata(version,buildRevision);

  const packageJson = JSON.parse(read("package.json"));
  packageJson.version = buildVersion;
  write("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);

  // pnpm-lock.yaml does not store the root package version.

  const tauriPath = "src-tauri/tauri.conf.json";
  const tauriConfig = JSON.parse(read(tauriPath));
  tauriConfig.version = buildVersion;
  tauriConfig.bundle ??= {};
  tauriConfig.bundle.android ??= {};
  tauriConfig.bundle.android.versionCode = versionCode;
  write(tauriPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

  const tapConfigPath = "src-tauri/tauri.tap.conf.json";
  if (fs.existsSync(path.join(root, tapConfigPath))) {
    const tapConfig = JSON.parse(read(tapConfigPath));
    tapConfig.version = tap.buildVersion;
    tapConfig.bundle ??= {};
    tapConfig.bundle.android ??= {};
    tapConfig.bundle.android.versionCode = tap.versionCode;
    write(tapConfigPath, `${JSON.stringify(tapConfig, null, 2)}\n`);
  }

  const cargoPath = "src-tauri/Cargo.toml";
  write(cargoPath, read(cargoPath).replace(/^(version\s*=\s*")[^"]+(")/m, `$1${buildVersion}$2`));

  const cargoLockPath = path.join(root, "src-tauri/Cargo.lock");
  if (fs.existsSync(cargoLockPath)) {
    write("src-tauri/Cargo.lock", read("src-tauri/Cargo.lock").replace(
      /(\[\[package\]\]\s*\nname = "urban-life"\s*\nversion = ")[^"]+(")/,
      `$1${buildVersion}$2`,
    ));
  }

  const androidPropertiesPath = "src-tauri/gen/android/app/tauri.properties";
  if (fs.existsSync(path.join(root, androidPropertiesPath))) {
    write(androidPropertiesPath, read(androidPropertiesPath)
      .replace(/^(tauri\.android\.versionName=).+$/m, `$1${tap.buildVersion}`)
      .replace(/^(tauri\.android\.versionCode=).+$/m, `$1${tap.versionCode}`));
  }

  const androidConfigPath = "src-tauri/gen/android/app/src/main/assets/tauri.conf.json";
  if (fs.existsSync(path.join(root, androidConfigPath))) {
    const androidConfig = JSON.parse(read(androidConfigPath));
    androidConfig.version = tap.buildVersion;
    androidConfig.bundle ??= {};
    androidConfig.bundle.android ??= {};
    androidConfig.bundle.android.versionCode = tap.versionCode;
    write(androidConfigPath, `${JSON.stringify(androidConfig, null, 2)}\n`);
  }

  console.log(`同步版本 ${version}（构建版本 ${buildVersion}，Android versionCode ${versionCode}）`);
  return { version, buildVersion, versionCode };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) syncVersion();

