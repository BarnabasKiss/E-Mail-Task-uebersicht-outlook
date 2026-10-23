// Entwürfe neuer Mails (nur in der App) und geplante Mails: speichern, löschen, planen, abbrechen, sofort senden, Antwort-Text merken.
export const mailDraftSave = {
  name: 'mail-draft-save',
  async run({ outbox }, p) {
    return outbox.saveDraft(p);
  },
};

export const mailDraftDelete = {
  name: 'mail-draft-delete',
  async run({ outbox }, { id }) {
    return { deleted: outbox.deleteDraft(id) };
  },
};

export const schedule = {
  name: 'schedule',
  async run({ outbox }, { kind, payload, sendAt, fromDraftId }) {
    const item = outbox.schedule({ kind, payload, sendAt, fromDraftId });
    return { id: item.id, sendAt: item.sendAt };
  },
};

export const scheduleCancel = {
  name: 'schedule-cancel',
  async run({ outbox }, { id, toDraft }) {
    return outbox.cancel(id, { toDraft });
  },
};

export const scheduleNow = {
  name: 'schedule-now',
  async run({ outbox }, { id }) {
    return outbox.sendNow(id);
  },
};

// Text, den du in der Antwort selbst geändert hast: bleibt erhalten, ohne den erzeugten Entwurf zu überschreiben (das Lernen vergleicht beides)
export const replyEdit = {
  name: 'reply-edit',
  async run({ store, scheduler }, { id, text }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    const t = String(text ?? '');
    if (t.trim()) store.set('draftEdits', p.mail_id, t.slice(0, 60000));
    else store.del('draftEdits', p.mail_id);
    return { ok: true };
  },
};
