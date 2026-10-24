// Anmeldung für den Betrieb im Netz: Anmeldeseite, signiertes Sitzungs-Cookie, Sperre nach Fehlversuchen.
// Ohne Passwort (lokaler Betrieb auf 127.0.0.1) ist die Anmeldung aus und alles läuft wie bisher.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { send, readBuffer } from './http.js';
import { loginPage } from './login-page.js';

const COOKIE = 'mailapp_session';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_FAILS = 5; // je Adresse
const MAX_FAILS_ALL = 30; // insgesamt, falls die Adresse gefälscht wird
const LOCK_MS = 15 * 60 * 1000;

const b64 = (b) => Buffer.from(b).toString('base64url');
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

/** Geheimnis für die Signatur: aus der Umgebung, sonst einmal erzeugt und im Datenordner abgelegt. */
export function loadSecret({ env, file }) {
  if (env) return env;
  try {
    const s = fs.readFileSync(file, 'utf8').trim();
    if (s.length >= 32) return s;
  } catch {}
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}

const cookieOf = (req) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return '';
};

export function createAuth({ user, password, secret, now = () => Date.now() }) {
  const enabled = !!password;
  const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const fails = new Map(); // ip -> { n, until }
  let failsAll = { n: 0, until: 0 };

  const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https';

  const issue = () => {
    const payload = b64(JSON.stringify({ exp: now() + SESSION_MS }));
    return `${payload}.${sign(payload)}`;
  };
  const valid = (token) => {
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig || !same(sig, sign(payload))) return false;
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > now();
    } catch {
      return false;
    }
  };
  const isAuthed = (req) => !enabled || valid(cookieOf(req));

  const locked = (ip) => (fails.get(ip)?.until ?? 0) > now() || failsAll.until > now();
  const fail = (ip) => {
    const f = fails.get(ip) || { n: 0, until: 0 };
    f.n += 1;
    if (f.n >= MAX_FAILS) Object.assign(f, { n: 0, until: now() + LOCK_MS });
    fails.set(ip, f);
    failsAll.n += 1;
    if (failsAll.n >= MAX_FAILS_ALL) failsAll = { n: 0, until: now() + LOCK_MS };
  };

  const cookie = (req, value, maxAgeSec) =>
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${isHttps(req) ? '; Secure' : ''}`;
  const html = (res, code, body, headers = {}) =>
    res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', ...headers }).end(body);

  async function login(req, res) {
    const ip = clientIp(req);
    if (locked(ip)) return html(res, 429, loginPage({ error: 'Zu viele Fehlversuche. Bitte in einer Viertelstunde erneut versuchen.' }));
    const form = new URLSearchParams((await readBuffer(req, 10_000)).toString());
    const userOk = same(form.get('user') || '', user);
    const passOk = same(form.get('password') || '', password);
    const ok = userOk && passOk;
    if (!ok) {
      fail(ip);
      return html(res, 401, loginPage({ error: 'Benutzername oder Passwort falsch.' }));
    }
    fails.delete(ip);
    return html(res, 303, '', { location: '/', 'set-cookie': cookie(req, issue(), SESSION_MS / 1000) });
  }

  /** true, wenn die Anfrage hier schon beantwortet wurde (Anmeldeseite, Abmelden, nicht angemeldet). */
  async function gate(req, res, url) {
    if (!enabled) return false;
    if (url.pathname === '/login') {
      if (req.method === 'POST') return await login(req, res), true;
      return html(res, 200, loginPage({})), true;
    }
    if (url.pathname === '/logout' && req.method === 'POST') {
      return html(res, 303, '', { location: '/login', 'set-cookie': cookie(req, '', 0) }), true;
    }
    if (isAuthed(req)) return false;
    if (url.pathname.startsWith('/api/')) return send(res, 401, { error: 'Nicht angemeldet', login: true }), true;
    return html(res, 303, '', { location: '/login' }), true;
  }

  return { enabled, gate, isAuthed };
}
