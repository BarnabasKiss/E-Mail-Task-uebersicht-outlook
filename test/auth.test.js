// Anmeldung (lib/auth.js): Seite, Sitzungs-Cookie, Sperre nach Fehlversuchen, Rolle ohne Passwort.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAuth } from '../lib/auth.js';

async function start(opts = { user: 'barni', password: 'geheim', secret: 'x'.repeat(40) }) {
  const auth = createAuth(opts);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (await auth.gate(req, res, url)) return;
    res.end('geschützt');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (user, password, headers = {}) =>
    fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ user, password }) });
  return { base, login, close: () => server.close() };
}

test('ohne Anmeldung: Seiten werden umgeleitet, API liefert 401', async () => {
  const s = await start();
  const page = await fetch(`${s.base}/`, { redirect: 'manual' });
  assert.equal(page.status, 303);
  assert.equal(page.headers.get('location'), '/login');
  const api = await fetch(`${s.base}/api/status`);
  assert.equal(api.status, 401);
  assert.equal((await api.json()).login, true);
  s.close();
});

test('richtige Daten: Cookie (HttpOnly, Strict) öffnet die Seite, Abmelden schließt sie wieder', async () => {
  const s = await start();
  const r = await s.login('barni', 'geheim', { 'x-forwarded-proto': 'https' });
  assert.equal(r.status, 303);
  const set = r.headers.get('set-cookie');
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  assert.match(set, /Secure/);
  const cookie = set.split(';')[0];
  assert.equal(await (await fetch(`${s.base}/`, { headers: { cookie } })).text(), 'geschützt');
  const out = await fetch(`${s.base}/logout`, { method: 'POST', redirect: 'manual', headers: { cookie } });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  s.close();
});

test('falsches Passwort und gefälschtes Cookie werden abgelehnt', async () => {
  const s = await start();
  assert.equal((await s.login('barni', 'falsch')).status, 401);
  assert.equal((await s.login('andere', 'geheim')).status, 401);
  const forged = `mailapp_session=${Buffer.from(JSON.stringify({ exp: Date.now() + 1e9 })).toString('base64url')}.abc`;
  assert.equal((await fetch(`${s.base}/api/x`, { headers: { cookie: forged } })).status, 401);
  s.close();
});

test('abgelaufene Sitzung gilt nicht mehr', async () => {
  let t = 1_000_000;
  const s = await start({ user: 'u', password: 'p', secret: 'y'.repeat(40), now: () => t });
  const cookie = (await s.login('u', 'p')).headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${s.base}/`, { headers: { cookie } })).status, 200);
  t += 31 * 24 * 3600 * 1000;
  assert.equal((await fetch(`${s.base}/`, { headers: { cookie }, redirect: 'manual' })).status, 303);
  s.close();
});

test('nach fünf Fehlversuchen ist die Adresse gesperrt, auch mit richtigem Passwort', async () => {
  const s = await start();
  const ip = { 'x-forwarded-for': '203.0.113.7' };
  for (let i = 0; i < 5; i++) assert.equal((await s.login('barni', 'falsch', ip)).status, 401);
  assert.equal((await s.login('barni', 'geheim', ip)).status, 429);
  assert.equal((await s.login('barni', 'geheim', { 'x-forwarded-for': '203.0.113.8' })).status, 303);
  s.close();
});

test('ohne Passwort ist die Anmeldung aus', async () => {
  const s = await start({ user: 'u', password: '', secret: 'z' });
  assert.equal(await (await fetch(`${s.base}/`)).text(), 'geschützt');
  s.close();
});
