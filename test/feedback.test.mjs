// Feedback loop — closing the product cycle. External signals (user feedback, metrics, production
// errors) dropped under .chalk/feedback/ are collected into a digest and handed to a BYO analysis
// agent that proposes improvement issues. These cover signal collection (which files, exclusions,
// inline input, empty case) and the agent run/parse (mirroring runRetro).
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectSignals, runFeedback } from '../lib/feedback.mjs';

function project() {
  const d = mkdtempSync(join(tmpdir(), 'feedback-'));
  mkdirSync(join(d, '.chalk', 'feedback', 'archive'), { recursive: true });
  return d;
}
const store = (root, feedback) => ({ root, protocol: () => ({ feedback }) });

test('collectSignals — gathers .md/.txt/.json under .chalk/feedback, excludes archive/, adds inline input', () => {
  const d = project();
  writeFileSync(join(d, '.chalk/feedback/users.md'), 'Users say onboarding is confusing.');
  writeFileSync(join(d, '.chalk/feedback/errors.json'), '{"top":"NPE in parser"}');
  writeFileSync(join(d, '.chalk/feedback/notes.png'), 'binary-ish');           // wrong extension → ignored
  writeFileSync(join(d, '.chalk/feedback/archive/old.md'), 'already processed'); // archived → ignored

  const { digest, files } = collectSignals(store(d), { input: 'CEO: ship dark mode' });
  assert.match(digest, /onboarding is confusing/);
  assert.match(digest, /NPE in parser/);
  assert.match(digest, /ship dark mode/, 'inline input included');
  assert.doesNotMatch(digest, /already processed/, 'archive/ excluded');
  assert.doesNotMatch(digest, /binary-ish/, 'non-signal extension excluded');
  assert.deepEqual(files.map((f) => f.split('/').pop()).sort(), ['errors.json', 'users.md'], 'source files reported for archiving');
});

test('collectSignals — empty digest and no files when there are no signals', () => {
  const r = collectSignals(store(project()), {});
  assert.equal(r.digest.trim(), '');
  assert.deepEqual(r.files, []);
});

test('runFeedback — runs the BYO agent and parses { issues } tolerantly', () => {
  const d = project();
  const cmd = `node -e "process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log('prose then '+JSON.stringify({issues:[{title:'fix: clearer onboarding',severity:'high',body:'b',labels:['enhancement']}]})))"`;
  const r = runFeedback(store(d, { command: cmd }), 'onboarding is confusing');
  assert.equal(r.status, 'ok');
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].title, 'fix: clearer onboarding');
});

test('runFeedback — unconfigured / non-JSON handled', () => {
  const d = project();
  assert.equal(runFeedback(store(d, { command: '' }), 'x').status, 'unconfigured');
  assert.equal(runFeedback(store(d, { command: 'node -e "console.log(\\"no json\\")"' }), 'x').status, 'error');
});
