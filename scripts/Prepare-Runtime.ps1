$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot 'runtime'
$cacheDir = Join-Path $projectRoot 'data/build-tools'
New-Item -ItemType Directory -Force -Path $runtimeDir,$cacheDir | Out-Null
function Receive-Verified([string]$Url,[string]$Target,[string]$Expected) {
  if (-not (Test-Path -LiteralPath $Target) -or (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected) { Invoke-WebRequest -Uri $Url -OutFile $Target -UseBasicParsing }
  if ((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected) { throw '공식 배포 파일의 SHA256이 다릅니다.' }
}
Receive-Verified 'https://nodejs.org/dist/v24.22.1/win-x64/node.exe' (Join-Path $runtimeDir 'node.exe') 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'
Receive-Verified 'https://github.com/openai/codex/releases/download/rust-v0.164.0/codex-x86_64-pc-windows-msvc.exe' (Join-Path $runtimeDir 'codex.exe') '6f267830b029ee25d9339864aa867cd45de9f8fd4c5ea007d2e63c13a0c66d36'
$archivePath = Join-Path $cacheDir 'codex-runtime.tar.gz'
Receive-Verified 'https://github.com/openai/codex/releases/download/rust-v0.164.0/codex-app-server-package-x86_64-pc-windows-msvc.tar.gz' $archivePath 'e177a62037b0b6b26774700f07a713db67f85efd2187c6a574c7a6a14ebf4b7e'
& tar -xzf $archivePath -C $runtimeDir
if ($LASTEXITCODE -ne 0) { throw 'AI 리소스 압축 해제에 실패했습니다.' }
foreach ($relative in @('bin/codex-code-mode-host.exe','codex-resources/codex-command-runner.exe','codex-resources/codex-windows-sandbox-setup.exe','codex-path/rg.exe')) { Copy-Item -LiteralPath (Join-Path $runtimeDir $relative) -Destination $runtimeDir -Force }
$licenses = @{
  'LICENSE-Codex.txt'='https://raw.githubusercontent.com/openai/codex/rust-v0.164.0/LICENSE';
  'LICENSE-Node.txt'='https://raw.githubusercontent.com/nodejs/node/v24.22.1/LICENSE';
  'LICENSE-ripgrep-MIT.txt'='https://raw.githubusercontent.com/BurntSushi/ripgrep/15.1.0/LICENSE-MIT';
  'LICENSE-ripgrep-UNLICENSE.txt'='https://raw.githubusercontent.com/BurntSushi/ripgrep/15.1.0/UNLICENSE'
}
foreach($entry in $licenses.GetEnumerator()) { Invoke-WebRequest -Uri $entry.Value -OutFile (Join-Path $runtimeDir $entry.Key) -UseBasicParsing }
Write-Output '공식 런타임의 SHA256 검증과 배포 준비를 마쳤습니다.'
