// Später erinnern: Mail verschwindet bis zum gewählten Zeitpunkt aus der Liste (nur lokal gespeichert).
export default {
  name: 'snooze',
  async run({ store, scheduler }, { id, until }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    const t = Date.parse(until);
    if (Number.isNaN(t) || t <= Date.now()) throw new Error('Zeitpunkt muss in der Zukunft liegen');
    store.set('snoozed', p.mail_id, new Date(t).toISOString());
    return { until: new Date(t).toISOString() };
  },
};
