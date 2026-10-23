// HTTP-Schnittstelle der App (nur localhost): Routen unter /api/, statische Dateien aus public/.
// Die Arbeit machen die Module: proposal-view (Liste), mail-view (Detail), attachment-http (Anhänge), actions/ (Aktionen).
import path from 'node:path';
import { actions } from '../actions/index.js';
import { friendlyError } from './errors.js';
import { send, readJson, readBuffer, serveStatic } from './http.js';
import { MAX_AUDIO_BYTES } from './speech.js';
import { serveAttachment } from './attachment-http.js';
import { openWithDefaultApp } from './open-file.js';
import { createProposalView } from './proposal-view.js';
import { createMailView } from './mail-view.js';
import { createContactProfile } from './contact-profile.js';
import { createThread } from './thread.js';

export function createApi({ cfg, scheduler, n8n, vault, rules, store, drafts, matcher, claude, attachments, review, roles, attInfo, docIndex, contacts, history, addressBook, outbox, textTools, speech }) {
  const services = { n8n, vault, rules, store, drafts, matcher, scheduler, review, contacts, history, addressBook, outbox, textTools, ownAddress: cfg.ownAddress, actions };
  const publicDir = path.join(cfg.root, 'public');
  const allowedHosts = new Set([`localhost:${cfg.port}`, `127.0.0.1:${cfg.port}`]);
  const proposalView = createProposalView({ rules, store, scheduler, ownAddress: cfg.ownAddress, roles, attInfo, docIndex });
  const mailView = createMailView({ cfg, drafts, attachments, store, vault, roles, proposalView, rules });
  const thread = createThread({ n8n, drafts, attachments, ownAddress: cfg.ownAddress, aliases: cfg.ownAliases || [], addressBook, onOwnSignature: (sig) => store.get('settings', 'signature') !== sig && store.set('settings', 'signature', sig), testDir: path.join(cfg.dataDir || '', 'test-anhaenge') });
  const contactProfile = createContactProfile({ scheduler, store, contacts, rules, roles, proposalView });
  const notFound = (res) => send(res, 404, { error: 'Nicht gefunden' });

  const status = () => ({
    fetchedAt: scheduler.state.fetchedAt,
    error: scheduler.state.error ? friendlyError(scheduler.state.error) : null,
    claudeBusy: claude.busy,
    rulesFile: rules.file,
    outbox: outbox ? outbox.counts() : { drafts: 0, scheduled: 0, failed: 0 },
  });

  // Anhänge einer Mail: Liste, "Was geht an Claude?"-Vorschau oder eine einzelne Datei
  async function handleAttachments(res, url, p, attachmentId) {
    if (!attachmentId) {
      const items = await attachments.list(p);
      attInfo?.remember(p.mail_id, items);
      return send(res, 200, { items, readByAi: cfg.attachments?.readByAi !== false, canPreview: !!review });
    }
    if (attachmentId === 'review-preview') {
      // Zeigt genau den maskierten Text, der an Claude ginge (ohne ihn zu senden). Nur wenn das Modul aktiv ist.
      if (!review) return send(res, 404, { error: 'Modul nicht aktiv' });
      try {
        const prep = await review.prepare(p);
        return send(res, 200, prep.skip ? `Nichts zu senden: ${prep.skip}` : prep.prompt);
      } catch (e) {
        return send(res, 200, `Würde NICHT gesendet: ${e.message}`);
      }
    }
    const file = await attachments.get(p, decodeURIComponent(attachmentId));
    return serveAttachment(res, file, { download: url.searchParams.has('download') });
  }

  async function handleApi(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    const [, resource, id, sub, subId] = parts;
    const get = req.method === 'GET';
    const post = req.method === 'POST';
    if (post && req.headers['x-mail-app'] !== '1') return send(res, 403, { error: 'Header x-mail-app fehlt' });

    if (get && resource === 'search') {
      // Dokument- und Mailtextsuche über den lokalen Index (lib/doc-index.js); content/names/text=0 schalten einen Bereich ab
      if (!docIndex) return send(res, 200, { hits: {}, indexed: 0, total: 0 });
      const on = (k) => url.searchParams.get(k) !== '0';
      const hits = docIndex.search(url.searchParams.get('q') || '', { content: on('content'), names: on('names'), text: on('text') });
      return send(res, 200, { hits, ...docIndex.coverage() });
    }

    if (resource === 'proposals' && id) {
      const p = scheduler.find(id);
      if (get && !sub) return p ? send(res, 200, await mailView.detail(p)) : notFound(res);
      if (!p) return notFound(res);
      if (get && sub === 'ai-view') {
        try {
          return send(res, 200, await mailView.aiView(p));
        } catch (e) {
          return send(res, 200, { error: friendlyError(e.message), items: [], problems: [] });
        }
      }
      if (get && sub === 'attachments') return handleAttachments(res, url, p, subId);
      if (get && sub === 'thread') return send(res, 200, await thread.page(p, { before: url.searchParams.get('before') || '', limit: Math.min(Number(url.searchParams.get('limit')) || 10, 25) }));
      if (post && sub === 'match') return send(res, 200, await matcher.match(p, { force: url.searchParams.get('force') === '1' }));
    }
    if (get && resource === 'contacts' && id) return send(res, 200, contactProfile.build(decodeURIComponent(id)));
    if (get && resource === 'proposals' && !id) return send(res, 200, proposalView.list());

    if (post && resource === 'actions' && id) {
      const action = actions[id];
      if (!action) return send(res, 404, { error: `Unbekannte Aktion: ${id}` });
      return send(res, 200, (await action.run(services, await readJson(req))) ?? { ok: true });
    }
    if (post && resource === 'refresh') {
      await scheduler.refresh();
      return send(res, 200, proposalView.list());
    }
    if (post && resource === 'open-rules') {
      rules.read(); // legt die Regeldatei bei Bedarf an
      openWithDefaultApp(rules.file);
      return send(res, 200, { opened: rules.file });
    }
    if (get && resource === 'address-book') {
      // /api/address-book/suggest?q=… = Vorschläge für die Empfängerfelder, sonst die Liste für die Verwaltung
      if (!addressBook) return send(res, 200, { items: [], total: 0, stats: {} });
      if (id === 'suggest') return send(res, 200, { items: addressBook.search(url.searchParams.get('q') || '', { limit: Math.min(Number(url.searchParams.get('limit')) || 8, 20), exclude: (url.searchParams.get('exclude') || '').split(',').filter(Boolean) }) });
      return send(res, 200, { ...addressBook.list({ q: url.searchParams.get('q') || '', source: url.searchParams.get('source') || '', limit: Math.min(Number(url.searchParams.get('limit')) || 200, 1000), offset: Number(url.searchParams.get('offset')) || 0 }), stats: addressBook.stats() });
    }
    if (get && resource === 'speech') return send(res, 200, speech ? speech.status() : { available: false, reason: 'nicht eingerichtet' });
    if (post && resource === 'transcribe') {
      // Aufnahme aus dem Browser (rohe Audio-Bytes) lokal in Text umwandeln
      if (!speech) return send(res, 503, { error: 'Die Spracherkennung ist nicht eingerichtet' });
      if (Number(req.headers['content-length']) > MAX_AUDIO_BYTES) {
        req.resume();
        return send(res, 413, { error: 'Die Aufnahme ist zu groß.' });
      }
      const audio = await readBuffer(req, MAX_AUDIO_BYTES);
      return send(res, 200, { text: await speech.transcribe(audio, req.headers['content-type'] || 'audio/webm') });
    }
    if (get && resource === 'outbox') return send(res, 200, outbox ? { drafts: outbox.listDrafts(), scheduled: outbox.listScheduled(), counts: outbox.counts() } : { drafts: [], scheduled: [], counts: {} });
    if (get && resource === 'compose-info') return send(res, 200, { signature: store.get('settings', 'signature') || '', ownAddress: cfg.ownAddress });
    if (get && resource === 'history-learn') return send(res, 200, history ? history.status() : { running: false, phase: 'idle', result: null });
    if (get && resource === 'status') return send(res, 200, status());
    return send(res, 404, { error: 'Unbekannte Route' });
  }

  return async function handler(req, res) {
    try {
      if (!allowedHosts.has(req.headers.host)) return send(res, 403, 'Nur über localhost erreichbar');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return serveStatic(res, publicDir, url.pathname);
    } catch (e) {
      return send(res, 500, { error: friendlyError(e.message) });
    }
  };
}
