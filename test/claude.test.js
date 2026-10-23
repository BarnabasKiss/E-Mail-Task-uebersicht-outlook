import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaude } from '../lib/claude.js';

test('Beendet sich die CLI sofort, gibt es einen Fehler und keinen Absturz des Prozesses', async () => {
  const claude = createClaude({ path: process.execPath, model: 'x', cwd: process.cwd(), timeoutMs: 5000 });
  // node mit den Claude-Argumenten (-p ...) beendet sich sofort mit Fehler, noch bevor der Prompt gelesen wird
  await assert.rejects(claude.run('x'.repeat(2_000_000)), /Claude beendet mit Code|bad option|EPIPE/i);
});
