// Aktionen-Register: neue Aktion = neue Datei in diesem Ordner + eine Zeile hier.
import accept from './accept.js';
import archive from './archive.js';
import del from './delete.js';
import restore from './restore.js';
import snooze from './snooze.js';
import regenerateDraft from './regenerate-draft.js';
import reviewRevert from './review-revert.js';
import draftPrevious from './draft-previous.js';
import contact from './contact.js';
import historyLearn from './history-learn.js';
import outlookDraft from './outlook-draft.js';
import outlookDraftDelete from './outlook-draft-delete.js';
import outlookSend from './outlook-send.js';
import bulk from './bulk.js';

export const actions = Object.fromEntries([accept, archive, del, restore, snooze, regenerateDraft, draftPrevious, reviewRevert, contact, historyLearn, outlookDraft, outlookDraftDelete, outlookSend, bulk].map((a) => [a.name, a]));
