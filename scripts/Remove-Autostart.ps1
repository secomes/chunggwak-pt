$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder '충곽피티 백그라운드.lnk'
if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
Write-Output '충곽피티의 시작 프로그램 등록을 해제했습니다. 일정 데이터는 보관됩니다.'
