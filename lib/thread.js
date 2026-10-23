// Verlauf einer Konversation für die Nachrichtenansicht: holt die Nachrichten über n8n (getThread, seitenweise, neueste zuerst),
// schneidet je Nachricht den zitierten Verlauf ab und trennt die Signatur. Fällt n8n aus oder gibt es keine Konversation (Testmails),
// bleibt die geöffnete Mail als einzelne Nachricht (degraded).
import fs from 'node:fs';
import path from 'node:path';
import { htmlToText, stripQuotedHistory, IMAGE_MARK } from './html.js';
import { splitSignature, commonSignature } from './signature.js';
import { isTestMail } from './test-mail.js';

const MAX_TEXT = 20000;
const CACHE_MS = 60 * 1000;

/** Text einer Nachricht ohne zitierten Verlauf (Von:/Am … schrieb, Original-Nachricht, ">"-Zeilen am Ende). */
export function ownText(text) {
  let t = stripQuotedHistory(String(text || ''), 0);
  t = t.replace(/(\n[ \t]*>.*)+\s*$/, '');
  return t.trim();
}

/**
 * Verlauf einer Testmail: Datei <testDir>/<mail_id>/verlauf.json mit Nachrichten { id, from, to, cc, sent, body } (älteste zuerst oder beliebig).
 * Wie n8n getThread: neueste zuerst, seitenweise. null, wenn es die Datei nicht gibt.
 */
export function testThread(testDir, proposal, { before = '', limit = 10 } = {}) {
  if (!testDir) return null;
  const file = path.join(testDir, String(proposal.mail_id).replace(/[^\w.-]/g, '_'), 'verlauf.json');
  let all;
  try {
    all = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  const sorted = [...all].sort((a, b) => String(b.sent).localeCompare(String(a.sent)));
  const older = sorted.filter((m) => !before || String(m.sent) < before);
  return { items: older.slice(0, limit).map((m) => ({ cc: [], to: [], hasAttachments: false, ...m })), hasMore: older.length > limit, total: sorted.length };
}

export function createThread({ n8n, drafts, attachments, ownAddress, aliases = [], addressBook, onOwnSignature, testDir, log = console.log }) {
  const mine = new Set([ownAddress, ...aliases].filter(Boolean).map((a) => a.toLowerCase()));
  const isOwn = (address) => mine.has(String(address || '').toLowerCase());
  const cache = new Map(); // Konversation|before|limit -> { at, data }

  const person = (r) => ({ name: r?.name || '', address: r?.address || '' });
  const people = (list) => (list || []).map(person);

  // Aus Roh-Nachrichten fertige Nachrichten machen: Text, Signatur, eigener Absender
  function build(items, currentId, currentText) {
    const texts = items.map((m) => ownText(m.id === currentId && currentText != null ? currentText : htmlToText(m.body || '', { paragraphs: true })).slice(0, MAX_TEXT));
    // Signatur, die bei demselben Absender in mehreren Nachrichten gleich endet
    const known = new Map();
    for (const addr of new Set(items.map((m) => m.from.address.toLowerCase()))) {
      const same = texts.filter((_, i) => items[i].from.address.toLowerCase() === addr);
      known.set(addr, commonSignature(same));
    }
    return items.map((m, i) => {
      const { body, signature } = splitSignature(texts[i], { known: known.get(m.from.address.toLowerCase()) });
      return {
        id: m.id,
        from: person(m.from),
        to: people(m.to),
        cc: people(m.cc),
        sent: m.sent,
        own: isOwn(m.from.address),
        current: m.id === currentId,
        hasAttachments: !!m.hasAttachments,
        text: body,
        signature,
      };
    });
  }

  async function currentMail(proposal) {
    const m = await drafts.getMail(proposal);
    const withMarks = drafts.mailText(m, { paragraphs: true, images: true });
    const own = ownText(withMarks);
    const { text } = await attachments.resolveImages(proposal, own, IMAGE_MARK);
    return { mail: m, text };
  }

  /** Die Nachrichten einer Seite des Verlaufs. before = Zeitpunkt der ältesten schon gezeigten Nachricht. */
  async function page(proposal, { before = '', limit = 10 } = {}) {
    const conv = proposal.conversation_id;
    const key = `${conv}|${before}|${limit}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

    let data;
    try {
      const fromFile = isTestMail(proposal) ? testThread(testDir, proposal, { before, limit }) : null;
      if (!fromFile && (!conv || isTestMail(proposal))) throw new Error('keine Konversation');
      const out = fromFile || (await n8n.getThread(conv, { before, limit }));
      const items = (out.items || []).map((m) => ({ ...m, from: person(m.from) }));
      // Die geöffnete Mail zeigt ihre Bilder: dafür ihren Text aus der Mail selbst nehmen
      const showsCurrent = !before && items.some((m) => m.id === proposal.mail_id);
      const cur = showsCurrent ? await currentMail(proposal).catch(() => null) : null;
      const messages = build(items, proposal.mail_id, cur?.text);
      if (!isTestMail(proposal)) {
        for (const m of items) addressBook?.rememberOnce(`verlauf:${m.id}`, [m.from, ...(m.to || []), ...(m.cc || [])]);
        const sig = messages.find((m) => m.own && m.signature)?.signature; // deine Signatur merkt sich die App für neue Mails
        if (sig) onOwnSignature?.(sig);
      }
      data = { messages, hasMore: !!out.hasMore, nextBefore: items.length ? items.map((m) => m.sent).sort()[0] : '', degraded: false };
    } catch (e) {
      if (conv && !isTestMail(proposal)) log(`[thread] ${e.message}`);
      // Rückfall: nur die geöffnete Mail
      const { mail, text } = await currentMail(proposal);
      const p = (r) => ({ name: r?.emailAddress?.name || '', address: r?.emailAddress?.address || '' });
      const one = build([{ id: proposal.mail_id, from: p(mail.from), to: (mail.toRecipients || []).map(p), cc: (mail.ccRecipients || []).map(p), sent: mail.receivedDateTime || proposal.received_at, body: '' }], proposal.mail_id, text);
      data = { messages: one, hasMore: false, nextBefore: '', degraded: true };
    }
    cache.set(key, { at: Date.now(), data });
    return data;
  }

  return { page };
}
