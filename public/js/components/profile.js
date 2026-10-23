// Absender-Profil mit Tabs: Letzte Mails (Standard), Überblick und Optionen (Dringlichkeit und Gedächtnis; hier kann später mehr dazukommen).
import { el, avatar, badge } from '../util.js';
import { icon } from '../icons.js';
import { createMemoryPanel } from './memory-panel.js';
import { createProfileMails } from './profile-mails.js';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');
const tile = (label, value) => el('div', { class: 'stat' }, el('span', { class: 'stat-value' }, value), el('span', { class: 'stat-label' }, label));

const RULES = [
  { kind: 'jetzt', label: 'Immer „Jetzt“', title: 'Mails dieses Absenders landen immer unter „Jetzt“' },
  { kind: 'heute', label: 'Immer „Heute“', title: 'Mails dieses Absenders landen immer unter „Heute“' },
  { kind: 'ignorieren', label: 'Ignorieren', title: 'Mails dieses Absenders werden nicht angezeigt' },
];

const TABS = [
  { id: 'mails', label: 'Letzte Mails', icon: 'inbox' },
  { id: 'ueberblick', label: 'Überblick', icon: 'file' },
  { id: 'optionen', label: 'Optionen', icon: 'sliders' },
];

/** handlers: { back(), openMail(id), change(payload) }; tab: gewählter Tab, onTab(id) merkt ihn (damit er nach einer Änderung bleibt) */
export function renderProfile(container, data, handlers, { tab = 'mails', onTab = () => {} } = {}) {
  const { stats: s, memory } = data;
  const roles = [['Direkt', s.roles.direkt], ['CC', s.roles.cc], ['Shared', s.roles.shared]].filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}`).join(' · ');

  const ruleRow = (key, label) => {
    const active = data.rules.find((r) => r.pattern === key)?.kind;
    return el(
      'div',
      { class: 'rule-row' },
      el('span', { class: 'rule-label' }, label),
      RULES.map((r) =>
        el('button', { class: 'btn small', type: 'button', title: r.title, 'aria-pressed': active === r.kind, onclick: () => handlers.change({ op: 'rule', key, kind: r.kind, on: active !== r.kind }) }, r.label),
      ),
    );
  };
  const otherRules = data.rules.filter((r) => r.pattern !== data.address && r.pattern !== data.domain?.key);

  const head = el(
    'header',
    { class: 'd-head' },
    el('div', { class: 'd-title' }, el('h2', {}, data.name || data.address), el('div', { class: 'd-badges' }, badge(data.address), data.domain && badge(`${data.domain.mails} Mails von ${data.domain.key}`, '', 'inbox'))),
    el('div', { class: 'd-actions' }, el('button', { class: 'btn', type: 'button', onclick: handlers.back }, icon('undo', 15), el('span', {}, 'Zurück zur Mail'))),
  );

  const overview = el(
    'section',
    { class: 'card', 'aria-label': 'Überblick' },
    el(
      'div',
      { class: 'stats' },
      tile('Mails', s.total ? `${s.total}${s.open ? ` (${s.open} offen)` : ''}` : '0'),
      tile('Erster Kontakt', day(s.first)),
      tile('Letzter Kontakt', day(s.last)),
      tile('Eingang', roles || '–'),
      tile('Aufgaben', s.tasksTaken || s.tasksOpen ? `${s.tasksTaken} übernommen${s.tasksOpen ? `, ${s.tasksOpen} vorgeschlagen` : ''}` : '–'),
      tile('Beantwortet', s.replyAsked ? `${s.replied} von ${s.replyAsked}` : '–'),
    ),
  );

  const options = el(
    'div',
    { class: 'p-options' },
    el(
      'section',
      { class: 'card', 'aria-label': 'Dringlichkeit' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Dringlichkeit')),
      ruleRow(data.address, 'Diese Adresse'),
      data.domain && ruleRow(data.domain.key, `Alle bei ${data.domain.key}`),
      otherRules.length > 0 && el('p', { class: 'hint' }, `Weitere Regeln, die zutreffen: ${otherRules.map((r) => `${r.pattern} (${r.kind})`).join(', ')}. Sie stehen in Mail-Regeln.md.`),
      el('p', { class: 'hint' }, 'Wirkt sofort und steht danach in Mail-Regeln.md. Nochmal klicken hebt die Regel auf.'),
    ),
    createMemoryPanel({ title: `Gedächtnis: ${data.name || data.address}`, part: memory.person, isPerson: true, change: handlers.change }),
    memory.domain && createMemoryPanel({ title: `Gedächtnis: alle bei ${memory.domain.key}`, part: memory.domain, isPerson: false, change: handlers.change }),
  );

  const panels = { mails: createProfileMails(data.recent, handlers.openMail), ueberblick: overview, optionen: options };
  const buttons = TABS.map((t) => el('button', { class: 'seg-btn', type: 'button', role: 'tab', 'data-tab': t.id, onclick: () => show(t.id) }, icon(t.icon, 14), t.label));
  function show(id) {
    for (const t of TABS) panels[t.id].hidden = t.id !== id;
    buttons.forEach((b, i) => b.setAttribute('aria-selected', String(TABS[i].id === id)));
    onTab(id);
  }
  show(TABS.some((t) => t.id === tab) ? tab : 'mails');

  container.replaceChildren(el('article', { class: 'detail profile' }, head, el('div', { class: 'seg', role: 'tablist', 'aria-label': 'Profil' }, buttons), ...Object.values(panels)));
}
