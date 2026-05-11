; MediaForge (图文工坊) Windows 安装程序
; 使用方法: iscc desktop/setup.iss

#define MyAppName "MediaForge"
#define MyAppDisplayName "图文工坊"
#define MyAppPublisher "MediaForge"
#define MyAppURL "https://github.com/abner/MediaForge"
#define MyAppExeName "MediaForge.exe"

; 从 pyproject.toml 读取版本号
#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

[Setup]
AppId={{B8F4A3D2-1C5E-4A7B-9D6F-8E2C3A0B1D4F}
AppName={#MyAppDisplayName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppDisplayName}
AllowNoIcons=yes
OutputDir={#SourcePath}\..\dist
OutputBaseFilename=MediaForge-Windows-Setup
SetupIconFile={#SourcePath}\build\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
DisableProgramGroupPage=yes

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式:"; Flags: checkedonce

[Files]
Source: "dist\MediaForge\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\MediaForge\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "desktop\run_console.bat"; DestDir: "{app}\desktop"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppDisplayName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppDisplayName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "启动 {#MyAppDisplayName}"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/c taskkill /f /im {#MyAppExeName} 2>nul"; Flags: runhidden

[Messages]
ChineseSimplified.BeveledLabel=中文
