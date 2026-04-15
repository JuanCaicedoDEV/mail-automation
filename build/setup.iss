; Inno Setup script for Email Automation
; Requires Inno Setup 6+ — https://jrsoftware.org/isinfo.php

[Setup]
AppName=Email Automation
AppVersion=1.0.0
AppPublisher=Your Company
DefaultDirName={autopf}\EmailAutomation
DefaultGroupName=Email Automation
OutputDir=..\dist
OutputBaseFilename=EmailAutomation-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
; Require Windows 10+
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
; Include the entire PyInstaller output folder
Source: "..\dist\EmailAutomation\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Email Automation"; Filename: "{app}\EmailAutomation.exe"
Name: "{group}\Uninstall Email Automation"; Filename: "{uninstallexe}"
Name: "{commondesktop}\Email Automation"; Filename: "{app}\EmailAutomation.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\EmailAutomation.exe"; Description: "Launch Email Automation"; Flags: nowait postinstall skipifsilent
