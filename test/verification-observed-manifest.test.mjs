import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

test('final observation preserves special object-key filenames as ordinary inputs', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-observed-manifest-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  for (const name of ['__proto__', 'constructor', 'toString']) writeFileSync(join(root, name), 'ordinary source');
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node -e "console.log(1)"' }; store.saveMeta(meta);
  const result = verify(store);
  assert.equal(result.green, true, JSON.stringify(result));
  const receipt = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
  for (const name of ['__proto__', 'constructor', 'toString']) {
    assert.ok(Object.hasOwn(receipt.after.source.files, name));
    assert.equal(receipt.after.source.files[name], receipt.before.source.files[name]);
  }
});
