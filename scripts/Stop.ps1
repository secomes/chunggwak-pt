$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidPath = Join-Path $projectRoot 'data/server.pid'
if (-not (Test-Path -LiteralPath $pidPath)) { Write-Output '이 실행기로 시작한 프로세스가 없습니다.'; exit }
$savedProcessId = [int](Get-Content -LiteralPath $pidPath)
$candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$savedProcessId" -ErrorAction SilentlyContinue
$expectedEntry = Join-Path $projectRoot 'src/server.mjs'
if ($candidate -and $candidate.Name -eq 'node.exe' -and $candidate.CommandLine.Contains($expectedEntry)) { Stop-Process -Id $savedProcessId; Remove-Item -LiteralPath $pidPath; Write-Output '충곽 뭐해 서버를 종료했습니다. 데이터는 보관됩니다.' } else { Write-Output '저장된 프로세스가 충곽 뭐해 실행과 일치하지 않아 종료하지 않았습니다.' }
