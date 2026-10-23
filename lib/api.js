// HTTP-Schnittstelle der App (nur localhost). Statische Dateien aus public/, JSON-API unter /api/.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { actions } from '../actions/index.js';
import { applyUrgencyRules } from './rules.js';
import { needsReply, ARCHIVE_STATUSES } from './scheduler.js';
import { friendlyError } from './errors.js';
import { isTestMail } from './test-mail.js';
import { extractText, kindOf } from './attachments.js';
import { maskTexts, findLeaks } from './mask-strict.js';
import { mailMeta } from './drafts.js';
import { IMAGE_MARK } from './html.js';
import { importanceReasons } from './importance.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const URGENCY_ORDER = { jetzt: 0, heute: 1, woche: 2, egal: 3 };

const send = (res, code, body, headers = {}) => {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (d) => {
      data += d;
      if (data.length > 1e6) reject(new Error('Anfrage zu groß'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Ungültiges JSON'));
      }
    });
  });

// Nur diese Typen zeigt der Browser direkt an. Alles andere (auch HTML und SVG, die Skripte enthalten können)
// wird zum Download gezwungen, damit Anhänge nie im Ursprung der App laufen.
const INLINE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const person = (r) => ({ name: r?.emailAddress?.name || '', address: r?.emailAddress?.address || '' });

