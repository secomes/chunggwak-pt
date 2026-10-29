$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot 'Start.ps1'
$shellPath = (Get-Command powershell.exe).Source
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder '충곽 뭐해 백그라운드.lnk'
$shellObject = New-Object -ComObject WScript.Shell
$shortcut = $shellObject.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $shellPath
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -File "' + $startScript + '" -NoBrowser'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Windows 로그인 후 충곽 뭐해 일정 API를 백그라운드에서 실행합니다.'
$shortcut.Save()
Write-Output 'Windows 로그인 시 충곽 뭐해가 자동 실행되도록 등록했습니다.'
