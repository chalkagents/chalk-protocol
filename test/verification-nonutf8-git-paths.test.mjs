import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, writeFileSync, rmSync, realpathSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
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

test('a Git index location beginning with a UTF-8 BOM is preserved exactly', t => {
  const root = realpathSync(mkdtempSync(`${tmpdir()}${sep}chalk-bom-index-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const index = `${root}${sep}.git${sep}\uFEFFindex`;
  const env = { ...process.env, GIT_INDEX_FILE: index };
  execFileSync('git', ['read-tree', '--empty'], { cwd: root, env });
  const previous = process.env.GIT_INDEX_FILE;
  let identity;
  try { process.env.GIT_INDEX_FILE = index; identity = sourceIdentity(root, { regression: { dir: '.chalk/held-out' } }); }
  finally { if (previous === undefined) delete process.env.GIT_INDEX_FILE; else process.env.GIT_INDEX_FILE = previous; }
  assert.equal(identity.status, 'known', identity.error);
  assert.equal(Object.hasOwn(identity.membershipInputs, index), true);
  assert.equal(Object.hasOwn(identity.membershipInputs, index.replace('\uFEFF', '')), false,
    'the leading BOM is retained in the Git membership authority');
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

test('a non-UTF-8 included Git configuration path fails closed', t => {
  const root = realpathSync(mkdtempSync(`${tmpdir()}${sep}chalk-nonutf8-include-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const rawPath = Buffer.concat([Buffer.from(`${root}${sep}include-`), Buffer.from([0xff])]);
  try { writeFileSync(rawPath, ''); }
  catch (error) {
    assert.ok(['EILSEQ', 'EINVAL', 'ENOENT', 'ENOTSUP'].includes(error.code), error.message);
    return;
  }
  appendFileSync(`${root}${sep}.git${sep}config`, Buffer.concat([
    Buffer.from('\n[include]\n\tpath = '), rawPath, Buffer.from('\n')
  ]));
  const identity = sourceIdentity(root, { regression: { dir: '.chalk/held-out' } });
  assert.equal(identity.status, 'unknown');
  assert.match(identity.error, /cannot decode included Git configuration paths as UTF-8/);
});

test('a non-UTF-8 Git metadata location fails closed', t => {
  const root = realpathSync(mkdtempSync(`${tmpdir()}${sep}chalk-nonutf8-gitdir-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const rawGitDir = Buffer.concat([Buffer.from(`${root}${sep}gitdir-`), Buffer.from([0xff])]);
  try { renameSync(`${root}${sep}.git`, rawGitDir); }
  catch (error) {
    assert.ok(['EILSEQ', 'EINVAL', 'ENOENT', 'ENOTSUP'].includes(error.code), error.message);
    return;
  }
  writeFileSync(`${root}${sep}.git`, Buffer.concat([Buffer.from('gitdir: '), rawGitDir, Buffer.from('\n')]));
  const identity = sourceIdentity(root, { regression: { dir: '.chalk/held-out' } });
  assert.equal(identity.status, 'unknown');
  assert.match(identity.error, /cannot decode Git input membership path as UTF-8/);
});

test('raw non-UTF-8 Git pathname environments fail closed in a child process', t => {
  const root = realpathSync(mkdtempSync(`${tmpdir()}${sep}chalk-nonutf8-env-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const module = pathToFileURL(resolve('lib/verification-record.mjs')).href;
  const program = `import {sourceIdentity} from ${JSON.stringify(module)};process.stdout.write(JSON.stringify(sourceIdentity(process.cwd(),{regression:{dir:'.chalk/held-out'}})));`;
  const selectors = [
    { name: 'XDG_CONFIG_HOME', windows: 'invalid-\uFFFD', shell: 'XDG_CONFIG_HOME=$(printf "invalid-\\377")' },
    { name: 'GIT_CONFIG_PARAMETERS', windows: "'core.excludesfile'='invalid-\uFFFD'", shell: 'GIT_CONFIG_PARAMETERS="\'core.excludesfile\'=\'invalid-$(printf "\\377")\'"' },
  ];
  for (const selector of selectors) {
    let identity;
    if (process.platform === 'win32') {
      const previous = process.env[selector.name];
      try { process.env[selector.name] = selector.windows; identity = sourceIdentity(root, { regression: { dir: '.chalk/held-out' } }); }
      finally { if (previous === undefined) delete process.env[selector.name]; else process.env[selector.name] = previous; }
    } else {
      const probe = spawnSync('/bin/sh', ['-c',
        `${selector.shell}; export ${selector.name}; exec "$1" --input-type=module -e "$2"`,
        'chalk-nonutf8-env', process.execPath, program], { cwd: root, encoding: 'utf8' });
      assert.equal(probe.status, 0, probe.stderr);
      identity = JSON.parse(probe.stdout);
    }
    assert.equal(identity.status, 'unknown');
    assert.match(identity.error, new RegExp(`replacement character in Git pathname environment: ${selector.name}`));
    assert.equal(Object.keys(identity.policyInputs).some(path => path.includes('\uFFFD')), false);
  }
});
