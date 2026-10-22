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
const attachments = createAttachments({ n8n, tmpDir: path.join(cfg.dataDir, 'tmp') });
const drafts = createDrafts({
  n8n, claude, rules, store, attachments,
  ownNames: cfg.ownNames, ownAddress: cfg.ownAddress, pseudonymize: cfg.pseudonymize,
  readAttachments: cfg.attachments?.readByAi !== false,
});
const learner = createLearner({ claude, rules, store, ownNames: cfg.ownNames });
const scheduler = createScheduler({ n8n, drafts, learner, store, poll: cfg.poll, log });

const handler = createApi({ cfg, scheduler, n8n, vault, rules, store, drafts, matcher, claude, attachments });
const server = http.createServer(handler);
server.listen(cfg.port, '127.0.0.1', () => {
  log(`Mail-App läuft auf http://localhost:${cfg.port}`);
  scheduler.start();
});
