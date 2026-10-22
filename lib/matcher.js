// Ordnet eine Aufgabe einer bestehenden ###-Überschrift zu oder schlägt eine neue vor
// (gleiche Logik wie die Todo-Automation: passt keine, entsteht eine neue ganz oben).

export function createMatcher({ claude, vault, store }) {
  const norm = (s) => String(s).trim().toLowerCase();

  async function match(proposal, { force = false } = {}) {
    const key = proposal.mail_id;
    const cached = store.get('matches', key);
    if (cached && !force && cached.forText === proposal.aufgabe_text) return cached;

    const headings = vault.headings();
    const prompt = `Du ordnest eine Aufgabe von Barni einer Kategorie seiner Aufgabenliste zu.

Bestehende Kategorien (###-Überschriften):
${headings.map((h) => `- ${h}`).join('\n')}

Aufgabe: ${proposal.aufgabe_text}
Thema laut Mailbewertung: ${proposal.aufgabe_thema || '(keines)'}
Betreff der Mail: ${proposal.betreff}

Wähle nach dem Inhalt die passende bestehende Kategorie. Passt keine, schlage eine neue, kurze Überschrift im Stil der bestehenden vor.
Antworte ausschließlich mit JSON: {"heading": "<exakt eine bestehende Kategorie oder null>", "newHeading": "<nur wenn heading null ist>", "reason": "<ein kurzer Satz>"}`;

    let result;
    try {
      const out = await claude.runJson(prompt);
      const found = out.heading && headings.find((h) => norm(h) === norm(out.heading));
      if (found) result = { heading: found, isNew: false, reason: out.reason || '' };
      else result = { heading: String(out.newHeading || proposal.aufgabe_thema || 'Sonstiges').trim(), isNew: true, reason: out.reason || '' };
    } catch (e) {
      result = { heading: null, isNew: false, reason: `Zuordnung fehlgeschlagen: ${e.message}`, failed: true };
    }
    result.forText = proposal.aufgabe_text;
    if (!result.failed) store.set('matches', key, result);
    return result;
  }

  return { match };
}
