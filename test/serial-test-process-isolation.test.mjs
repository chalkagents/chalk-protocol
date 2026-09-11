import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('serial scheduler files receive independent node:test runner lifetimes', t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'chalk-serial-runners-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = ['first.test.mjs', 'second.test.mjs'];
  for (const [index, file] of files.entries()) {
    fs.writeFileSync(join(root, file), `import { test } from 'node:test'; test('serial ${index + 1}', () => {});\n`);
  }

  const batch = join(process.cwd(), 'scripts/verify-test-batch.mjs');
  const result = spawnSync(process.execPath, [batch, '1', ...files.map(file => join(root, file))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.match(/TAP version 13/g)?.length, 2, result.stdout);
  assert.match(result.stdout, /ok 1 - serial 1/);
  assert.match(result.stdout, /ok 1 - serial 2/);
  assert.doesNotMatch(result.stdout, /ok 2 - serial 2/);

  const marker = join(root, 'second-ran');
  fs.writeFileSync(join(root, files[0]), "import { test } from 'node:test'; import assert from 'node:assert/strict'; test('fails', () => assert.fail('expected'));\n");
  fs.writeFileSync(join(root, files[1]), `import { test } from 'node:test'; import fs from 'node:fs'; test('still runs', () => fs.writeFileSync(${JSON.stringify(marker)}, 'yes'));\n`);
  const failed = spawnSync(process.execPath, [batch, '1', ...files.map(file => join(root, file))], { encoding: 'utf8' });
  assert.equal(failed.status, 1, failed.stdout + failed.stderr);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'yes');
});
