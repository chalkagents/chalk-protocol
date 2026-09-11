import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceIdentity } from '../lib/verification-record.mjs';

test('a Git pathname beginning with a UTF-8 BOM is preserved exactly', t => {
  const root = realpathSync(mkdtempSync(`${tmpdir()}${sep}chalk-bom-path-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const pathname = '\uFEFFsource.js';
  writeFileSync(`${root}${sep}${pathname}`, 'source');
  execFileSync('git', ['add', '-A'], { cwd: root });

  const identity = sourceIdentity(root, { regression: { dir: '.chalk/held-out' } });
  assert.equal(identity.status, 'known');
  assert.equal(typeof identity.files[pathname], 'string');
  assert.equal(Object.hasOwn(identity.files, 'source.js'), false,
    'the leading BOM is pathname data, not a decoding signature');
});

test('a non-UTF-8 Git pathname fails closed or is rejected by the filesystem', t => {
  const root = realpathSync(mkdtempSync(`${tmpdir()}${sep}chalk-nonutf8-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });

  const rawPath = Buffer.concat([Buffer.from(`${root}${sep}invalid-`), Buffer.from([0xff])]);
  try { writeFileSync(rawPath, 'source'); }
  catch (error) {
    assert.ok(['EILSEQ', 'EINVAL', 'ENOENT', 'ENOTSUP'].includes(error.code), error.message);
    return;
  }
  execFileSync('git', ['add', '-A'], { cwd: root });

  const identity = sourceIdentity(root, { regression: { dir: '.chalk/held-out' } });
  assert.equal(identity.status, 'unknown');
  assert.match(identity.error, /cannot decode Git input paths as UTF-8/);
  assert.equal(Object.keys(identity.files).some(path => path.includes('\uFFFD')), false,
    'lossy replacement-character paths never enter the source manifest');
});

test('a non-UTF-8 Git policy pathname fails closed or is rejected by the filesystem', t => {
  const root = realpathSync(mkdtempSync(`${tmpdir()}${sep}chalk-nonutf8-policy-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });

  const rawPath = Buffer.concat([Buffer.from(`${root}${sep}ignore-`), Buffer.from([0xff])]);
  try { writeFileSync(rawPath, 'generated/\n'); }
  catch (error) {
    assert.ok(['EILSEQ', 'EINVAL', 'ENOENT', 'ENOTSUP'].includes(error.code), error.message);
    return;
  }
  appendFileSync(`${root}${sep}.git${sep}config`, Buffer.concat([
    Buffer.from('\n[core]\n\texcludesFile = '), rawPath, Buffer.from('\n')
  ]));

  const identity = sourceIdentity(root, { regression: { dir: '.chalk/held-out' } });
  assert.equal(identity.status, 'unknown');
  assert.match(identity.error, /cannot decode Git ignore-policy path as UTF-8/);
  assert.equal(Object.keys(identity.policyInputs).some(path => path.includes('\uFFFD')), false,
    'lossy replacement-character paths never enter the policy manifest');
});
