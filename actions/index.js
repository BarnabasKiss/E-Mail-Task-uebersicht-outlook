// Aktionen-Register: neue Aktion = neue Datei in diesem Ordner + eine Zeile hier.
import accept from './accept.js';
import archive from './archive.js';
import del from './delete.js';
import restore from './restore.js';
import snooze from './snooze.js';
import regenerateDraft from './regenerate-draft.js';
import reviewRevert from './review-revert.js';

export const actions = Object.fromEntries([accept, archive, del, restore, snooze, regenerateDraft, reviewRevert].map((a) => [a.name, a]));
