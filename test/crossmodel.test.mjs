// M3 — cross-model adversarial review. The P5 reviewer must be an INDEPENDENT check: when it shares the
// executor's model, self-preference bias and correlated blind spots undermine it (research: self-preference
// bias arxiv 2410.21819; reviewer/generator fail together arxiv 2604.08401; cross-family judging is the fix
// and has "no human analog"). Chalk can't force a model choice (the agent is BYO), but `chalk doctor` must
// SURFACE the risk so an autonomous run isn't graded by a clone of its own author. Locked contract.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameModelFamily, modelSignature } from '../lib/config.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-xmodel-'));
const conf = (d, fn) => {
  const f = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(f, 'utf8'));
  fn(o.protocol);
  writeFileSync(f, JSON.stringify(o, null, 2));
};

test('modelSignature — extracts the base binary and the --model value', () => {
  assert.deepEqual(modelSignature('claude -p --agent chalk-executor'), { bin: 'claude', model: '' });
  assert.deepEqual(modelSignature('claude -p --model claude-opus-4'), { bin: 'claude', model: 'claude-opus-4' });
  assert.deepEqual(modelSignature('claude --model=sonnet -p'), { bin: 'claude', model: 'sonnet' });
  assert.deepEqual(modelSignature(''), { bin: '', model: '' });
});

test('sameModelFamily — same binary + same/absent model is flagged; a different model or tool is not', () => {
  // The live failure this guards: executor and reviewer both `claude -p` with no distinguishing model.
  assert.equal(sameModelFamily('claude -p --agent chalk-executor', 'claude -p --agent chalk-reviewer'), true);
  // A different model on the reviewer breaks the self-preference loop → not flagged.
  assert.equal(sameModelFamily('claude -p --model opus', 'claude -p --model sonnet'), false);
  // A different tool entirely → not flagged.
  assert.equal(sameModelFamily('claude -p', 'codex exec'), false);
  // Nothing to compare when either side is unconfigured.
  assert.equal(sameModelFamily('', 'claude -p'), false);
  assert.equal(sameModelFamily('claude -p', ''), false);
});

test('doctor — warns when the reviewer shares the executor model; clears when cross-model', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'demo');
  conf(d, (p) => {
    p.executor = { command: 'claude -p --agent chalk-executor' };
    p.review = { command: 'claude -p --agent chalk-reviewer', requiredAt: ['per-task'] };
  });
  let r = chalk(d, 'doctor');
  assert.match(r.out, /same model/i, 'doctor warns when the adversarial reviewer shares the executor model');

  conf(d, (p) => { p.review = { command: 'codex exec', requiredAt: ['per-task'] }; });
  r = chalk(d, 'doctor');
  assert.doesNotMatch(r.out, /same model/i, 'a different reviewer tool clears the warning');
});
