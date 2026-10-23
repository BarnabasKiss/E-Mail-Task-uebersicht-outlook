// Antwort als Entwurf in Outlook ablegen (sendet nichts). Ersetzt einen früher abgelegten Entwurf zu derselben Mail.
// Der Entwurf wird als "nur an den Absender antworten" angelegt, danach setzt n8n An und CC genau so, wie die App sie zeigt.
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function cleanRecipients(list, label) {
  const out = [...new Set((Array.isArray(list) ? list : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean))];
  if (out.some((a) => !EMAIL.test(a))) throw new Error(`Ungültige Adresse bei ${label}`);
  return out;
}

export default {
  name: 'outlook-draft',
  async run({ n8n, store, scheduler }, { id, text, to, cc }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    if (String(p.mail_id).startsWith('TEST-')) throw new Error('Testnachrichten gibt es in Outlook nicht');
    const body = String(text || '').trim();
    if (!body) throw new Error('Der Entwurf ist leer');
    const toList = cleanRecipients(to, 'An');
    const ccList = cleanRecipients(cc, 'CC').filter((a) => !toList.includes(a));
    if (!toList.length) throw new Error('Es fehlt ein Empfänger bei An');
    if (toList.length + ccList.length > 30) throw new Error('Höchstens 30 Empfänger');

    const old = store.get('outlookDrafts', p.mail_id);
    if (old?.draftId) await n8n.deleteDraft(old.draftId).catch(() => {}); // war er schon weg, ist das in Ordnung
    const out = await n8n.saveDraft({ id: p.mail_id, text: body, to: toList, cc: ccList });
    if (!out?.draftId) throw new Error('Outlook hat keinen Entwurf angelegt');
    const saved = { draftId: out.draftId, webLink: out.webLink || '', savedAt: new Date().toISOString(), text: body, to: toList, cc: ccList };
    store.set('outlookDrafts', p.mail_id, saved);
    return { draftId: saved.draftId, webLink: saved.webLink, savedAt: saved.savedAt };
  },
};
