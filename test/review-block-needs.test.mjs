// Reviewer-induced auto-blocks get their own `--needs review` category (#46). Before this, a
// review BLOCK and a genuinely human-blocking stage failure both parked as `needs:human-input`,
// so triage that routes by block.needs treated "chalk's own reviewer refuted the change — the
// agent must fix the findings" identically to "waiting on credentials/a decision". Now: the
// taxonomy accepts `review` (chalk block validation), BOTH review-block emitters (the pipeline's
// fix-loop exhaustion and the run loop's verdict block) park with needs:review, a genuine
// non-review stage failure stays human-input, and `chalk next` surfaces a review block with its
// own agent-owned shape instead of the human-dependency one. Locked contract for the task
// tracking issue #46.
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-needs-'));
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));

// A working repo whose origin is a local bare repo, so the pipeline's push works offline.
function repoWithBare() {
  const bare = scratch();
  execSync('git init --bare -b main', { cwd: bare, stdio: 'pipe' });
  const d = scratch();
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  writeFileSync(join(d, 'README.md'), '# tmp\n'); g('add README.md'); g('commit -m init');
  g(`remote add origin ${bare}`); g('push -u origin main');
  return d;
}
const stubGh = (d) => {
  const p = join(d, 'fake-gh.mjs');
  writeFileSync(p, `const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('pr','create')) console.log('https://github.com/o/r/pull/42');
    else if(has('pr','checks')) console.log(JSON.stringify([{bucket:'pass'}]));
    else console.log(JSON.stringify([{number:7,title:'Add feature',url:'u',body:'- [ ] do it',labels:[]}]));`);
  return `node ${p}`;
};

test('taxonomy — `chalk block --needs review` is accepted; bogus values still rejected', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  chalk(d, 'task', 'add', 'T');
  const id = tasksOf(d)[0].id;
  assert.equal(chalk(d, 'block', id, '--needs', 'bogus', '--reason', 'r').code, 1, 'unknown --needs rejected');
  assert.equal(chalk(d, 'block', id, '--needs', 'review', '--reason', 'reviewer said no').code, 0, 'review is a valid category');
  assert.equal(tasksOf(d)[0].block.needs, 'review');
});

test('pipeline — an unfixable review BLOCK parks with needs:review; chalk next surfaces it as agent-owned', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n'); writeFileSync('feature.test.js','// asserts feature\\n');`);
  // A reviewer that ALWAYS blocks — the fix loop can't turn it green.
  writeFileSync(join(d, 'rev.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log(JSON.stringify({verdict:'block',findings:[{severity:'high',area:'correctness',note:'UNFIXABLE_FINDING'}]}));`);
  conf(d, (o) => { o.github.command = stubGh(d); o.worktree.dir = scratch(); o.executor = { command: `node ${join(d, 'exec.mjs')}` };
    o.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; o.handoff.maxAttempts = 1; });
  chalk(d, 'issue', 'pull');
  assert.equal(chalk(d, 'pipeline').code, 2, 'pipeline exits 2 with a blocked task');
  const t = tasksOf(d)[0];
  assert.equal(t.state, 'blocked');
  assert.equal(t.block.needs, 'review', 'reviewer-induced block gets the review category, not human-input');
  assert.match(t.block.reason, /UNFIXABLE_FINDING/, 'the finding text still travels in the reason');
  // `chalk next` renders it as the agent's own work, not a pending human dependency.
  const next = chalk(d, 'next');
  assert.match(next.out, /review-blocked/i, 'review blocks get their own shape');
  assert.match(next.out, /fix the findings.*chalk review/i, 'tells the agent the unblock path');
  assert.doesNotMatch(next.out, /needs human-input/, 'not conflated with a human dependency');
});

test('pipeline — a genuine non-review stage failure still parks with needs:human-input', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  // Executor makes NO change → the commit stage dies ("nothing to commit"): a real stage failure.
  writeFileSync(join(d, 'exec.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{}`);
  conf(d, (o) => { o.github.command = stubGh(d); o.worktree.dir = scratch(); o.executor = { command: `node ${join(d, 'exec.mjs')}` }; o.requireTest = false; });
  chalk(d, 'issue', 'pull');
  assert.equal(chalk(d, 'pipeline').code, 2);
  const t = tasksOf(d)[0];
  assert.equal(t.state, 'blocked');
  assert.equal(t.block.needs, 'human-input', 'a stage failure is NOT reviewer-induced — stays human-input');
});

test('run loop — a blocking review verdict parks with needs:review; the verify-RED block stays human-input', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  writeFileSync(join(d, 'exec.mjs'), `import {readFileSync,writeFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('f.test.js','// t\\n');`);
  writeFileSync(join(d, 'rev.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log(JSON.stringify({verdict:'block',findings:[]}));`);
  conf(d, (o) => { o.executor = { command: `node ${join(d, 'exec.mjs')}` }; o.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; });
  chalk(d, 'task', 'add', 'T');
  chalk(d, 'spec', tasksOf(d)[0].id, '--criterion', 'x');
  chalk(d, 'run', '--max', '1');
  assert.equal(tasksOf(d)[0].state, 'blocked');
  assert.equal(tasksOf(d)[0].block.needs, 'review', 'run-loop review block uses the review category');
  // Contrast: verify-RED (no reviewer involved) still parks as human-input.
  const d2 = scratch();
  chalk(d2, 'init', '--name', 'p');
  writeFileSync(join(d2, 'exec.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{}`);
  conf(d2, (o) => { o.executor = { command: `node ${join(d2, 'exec.mjs')}` }; o.verify = { ...o.verify, test: 'node -e "process.exit(1)"' }; });
  chalk(d2, 'task', 'add', 'T');
  chalk(d2, 'spec', tasksOf(d2)[0].id, '--criterion', 'x');
  chalk(d2, 'run', '--max', '1');
  assert.equal(tasksOf(d2)[0].block.needs, 'human-input', 'verify-RED is not reviewer-induced');
});
