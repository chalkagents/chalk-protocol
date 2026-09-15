import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';
import { sourceIdentity } from '../lib/verification-record.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-literal-boundary-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

for (const tracked of [false, true]) {
  test(`configured sealed directories with glob characters do not exclude unrelated ${tracked ? 'tracked' : 'untracked'} source`, t => {
    const root = fixture(t);
    mkdirSync(join(root, 'private[1]')); mkdirSync(join(root, 'private1'));
    writeFileSync(join(root, 'private[1]/sealed.txt'), 'synthetic excluded content');
    writeFileSync(join(root, 'private1/source.js'), 'before');
    if (tracked) execFileSync('git', ['add', '--', 'private1/source.js', ':(literal)private[1]/sealed.txt'], { cwd: root });
    const proto = { regression: { dir: 'private[1]' } };
    const before = sourceIdentity(root, proto);
    assert.equal(before.status, 'known');
    assert.ok(Object.hasOwn(before.files, 'private1/source.js'));
    assert.equal(Object.hasOwn(before.files, 'private[1]/sealed.txt'), false);
    writeFileSync(join(root, 'private1/source.js'), 'after');
    const after = sourceIdentity(root, proto);
    assert.notEqual(before.digest, after.digest);
  });
}

test('a stable ignored ancestor permits output beside a force-tracked file', t => {
  const root = fixture(t);
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  mkdirSync(join(root, 'build'));
  writeFileSync(join(root, '.gitignore'), '/build/\n');
  writeFileSync(join(root, 'build/.gitkeep'), 'tracked');
  execFileSync('git', ['add', '-f', 'build/.gitkeep'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), 'require("fs").writeFileSync("build/output.log","generated");');
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  const result = verify(store);
  assert.equal(result.green, true, JSON.stringify(result));
  assert.equal(readFileSync(join(root, 'build/output.log'), 'utf8'), 'generated');
  assert.equal(readFileSync(join(root, 'build/.gitkeep'), 'utf8'), 'tracked');
});
