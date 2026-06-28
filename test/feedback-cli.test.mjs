// `chalk feedback` — the product loop end-to-end: collect signals → analysis agent → file
// improvement issues (dedup + severity floor + dry-run, like retro) → archive processed signals.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...a) => spawnSync('node', [CLI, ...a], { cwd, encoding: 'utf8' });

// A stub gh: record `issue create` titles to a file; answer `issue list` with given open titles.
function stubGh(d, createsFile, openTitles = []) {
  const p = join(d, 'gh.mjs');
  writeFileSync(p, `import {appendFileSync} from 'node:fs'; const a=process.argv.slice(2); const has=(...x)=>x.every(y=>a.includes(y));
    if(has('issue','create')){ appendFileSync(${JSON.stringify(createsFile)}, a[a.indexOf('--title')+1]+'\\n'); console.log('https://github.com/o/r/issues/1'); }
    else if(has('issue','list')) console.log(${JSON.stringify(JSON.stringify(openTitles.map((t) => ({ title: t }))))});
    else console.log('[]');`);
  return `node ${p}`;
}
// A stub feedback agent that emits a fixed issue set (reads + ignores stdin).
function agent(d, issues) {
  const p = join(d, 'agent.mjs');
  writeFileSync(p, `process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify({ issues }))}));`);
  return `node ${p}`;
}
function project(issues, openTitles = []) {
  const d = mkdtempSync(join(tmpdir(), 'feedback-cli-'));
  chalk(d, 'init', '--name', 'd');
  mkdirSync(join(d, '.chalk/feedback'), { recursive: true });
  writeFileSync(join(d, '.chalk/feedback/users.md'), 'Onboarding is confusing; dark mode requested.');
  const createsFile = join(d, 'creates.txt');
  const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f));
  o.protocol.feedback = { command: agent(d, issues) };
  o.protocol.github = { ...(o.protocol.github || {}), command: stubGh(d, createsFile, openTitles) };
  writeFileSync(f, JSON.stringify(o, null, 2));
  return { d, createsFile };
}
const archived = (d) => existsSync(join(d, '.chalk/feedback/archive')) ? readdirSync(join(d, '.chalk/feedback/archive')) : [];

test('chalk feedback — files an improvement issue from a signal and archives the signal', () => {
  const { d, createsFile } = project([{ title: 'feat: clearer onboarding', severity: 'high', body: 'b' }]);
  const r = chalk(d, 'feedback');
  assert.equal(r.status, 0);
  assert.match(readFileSync(createsFile, 'utf8'), /clearer onboarding/, 'issue filed via gh');
  assert.deepEqual(archived(d), ['users.md'], 'signal archived so it is not re-analyzed');
  assert.equal(existsSync(join(d, '.chalk/feedback/users.md')), false, 'moved out of the inbox');
});

test('chalk feedback — dedup (skips a similar open issue) and severity floor (defers low)', () => {
  const { d, createsFile } = project(
    [{ title: 'feat: clearer onboarding flow', severity: 'high' }, { title: 'chore: tweak copy', severity: 'low' }],
    ['Clearer onboarding'], // an already-open issue with a similar title
  );
  const r = chalk(d, 'feedback');
  assert.equal(r.status, 0);
  assert.equal(existsSync(createsFile), false, 'nothing filed: one deduped, one below the med floor');
  assert.match(`${r.stdout}${r.stderr}`, /defer/i);
});

test('chalk feedback — --dry-run files nothing and leaves signals in place', () => {
  const { d, createsFile } = project([{ title: 'feat: x', severity: 'high' }]);
  chalk(d, 'feedback', '--dry-run');
  assert.equal(existsSync(createsFile), false, 'no gh issue create in dry-run');
  assert.equal(existsSync(join(d, '.chalk/feedback/users.md')), true, 'signal NOT archived in dry-run');
});

test('chalk feedback — no signals → clean exit, agent not invoked', () => {
  const d = mkdtempSync(join(tmpdir(), 'feedback-cli-'));
  chalk(d, 'init', '--name', 'd');
  const ran = join(d, 'ran');
  const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f));
  o.protocol.feedback = { command: `node -e "require('fs').writeFileSync('${ran.replace(/\\/g, '/')}','1')"` };
  writeFileSync(f, JSON.stringify(o, null, 2));
  const r = chalk(d, 'feedback');
  assert.equal(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /no signals/i);
  assert.equal(existsSync(ran), false, 'the agent was never called');
});
