/** Derive native build metadata while preserving existing decimal version ordering. */
export function deriveVersionMetadata(version, buildRevision = 0) {
  if(!Number.isInteger(buildRevision)||buildRevision<0||buildRevision>9)throw new Error('Android 修订号必须为 0–9，超过后应升级公开版本号');
  const match = version.match(/^(\d+)\.(\d{1,6})(?:\.(\d+))?$/);
  if (!match) throw new Error(`非法版本号: ${version}`);
  const [, major, minor, patch = "0"] = match;
  // Explicit allocations preserve Android upgrade ordering across the 1.49 release lines.
  const allocatedCodes = { '1.49.2': 1_492_000, '1.49.5': 1_495_000, '1.49.7': 1_497_000, '1.49.8': 1_498_000 };
  const buildVersion = `${Number(major)}.${Number(minor)}.${Number(patch)}`;
  const future149Patch = Number(major) === 1 && Number(minor) === 49 && Number(patch) >= 9;
  if(buildRevision>0&&allocatedCodes[buildVersion]===undefined&&!future149Patch)throw new Error('该历史版本未预留 Android 修订号段');
  // 1.49.9 starts after both published 1.49.8 variants. Reserve ten codes
  // for Tap and stay below 1.50.0; reject overflow rather than silently reuse
  // another version's Android code.
  if (future149Patch && Number(patch) > 58) throw new Error(`1.49 版本号段已用尽，请分配新版本号段: ${version}`);
  const versionCode = allocatedCodes[buildVersion] ?? (future149Patch
    ? 1_499_000 + (Number(patch) - 9) * 20
    : Number(major) * 1_000_000 + Number(minor.padEnd(6, "0")) + Number(patch));
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || versionCode+buildRevision > 2_100_000_000) {
    throw new Error(`无法生成 Android versionCode: ${version}`);
  }
  return { buildVersion, versionCode: versionCode + buildRevision };
}

export function deriveTapVersionMetadata(version, buildRevision = 0) {
  const metadata=deriveVersionMetadata(version,buildRevision);
  const allocatedTapCodes = { '1.49.2': 1_492_010, '1.49.5': 1_495_010, '1.49.7': 1_497_010, '1.49.8': 1_498_010 };
  const future149Patch = /^1\.49\.(\d+)$/.exec(metadata.buildVersion);
  const futureTapCode = future149Patch && Number(future149Patch[1]) >= 9 ? metadata.versionCode + 10 : metadata.versionCode;
  return {buildVersion:`${metadata.buildVersion}-tap`,versionCode:allocatedTapCodes[metadata.buildVersion]!==undefined?allocatedTapCodes[metadata.buildVersion]+buildRevision:futureTapCode};
}
