// Public offline conformance kit: one harness, complete fixtures, four built-ins, external commands,
// mutation refusal, output formats, network opt-in, version reporting, docs, and package assets.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFORMANCE_FIXTURES, conformanceAdapterCommand, renderConformanceReport, runAdapterConformance,
} from '../lib/adapter-conformance.mjs';
import { launchCommand } from '../lib/process.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const VERSION = 'chalk-agent-adapter/1';
const chalk = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' });

test('one harness covers every required offline fixture and all four adapter implementations', () => {
  assert.deepEqual(CONFORMANCE_FIXTURES, [
    'multiline', 'text', 'structured', 'noisy', 'malformed', 'nonzero', 'timeout', 'missing-usage',
    'usage', 'identity', 'diagnostics', 'read-only', 'workspace-write', 'unsupported', 'mutation',
  ]);
  for (const adapter of ['claude', 'opencode', 'raw-command', 'fake']) {
    const report = runAdapterConformance({ adapter, command: conformanceAdapterCommand(adapter) });
    assert.equal(report.ok, true, `${adapter}: ${JSON.stringify(report.results.filter((item) => item.status === 'fail'))}`);
    assert.equal(report.passed, CONFORMANCE_FIXTURES.length);
    assert.deepEqual(report.adapterViolations, []);
    assert.equal(report.mode, 'offline');
    assert.equal(report.networkAllowed, false);
    assert.ok(report.results.every((item) => item.protocolVersion === VERSION), `${adapter} versions every result`);
  }
});

test('read-only mutation and unsupported capability receive passing conformance only when refused', () => {
  const report = runAdapterConformance({ adapter: 'fake', command: conformanceAdapterCommand('fake') });
  const mutation = report.results.find((item) => item.name === 'mutation');
  assert.equal(mutation.status, 'pass');
  assert.match(mutation.detail, /production result failed with read-only-mutation: conformance-mutation\.txt/);
  assert.equal(mutation.adapterViolation, undefined, 'the fixture reports failure instead of claiming the mutation succeeded');
  const unsupported = report.results.find((item) => item.name === 'unsupported');
  assert.equal(unsupported.status, 'pass');
  assert.match(unsupported.detail, /unsupported capability reported/);
});

test('CLI accepts a configured external executable and renders human or JSON results', () => {
  const external = conformanceAdapterCommand('fake');
  const json = chalk('adapter', 'conformance', '--command', external, '--json');
  assert.equal(json.status, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.adapter, 'external');
  assert.equal(report.protocolVersion, VERSION);
  assert.ok(report.results.every((item) => item.protocolVersion === VERSION));

  const human = chalk('adapter', 'conformance', '--adapter', 'raw-command');
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, new RegExp(`Agent Adapter Protocol conformance · ${VERSION}`));
  assert.match(human.stdout, /15\/15 passed/);
  assert.equal((human.stdout.match(/\[chalk-agent-adapter\/1\]/g) || []).length, CONFORMANCE_FIXTURES.length, 'every human fixture result prints the tested version');
});

test('offline is network-inert; only explicit --live enables a provider-capable invocation', () => {
  for (const adapter of ['claude', 'opencode']) {
    const result = spawnSync(process.execPath, [CLI, 'adapter', 'conformance', '--adapter', adapter, '--json'], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, CHALK_CLAUDE_BIN: '/definitely-not-a-provider', CHALK_OPENCODE_BIN: '/definitely-not-a-provider' },
    });
    assert.equal(result.status, 0, `${adapter}: ${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).networkAllowed, false, `${adapter} never reached its provider binary`);
  }
  const live = chalk('adapter', 'conformance', '--adapter', 'fake', '--live', '--json');
  assert.equal(live.status, 0, live.stderr);
  const report = JSON.parse(live.stdout);
  assert.equal(report.mode, 'live');
  assert.equal(report.networkAllowed, true);
  assert.equal(report.total, 1, 'live mode is an explicit bounded smoke check');

  const source = readFileSync(join(ROOT, 'lib', 'adapter-conformance.mjs'), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\//, 'the harness itself has no network implementation');
});

test('external author docs use published package interfaces and all kit assets ship', () => {
  const docs = readFileSync(join(ROOT, 'docs', 'ADAPTER_CONFORMANCE.md'), 'utf8');
  assert.match(docs, /chalk adapter conformance --command/);
  assert.match(docs, /chalk-protocol\/lib\/adapters\/conformance-fixtures\.mjs/);
  assert.doesNotMatch(docs, /\.\.\/examples|\.chalk\//, 'external instructions do not depend on repository-only artifacts');

  const cache = mkdtempSync(join(tmpdir(), 'chalk-conformance-pack-'));
  const packed = launchCommand('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120_000, env: { ...process.env, npm_config_cache: cache },
  });
  assert.equal(packed.status, 0, packed.stderr);
  const files = JSON.parse(packed.stdout)[0].files.map((item) => item.path);
  for (const asset of [
    'bin/adapters/fake.mjs', 'bin/adapters/raw-command.mjs', 'lib/adapter-conformance.mjs',
    'lib/adapters/conformance-fixtures.mjs', 'docs/ADAPTER_CONFORMANCE.md',
  ]) assert.ok(files.includes(asset), `${asset} missing from package`);
});

test('human renderer always identifies the tested protocol version', () => {
  const report = runAdapterConformance({ adapter: 'fake', command: conformanceAdapterCommand('fake') });
  const rendered = renderConformanceReport(report);
  assert.match(rendered, new RegExp(VERSION.replace('/', '\\/')));
  assert.equal((rendered.match(/chalk-agent-adapter\/1/g) || []).length, report.total + 1);
});
