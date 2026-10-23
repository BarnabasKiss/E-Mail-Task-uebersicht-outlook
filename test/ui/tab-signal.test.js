import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, importApp, resetBody, tick, SKIP } from './dom.js';

const w = await setupDom();
const opts = { skip: !w && SKIP };
const link = () => document.querySelector('link[rel~="icon"]');
const svg = () => decodeURIComponent(link().href.split(',').slice(1).join(','));

test('Tab-Symbol und Titel: nichts offen, offen (blau), wichtig (orange-rot)', opts, async () => {
  resetBody();
  const { createTabSignal } = await importApp('tab-signal.js');
  const sig = createTabSignal();
  assert.equal(document.querySelectorAll('link[rel~="icon"]').length, 1);
  sig.update({ open: 0, important: 0 });
  assert.ok(document.title === 'Mail-Übersicht' && !svg().includes('circle'));
  sig.update({ open: 4, important: 0 });
  assert.ok(document.title === '(4) Mail-Übersicht' && svg().includes('#2563eb') && !svg().includes('<text'));
  sig.update({ open: 4, important: 2 });
  assert.ok(document.title === '(2 wichtig) Mail-Übersicht' && svg().includes('#f2480b') && !svg().includes('<text'));
});

test('Tab-Symbol: bei neuer wichtiger Mail pulsiert der Punkt zwischen zwei Größen', opts, async () => {
  const { createTabSignal } = await importApp('tab-signal.js');
  const sig = createTabSignal();
  sig.update({ open: 4, important: 2, pulse: true });
  const frames = new Set([svg()]);
  for (let i = 0; i < 4; i += 1) {
    await tick(250);
    frames.add(svg());
  }
  assert.equal(frames.size, 2);
  sig.update({ open: 0, important: 0 });
});

test('Benachrichtigungen: nur für neu wichtige echte Mails, gebündelt ab 4, Klick springt zur Mail, ohne Erlaubnis nichts', opts, async () => {
  const shown = [];
  globalThis.Notification = class {
    static permission = 'granted';
    constructor(title, o) {
      this.title = title;
      this.o = o;
      shown.push(this);
    }
    close() {}
  };
  window.focus = () => {};
  const N = await importApp('notifier.js');
  const m = (id, o = {}) => ({ id, absender: 'Helga', betreff: 'Eskalation', dringlichkeit: 'jetzt', received_at: new Date().toISOString(), wichtig: [], ...o });
  let opened = null;
  N.notifyFresh([m(1)], { onOpen: (id) => (opened = id) });
  assert.equal(shown[0].title, 'Wichtig: Helga');
  assert.match(shown[0].o.body, /Jetzt/);
  shown[0].onclick();
  assert.equal(opened, 1);
  shown.length = 0;
  N.notifyFresh([m(2), m(3, { is_test: true })], { onOpen() {} });
  assert.equal(shown.length, 1, 'Testmails melden nichts');
  shown.length = 0;
  N.notifyFresh([m(4), m(5), m(6), m(7)], { onOpen() {} });
  assert.deepEqual(shown.map((n) => n.title), ['4 neue wichtige Mails']);
  shown.length = 0;
  Notification.permission = 'denied';
  N.notifyFresh([m(8)], { onOpen() {} });
  assert.equal(shown.length, 0);
  N.rememberSeen(['1', '2']);
  assert.deepEqual(N.seenIds(), ['1', '2']);
});
