param([string]$Compiler = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimePath = Join-Path $projectRoot 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $runtimePath)) { throw 'runtime/node.exe가 필요합니다.' }
if (-not (Test-Path -LiteralPath $Compiler)) { $Compiler = Join-Path $projectRoot 'data/build-tools/inno/ISCC.exe' }
if (-not (Test-Path -LiteralPath $Compiler)) { throw 'Inno Setup 컴파일러 경로를 지정해 주세요.' }
Push-Location $projectRoot
try {
  & $runtimePath --test
  if ($LASTEXITCODE -ne 0) { throw '테스트에 실패했습니다.' }
  & $Compiler (Join-Path $PSScriptRoot 'setup.iss')
  if ($LASTEXITCODE -ne 0) { throw '설치 파일 작성에 실패했습니다.' }
  $setupPath = Join-Path $projectRoot 'dist/ChunggwakMohae-Setup-2.0.0.exe'
  $sum = (Get-FileHash -Algorithm SHA256 -LiteralPath $setupPath).Hash.ToLowerInvariant()
  ($sum + '  ChunggwakMohae-Setup-2.0.0.exe') | Set-Content -LiteralPath (Join-Path $projectRoot 'dist/SHA256SUMS.txt') -Encoding ASCII
  Write-Output $setupPath
} finally { Pop-Location }
