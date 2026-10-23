// Neue Mail schreiben: als Entwurf in Outlook ablegen (sendet nichts), den Entwurf senden oder verwerfen.
// Gesendet oder gelöscht wird nur ein Entwurf, den diese App selbst angelegt hat (composeDrafts); n8n prüft zusätzlich, dass die ID ein Entwurf ist.
import { cleanRecipients } from './outlook-draft.js';
import { imageFor } from '../lib/signature-setting.js';

export const composeDraft = {
  name: 'compose-draft',
  async run({ n8n, store, addressBook }, { subject, text, to, cc, bcc, replaceId, signatureImage }) {
    const subj = String(subject || '').replace(/[\r\n]+/g, ' ').trim();
    const body = String(text || '').trim();
    if (!subj) throw new Error('Es fehlt der Betreff');
    if (subj.length > 300) throw new Error('Der Betreff ist zu lang (höchstens 300 Zeichen)');
    if (!body) throw new Error('Der Text ist leer');
    const toList = cleanRecipients(to, 'An');
    const ccList = cleanRecipients(cc, 'CC').filter((a) => !toList.includes(a));
    const bccList = cleanRecipients(bcc, 'BCC').filter((a) => !toList.includes(a) && !ccList.includes(a));
    if (!toList.length) throw new Error('Es fehlt ein Empfänger bei An');
    if (toList.length + ccList.length + bccList.length > 60) throw new Error('Höchstens 60 Empfänger');

    if (replaceId && store.get('composeDrafts', replaceId)) {
      await n8n.deleteDraft(replaceId).catch(() => {}); // war er schon weg, ist das in Ordnung
      store.del('composeDrafts', replaceId);
    }
    const out = await n8n.saveNewDraft({ subject: subj, text: body, to: toList, cc: ccList, bcc: bccList, ...imageFor(store, { signatureImage }) });
    if (!out?.draftId) throw new Error('Outlook hat keinen Entwurf angelegt');
    const saved = { savedAt: new Date().toISOString(), subject: subj, to: toList, cc: ccList, bcc: bccList };
    store.set('composeDrafts', out.draftId, saved);
    return { draftId: out.draftId, webLink: out.webLink || '', savedAt: saved.savedAt };
  },
};

export const composeSend = {
  name: 'compose-send',
  async run({ n8n, store, addressBook }, { draftId }) {
    const saved = store.get('composeDrafts', draftId);
    if (!saved) throw new Error('Dieser Entwurf stammt nicht aus der App oder wurde schon gesendet');
    await n8n.sendDraft(draftId);
    store.del('composeDrafts', draftId);
    addressBook?.touch([...saved.to, ...saved.cc, ...saved.bcc]);
    return { sent: true };
  },
};

export const composeDiscard = {
  name: 'compose-discard',
  async run({ n8n, store }, { draftId }) {
    if (!store.get('composeDrafts', draftId)) return { deleted: false };
    await n8n.deleteDraft(draftId).catch((e) => {
      if (!/outlook|kein Entwurf/i.test(e.message)) throw e; // schon weg
    });
    store.del('composeDrafts', draftId);
    return { deleted: true };
  },
};
