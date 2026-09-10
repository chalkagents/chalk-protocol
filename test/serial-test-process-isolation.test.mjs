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
  assert.match(result.stdout, /serial 1[\s\S]*tests 1[\s\S]*serial 2[\s\S]*tests 1/);
  assert.doesNotMatch(result.stdout, /tests 2/);
});