export function createApi({ cfg, scheduler, n8n, vault, rules, store, drafts, matcher, claude, attachments, review, roles, attInfo, docIndex }) {
  const services = { n8n, vault, rules, store, drafts, matcher, scheduler, review };
  const publicDir = path.join(cfg.root, 'public');
  const allowedHosts = new Set([`localhost:${cfg.port}`, `127.0.0.1:${cfg.port}`]);

  function view(p, urgencyRules) {
    const rule = applyUrgencyRules(p, urgencyRules);
    const until = store.get('snoozed', p.mail_id);
    const err = store.get('draftErrors', p.mail_id);
    return {
      hidden: rule.hidden,
      item: {
        id: p.id,
        mail_id: p.mail_id,
        is_test: isTestMail(p),
        betreff: p.betreff,
        absender: p.absender,
        absender_mail: p.absender_mail,
        received_at: p.received_at,
        dringlichkeit: rule.urgency || p.dringlichkeit,
        dringlichkeit_original: p.dringlichkeit,
        durch_regel: !!rule.urgency,
        kategorie: p.kategorie,
        zusammenfassung: p.zusammenfassung,
        antwort_noetig: needsReply(p),
        aufgabe_text: p.aufgabe_text,
        aufgabe_thema: p.aufgabe_thema,
        frist: p.frist,
        begruendung: p.begruendung,
        web_link: p.web_link,
        anhang_bewertung: p.anhang_bewertung || null,
        rolle: roles?.get(p.mail_id) || null,
        empfaenger: docIndex?.recipients(p.mail_id) || null,
        wichtig: importanceReasons({ ...p, dringlichkeit: rule.urgency || p.dringlichkeit, archiviert: ARCHIVE_STATUSES.includes(p.status) }),
        anhaenge: attInfo?.get(p.mail_id) ?? null,
        aufgabe_uebernommen: store.get('tasks', p.mail_id) || null,
        hat_entwurf: !!store.get('drafts', p.mail_id),
        entwurf_fehler: err ? friendlyError(err.message) : null,
        snoozed_until: until && Date.parse(until) > Date.now() ? until : null,
        status: p.status,
        archiviert: ARCHIVE_STATUSES.includes(p.status),
        abgelegt_am: p.updatedAt || null,
      },
    };
  }

  function listProposals() {
    const urgencyRules = rules.urgencyRules();
    const items = [];
    let hidden = 0;
    for (const p of scheduler.state.items) {
      const v = view(p, urgencyRules);
      if (v.hidden) hidden += 1;
      else items.push(v.item);
    }
    items.sort(
      (a, b) =>
        (URGENCY_ORDER[a.dringlichkeit] ?? 9) - (URGENCY_ORDER[b.dringlichkeit] ?? 9) ||
        String(b.received_at).localeCompare(String(a.received_at)),
    );
    // Done: zuletzt abgelegt zuerst (Reihenfolge kommt vom Scheduler)
    const archive = scheduler.state.archive.map((p) => view(p, urgencyRules).item);
    return { items, archive, hidden, ownAddress: cfg.ownAddress };
  }

  async function detail(id) {
    const p = scheduler.find(id);
    if (!p) return null;
    const item = view(p, rules.urgencyRules()).item;
    let mail = null;
    let mailError = null;
    try {
      const m = await drafts.getMail(p);
      item.rolle = roles?.remember(p.mail_id, m) || item.rolle;
      mail = {
        source: item.is_test ? 'test' : 'outlook',
        subject: m.subject,
        from: person(m.from),
        to: (m.toRecipients || []).map(person),
        cc: (m.ccRecipients || []).map(person),
        receivedDateTime: m.receivedDateTime,
        text: drafts.mailText(m, { paragraphs: true }).slice(0, 20000),
      };
      // Bilder im Text: nur zur Anzeige. Die Marken tragen die Anhang-ID, die App lädt das Bild darüber.
      const withImages = drafts.mailText(m, { paragraphs: true, images: true }).slice(0, 20000);
      if (withImages !== mail.text) {
        const shown = await attachments.resolveImages(p, withImages, IMAGE_MARK);
        mail.imageText = shown.text;
      }
      // Nur zur Anzeige ("Was wurde anonymisiert?"): dieselbe Maskierung wie für Claude, aber ohne Prüfung, damit die Ansicht nie leer bleibt.
      if (cfg.pseudonymize) {
        try {
          const out = maskTexts(mailMeta(m), [mail.text], { ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, check: false });
          mail.masked = { text: out.texts[0], map: out.map };
        } catch {
          mail.masked = null;
        }
      }
    } catch (e) {
      mailError = friendlyError(e.message);
      // Rückfall: gespeicherte Vorschau und Absender aus der Tabelle, damit die Ansicht nicht leer bleibt.
      mail = {
        source: 'vorschau',
        subject: p.betreff,
        from: { name: p.absender || '', address: p.absender_mail || '' },
        to: [],
        cc: [],
        receivedDateTime: p.received_at,
        text: p.vorschau || '',
      };
    }
    const archived = item.archiviert;
    return {
      proposal: item,
      mail,
      mailError,
      draft: archived ? null : store.get('drafts', p.mail_id) || null,
      headings: archived ? [] : vault.headings(),
    };
  }

  /**
   * Was Claude aus Mail, Bildern und Anhängen bekäme: Text je Anhang im Original und maskiert (gemeinsame Platzhalter),
   * dazu das Ergebnis der Prüfung. Nur zur Anzeige, es wird nichts gesendet.
   */
  async function aiView(p) {
    const m = await drafts.getMail(p);
    // Bilder im Text bekommen vor dem Maskieren eine Nummer (⟦bild:1⟧), damit die Oberfläche sie wieder einsetzen kann.
    const resolved = await attachments.resolveImages(p, drafts.mailText(m, { paragraphs: true, images: true }).slice(0, 20000), IMAGE_MARK);
    const imageIds = [];
    const text = resolved.text.replace(IMAGE_MARK, (all, id) => `⟦bild:${imageIds.push(id)}⟧`);
    const read = cfg.attachments?.readByAi !== false ? (await attachments.readAll(p)).filter((a) => a.text) : [];
    const items = read.map((a) => ({ name: a.name, original: a.text, attId: a.attId || null }));
    if (!cfg.pseudonymize) return { items: items.map((a) => ({ ...a, masked: null })), imageIds, text: null, map: null, problems: [] };
    const out = maskTexts(mailMeta(m), [text, ...read.flatMap((a) => [a.name, a.text])], { ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, check: false });
    const problems = findLeaks(out.texts, out.map, { ownNames: cfg.ownNames, ownAddress: cfg.ownAddress });
    return {
      text: out.texts[0],
      imageIds,
      map: out.map,
      problems: [...new Set(problems)],
      items: items.map((a, i) => ({ ...a, maskedName: out.texts[1 + i * 2], masked: out.texts[2 + i * 2] })),
    };
  }

  function status() {
    return {
      fetchedAt: scheduler.state.fetchedAt,
      error: scheduler.state.error ? friendlyError(scheduler.state.error) : null,
      claudeBusy: claude.busy,
      rulesFile: rules.file,
    };
  }

  // Öffnet die Regeldatei mit dem Standardprogramm für .md (der Browser darf lokale Dateien nicht selbst öffnen).
  function openRules() {
    rules.read(); // legt die Datei bei Bedarf an
    const [cmd, args] =
      process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', rules.file]]
      : process.platform === 'darwin' ? ['open', [rules.file]]
      : ['xdg-open', [rules.file]];
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {}); // z. B. kein xdg-open installiert: Datei lässt sich dann von Hand öffnen
    child.unref();
    return { opened: rules.file };
  }

  async function handleApi(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    if (req.method === 'POST' && req.headers['x-mail-app'] !== '1') return send(res, 403, { error: 'Header x-mail-app fehlt' });

    if (req.method === 'GET' && parts[1] === 'search') {
      // Dokumentensuche: Treffer in Anhängen und Bildern (Text lokal gemerkt, siehe lib/doc-index.js)
      const q = url.searchParams.get('q') || '';
      const on = (k) => url.searchParams.get(k) !== '0'; // content=0 / names=0 schaltet den Bereich ab
      return send(res, 200, docIndex ? { hits: docIndex.search(q, { content: on('content'), names: on('names'), text: on('text') }), ...docIndex.coverage() } : { hits: {}, indexed: 0, total: 0 });
    }
    if (req.method === 'GET' && parts[1] === 'proposals' && parts[3] === 'ai-view') {
      const p = scheduler.find(parts[2]);
      if (!p) return send(res, 404, { error: 'Nicht gefunden' });
      try {
        return send(res, 200, await aiView(p));
      } catch (e) {
        return send(res, 200, { error: friendlyError(e.message), items: [], problems: [] });
      }
    }
    if (req.method === 'GET' && parts[1] === 'proposals' && parts[3] === 'attachments') {
      const p = scheduler.find(parts[2]);
      if (!p) return send(res, 404, { error: 'Nicht gefunden' });
      if (!parts[4]) {
        const items = await attachments.list(p);
        attInfo?.remember(p.mail_id, items);
        return send(res, 200, { items, readByAi: cfg.attachments?.readByAi !== false, canPreview: !!review });
      }
      if (parts[4] === 'review-preview') {
        // Zeigt genau den maskierten Text, der an Claude ginge (ohne ihn zu senden). Nur wenn das Modul aktiv ist.
        if (!review) return send(res, 404, { error: 'Modul nicht aktiv' });
        try {
          const prep = await review.prepare(p);
          return send(res, 200, prep.skip ? `Nichts zu senden: ${prep.skip}` : prep.prompt);
        } catch (e) {
          return send(res, 200, `Würde NICHT gesendet: ${e.message}`);
        }
      }
      const f = await attachments.get(p, decodeURIComponent(parts[4]));
      const type = String(f.contentType).split(';')[0].trim().toLowerCase();
      const forceDownload = url.searchParams.has('download');
      // Office-Dateien kann der Browser nicht anzeigen: "Öffnen" zeigt dort den Textinhalt, "Herunterladen" liefert die Datei.
      if (!forceDownload && !INLINE_TYPES.has(type) && ['text', 'docx', 'xlsx', 'pptx'].includes(kindOf({ name: f.name, contentType: f.contentType }))) {
        const ex = await extractText({ name: f.name, contentType: f.contentType }, f.buffer);
        return send(res, 200, ex.text ?? `(Keine Vorschau: ${ex.reason})`, { 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=600' });
      }
      const inline = !forceDownload && INLINE_TYPES.has(type);
      res.writeHead(200, {
        'content-type': inline ? type : 'application/octet-stream',
        'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'content-length': f.buffer.length,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=600',
        ...(type === 'application/pdf' ? {} : { 'content-security-policy': "sandbox; default-src 'none'; img-src 'self' data:" }),
      });
      return res.end(f.buffer);
    }
    if (req.method === 'GET' && parts[1] === 'proposals' && !parts[2]) return send(res, 200, listProposals());
    if (req.method === 'GET' && parts[1] === 'proposals' && parts[2]) {
      const d = await detail(parts[2]);
      return d ? send(res, 200, d) : send(res, 404, { error: 'Nicht gefunden' });
    }
    if (req.method === 'POST' && parts[1] === 'proposals' && parts[3] === 'match') {
      const p = scheduler.find(parts[2]);
      if (!p) return send(res, 404, { error: 'Nicht gefunden' });
      return send(res, 200, await matcher.match(p, { force: url.searchParams.get('force') === '1' }));
    }
    if (req.method === 'POST' && parts[1] === 'actions' && parts[2]) {
      const action = actions[parts[2]];
      if (!action) return send(res, 404, { error: `Unbekannte Aktion: ${parts[2]}` });
      return send(res, 200, (await action.run(services, await readJson(req))) ?? { ok: true });
    }
    if (req.method === 'POST' && parts[1] === 'refresh') {
      await scheduler.refresh();
      return send(res, 200, listProposals());
    }
    if (req.method === 'POST' && parts[1] === 'open-rules') return send(res, 200, openRules());
    if (req.method === 'GET' && parts[1] === 'status') return send(res, 200, status());
    return send(res, 404, { error: 'Unbekannte Route' });
  }

  function handleStatic(req, res, url) {
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(publicDir, rel);
    if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Nicht gefunden');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }

  return async function handler(req, res) {
    try {
      if (!allowedHosts.has(req.headers.host)) return send(res, 403, 'Nur über localhost erreichbar');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return handleStatic(req, res, url);
    } catch (e) {
      return send(res, 500, { error: friendlyError(e.message) });
    }
  };
}
