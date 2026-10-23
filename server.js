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
import { createAttachments, useLocalTesseract } from './lib/attachments.js';
import { createAttachmentReview } from './lib/attachment-review.js';
import { createRoles } from './lib/roles.js';
import { createAttachmentInfo } from './lib/attachment-info.js';
import { createDocIndex } from './lib/doc-index.js';
import { createLearner } from './lib/learner.js';
import { createScheduler } from './lib/scheduler.js';
import { createApi } from './lib/api.js';

const cfg = loadConfig();
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

const n8n = createN8nClient(cfg.n8n);
const claude = createClaude({ ...cfg.claude, cwd: cfg.dataDir });
const store = createStore(path.join(cfg.dataDir, 'state.json'));
const vault = createVault({ dir: cfg.vault.dir, tasksFile: cfg.vault.tasksFile, backupDir: path.join(cfg.dataDir, 'backups') });
// Relativ = im App-Ordner (cfg.root), absolut = beliebiger Ort. Nicht im Vault.
const rules = createRules({ file: path.resolve(cfg.root, cfg.rulesFile) });
const matcher = createMatcher({ claude, vault, store });
// Optional: entpacktes tesseract im Datenordner (ohne Installation, siehe README)
if (useLocalTesseract(path.join(cfg.dataDir, 'tesseract'))) log('tesseract aus dem Datenordner');
const attachments = createAttachments({ n8n, tmpDir: path.join(cfg.dataDir, 'tmp'), testDir: path.join(cfg.dataDir, 'test-anhaenge'), inlineOcr: cfg.attachments?.ocrInline !== false });
const drafts = createDrafts({
  n8n, claude, rules, store, attachments,
  ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, pseudonymize: cfg.pseudonymize,
  readAttachments: cfg.attachments?.readByAi !== false,
});
const learner = createLearner({ claude, rules, store, ownNames: cfg.ownNames });
// Modul "Bewertung mit Anhängen": nur mit attachments.review.enabled, sonst läuft die App wie ohne.
let scheduler;
const review =
  cfg.attachments?.review?.enabled && cfg.attachments?.readByAi !== false
    ? createAttachmentReview({ attachments, drafts, claude, store, ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, getScheduler: () => scheduler, review: cfg.attachments.review, dataDir: cfg.dataDir, log })
    : null;
const roles = createRoles({ drafts, store, ownAddress: cfg.ownAddress, aliases: cfg.ownAliases, getScheduler: () => scheduler, log });
const attInfo = createAttachmentInfo({ attachments, store, getScheduler: () => scheduler, log });
const docIndex = createDocIndex({ attachments, drafts, file: path.join(cfg.dataDir, 'doc-index.json'), getScheduler: () => scheduler, log });
scheduler = createScheduler({
  n8n, drafts, learner, store, poll: cfg.poll, log,
  decorate: review?.decorate,
  extraJobs: [['roles', roles.run, cfg.poll.rolesSec ?? 30], ['attInfo', attInfo.run, cfg.poll.attInfoSec ?? 30], ...(cfg.attachments?.searchDocs === false ? [] : [['docIndex', docIndex.run, cfg.poll.docIndexSec ?? 45]]), ...(review ? [['review', review.run, cfg.poll.reviewSec ?? 90]] : [])],
});

const handler = createApi({ cfg, scheduler, n8n, vault, rules, store, drafts, matcher, claude, attachments, review, roles, attInfo, docIndex });
const server = http.createServer(handler);
server.listen(cfg.port, '127.0.0.1', () => {
  log(`Mail-App läuft auf http://localhost:${cfg.port}`);
  scheduler.start();
});
