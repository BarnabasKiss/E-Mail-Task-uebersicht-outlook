// Zurückholen aus Done (oder Rückgängig nach Verwerfen): setzt den Eintrag in n8n wieder auf "neu".
// Eine dabei angelegte Ignorieren-Regel bleibt bestehen (steht in Mail-Regeln.md und lässt sich dort löschen).
export default {
  name: 'restore',
  async run({ n8n, scheduler }, { id }) {
    await n8n.setStatus(id, 'neu');
    await scheduler.refresh();
    return { restored: true };
  },
};
