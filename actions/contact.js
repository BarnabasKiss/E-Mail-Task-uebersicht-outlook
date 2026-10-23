// Absender-Profil bearbeiten: Merkmale (Ansprache, Anrede, Gruß, Sprache), Notizen und Dringlichkeitsregeln.
// key = Adresse einer Person oder "@firma.at" für die Firma.
export default {
  name: 'contact',
  async run({ contacts, rules }, { op, key, ...p }) {
    switch (op) {
      case 'field':
        contacts.setField(key, p.field, p.value);
        break;
      case 'note-add':
        if (!String(p.text || '').trim()) throw new Error('Die Notiz ist leer');
        contacts.addManualNote(key, p.text);
        break;
      case 'note-edit':
        contacts.editNote(key, p.id, { text: p.text, reviewed: p.reviewed });
        break;
      case 'note-delete':
        contacts.deleteNote(key, p.id);
        break;
      case 'confirm':
        contacts.confirmAll(key);
        break;
      case 'rule':
        rules.setUrgencyRule(p.kind, key, p.on !== false);
        break;
      default:
        throw new Error(`Unbekannte Änderung: ${op}`);
    }
    return { ok: true };
  },
};
