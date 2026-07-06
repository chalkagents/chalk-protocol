// Cross-model review for opencode (#85) — modelSignature parsed only the command string, so the
// bundled opencode adapters (`node …/opencode-exec.mjs`, model via CHALK_OPENCODE_MODEL) reported
// { bin: 'node', model: '' }: the doctor's same-model warning was blind to the real identity in
// both directions (false positives against any other node script, no model to compare). Contract:
// opencode adapter commands resolve to bin 'opencode' + the env-var model, an explicit --model
// still wins, and everything else stays conservative. Locked contract for task-9bfdd13.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameModelFamily, modelSignature } from '../lib/config.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, env, ...args) => {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const EXEC = 'node /repo/bin/adapters/opencode-exec.mjs';
const JSON_ = 'node /repo/bin/adapters/opencode-json.mjs';
const MODEL = { CHALK_OPENCODE_MODEL: 'anthropic/claude-opus-4-8' };

test('modelSignature — an opencode adapter resolves to bin opencode + the CHALK_OPENCODE_MODEL model', () => {
  assert.deepEqual(modelSignature(EXEC, MODEL), { bin: 'opencode', model: 'anthropic/claude-opus-4-8' });
  assert.deepEqual(modelSignature(JSON_, MODEL), { bin: 'opencode', model: 'anthropic/claude-opus-4-8' });
  assert.deepEqual(modelSignature(EXEC, {}), { bin: 'opencode', model: '' }, 'no env var → no model identity (conservative)');
});

test('modelSignature — an explicit --model on the command wins over the env var; non-opencode is untouched', () => {
  assert.deepEqual(modelSignature(`${EXEC} --model x/y`, MODEL), { bin: 'opencode', model: 'x/y' });
  assert.deepEqual(modelSignature('node some-other-agent.mjs', MODEL), { bin: 'node', model: '' }, 'the env fallback applies ONLY to the opencode adapters');
  assert.deepEqual(modelSignature('claude -p --agent chalk-executor', MODEL), { bin: 'claude', model: '' });
});

test('sameModelFamily — two opencode adapters under the same CHALK_OPENCODE_MODEL are the same family', () => {
  assert.equal(sameModelFamily(EXEC, JSON_, MODEL), true, 'the self-preference warning can now fire for opencode users');
  assert.equal(sameModelFamily(EXEC, `${JSON_} --model other/model`, MODEL), false, 'a reviewer pinned to a different explicit model clears it');
  assert.equal(sameModelFamily(EXEC, 'claude -p --agent chalk-reviewer', MODEL), false, 'a different tool clears it');
  assert.equal(sameModelFamily(EXEC, 'node my-claude-wrapper.mjs', MODEL), false, 'an opencode adapter no longer false-matches an arbitrary node script');
});

test('doctor — the same-model warning fires for an all-opencode setup (was inert before the env fallback)', () => {
  const d = mkdtempSync(join(tmpdir(), 'xmodel-env-'));
  chalk(d, {}, 'init', '--name', 'demo');
  const f = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(f, 'utf8'));
  o.protocol.executor = { command: EXEC };
  o.protocol.review = { command: JSON_, requiredAt: ['per-task'] };
  writeFileSync(f, JSON.stringify(o, null, 2));
  const r = chalk(d, MODEL, 'doctor');
  assert.match(r.out, /same model/i, 'doctor sees the shared env-var model through the adapter commands');
});
