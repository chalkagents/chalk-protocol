import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceIdentity, approvalSourceIdentity } from '../lib/verification-record.mjs';
import { startVerificationMonitor } from '../lib/verification-command.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-approval-source-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  return { root, git };
}
function matching(root) {
  const full = sourceIdentity(root), endpoint = approvalSourceIdentity(root);
  assert.equal(full.status, 'known', full.error); assert.equal(endpoint.status, 'known', endpoint.error);
  assert.equal(endpoint.method, full.method); assert.deepEqual(endpoint.files, full.files);
  return endpoint;
}

test('approval admission re-enumerates the same effective source while execution retains full observation', t => {
  const { root, git } = fixture(t);
  fs.writeFileSync(join(root, '.gitignore'), 'generated/\n');
  fs.mkdirSync(join(root, 'generated'));
  fs.writeFileSync(join(root, 'generated/tracked.txt'), 'locked'); git('add', '-f', 'generated/tracked.txt');
  fs.writeFileSync(join(root, 'generated/ignored.txt'), 'output');
  fs.writeFileSync(join(root, 'source.txt'), 'AAAA');
  const first = matching(root);
  assert.equal(first.files['generated/ignored.txt'], undefined);
  assert.ok(first.files['generated/tracked.txt']); assert.ok(first.files['source.txt']);
  assert.throws(() => startVerificationMonitor(root, {}, first), /cannot establish execution observation/);
  fs.writeFileSync(join(root, 'source.txt'), 'BBBB');
  assert.notEqual(matching(root).files['source.txt'], first.files['source.txt']);
  fs.writeFileSync(join(root, '.gitignore'), '');
  assert.ok(matching(root).files['generated/ignored.txt']);
  fs.rmSync(join(root, 'generated/tracked.txt'));
  assert.equal(matching(root).files['generated/tracked.txt'], 'deleted');
  fs.symlinkSync('source.txt', join(root, 'link.txt')); matching(root);
  fs.symlinkSync('../outside.txt', join(root, 'escape.txt'));
  assert.equal(approvalSourceIdentity(root).status, 'unknown');
});

test('approval admission preserves initialized and uninitialized Gitlink fingerprints', t => {
  const { root, git } = fixture(t);
  fs.mkdirSync(join(root, 'nested'));
  const nested = (...args) => execFileSync('git', args, { cwd: join(root, 'nested'), encoding: 'utf8' });
  nested('init', '-q'); nested('config', 'user.name', 'Fixture'); nested('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(join(root, 'nested/source.txt'), 'AAAA'); nested('add', '.'); nested('commit', '-qm', 'fixture');
  const head = nested('rev-parse', 'HEAD').trim();
  git('update-index', '--add', '--cacheinfo', `160000,${head},nested`);
  const first = matching(root);
  fs.writeFileSync(join(root, 'nested/source.txt'), 'BBBB');
  assert.notEqual(matching(root).files.nested, first.files.nested);
  fs.rmSync(join(root, 'nested/.git'), { recursive: true }); matching(root);
});
