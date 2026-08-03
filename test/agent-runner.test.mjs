// Agent Runner seam — executor and planner share one normalized interface while legacy command
// strings retain streaming, plain-text, failure, timeout, and cost-ledger behavior.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAgent, usageForLedger } from '../lib/agent-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const FAKE = join(ROOT, 'examples', 'agent-runner', 'fake-raw-agent.mjs');
const fake = (fixture) => `${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE)} ${fixture}`;

test('runAgent returns one normalized result for planner text and executor streaming', () => {
  const planner = runAgent('planner', { command: fake('text'), input: 'plan input', output: { kind: 'text' } });
  assert.deepEqual(Object.keys(planner).sort(), ['diagnostics', 'identity', 'status', 'structured', 'text', 'usage']);
  assert.equal(planner.status, 'ok');
  assert.equal(planner.text, 'fake output: plan input');
  assert.equal(planner.structured, null);
  assert.equal(planner.identity, null, 'raw commands do not invent an independence identity');

  const runnerUrl = pathToFileURL(join(ROOT, 'lib', 'agent-runner.mjs')).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { runAgent } from ${JSON.stringify(runnerUrl)};
    const r = runAgent('executor', { command: ${JSON.stringify(fake('text'))}, input: 'live marker', output: { kind: 'text' } });
    process.stderr.write(JSON.stringify(r));
  `], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /fake output: live marker/, 'executor output remains visible on stdout');
  assert.equal(JSON.parse(child.stderr).status, 'ok');
});

test('runAgent normalizes timeout, non-zero exit, missing binary, and malformed envelope diagnostics', () => {
  const timeout = runAgent('planner', { command: fake('timeout'), timeout: 20, output: { kind: 'text' } });
  assert.equal(timeout.status, 'timeout');
  assert.equal(timeout.diagnostics[0].code, 'timeout');

  const nonzero = runAgent('planner', { command: fake('nonzero'), output: { kind: 'text' } });
  assert.equal(nonzero.status, 'failed');
  assert.equal(nonzero.text, 'partial fake output\n');
  assert.equal(nonzero.diagnostics[0].code, 'nonzero-exit');

  const missing = runAgent('planner', { command: 'chalk-agent-command-that-does-not-exist', output: { kind: 'text' } });
  assert.equal(missing.status, 'failed');
  assert.equal(missing.diagnostics[0].code, 'command-not-found');

  const malformed = runAgent('planner', { command: fake('malformed-envelope'), output: { kind: 'text' } });
  assert.equal(malformed.status, 'ok', 'legacy malformed-envelope behavior remains non-fatal');
  assert.match(malformed.text, /"type":"result"/);
  assert.equal(malformed.diagnostics[0].code, 'malformed-envelope');
});

test('runAgent captures normalized usage and maps it to the existing cost ledger shape', () => {
  const result = runAgent('planner', { command: fake('usage'), output: { kind: 'text' } });
  assert.equal(result.status, 'ok');
  assert.equal(result.text, 'usage-aware fake output');
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 2, costUsd: 0.04, turns: 1 });
  assert.deepEqual(usageForLedger(result.usage), { tokens: { in: 12, out: 5, cacheRead: 3, cacheWrite: 2 }, costUsd: 0.04, turns: 1 });
});

test('planner and executor call the seam and never prepend protocol.runner to agent commands', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-agent-runner-'));
  const chalk = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: d, encoding: 'utf8' });
  assert.equal(chalk('init', '--name', 'runner-test').status, 0);

  const runnerMarker = join(d, 'runner-was-used');
  const runner = join(d, 'project-runner.mjs');
  writeFileSync(runner, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(runnerMarker)}, 'used');`);
  const configFile = join(d, '.chalk', 'chalk.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  config.protocol.runner = `${JSON.stringify(process.execPath)} ${JSON.stringify(runner)}`;
  config.protocol.planner = { command: fake('text') };
  config.protocol.executor = { command: fake('text') };
  writeFileSync(configFile, JSON.stringify(config, null, 2));

  assert.equal(chalk('task', 'add', 'chore: runner seam').status, 0);
  const taskId = JSON.parse(readFileSync(join(d, '.chalk', 'tasks.json'), 'utf8'))[0].id.slice(0, 12);
  assert.equal(chalk('spec', taskId, '--criterion', 'runner seam works').status, 0);
  const plan = chalk('plan', taskId);
  assert.equal(plan.status, 0, `${plan.stdout}${plan.stderr}`);
  assert.equal(chalk('run', '--max', '1').status, 0);
  assert.throws(() => readFileSync(runnerMarker), /ENOENT/, 'project runner is reserved for toolchain commands');

  const cliSource = readFileSync(CLI, 'utf8');
  const driverSource = readFileSync(join(ROOT, 'lib', 'run.mjs'), 'utf8');
  assert.match(cliSource, /runAgent\('planner'/);
  assert.match(cliSource, /runAgent\('executor'/);
  assert.match(driverSource, /runAgent\('executor'/);
  assert.doesNotMatch(driverSource, /runExecutorCaptured|withRunner/);
});
