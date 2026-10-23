// Adressbuch bearbeiten: Kontakt anlegen, ändern, löschen, eine eingefügte Liste, die Outlook-Kontakte oder die Empfänger deiner gesendeten Mails übernehmen.
const PAGE = 25;
const MAX_MAILS = 1000;

// Empfänger (An, CC) aller gesendeten Mails, neueste zuerst: erst Gesendete Elemente, dann eigene Mails in Archiv und Unterordnern. Jede Mail zählt einmal.
async function importSent({ addressBook, n8n }) {
  const seen = new Set();
  let mails = 0;
  let people = 0;
  for (const scope of ['sent', 'all']) {
    let before = '';
    while (seen.size < MAX_MAILS) {
      const page = await n8n.listSent({ limit: PAGE, before, scope });
      if (!page.length) break;
      for (const m of page) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        mails += 1;
        people += addressBook.rememberOnce(`gesendet:${m.id}`, [...(m.to || []), ...(m.cc || [])], 'sent');
      }
      const oldest = page.map((m) => m.sentDateTime).filter(Boolean).sort()[0];
      if (!oldest || oldest === before || page.length < PAGE) break;
      before = oldest;
    }
  }
  return { mails, people };
}
export default {
  name: 'book',
  async run({ addressBook, n8n }, { op, ...p }) {
    if (!addressBook) throw new Error('Das Adressbuch ist nicht eingerichtet');
    switch (op) {
      case 'add':
        return addressBook.add(p);
      case 'edit':
        return addressBook.edit(p.address, p);
      case 'remove':
        return { removed: addressBook.remove(p.address) };
      case 'import-text':
        return addressBook.importText(p.text);
      case 'import-sent':
        return importSent({ addressBook, n8n });
      case 'import-outlook': {
        const out = await n8n.listContacts();
        return { ...addressBook.importOutlook(out?.items), empty: !(out?.items || []).length };
      }
      default:
        throw new Error(`Unbekannte Änderung: ${op}`);
    }
  },
};
