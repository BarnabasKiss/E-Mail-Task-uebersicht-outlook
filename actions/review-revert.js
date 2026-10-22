// Setzt die Bewertung einer Mail auf die Bewertung aus n8n zurück (Modul "Bewertung mit Anhängen").
export default {
  name: 'review-revert',
  async run({ review, scheduler }, { id }) {
    if (!review) throw new Error('Die Bewertung mit Anhängen ist nicht aktiv');
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden');
    review.revert(p.mail_id);
    return { ok: true };
  },
};
