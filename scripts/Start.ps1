param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$bundledRuntime = Join-Path $projectRoot 'runtime/node.exe'
$runtimeCommand = Get-Command node -ErrorAction SilentlyContinue
$runtimePath = if (Test-Path -LiteralPath $bundledRuntime) { $bundledRuntime } elseif ($runtimeCommand) { $runtimeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $runtimePath)) { throw 'Node.js 24 이상을 설치한 뒤 다시 실행해 주세요.' }
$taskDataPath = Join-Path $projectRoot 'data'
New-Item -ItemType Directory -Force -Path $taskDataPath | Out-Null
$launchPath = Join-Path $taskDataPath 'local-launch.json'
$healthAddress = 'http://127.0.0.1:4318/api/health'
$alreadyRunning = $false
try { $status = Invoke-RestMethod -Uri $healthAddress -TimeoutSec 2; $alreadyRunning = $status.service -in @('충곽 뭐해','충곽피티') } catch { }
if (-not $alreadyRunning) {
  $entryPoint = Join-Path $projectRoot 'src/server.mjs'
  $serverProcess = Start-Process -FilePath $runtimePath -ArgumentList ('"' + $entryPoint + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskDataPath 'server.log') -RedirectStandardError (Join-Path $taskDataPath 'server-error.log')
  $serverProcess.Id | Set-Content -LiteralPath (Join-Path $taskDataPath 'server.pid')
  for ($attempt = 0; $attempt -lt 40; $attempt++) { Start-Sleep -Milliseconds 250; try { $status = Invoke-RestMethod -Uri $healthAddress -TimeoutSec 2; if ($status.service -in @('충곽 뭐해','충곽피티')) { $alreadyRunning = $true; break } } catch { } }
}
if (-not $alreadyRunning) { throw '서버를 시작하지 못했습니다. data/server-error.log를 확인해 주세요.' }
if (-not $NoBrowser) { if (Test-Path -LiteralPath $launchPath) { $launch = Get-Content -Raw -LiteralPath $launchPath | ConvertFrom-Json; Start-Process -FilePath $launch.url } else { Start-Process -FilePath 'http://127.0.0.1:4318' } }
Write-Output '충곽 뭐해가 백그라운드에서 실행 중입니다. http://127.0.0.1:4318'
