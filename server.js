// Startpunkt: baut die Module zusammen, startet Hintergrundarbeit und den lokalen Webserver.
import http from 'node:http';
import path from 'node:path';
import { loadConfig } from './lib/config.js';
import { createN8nClient } from './lib/n8n-client.js';
import { createClaude } from './lib/claude.js';
import { createStore } from './lib/store.js';
import { createVault } from './lib/vault.js';
import { createRules } from './lib/rules.js';
import { createMatcher } from './lib/matcher.js';
import { createDrafts } from './lib/drafts.js';
import { createAttachments } from './lib/attachments.js';
import { useLocalTesseract } from './lib/extract-text.js';
import { createAttachmentReview } from './lib/attachment-review.js';
import { createRoles } from './lib/roles.js';
import { createAttachmentInfo } from './lib/attachment-info.js';
import { createDocIndex } from './lib/doc-index.js';
import { createContacts } from './lib/contacts.js';
import { createLearner } from './lib/learner.js';
import { createHistoryLearner } from './lib/history-learner.js';
import { createAddressBook } from './lib/address-book.js';
import { createAddressJob } from './lib/address-job.js';
import { createOutbox } from './lib/outbox.js';
import { createTextTools } from './lib/text-tools.js';
import { createSpeech, defaultPython } from './lib/speech.js';
import { createScheduler } from './lib/scheduler.js';
import { createApi } from './lib/api.js';

const cfg = loadConfig();
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
const dataFile = (name) => path.join(cfg.dataDir, name);
let scheduler; // wird unten erzeugt; Module, die ihn brauchen, greifen erst zur Laufzeit darauf zu
const getScheduler = () => scheduler;

// --- Grunddienste
const n8n = createN8nClient(cfg.n8n);
const claude = createClaude({ ...cfg.claude, cwd: cfg.dataDir });
const store = createStore(dataFile('state.json'));
const vault = createVault({ dir: cfg.vault.dir, tasksFile: cfg.vault.tasksFile, backupDir: dataFile('backups') });
// Relativ = im App-Ordner (cfg.root), absolut = beliebiger Ort. Nicht im Vault.
const rules = createRules({ file: path.resolve(cfg.root, cfg.rulesFile) });
const matcher = createMatcher({ claude, vault, store });

// --- Anhänge, Entwürfe, Lernen
// Optional: entpacktes tesseract im Datenordner (ohne Installation, siehe docs/installation.md)
if (useLocalTesseract(dataFile('tesseract'))) log('tesseract aus dem Datenordner');
const attachments = createAttachments({
  n8n, tmpDir: dataFile('tmp'), testDir: dataFile('test-anhaenge'), inlineOcr: cfg.attachments?.ocrInline !== false,
  pdfOcr: { enabled: cfg.attachments?.ocrPdf !== false, maxPages: cfg.attachments?.ocrPdfMaxPages ?? 10 },
});
const contacts = createContacts({ store });
const drafts = createDrafts({
  n8n, claude, rules, store, attachments, contacts,
  ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, pseudonymize: cfg.pseudonymize,
  readAttachments: cfg.attachments?.readByAi !== false,
});
const learner = createLearner({ claude, rules, store, ownNames: cfg.ownNames, contacts });
const addressBook = createAddressBook({ file: dataFile('address-book.json'), ownAddresses: [cfg.ownAddress, ...(cfg.ownAliases || [])], log });
const outbox = createOutbox({ n8n, store, getScheduler, drafts, addressBook, log });
const textTools = createTextTools({ claude, ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, pseudonymize: cfg.pseudonymize, nameOf: (a) => addressBook.search(a, { limit: 1 }).find((p) => p.address === String(a).toLowerCase())?.name || '' });
const speech = createSpeech({
  enabled: cfg.speech?.enabled !== false,
  python: cfg.speech?.python || defaultPython(cfg.dataDir),
  script: path.join(cfg.root, 'tools', 'stt-worker.py'),
  model: cfg.speech?.model || 'small',
  language: cfg.speech?.language || 'de',
  tmpDir: dataFile('tmp'),
  log,
});
const history = createHistoryLearner({ addressBook, n8n, claude, rules, contacts, store, ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, log });

// --- Module mit eigenem Hintergrundjob (Intervalle: docs/konfiguration.md)
const roles = createRoles({ drafts, store, ownAddress: cfg.ownAddress, aliases: cfg.ownAliases, getScheduler, log });
const attInfo = createAttachmentInfo({ attachments, store, getScheduler, log });
const docIndex = createDocIndex({ attachments, drafts, file: dataFile('doc-index.json'), getScheduler, ocrVersion: cfg.attachments?.ocrPdf !== false ? 1 : 0, log });
// Modul "Bewertung mit Anhängen": nur mit attachments.review.enabled, sonst läuft die App wie ohne.
const review =
  cfg.attachments?.review?.enabled && cfg.attachments?.readByAi !== false
    ? createAttachmentReview({ attachments, drafts, claude, store, ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, getScheduler, review: cfg.attachments.review, dataDir: cfg.dataDir, log })
    : null;

const addressJob = createAddressJob({ book: addressBook, getScheduler, docIndex });
const poll = cfg.poll;
const extraJobs = [
  ['roles', roles.run, poll.rolesSec ?? 30],
  ['attInfo', attInfo.run, poll.attInfoSec ?? 30],
  ['addressBook', addressJob.run, poll.addressBookSec ?? 120],
  ['outbox', outbox.runDue, poll.outboxSec ?? 30],
];
if (cfg.attachments?.searchDocs !== false) extraJobs.push(['docIndex', docIndex.run, poll.docIndexSec ?? 45]);
if (review) extraJobs.push(['review', review.run, poll.reviewSec ?? 90]);

scheduler = createScheduler({ n8n, drafts, learner, store, poll, log, decorate: review?.decorate, extraJobs });

// --- Webserver (nur localhost)
const handler = createApi({ cfg, scheduler, n8n, vault, rules, store, drafts, matcher, claude, attachments, review, roles, attInfo, docIndex, contacts, history, addressBook, outbox, textTools, speech });
const server = http.createServer(handler);
// Der Arbeitsprozess der Spracherkennung soll mit der App enden
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => (speech.close(), process.exit(0)));
process.on('exit', () => speech.close());
server.listen(cfg.port, '127.0.0.1', () => {
  log(`Mail-App läuft auf http://localhost:${cfg.port}`);
  scheduler.start();
});
