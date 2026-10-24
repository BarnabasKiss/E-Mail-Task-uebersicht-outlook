// Aktionen-Register: neue Aktion = neue Datei in diesem Ordner + eine Zeile hier.
import accept from './accept.js';
import archive from './archive.js';
import del from './delete.js';
import restore from './restore.js';
import snooze from './snooze.js';
import regenerateDraft from './regenerate-draft.js';
import reviewRevert from './review-revert.js';
import contact from './contact.js';
import historyLearn from './history-learn.js';
import outlookDraft from './outlook-draft.js';
import outlookDraftDelete from './outlook-draft-delete.js';
import outlookSend from './outlook-send.js';
import book from './book.js';
import rulesAction from './rules.js';
import { composeDraft, composeSend, composeDiscard } from './compose.js';
import { textImprove, textSubject } from './text-tools.js';
import { sendCheck } from './send-check.js';
import { signature } from './signature.js';
import { tasksFile } from './tasks-file.js';
import { mailDraftSave, mailDraftDelete, schedule, scheduleCancel, scheduleNow, replyEdit } from './outbox.js';
import bulk from './bulk.js';

export const actions = Object.fromEntries([accept, archive, del, restore, snooze, regenerateDraft, reviewRevert, contact, historyLearn, outlookDraft, outlookDraftDelete, outlookSend, book, rulesAction, composeDraft, composeSend, composeDiscard, textImprove, textSubject, sendCheck, signature, tasksFile, mailDraftSave, mailDraftDelete, schedule, scheduleCancel, scheduleNow, replyEdit, bulk].map((a) => [a.name, a]));
