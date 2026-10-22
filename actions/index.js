// Aktionen-Register: neue Aktion = neue Datei in diesem Ordner + eine Zeile hier.
import accept from './accept.js';
import archive from './archive.js';
import del from './delete.js';
import restore from './restore.js';
import snooze from './snooze.js';
import regenerateDraft from './regenerate-draft.js';

export const actions = Object.fromEntries([accept, archive, del, restore, snooze, regenerateDraft].map((a) => [a.name, a]));
