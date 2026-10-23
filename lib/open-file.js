// Öffnet eine Datei mit dem Standardprogramm des Systems (der Browser darf lokale Dateien nicht selbst öffnen).
import { spawn } from 'node:child_process';

export function openWithDefaultApp(file) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', file]]
    : process.platform === 'darwin' ? ['open', [file]]
    : ['xdg-open', [file]];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); // z. B. kein xdg-open installiert: die Datei lässt sich dann von Hand öffnen
  child.unref();
}
