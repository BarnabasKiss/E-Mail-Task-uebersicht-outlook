// Regeldatei in der App bearbeiten: einzelne Regeln hinzufügen, ändern, löschen oder die ganze Datei als Text speichern.
// Antwort ist immer das aktuelle Dokument, damit die Oberfläche neu zeichnen kann.
export default {
  name: 'rules',
  async run({ rules }, { op, section, index, was, text, version }) {
    switch (op) {
      case 'add':
        rules.addRule(section, text);
        break;
      case 'edit':
        rules.editRule(section, index, was, text);
        break;
      case 'delete':
        rules.deleteRule(section, index, was);
        break;
      case 'save-text':
        rules.saveText(text, version);
        break;
      default:
        throw new Error(`Unbekannte Änderung: ${op}`);
    }
    return rules.document();
  },
};
