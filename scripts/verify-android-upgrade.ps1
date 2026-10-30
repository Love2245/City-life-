param(
  [Parameter(Mandatory = $true)][string]$Apk,
  [string]$BuildTools = $env:ANDROID_BUILD_TOOLS,
  [string]$ExpectedPackage = "com.urbanlife.game",
  [int]$MinimumVersionCode = 1475001,
  [string]$ExpectedCertSha256 = "8ceeda14c656d4687640388b1023bbbb65948b302897bb9703d60ac4ee1ba7a6"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Apk -PathType Leaf)) { throw "APK not found: $Apk" }
if ([string]::IsNullOrWhiteSpace($BuildTools)) { throw "Set ANDROID_BUILD_TOOLS or pass -BuildTools." }
$aapt = Join-Path $BuildTools "aapt.exe"
$apksigner = Join-Path $BuildTools "apksigner.bat"
$sdkRoot = Split-Path (Split-Path $BuildTools -Parent) -Parent
$apkanalyzer = Join-Path $sdkRoot "cmdline-tools\latest\bin\apkanalyzer.bat"
if ((-not (Test-Path -LiteralPath $aapt) -and -not (Test-Path -LiteralPath $apkanalyzer)) -or -not (Test-Path -LiteralPath $apksigner)) {
  throw "Android build tools not found."
}

if (Test-Path -LiteralPath $apkanalyzer) {
  $packageOutput = & $apkanalyzer manifest application-id $Apk
  if ($LASTEXITCODE -ne 0) { throw "Cannot read Android package name." }
  $actualPackage = ([string]($packageOutput | Select-Object -First 1)).Trim()
  $versionCodeOutput = & $apkanalyzer manifest version-code $Apk
  $versionCodeExitCode = $LASTEXITCODE
  $versionCodeText = ([string]($versionCodeOutput | Select-Object -First 1)).Trim()
  if ($versionCodeExitCode -ne 0 -or $versionCodeText -notmatch "^[0-9]+$") { throw "Cannot read Android versionCode." }
  $versionCode = [int]$versionCodeText
} else {
  $badging = & $aapt dump badging $Apk
  if ($LASTEXITCODE -ne 0) { throw "Cannot read Android package metadata." }
  $packageLine = $badging | Where-Object { $_ -match "^package:" } | Select-Object -First 1
  if ($packageLine -notmatch "name='([^']+)' versionCode='([0-9]+)'") { throw "Cannot parse package name/versionCode." }
  $actualPackage = $Matches[1]
  $versionCode = [int]$Matches[2]
}
if ($actualPackage -ne $ExpectedPackage -or $versionCode -lt $MinimumVersionCode) {
  throw "Wrong package name or versionCode for an upgrade."
}

$verification = & $apksigner verify --verbose --print-certs $Apk
if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed." }
$certificateLine = $verification | Where-Object { $_ -match "Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)" } | Select-Object -First 1
$certificateMatch = [regex]::Match([string]$certificateLine, "Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)")
if (-not $certificateMatch.Success) {
  throw "Cannot determine APK signing certificate."
}
$actualCert = $certificateMatch.Groups[1].Value.ToLowerInvariant()
if ($actualCert -ne $ExpectedCertSha256.ToLowerInvariant()) {
  throw "APK certificate differs from the previous release certificate. Existing installs cannot update in place."
}
if (-not ($verification | Where-Object { $_ -match "Verified using v2 scheme.*true" })) {
  throw "APK v2 signature is missing."
}
Write-Output "Upgrade-compatible APK verified: package=$actualPackage versionCode=$versionCode certificate=$actualCert"
