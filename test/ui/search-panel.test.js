import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, importApp, resetBody, SKIP } from './dom.js';

const w = await setupDom();
const opts = { skip: !w && SKIP };
const $ = (id) => document.getElementById(id);

async function panel() {
  resetBody();
  const { createSearchPanel } = await importApp('components/search-panel.js');
  const calls = [];
  const p = createSearchPanel({ panel: $('filter-panel'), chipsBox: $('filter-chips'), button: $('filter-toggle'), onChange: (f) => calls.push(f) });
  p.setChoices({ formats: ['PDF', 'XLSX'], names: ['Paul Weber', 'Helga Brunner'] });
  return { p, calls };
}
const select = (label) => [...$('filter-panel').querySelectorAll('select')].find((x) => x.getAttribute('aria-label') === label);
const fire = (el, type) => el.dispatchEvent(new w.Event(type));

test('Panel: startet zu, öffnet per Knopf, Auswahlen kommen aus den Daten', opts, async () => {
  await panel();
  assert.ok($('filter-panel').hidden);
  $('filter-toggle').click();
  assert.ok(!$('filter-panel').hidden);
  assert.equal($('filter-toggle').getAttribute('aria-expanded'), 'true');
  assert.ok($('filter-toggle').querySelector('svg'), 'Filter-Symbol');
  assert.equal($('filter-panel').querySelectorAll('input[type=checkbox]').length, 8); // 5 Bereiche + Anhang, Aufgabe, Wichtig
  assert.equal([...select('Dateiformat').options].map((o) => o.value).join(), ',PDF,XLSX');
  assert.equal($('filter-panel').querySelectorAll('#fp-people option').length, 2);
});

test('Panel: Eingaben melden Änderungen, zeigen Chips und den Zähler am Knopf', opts, async () => {
  const { calls } = await panel();
  const [from, to] = $('filter-panel').querySelectorAll('input[type=text]');
  from.value = 'weber';
  fire(from, 'input');
  assert.equal(calls.at(-1).from, 'weber');
  assert.ok($('filter-chips').textContent.includes('Von: weber'));
  to.value = 'brunner';
  fire(to, 'input');
  select('An, CC oder beides').value = 'cc';
  fire(select('An, CC oder beides'), 'change');
  assert.deepEqual([calls.at(-1).to, calls.at(-1).toMode], ['brunner', 'cc']);
  assert.ok($('filter-chips').textContent.includes('CC: brunner'));
  assert.equal($('filter-toggle').querySelector('.filter-count').textContent, '2');
});

test('Panel: Format setzt den Anhang-Filter mit, Bereiche, Eingang und Zeitraum', opts, async () => {
  const { calls } = await panel();
  select('Dateiformat').value = 'PDF';
  fire(select('Dateiformat'), 'change');
  assert.ok(calls.at(-1).format === 'PDF' && calls.at(-1).anhang === true);
  const boxes = [...$('filter-panel').querySelectorAll('input[type=checkbox]')];
  assert.ok(boxes[5].checked, 'Mit Anhang folgt');
  boxes[3].click(); // Dokumentinhalt aus
  assert.equal(calls.at(-1).scope.content, false);
  assert.ok($('filter-chips').textContent.includes('Nur in:'));
  [...$('filter-panel').querySelectorAll('.fp-toggle')][0].click();
  assert.deepEqual(calls.at(-1).rollen, ['direkt']);
  $('filter-panel').querySelector('.fp-quick:nth-child(2)').click(); // 7 Tage
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(calls.at(-1).after) && calls.at(-1).before === '');
});

test('Panel: Chip entfernt einen Filter, "Zurücksetzen" alle', opts, async () => {
  const { calls } = await panel();
  select('Dateiformat').value = 'XLSX';
  fire(select('Dateiformat'), 'change');
  [...$('filter-chips').querySelectorAll('.filter-chip')].find((c) => c.textContent.startsWith('Format')).click();
  assert.deepEqual([calls.at(-1).format, calls.at(-1).anhang], ['', false]);
  const from = $('filter-panel').querySelector('input[type=text]');
  from.value = 'x';
  fire(from, 'input');
  $('filter-panel').querySelector('.link').click();
  assert.ok($('filter-chips').hidden);
  assert.equal(from.value, '');
  assert.equal($('filter-toggle').querySelector('.filter-count').textContent, '');
});
