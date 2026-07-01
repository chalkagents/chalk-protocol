// M5 — the sanctioned overrides must not become silent bypasses of the gates. Two guards:
//   1. `amend-spec` INVALIDATES a prior passing review — the adversary approved a DIFFERENT test, so a
//      changed locked test makes that verdict stale and `done` must require a fresh review. Closes the
//      bypass "get a pass, then weaken the locked test, then merge on the stale approval".
//   2. `done --force-review` requires `--why` and logs a decision — the override is auditable, never silent.
// Locked contract.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const conf = (d, fn) => {
  const f = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(f, 'utf8'));
  fn(o.protocol);
  writeFileSync(f, JSON.stringify(o, null, 2));
};
const tid = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].id.slice(0, 12);

// A stub reviewer that reads+ignores the prompt on stdin and always PASSES — lets us drive the P5 flow
// without a real agent (exactly how the pipeline suite stubs its BYO agents).
function project() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-m5-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'reviewer.mjs'), `process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(JSON.stringify({verdict:'pass',findings:[]})));`);
  conf(d, (p) => { p.review = { command: 'node reviewer.mjs', requiredAt: ['per-task'] }; });
  writeFileSync(join(d, 'x.test.mjs'), `import a from 'node:assert'; a.equal(1, 1); console.log('ok');`);
  chalk(d, 'task', 'add', 'feat: thing');
  const id = tid(d);
  chalk(d, 'spec', id, '--criterion', 'does the thing', '--test', 'x.test.mjs');
  chalk(d, 'start', id);
  return { d, id };
}

test('amend-spec — invalidates a prior passing review; done then requires a fresh review', () => {
  const { d, id } = project();
  assert.equal(chalk(d, 'review', id).code, 0, 'the stub reviewer passes');
  // Change the locked test, then re-lock it via the sanctioned path.
  writeFileSync(join(d, 'x.test.mjs'), `import a from 'node:assert'; a.equal(2, 2); console.log('ok');`);
  assert.equal(chalk(d, 'amend-spec', id, '--test', 'x.test.mjs', '--why', 'strengthen the assertion').code, 0);
  // done MUST now refuse — the prior approval was for a different test.
  const done1 = chalk(d, 'done', id);
  assert.notEqual(done1.code, 0, 'done refuses after amend-spec invalidated the review');
  assert.match(done1.out, /review/i, 'the refusal cites the (now stale) review');
  // A fresh review re-opens the gate.
  assert.equal(chalk(d, 'review', id).code, 0);
  assert.equal(chalk(d, 'done', id).code, 0, 'done succeeds after a fresh passing review');
});

test('done --force-review — requires --why and logs a decision (auditable override, never silent)', () => {
  const { d, id } = project();
  assert.notEqual(chalk(d, 'done', id).code, 0, 'done is blocked without a passing review');
  assert.notEqual(chalk(d, 'done', id, '--force-review').code, 0, 'force-review without --why is refused');
  const forced = chalk(d, 'done', id, '--force-review', '--why', 'meta-task that owns the suite');
  assert.equal(forced.code, 0, 'force-review --why overrides the gate');
  assert.match(readFileSync(join(d, '.chalk/decisions.md'), 'utf8'), /Overrode review gate/, 'the override is logged as a decision');
});
