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
import { createLearner } from './lib/learner.js';
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
const attachments = createAttachments({ n8n, tmpDir: dataFile('tmp'), testDir: dataFile('test-anhaenge'), inlineOcr: cfg.attachments?.ocrInline !== false });
const drafts = createDrafts({
  n8n, claude, rules, store, attachments,
  ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, pseudonymize: cfg.pseudonymize,
  readAttachments: cfg.attachments?.readByAi !== false,
});
const learner = createLearner({ claude, rules, store, ownNames: cfg.ownNames });

// --- Module mit eigenem Hintergrundjob (Intervalle: docs/konfiguration.md)
const roles = createRoles({ drafts, store, ownAddress: cfg.ownAddress, aliases: cfg.ownAliases, getScheduler, log });
const attInfo = createAttachmentInfo({ attachments, store, getScheduler, log });
const docIndex = createDocIndex({ attachments, drafts, file: dataFile('doc-index.json'), getScheduler, log });
// Modul "Bewertung mit Anhängen": nur mit attachments.review.enabled, sonst läuft die App wie ohne.
const review =
  cfg.attachments?.review?.enabled && cfg.attachments?.readByAi !== false
    ? createAttachmentReview({ attachments, drafts, claude, store, ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, getScheduler, review: cfg.attachments.review, dataDir: cfg.dataDir, log })
    : null;

const poll = cfg.poll;
const extraJobs = [
  ['roles', roles.run, poll.rolesSec ?? 30],
  ['attInfo', attInfo.run, poll.attInfoSec ?? 30],
];
if (cfg.attachments?.searchDocs !== false) extraJobs.push(['docIndex', docIndex.run, poll.docIndexSec ?? 45]);
if (review) extraJobs.push(['review', review.run, poll.reviewSec ?? 90]);

scheduler = createScheduler({ n8n, drafts, learner, store, poll, log, decorate: review?.decorate, extraJobs });

// --- Webserver (nur localhost)
const handler = createApi({ cfg, scheduler, n8n, vault, rules, store, drafts, matcher, claude, attachments, review, roles, attInfo, docIndex });
const server = http.createServer(handler);
server.listen(cfg.port, '127.0.0.1', () => {
  log(`Mail-App läuft auf http://localhost:${cfg.port}`);
  scheduler.start();
});
