import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSION, CHANGELOG, ANDROID_BUILD_REVISION } from "../src/version";
import packageMetadata from "../package.json";
import tauriConfig from "../src-tauri/tauri.conf.json";
import tapConfig from "../src-tauri/tauri.tap.conf.json";
import { deriveVersionMetadata, deriveTapVersionMetadata } from "../scripts/version-metadata.js";

describe("1.49 构建版本一致性", () => {
  it("网页、桌面、Android 与 TapTap 元数据保持同步", () => {
    const { buildVersion, versionCode } = deriveVersionMetadata(VERSION,ANDROID_BUILD_REVISION);
    const tap=deriveTapVersionMetadata(VERSION,ANDROID_BUILD_REVISION);
    expect(VERSION).toBe('1.49.8');expect(versionCode).toBe(1498002);expect(tap.versionCode).toBe(1498012);
    expect(buildVersion).toBe(VERSION);
    expect(packageMetadata.version).toBe(buildVersion);
    expect(tauriConfig.version).toBe(buildVersion);
    expect(tauriConfig.bundle.android.versionCode).toBe(versionCode);
    expect(tapConfig.version).toBe(`${buildVersion}-tap`);
    expect(tapConfig.bundle.android.versionCode).toBe(tap.versionCode);

    const cargoSource = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
    expect(cargoSource.split(/\r?\n/)).toContain(`version = "${buildVersion}"`);
    const cargoLockSource = readFileSync(new URL("../src-tauri/Cargo.lock", import.meta.url), "utf8");
    const appPackage = cargoLockSource.match(/\[\[package\]\]\r?\nname = "urban-life"\r?\nversion = "([^"]+)"/);
    expect(appPackage?.[1]).toBe(buildVersion);

    const androidProperties = readFileSync(new URL("../src-tauri/gen/android/app/tauri.properties", import.meta.url), "utf8");
    expect(androidProperties).toContain(`tauri.android.versionName=${buildVersion}-tap`);
    expect(androidProperties).toContain(`tauri.android.versionCode=${tap.versionCode}`);
    const androidConfig = JSON.parse(readFileSync(new URL("../src-tauri/gen/android/app/src/main/assets/tauri.conf.json", import.meta.url), "utf8"));
    expect(androidConfig.version).toBe(`${buildVersion}-tap`);
    expect(androidConfig.bundle.android.versionCode).toBe(tap.versionCode);
    expect(CHANGELOG[0].version).toBe(VERSION);
    expect(new Set(CHANGELOG.map(entry => entry.version)).size).toBe(CHANGELOG.length);
  });
});
