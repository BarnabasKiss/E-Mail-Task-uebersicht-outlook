// "Aus gesendeten Mails lernen": Start, Fortschritt und Ergebnis. Das Lernen selbst läuft auf dem Server (lib/history-learner.js).
import { el } from '../util.js';
import { icon } from '../icons.js';

const PHASE = {
  lesen: 'Gesendete Mails werden über n8n geholt …',
  auswerten: 'Stil wird lokal ausgewertet …',
  regeln: 'Claude leitet allgemeine Regeln ab (anonymisierter Text) …',
  personen: 'Claude leitet Notizen je Person ab (anonymisierter Text) …',
};

/** status: Antwort von GET /api/history-learn. handlers: { start(count), back(), openRules() } */
export function renderLearnPanel(container, status, handlers) {
  const count = el('input', { type: 'number', min: '10', max: '1000', step: '10', value: '200', 'aria-label': 'Anzahl gesendeter Mails', disabled: status.running });
  const start = el('button', { class: 'btn primary', type: 'button', disabled: status.running, onclick: () => handlers.start(Number(count.value) || 200) }, icon('sparkle', 15), el('span', {}, status.running ? 'Läuft …' : 'Lernen starten'));
  const r = status.result;

  const progress = status.running
    ? el('div', { class: 'learn-progress', role: 'status' }, el('strong', {}, PHASE[status.phase] || 'Läuft …'), el('span', {}, ` ${status.read} Mails gelesen${status.usable ? `, ${status.usable} brauchbar` : ''}${status.phase === 'personen' ? `, Person ${status.people}` : ''}`))
    : null;
  const failed = status.error ? el('div', { class: 'inline-error' }, icon('alert', 16), el('span', {}, `Das Lernen ist abgebrochen: ${status.error}`)) : null;

  const result = r
    ? el(
        'section',
        { class: 'card', 'aria-label': 'Ergebnis' },
        el('div', { class: 'card-head' }, el('h3', {}, 'Letztes Ergebnis')),
        el(
          'ul',
          { class: 'learn-result' },
          el('li', {}, `${r.mails} gesendete Mails gelesen, ${r.usable} davon brauchbar (${r.newMails} neu für das Gedächtnis), ${r.people} Empfänger.`),
          el('li', {}, `${r.rulesAdded} neue allgemeine Regeln in Mail-Regeln.md, Abschnitt „Aus gesendeten Mails abgeleitet (bitte prüfen)“.`),
          el('li', {}, `${r.notesAdded} neue Notizen im Absender-Gedächtnis, markiert als „prüfen“ (Klick aufs Profilbild einer Mail öffnet das Profil).`),
          r.skipped > 0 && el('li', {}, `${r.skipped} Mails wurden nicht an Claude gegeben, weil die Anonymisierung nicht sicher genug war.`),
        ),
        el('button', { class: 'btn', type: 'button', onclick: handlers.openRules }, icon('file', 15), el('span', {}, 'Mail-Regeln.md öffnen')),
      )
    : null;

  container.replaceChildren(
    el(
      'article',
      { class: 'detail learn' },
      el('header', { class: 'd-head' }, el('div', { class: 'd-title' }, el('h2', {}, 'Aus gesendeten Mails lernen')), el('div', { class: 'd-actions' }, el('button', { class: 'btn', type: 'button', onclick: handlers.back }, icon('undo', 15), el('span', {}, 'Zurück')))),
      el(
        'section',
        { class: 'card' },
        el('p', {}, 'Die App liest deine gesendeten Mails (über n8n, nur lesend) und leitet daraus Regeln ab:'),
        el(
          'ul',
          { class: 'learn-list' },
          el('li', {}, 'Ansprache (Du/Sie), Anrede, Gruß und Sprache je Person und Firma: lokal, ohne KI.'),
          el('li', {}, 'Allgemeine Stilregeln und Notizen je Person: Claude sieht nur anonymisierte Auszüge (strenge Maskierung mit Prüfung, unsichere Mails bleiben draußen).'),
        ),
        el('p', { class: 'hint' }, 'Alles Neue ist als „prüfen“ markiert und lässt sich ändern oder löschen: allgemeine Regeln in Mail-Regeln.md, alles andere im Absender-Profil. Jede Mail zählt nur einmal, ein zweiter Lauf ist also harmlos.'),
        el('div', { class: 'learn-start' }, el('label', {}, 'Wie viele der neuesten gesendeten Mails?'), count, start),
        progress,
        failed,
      ),
      result,
    ),
  );
}
