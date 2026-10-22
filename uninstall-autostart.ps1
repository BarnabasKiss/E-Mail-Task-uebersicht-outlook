# Entfernt die Autostart-Verknüpfung wieder. Ein laufender Server wird nicht beendet.
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Mail-App.lnk'
if (Test-Path $lnk) { Remove-Item $lnk; Write-Host "Autostart entfernt." } else { Write-Host "Kein Autostart vorhanden." }
