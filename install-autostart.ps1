# Legt eine Verknüpfung im Windows-Autostart an, die den App-Server beim Anmelden unsichtbar startet.
# Entfernen: uninstall-autostart.ps1
$dir = $PSScriptRoot
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Mail-App.lnk'
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath = 'wscript.exe'
$s.Arguments = '"' + (Join-Path $dir 'start-hidden.vbs') + '"'
$s.WorkingDirectory = $dir
$s.Description = 'Mail-App (lokaler Server)'
$s.Save()
Write-Host "Autostart eingerichtet: $lnk"
Write-Host "Sofort starten ohne Neuanmeldung: wscript.exe `"$(Join-Path $dir 'start-hidden.vbs')`""
