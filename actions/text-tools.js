// Textwerkzeuge für Antworten und neue Mails (siehe lib/text-tools.js): Rechtschreibung, Rechtschreibung und Struktur, Lücken suchen, Betreff vorschlagen.
export const textImprove = {
  name: 'text-improve',
  async run({ textTools }, { mode, text, subject, to, context }) {
    if (mode === 'gaps') return textTools.findGaps({ text, subject, to, context });
    return textTools.improveText({ mode, text, to });
  },
};

export const textSubject = {
  name: 'text-subject',
  async run({ textTools }, { text, to }) {
    return textTools.suggestSubject({ text, to });
  },
};
