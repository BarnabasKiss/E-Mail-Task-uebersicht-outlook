import test from 'node:test';
import assert from 'node:assert/strict';
import { isOverdue } from '../public/js/components/list.js';

const now = new Date(2026, 9, 23, 10, 0); // 23.10.2026 10:00
const mail = (o) => ({ dringlichkeit: 'heute', received_at: new Date(2026, 9, 23, 7, 0).toISOString(), frist: '', archiviert: false, ...o });

test('überfällig: "Heute" von gestern, Frist vorbei, "Diese Woche" älter als 7 Tage', () => {
  assert.equal(isOverdue(mail({}), now), false); // heute eingegangen
  assert.equal(isOverdue(mail({ received_at: new Date(2026, 9, 22, 18, 0).toISOString() }), now), true);
  assert.equal(isOverdue(mail({ frist: '2026-10-22' }), now), true);
  assert.equal(isOverdue(mail({ frist: '2026-10-23' }), now), false); // Frist heute ist noch nicht überfällig
  assert.equal(isOverdue(mail({ dringlichkeit: 'woche', received_at: new Date(2026, 9, 20).toISOString() }), now), false);
  assert.equal(isOverdue(mail({ dringlichkeit: 'woche', received_at: new Date(2026, 9, 10).toISOString() }), now), true);
});

test('überfällig: "Jetzt", "Egal" und Done nie', () => {
  const old = new Date(2026, 8, 1).toISOString();
  assert.equal(isOverdue(mail({ dringlichkeit: 'jetzt', received_at: old }), now), false);
  assert.equal(isOverdue(mail({ dringlichkeit: 'egal', received_at: old }), now), false);
  assert.equal(isOverdue(mail({ received_at: old, archiviert: true }), now), false);
});
