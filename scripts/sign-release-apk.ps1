param(
  [Parameter(Mandatory = $true)]
  [string]$UnsignedApk,

  [Parameter(Mandatory = $true)]
  [string]$OutputApk,

  [string]$BuildTools = $env:ANDROID_BUILD_TOOLS,
  [string]$Keystore = $env:ANDROID_KEYSTORE,
  [string]$KeyAlias = $env:ANDROID_KEY_ALIAS,
  [string]$KeystorePassword = $env:ANDROID_KEYSTORE_PASSWORD,
  [string]$KeyPassword = $env:ANDROID_KEY_PASSWORD,
  [string]$ExpectedCertSha256 = "8ceeda14c656d4687640388b1023bbbb65948b302897bb9703d60ac4ee1ba7a6"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-File([string]$Path, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label does not exist: $Path"
  }
}

function Require-Value([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Label is required. Pass it as a parameter or environment variable."
  }
}

Require-File $UnsignedApk "Unsigned APK"
Require-File $Keystore "Android signing keystore"
Require-Value $BuildTools "Android Build Tools directory (ANDROID_BUILD_TOOLS)"
Require-Value $KeyAlias "Signing alias (ANDROID_KEY_ALIAS)"
Require-Value $KeystorePassword "Keystore password (ANDROID_KEYSTORE_PASSWORD)"
Require-Value $KeyPassword "Alias password (ANDROID_KEY_PASSWORD)"

$zipalign = Join-Path $BuildTools "zipalign.exe"
$apksigner = Join-Path $BuildTools "apksigner.bat"
Require-File $zipalign "zipalign tool"
Require-File $apksigner "apksigner tool"

$outputDirectory = Split-Path -Parent $OutputApk
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$previousKeystorePassword = [Environment]::GetEnvironmentVariable("URBANLIFE_APK_KEYSTORE_PASSWORD", "Process")
$previousKeyPassword = [Environment]::GetEnvironmentVariable("URBANLIFE_APK_KEY_PASSWORD", "Process")
[Environment]::SetEnvironmentVariable("URBANLIFE_APK_KEYSTORE_PASSWORD", $KeystorePassword, "Process")
[Environment]::SetEnvironmentVariable("URBANLIFE_APK_KEY_PASSWORD", $KeyPassword, "Process")

$temporaryAligned = Join-Path ([System.IO.Path]::GetTempPath()) ("urban-life-aligned-{0}.apk" -f $PID)
try {
  & $zipalign -f -P 16 4 $UnsignedApk $temporaryAligned
  if ($LASTEXITCODE -ne 0) {
    throw "zipalign failed with exit code $LASTEXITCODE"
  }

  & $apksigner sign `
    --ks $Keystore `
    --ks-type PKCS12 `
    --ks-key-alias $KeyAlias `
    --ks-pass "env:URBANLIFE_APK_KEYSTORE_PASSWORD" `
    --key-pass "env:URBANLIFE_APK_KEY_PASSWORD" `
    --v1-signing-enabled true `
    --v2-signing-enabled true `
    --v3-signing-enabled true `
    --v4-signing-enabled true `
    --out $OutputApk `
    $temporaryAligned
  if ($LASTEXITCODE -ne 0) {
    throw "apksigner sign failed with exit code $LASTEXITCODE"
  }

  & $zipalign -c -P 16 4 $OutputApk
  if ($LASTEXITCODE -ne 0) {
    throw "APK does not pass 16 KB page-size alignment verification."
  }

  $verification = & $apksigner verify --verbose --print-certs --v4-signature-file "$OutputApk.idsig" $OutputApk
  if ($LASTEXITCODE -ne 0) {
    throw "apksigner verify failed; the output APK did not pass signature verification."
  }
  $certificateLine = $verification | Where-Object { $_ -match "Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)" } | Select-Object -First 1
  $certificateMatch = [regex]::Match([string]$certificateLine, "Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)")
  if (-not $certificateMatch.Success) {
    throw "Cannot determine APK signing certificate."
  }
  if ($certificateMatch.Groups[1].Value.ToLowerInvariant() -ne $ExpectedCertSha256.ToLowerInvariant()) {
    throw "APK certificate differs from the previous release signing key; this package cannot update existing Android installs."
  }
  $verification | Write-Output

  Write-Output "Signed APK generated and verified: $OutputApk"
} finally {
  if (Test-Path -LiteralPath $temporaryAligned -PathType Leaf) {
    Remove-Item -LiteralPath $temporaryAligned -Force
  }
  [Environment]::SetEnvironmentVariable("URBANLIFE_APK_KEYSTORE_PASSWORD", $previousKeystorePassword, "Process")
  [Environment]::SetEnvironmentVariable("URBANLIFE_APK_KEY_PASSWORD", $previousKeyPassword, "Process")
}
