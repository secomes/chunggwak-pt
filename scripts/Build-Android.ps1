param([string]$JavaHome = $env:JAVA_HOME)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$originalJavaHome = $env:JAVA_HOME
$temporaryDrive = $null
try {
  if (-not $JavaHome) {
    $bundledJdk = Join-Path $projectRoot 'data/build-tools/jdk-21.0.12.1+1'
    if (Test-Path -LiteralPath (Join-Path $bundledJdk 'bin/java.exe')) { $JavaHome = $bundledJdk }
  }
  if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) { throw 'JDK 21 경로를 -JavaHome으로 지정해 주세요.' }
  $buildRoot = $projectRoot
  # Temporary drive spelling avoids JVM non-ASCII classpath failures. No files move.
  if ($projectRoot -match '[^\x00-\x7F]') {
    foreach ($letter in @('Z','Y','X','W','V','U','T','S','R','Q','P','O','N','M')) {
      if (-not (Test-Path ($letter + ':\'))) { $temporaryDrive = $letter + ':'; break }
    }
    if (-not $temporaryDrive) { throw '빌드용 임시 드라이브를 만들 여유가 없습니다.' }
    & subst.exe $temporaryDrive $projectRoot
    if ($LASTEXITCODE -ne 0) { $temporaryDrive = $null; throw '임시 빌드 경로 연결에 실패했습니다.' }
    $buildRoot = $temporaryDrive + '\'
    if ($JavaHome.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) { $JavaHome = Join-Path $buildRoot $JavaHome.Substring($projectRoot.Length).TrimStart('\','/') }
  }
  $env:JAVA_HOME = $JavaHome
  $gradle = Join-Path $buildRoot 'data/build-tools/gradle-8.9/bin/gradle.bat'
  if (-not (Test-Path -LiteralPath $gradle)) { $gradle = Join-Path $buildRoot 'android/gradlew.bat' }
  & $gradle -p (Join-Path $buildRoot 'android') --no-daemon :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease
  if ($LASTEXITCODE -ne 0) { throw 'Android 빌드 또는 검사에 실패했습니다.' }
  $apk = Join-Path $projectRoot 'android/app/build/outputs/apk/release/app-release.apk'
  if (-not (Test-Path -LiteralPath $apk)) { throw '배포 서명 설정이 없습니다. android/README.md를 확인하세요.' }
  $dist = Join-Path $projectRoot 'dist'
  New-Item -ItemType Directory -Path $dist -Force | Out-Null
  $output = Join-Path $dist 'ChunggwakMohae-Android-2.0.0.apk'
  Copy-Item -LiteralPath $apk -Destination $output -Force
  $hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $dist 'ANDROID-SHA256SUMS.txt'), $hash + '  ChunggwakMohae-Android-2.0.0.apk' + [Environment]::NewLine, [Text.Encoding]::ASCII)
  Write-Output $output
  Write-Output '빌드 완료. 공개 출시 전 제공자 등록·학교 승인·실기기 연동 시험이 별도로 필요합니다.'
} finally {
  $env:JAVA_HOME = $originalJavaHome
  if ($temporaryDrive) { & subst.exe $temporaryDrive /D }
}
