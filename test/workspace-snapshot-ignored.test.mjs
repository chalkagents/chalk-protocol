// Read-only enforcement snapshots every relevant workspace file, including git-ignored paths.
import { test } from 'node:test';
import assert from 'node:assert';
import { chmodSync, mkdtempSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runAgent } from '../lib/agent-runner.mjs';
import { snapshotChanges, workspaceSnapshot } from '../lib/workspace-snapshot.mjs';

const scratch = (name = 'chalk-snapshot-') => mkdtempSync(join(tmpdir(), name));
const git = (root, args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};

function workspace() {
  const root = scratch();
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Snapshot Test']);
  git(root, ['config', 'user.email', 'snapshot@example.invalid']);
  writeFileSync(join(root, '.gitignore'), 'ignored-*.txt\nnode_modules/\n.chalk/held-out/\n');
  writeFileSync(join(root, 'tracked-clean.txt'), 'tracked clean before\n');
  writeFileSync(join(root, 'tracked-dirty.txt'), 'tracked committed\n');
  writeFileSync(join(root, 'ignored-edited.txt'), 'ignored before\n');
  writeFileSync(join(root, 'ignored-deleted.txt'), 'delete me\n');
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'package-cache.txt'), 'cache before\n');
  mkdirSync(join(root, '.chalk', 'held-out'), { recursive: true });
  writeFileSync(join(root, '.chalk', 'held-out', 'secret.test.mjs'), 'hidden before\n');
  const outside = join(scratch('chalk-snapshot-outside-'), 'outside.txt');
  writeFileSync(outside, 'outside before\n');
  symlinkSync(outside, join(root, 'outside-link'));
  git(root, ['add', '.gitignore', 'tracked-clean.txt', 'tracked-dirty.txt', 'outside-link']);
  git(root, ['commit', '-qm', 'fixture']);
  return { root, outside };
}

test('workspace snapshots detect ignored edit/create/delete without traversing excluded trees or symlink targets', () => {
  const { root, outside } = workspace();
  writeFileSync(join(root, 'tracked-dirty.txt'), 'dirty before snapshot\n');
  const before = workspaceSnapshot(root);

  writeFileSync(join(root, 'tracked-clean.txt'), 'tracked clean after\n');
  writeFileSync(join(root, 'tracked-dirty.txt'), 'dirty after snapshot\n');
  writeFileSync(join(root, 'ordinary-untracked.txt'), 'ordinary new\n');
  writeFileSync(join(root, 'ignored-edited.txt'), 'ignored after\n');
  writeFileSync(join(root, 'ignored-created.txt'), 'ignored new\n');
  unlinkSync(join(root, 'ignored-deleted.txt'));
  writeFileSync(join(root, 'node_modules', 'package-cache.txt'), 'cache after\n');
  writeFileSync(join(root, '.chalk', 'held-out', 'secret.test.mjs'), 'hidden after\n');
  writeFileSync(join(root, '.git', 'chalk-sentinel'), 'git internals changed\n');
  writeFileSync(outside, 'outside after\n');

  const changed = snapshotChanges(before, workspaceSnapshot(root));
  assert.deepEqual(changed, [
    'ignored-created.txt',
    'ignored-deleted.txt',
    'ignored-edited.txt',
    'ordinary-untracked.txt',
    'tracked-clean.txt',
    'tracked-dirty.txt',
  ]);
  assert.ok(!changed.some((path) => path.startsWith('.git/') || path.startsWith('node_modules/') || path.startsWith('.chalk/held-out/')));
  assert.ok(!changed.includes('outside-link'), 'hash the symlink itself instead of following its external target');
});

test('Agent Runner refuses ignored-file mutation for read-only roles and leaves workspace-write roles unaffected', () => {
  const helperRoot = scratch('chalk-snapshot-agent-');
  const agent = join(helperRoot, 'mutating-agent.mjs');
  writeFileSync(agent, `#!/usr/bin/env node
import { unlinkSync, writeFileSync } from 'node:fs';
writeFileSync('ignored-edited.txt', 'agent edited\\n');
writeFileSync('ignored-created.txt', 'agent created\\n');
try { unlinkSync('ignored-deleted.txt'); } catch {}
process.stdout.write('agent result');
`);
  chmodSync(agent, 0o755);
  const profile = {
    name: 'malicious', adapter: 'raw-command',
    command: `${JSON.stringify(process.execPath)} ${JSON.stringify(agent)}`,
    identity: null, capabilities: null, options: {},
  };

  const readOnly = workspace();
  const refused = runAgent('planner', { profile, context: 'inspect', cwd: readOnly.root });
  assert.equal(refused.status, 'failed');
  assert.equal(refused.text, '');
  const diagnostics = refused.diagnostics.map((item) => `${item.code}: ${item.message}`).join('\n');
  assert.match(diagnostics, /read-only-mutation/);
  for (const path of ['ignored-created.txt', 'ignored-deleted.txt', 'ignored-edited.txt']) assert.match(diagnostics, new RegExp(path));

  const writable = workspace();
  const allowed = runAgent('executor', { profile, context: 'write', cwd: writable.root, stream: false });
  assert.equal(allowed.status, 'ok', JSON.stringify(allowed.diagnostics));
  assert.equal(allowed.text, 'agent result');
});
