// The `test` CI workflow must exercise the whole supported Node range, not a single version.
// chalk's lib/ leans on `node --test`, the built-in test runner, and other stdlib surface whose
// behaviour has shifted across 20 → 22 → 24 (test runner output, glob, fetch, path). Testing only
// Node 20 on one runner lets a version-specific break ship green. This suite pins the workflow to a
// `strategy.matrix.node-version` covering 20, 22 and 24, driven through setup-node so the matrix
// actually selects the runtime (a hardcoded `node-version: '20'` alongside a matrix would be a
// silent vacuous pass). Structural, string-based assertions — the project is zero-dependency, so
// there is no YAML parser to lean on. Locked contract for the CI node-matrix task.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(repoRoot, '.github/workflows/test.yml'), 'utf8');

test('the test workflow declares a strategy.matrix', () => {
  assert.match(workflow, /strategy:/, 'workflow must declare a build strategy');
  assert.match(workflow, /matrix:/, 'workflow must declare a matrix');
});

test('the matrix covers Node 20, 22 and 24', () => {
  // Isolate the node-version matrix declaration so a version mentioned elsewhere can't spoof this.
  const m = workflow.match(/node-version:\s*\[([^\]]*)\]/);
  assert.ok(m, 'expected an inline `node-version: [ ... ]` matrix list');
  const versions = m[1].split(',').map((v) => v.replace(/['"\s]/g, ''));
  for (const want of ['20', '22', '24']) {
    assert.ok(versions.includes(want), `matrix must include Node ${want} (got: ${versions.join(', ')})`);
  }
});

test('setup-node is driven by the matrix, not a hardcoded version', () => {
  // The setup-node step must consume ${{ matrix.node-version }}; otherwise the matrix fans out but
  // every job installs the same pinned runtime — coverage that lies.
  assert.match(
    workflow,
    /node-version:\s*\$\{\{\s*matrix\.node-version\s*\}\}/,
    'setup-node must reference ${{ matrix.node-version }}',
  );
});
