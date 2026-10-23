// Kontakte: das Adressbuch der App (Vorschläge bei An, CC, BCC). Suchen, anlegen, ändern, löschen, eine Liste einfügen, Outlook-Kontakte übernehmen.
import { el, formatShort } from '../util.js';
import { icon } from '../icons.js';

const SOURCES = [
  ['', 'Alle'],
  ['mail', 'Aus Mails'],
  ['sent', 'Angeschrieben'],
  ['outlook', 'Aus Outlook'],
  ['manuell', 'Von Hand'],
];
const SOURCE_LABEL = { mail: 'Mail', sent: 'Angeschrieben', outlook: 'Outlook', manuell: 'Von Hand' };

/**
 * data: { items, total, stats }. view: { q, source }. 
 * handlers: { back, search(q, source), add({name,address,company}), edit(address, fields), remove(address), importText(text), importOutlook(), openProfile(address), more() }
 * note: Text unter der Werkzeugleiste (Ergebnis des letzten Imports)
 */
export function renderContacts(container, data, view, handlers, note = '') {
  const s = data.stats || {};
  const q = el('input', { type: 'search', class: 'ct-search', value: view.q, placeholder: 'Name, Firma oder Adresse suchen', 'aria-label': 'Kontakte suchen', oninput: () => debounce(() => handlers.search(q.value, source.value)) });
  const source = el('select', { 'aria-label': 'Quelle', onchange: () => handlers.search(q.value, source.value) }, SOURCES.map(([v, l]) => el('option', { value: v, selected: v === view.source }, l)));

  const nName = el('input', { type: 'text', placeholder: 'Name', 'aria-label': 'Name' });
  const nAddr = el('input', { type: 'text', placeholder: 'E-Mail-Adresse', 'aria-label': 'E-Mail-Adresse' });
  const nCompany = el('input', { type: 'text', placeholder: 'Firma (optional)', 'aria-label': 'Firma' });
  const addBtn = el('button', { class: 'btn primary', type: 'button', onclick: () => handlers.add({ name: nName.value, address: nAddr.value, company: nCompany.value }) }, icon('check', 15), el('span', {}, 'Hinzufügen'));
  [nName, nAddr, nCompany].forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && addBtn.click()));

  const paste = el('textarea', { class: 'ct-paste', rows: 5, placeholder: 'Eine Zeile je Kontakt, z. B.\nAnna Berger;anna@kunde.at\nMax Huber <max@partner.at>\npaul@firma.at', 'aria-label': 'Kontaktliste einfügen' });
  const pasteBox = el(
    'details',
    { class: 'ct-paste-box' },
    el('summary', {}, 'Liste einfügen (aus Excel, CSV oder einer Mail)'),
    paste,
    el('div', { class: 'ct-paste-actions' }, el('button', { class: 'btn small', type: 'button', onclick: () => handlers.importText(paste.value) }, 'Übernehmen')),
  );

  const row = (c) =>
    el(
      'li',
      { class: 'ct-row' },
      el('input', { type: 'text', class: 'ct-name', value: c.name, placeholder: '(ohne Namen)', 'aria-label': `Name zu ${c.address}`, onchange: (e) => handlers.edit(c.address, { name: e.target.value }) }),
      el('span', { class: 'ct-addr' }, el('button', { class: 'link', type: 'button', title: 'Absender-Profil öffnen', onclick: () => handlers.openProfile(c.address) }, c.address)),
      el('input', { type: 'text', class: 'ct-company', value: c.company, placeholder: 'Firma', 'aria-label': `Firma zu ${c.address}`, onchange: (e) => handlers.edit(c.address, { company: e.target.value }) }),
      el('span', { class: 'ct-src' }, c.sources.map((x) => el('span', { class: `badge${x === 'manuell' || x === 'outlook' ? ' ok' : ''}`, title: x === 'sent' ? `Du hast ihm ${c.sentCount}× geschrieben` : undefined }, SOURCE_LABEL[x] || x))),
      el('time', { class: 'ct-last' }, c.last ? formatShort(c.last) : ''),
      el('button', { class: 'icon-btn danger', type: 'button', title: 'Kontakt löschen', 'aria-label': `${c.address} löschen`, onclick: () => handlers.remove(c.address) }, icon('trash', 14)),
    );

  container.replaceChildren(
    el(
      'article',
      { class: 'detail contacts' },
      el('header', { class: 'd-head' }, el('div', { class: 'd-title' }, el('h2', {}, 'Kontakte'), el('div', { class: 'd-badges' }, el('span', { class: 'badge' }, `${s.total || 0} im Adressbuch`), ['mail', 'sent', 'outlook', 'manuell'].filter((k) => s[k]).map((k) => el('span', { class: 'badge' }, `${SOURCE_LABEL[k]}: ${s[k]}`)))), el('div', { class: 'd-actions' }, el('button', { class: 'btn', type: 'button', onclick: handlers.back }, icon('undo', 15), el('span', {}, 'Zurück')))),
      el(
        'section',
        { class: 'card' },
        el('p', {}, 'Das Adressbuch gibt dir Vorschläge bei An, CC und BCC. Es füllt sich von selbst aus deinen Mails (Absender, Empfänger, Verlauf, wem du geschrieben hast) und lässt sich hier ergänzen. Es liegt nur auf diesem Rechner.'),
        el('div', { class: 'ct-tools' }, el('button', { class: 'btn', type: 'button', title: 'Liest die Empfänger (An und CC) deiner gesendeten Mails, ohne Claude', onclick: handlers.importSent }, icon('refresh', 15), el('span', {}, 'Aus gesendeten Mails übernehmen')), el('button', { class: 'btn', type: 'button', title: 'Persönliche Outlook-Kontakte', onclick: handlers.importOutlook }, icon('refresh', 15), el('span', {}, 'Aus Outlook übernehmen'))),
        note && el('p', { class: 'hint ct-note', role: 'status' }, note),
        el('div', { class: 'ct-add' }, nName, nAddr, nCompany, addBtn),
        pasteBox,
      ),
      el(
        'section',
        { class: 'card' },
        el('div', { class: 'ct-filter' }, q, source),
        data.items.length
          ? el('ul', { class: 'ct-list' }, data.items.map(row))
          : el('p', { class: 'hint' }, view.q || view.source ? 'Keine Kontakte gefunden.' : 'Noch keine Kontakte. Sie erscheinen mit den nächsten Mails von selbst, oder du legst sie oben an.'),
        data.total > data.items.length && el('button', { class: 'btn small ct-more', type: 'button', onclick: handlers.more }, `Mehr anzeigen (${data.total - data.items.length} weitere)`),
      ),
    ),
  );
  if (view.focusSearch) q.focus();
}

let timer;
function debounce(fn) {
  clearTimeout(timer);
  timer = setTimeout(fn, 250);
}
