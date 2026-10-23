// Aus vielen gesendeten Mails lernen: startet im Hintergrund, den Stand zeigt GET /api/history-learn.
export default {
  name: 'history-learn',
  async run({ history }, { count }) {
    if (!history) throw new Error('Nicht eingerichtet');
    return history.start({ count });
  },
};
