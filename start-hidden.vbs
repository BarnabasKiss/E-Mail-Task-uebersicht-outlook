' Startet den App-Server ohne Konsolenfenster. Log: %LOCALAPPDATA%\mail-app\server.log
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
logDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\mail-app"
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
sh.CurrentDirectory = dir
sh.Run "cmd /c node server.js >> """ & logDir & "\server.log"" 2>&1", 0, False
