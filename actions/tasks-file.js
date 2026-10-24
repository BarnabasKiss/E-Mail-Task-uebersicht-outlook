// Aufgabenliste wählen (Optionen → Aufgabenliste): Datei setzen oder auf config.json zurückstellen. Antwort ist der neue Stand.
import { setTasksFile } from '../lib/tasks-setting.js';

export const tasksFile = {
  name: 'tasks-file',
  async run({ vault, store, configuredTasksFile }, { op, path }) {
    if (op === 'set') return setTasksFile({ vault, store, configured: configuredTasksFile }, path);
    if (op === 'reset') return setTasksFile({ vault, store, configured: configuredTasksFile }, null);
    throw new Error(`Unbekannte Änderung: ${op}`);
  },
};
