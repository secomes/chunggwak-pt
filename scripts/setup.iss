#define AppVersion "1.1.0"
#ifndef BuildOutput
  #define BuildOutput "..\dist"
#endif
[Setup]
AppId={{F6063C8E-99EF-4A1D-A37B-384425EB9BB9}
AppName=충곽피티
AppVersion={#AppVersion}
AppPublisher=Chunggwak PT
DefaultDirName={localappdata}\Programs\ChunggwakPT
DefaultGroupName=충곽피티
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#BuildOutput}
OutputBaseFilename=ChunggwakPT-Setup-{#AppVersion}
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayName=충곽피티
CloseApplications=no
SetupLogging=yes
[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
[Tasks]
Name: "desktopicon"; Description: "바탕화면에 충곽피티 바로가기 만들기"; Flags: checkedonce
Name: "autostart"; Description: "Windows 로그인 시 백그라운드에서 자동 실행"; Flags: checkedonce
[Files]
Source: "..\src\*.mjs"; DestDir: "{app}\src"; Flags: ignoreversion
Source: "..\public\*"; DestDir: "{app}\public"; Flags: ignoreversion
Source: "..\docs\*.md"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "..\scripts\*.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\runtime\*.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "..\runtime\LICENSE-*.txt"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD-PARTY.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\충곽피티 실행.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\충곽피티 종료.cmd"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{group}\충곽피티"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\Start.ps1"""; WorkingDir: "{app}"
Name: "{group}\충곽피티 종료"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\Stop.ps1"""; WorkingDir: "{app}"
Name: "{autodesktop}\충곽피티"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\Start.ps1"""; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{userstartup}\충곽피티 백그라운드"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\Start.ps1"" -NoBrowser"; WorkingDir: "{app}"; Tasks: autostart
[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\Start.ps1"""; Description: "충곽피티 실행"; Flags: nowait postinstall skipifsilent runhidden
[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\Stop.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "StopChunggwak"
; User data is deliberately preserved; it is never shipped in the installer.
