// Zurückholen aus Done (oder Rückgängig nach "Done"): setzt den Eintrag in n8n wieder auf "neu".
// Eine dabei angelegte Ignorieren-Regel bleibt bestehen (steht in Mail-Regeln.md und lässt sich dort löschen).
export default {
  name: 'restore',
  async run({ n8n, scheduler }, { id, refresh = true }) {
    await n8n.setStatus(id, 'neu');
    if (refresh) await scheduler.refresh();
    return { restored: true };
  },
};
