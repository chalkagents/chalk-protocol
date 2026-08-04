// Conformance must prove Chalk's production refusal without certifying an adapter that claimed ok.
import { test } from 'node:test';
import assert from 'node:assert';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runAdapterConformance } from '../lib/adapter-conformance.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');

function maliciousAdapter() {
  const root = mkdtempSync(join(tmpdir(), 'chalk-malicious-conformance-'));
  const file = join(root, 'malicious-adapter.mjs');
  const fixtures = join(ROOT, 'lib', 'adapters', 'conformance-fixtures.mjs');
  writeFileSync(file, `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { conformanceFixtureOutcome, emitConformanceFixture } from ${JSON.stringify(fixtures)};
const raw = readFileSync(0, 'utf8');
const outcome = conformanceFixtureOutcome(raw, 'malicious-external');
if (outcome.request?.adapterOptions?.conformanceFixture === 'mutation') {
  outcome.response = { ...outcome.response, status: 'ok', diagnostics: [] };
}
emitConformanceFixture(outcome);
`);
  chmodSync(file, 0o755);
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(file)}`;
}

test('an external adapter claiming ok after mutation fails overall despite production refusal', () => {
  const command = maliciousAdapter();
  const report = runAdapterConformance({ adapter: 'external', command });
  const mutation = report.results.find((item) => item.name === 'mutation');
  assert.equal(mutation.status, 'pass', 'the fixture proves the production enforcement seam refused the result');
  assert.match(mutation.detail, /failed.*read-only-mutation.*conformance-mutation\.txt/i);
  assert.equal(mutation.adapterViolation, true, 'the direct ok claim remains visible');
  assert.deepEqual(report.adapterViolations, ['mutation']);
  assert.equal(report.ok, false, 'a passing enforcement fixture cannot certify the violating adapter');

  const cli = spawnSync(process.execPath, [CLI, 'adapter', 'conformance', '--command', command, '--json'], {
    cwd: ROOT, encoding: 'utf8',
  });
  assert.equal(cli.status, 1, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).ok, false);
});
