// Handoff docs — the artifact that lets one session pick up where another stopped. A task that
// blocks, is handed off manually, or churns past its attempt budget should leave a structured doc a
// FRESH session can read (context minification: one session per task). These tests cover the render
// (criteria + changed files + locked tests + pickup), the seq-incrementing storage + task pointer,
// the latestHandoff lookup, and the optional BYO agent enrichment.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { writeHandoff, latestHandoff } from '../lib/handoff.mjs';

// A real git repo with one base commit and an uncommitted change, so changedPaths has something.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'handoff-'));
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  writeFileSync(join(d, 'README.md'), '# x\n'); g('add -A'); g('commit -m base');
  writeFileSync(join(d, 'feature.js'), 'export const f = 1;\n'); // uncommitted impl change
  return d;
}
const mkStore = (root, handoff) => ({ root, protocol: () => ({ handoff }), upsertTask() {}, emitUpdate() {} });
const mkTask = () => ({ id: 'task-abcdef0', title: 'Do the X', state: 'in-progress',
  acceptanceCriteria: [{ text: 'crit one' }, { text: 'crit two' }], tests: [{ path: 'x.test.js' }] });

test('writeHandoff — renders a structured doc, stores it under .chalk/handoffs, records the pointer', () => {
  const d = repo();
  const store = mkStore(d);
  const task = mkTask();

  const rec = writeHandoff(store, task, { reason: 'manual', note: 'stopped mid-way; verify red on the parser' });
  assert.match(rec.path, /^\.chalk\/handoffs\/task-abcdef0-1\.md$/, 'path is <shortId>-<seq>.md, seq starts at 1');
  assert.ok(existsSync(join(d, rec.path)), 'the file it points to exists');
  assert.equal(rec.reason, 'manual');
  assert.equal(rec.seq, 1);
  assert.deepEqual(task.handoff, rec, 'the pointer is recorded on task.handoff');

  const md = readFileSync(join(d, rec.path), 'utf8');
  assert.match(md, /Do the X/, 'title');
  assert.match(md, /task-abcdef0/, 'task id');
  assert.match(md, /in-progress/, 'state');
  assert.match(md, /manual/, 'reason');
  assert.match(md, /crit one[\s\S]*crit two/, 'acceptance criteria');
  assert.match(md, /feature\.js/, 'changed files from the workdir git status');
  assert.match(md, /x\.test\.js/, 'locked tests');
  assert.match(md, /stopped mid-way/, 'the note');
  assert.match(md, /chalk context task-abcdef0/, 'pickup instruction names a fresh-session resume');
});

test('writeHandoff — seq increments across handoffs; latestHandoff returns the most recent (or null)', () => {
  const d = repo();
  const store = mkStore(d);
  const task = mkTask();

  assert.equal(latestHandoff(store, task), null, 'no handoff yet → null');
  const r1 = writeHandoff(store, task, { reason: 'block' });
  const r2 = writeHandoff(store, task, { reason: 'churn' });
  assert.equal(r1.seq, 1);
  assert.equal(r2.seq, 2);
  assert.match(r2.path, /task-abcdef0-2\.md$/);
  assert.deepEqual(latestHandoff(store, task), r2, 'latest is the most recent record');
  assert.ok(existsSync(join(d, latestHandoff(store, task).path)), 'the latest pointer resolves to a real file');
});

test('writeHandoff — an optional BYO agent enriches the narrative; absent → template only (no model call)', () => {
  const d = repo();
  const task = mkTask();

  // No command configured → the doc is produced from the template alone (this very call proves it
  // needs no model: an unset command must not throw or block).
  const plain = readFileSync(join(d, writeHandoff(mkStore(d), task, { reason: 'manual' }).path), 'utf8');
  assert.doesNotMatch(plain, /AGENT-SAYS/, 'no narrative without a command');

  // A configured command's stdout is spliced into the doc.
  const cmd = `node -e "process.stdin.on('data',()=>{});console.log('AGENT-SAYS: root cause is the off-by-one')"`;
  const enriched = readFileSync(join(d, writeHandoff(mkStore(d, { command: cmd }), mkTask(), { reason: 'manual' }).path), 'utf8');
  assert.match(enriched, /AGENT-SAYS: root cause is the off-by-one/, 'agent narrative is included');
});

test('writeHandoff — a failing BYO agent falls back to template-only, never throwing', () => {
  const d = repo();
  const rec = writeHandoff(mkStore(d, { command: 'node -e "process.exit(1)"' }), mkTask(), { reason: 'block' });
  const md = readFileSync(join(d, rec.path), 'utf8');
  assert.match(md, /Do the X/, 'the template still renders when the agent exits nonzero');
  assert.match(md, /## Notes/, 'the Notes section is present with no spliced narrative');
});
