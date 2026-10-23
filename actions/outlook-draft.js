// Antwort als Entwurf in Outlook ablegen (sendet nichts). Ersetzt einen früher abgelegten Entwurf zu derselben Mail.
// Der Entwurf wird als "nur an den Absender antworten" angelegt, danach setzt n8n An, CC und BCC genau so, wie die App sie zeigt.
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function cleanRecipients(list, label) {
  const out = [...new Set((Array.isArray(list) ? list : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean))];
  if (out.some((a) => !EMAIL.test(a))) throw new Error(`Ungültige Adresse bei ${label}`);
  return out;
}

export default {
  name: 'outlook-draft',
  async run({ n8n, store, scheduler, addressBook }, { id, text, to, cc, bcc }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    const body = String(text || '').trim();
    if (!body) throw new Error('Der Entwurf ist leer');
    const toList = cleanRecipients(to, 'An');
    const ccList = cleanRecipients(cc, 'CC').filter((a) => !toList.includes(a));
    const bccList = cleanRecipients(bcc, 'BCC').filter((a) => !toList.includes(a) && !ccList.includes(a)); // jede Adresse nur einmal: An vor CC vor BCC
    if (!toList.length) throw new Error('Es fehlt ein Empfänger bei An');
    if (toList.length + ccList.length + bccList.length > 60) throw new Error('Höchstens 60 Empfänger');

    const test = String(p.mail_id).startsWith('TEST-'); // Testmail: es gibt sie in Outlook nicht, also wird nur simuliert
    const old = store.get('outlookDrafts', p.mail_id);
    if (old?.draftId && !test) await n8n.deleteDraft(old.draftId).catch(() => {}); // war er schon weg, ist das in Ordnung
    const out = test ? { draftId: 'TEST-ENTWURF', webLink: '' } : await n8n.saveDraft({ id: p.mail_id, text: body, to: toList, cc: ccList, bcc: bccList });
    if (!out?.draftId) throw new Error('Outlook hat keinen Entwurf angelegt');
    const saved = { draftId: out.draftId, webLink: out.webLink || '', savedAt: new Date().toISOString(), text: body, to: toList, cc: ccList, bcc: bccList };
    if (!test) addressBook?.touch([...toList, ...ccList, ...bccList]);
    store.set('outlookDrafts', p.mail_id, saved);
    return { draftId: saved.draftId, webLink: saved.webLink, savedAt: saved.savedAt, simulated: test };
  },
};
