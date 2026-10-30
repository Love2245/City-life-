$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot '.cache/desktop-runtime'
$statusPath = Join-Path $runtimeDir 'status.json'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:LOCALAPPDATA 'hermes/node/node.exe' }
Add-Type -AssemblyName PresentationFramework
try {
    if (!(Test-Path -LiteralPath $nodeExe)) { throw '未找到 Node.js，请检查本机开发环境。' }
    $scriptFile = Join-Path $PSScriptRoot 'start-game.mjs'
    # No launcher window. The game window is the only window the player should see;
    # this process stays hidden and only speaks up when startup actually fails.
    $runner = Start-Process -FilePath $nodeExe -ArgumentList @(('"' + $scriptFile + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddMinutes(20)
    while (-not $runner.HasExited -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 600
        $runner.Refresh()
        # status.json is UTF-8 without BOM. Windows PowerShell 5.1 decodes it as ANSI by
        # default, and the garbled multibyte message can swallow a quote and break JSON
        # parsing. Read as UTF-8 and tolerate a half-written file during a status update.
        $status = $null
        if (Test-Path -LiteralPath $statusPath) {
            try { $status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $status = $null }
        }
        if ($status -and $status.pid -eq $runner.Id -and $status.phase -eq 'error') {
            [System.Windows.MessageBox]::Show(($status.message + "`n`n日志：" + (Join-Path $runtimeDir 'startup.log')), '都市生活启动失败') | Out-Null
            exit 1
        }
        if ($status -and $status.pid -eq $runner.Id -and $status.phase -eq 'closed') { exit 0 }
    }
    if (-not $runner.HasExited) { exit 0 }
    if ($runner.ExitCode -ne 0) {
        [System.Windows.MessageBox]::Show(('启动失败，请查看：' + (Join-Path $runtimeDir 'startup.log')), '都市生活启动失败') | Out-Null
        exit 1
    }
} catch { [System.Windows.MessageBox]::Show($_.Exception.Message, '都市生活启动失败') | Out-Null; exit 1 }
