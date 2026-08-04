// First-party Protocol v1 adapters own provider behavior; core sees only normalized envelopes.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from '../lib/agent-runner.mjs';
import { AGENT_ROLES } from '../lib/config.mjs';
import { CLAUDE_SUPPORTED_ROLES } from '../lib/adapters/claude.mjs';
import { OPENCODE_SUPPORTED_ROLES } from '../lib/adapters/opencode.mjs';
import { initSpine } from '../lib/store.mjs';
import { launchCommand } from '../lib/process.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE = join(ROOT, 'bin', 'adapters', 'claude.mjs');
const OPENCODE = join(ROOT, 'bin', 'adapters', 'opencode.mjs');
const scratch = (name = 'chalk-provider-adapter-') => mkdtempSync(join(tmpdir(), name));
const command = (file) => `${JSON.stringify(process.execPath)} ${JSON.stringify(file)}`;
const capabilities = { access: ['read-only', 'workspace-write'], output: ['text', 'json', 'none'] };

function fakeProvider(root) {
  const file = join(root, 'fake-provider.mjs');
  writeFileSync(file, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const stdin = readFileSync(0, 'utf8');
writeFileSync(process.env.FAKE_CAPTURE, JSON.stringify({ args: process.argv.slice(2), stdin }));
if (process.env.FAKE_FAIL === '1') {
  process.stderr.write('provider failed token=' + process.env.FAKE_SECRET);
  process.exit(2);
}
const result = process.env.FAKE_RESULT || 'provider text';
if (process.argv.includes('--output-format')) {
  process.stdout.write(JSON.stringify({ type: 'result', result, usage: { input_tokens: 21, output_tokens: 8, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 }, total_cost_usd: 0.06, num_turns: 2 }));
} else {
  process.stdout.write('provider banner\\n' + result);
}
`);
  chmodSync(file, 0o755);
  return file;
}

function profile(adapter, asset, binary, options = {}) {
  return {
    name: adapter,
    adapter,
    command: command(asset),
    identity: null,
    capabilities,
    options: { binary, ...options },
  };
}

test('Claude adapter owns system prompt, permissions, envelope decoding, usage, and identity', () => {
  const root = scratch();
  const workspace = scratch('chalk-claude-workspace-');
  const binary = fakeProvider(root);
  const capture = join(root, 'capture.json');
  const costs = [];
  const result = runAgent('reviewer', {
    profile: profile('claude', CLAUDE, binary, { model: 'opaque-claude-model' }),
    context: 'review this exact context', cwd: workspace, stderr: 'capture',
    env: { ...process.env, FAKE_CAPTURE: capture, FAKE_RESULT: JSON.stringify({ verdict: 'pass', findings: [], decisions: [] }) },
    cost: { store: { logCost: (record) => costs.push(record) }, taskId: 'task-adapter' },
  });
  assert.equal(result.status, 'ok', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.structured, { verdict: 'pass', findings: [], decisions: [] });
  assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 8, cacheReadTokens: 5, cacheWriteTokens: 2, costUsd: 0.06, turns: 2 });
  assert.deepEqual(result.identity, { displayName: 'Claude Code', model: 'opaque-claude-model' });
  assert.deepEqual(costs[0].tokens, { in: 21, out: 8, cacheRead: 5, cacheWrite: 2 }, 'new normalized usage persists in the readable v0 ledger shape');

  const invocation = JSON.parse(readFileSync(capture, 'utf8'));
  assert.ok(invocation.args.includes('--system-prompt'));
  assert.match(invocation.args[invocation.args.indexOf('--system-prompt') + 1], /decision digest/i, 'canonical role instructions map to the native system prompt');
  assert.deepEqual(invocation.args.slice(invocation.args.indexOf('--permission-mode'), invocation.args.indexOf('--permission-mode') + 2), ['--permission-mode', 'plan']);
  assert.deepEqual(invocation.args.slice(invocation.args.indexOf('--model'), invocation.args.indexOf('--model') + 2), ['--model', 'opaque-claude-model']);
  assert.equal(invocation.stdin, 'review this exact context', 'run context remains separate from the system prompt');
});

test('OpenCode adapter owns argv prompt transport, JSON cleanup, permissions, and identity', () => {
  const root = scratch();
  const workspace = scratch('chalk-opencode-workspace-');
  const binary = fakeProvider(root);
  const capture = join(root, 'capture.json');
  const reviewer = runAgent('reviewer', {
    profile: profile('opencode', OPENCODE, binary, { model: 'opaque-opencode-model' }),
    context: 'review context with $VARS and `ticks`', cwd: workspace, stderr: 'capture',
    env: { ...process.env, FAKE_CAPTURE: capture, FAKE_RESULT: '```json\n{"verdict":"pass","findings":[],"decisions":[]}\n```' },
  });
  assert.equal(reviewer.status, 'ok', JSON.stringify(reviewer.diagnostics));
  assert.deepEqual(reviewer.identity, { displayName: 'OpenCode', model: 'opaque-opencode-model' });
  const readOnly = JSON.parse(readFileSync(capture, 'utf8'));
  assert.ok(!readOnly.args.includes('--auto'), 'read-only role never receives write permission');
  assert.match(readOnly.args.at(-1), /# Role instructions[\s\S]+# Run context[\s\S]+\$VARS/, 'stdin fields map to one verbatim argv prompt');

  const executor = runAgent('executor', {
    profile: profile('opencode', OPENCODE, binary), context: 'write context', cwd: workspace, stream: false,
    env: { ...process.env, FAKE_CAPTURE: capture, FAKE_RESULT: 'executor output' },
  });
  assert.equal(executor.status, 'ok', JSON.stringify(executor.diagnostics));
  assert.ok(JSON.parse(readFileSync(capture, 'utf8')).args.includes('--auto'), 'workspace-write role receives provider write permission');
});

test('both first-party adapters advertise every role in the current Protocol v1 integration', () => {
  assert.deepEqual([...CLAUDE_SUPPORTED_ROLES].sort(), [...AGENT_ROLES].sort());
  assert.deepEqual([...OPENCODE_SUPPORTED_ROLES].sort(), [...AGENT_ROLES].sort());
});

test('provider failures retain useful raw diagnostics with credential values redacted', () => {
  const root = scratch();
  const workspace = scratch('chalk-failure-workspace-');
  const binary = fakeProvider(root);
  const secret = 'SUPERSECRET-123456';
  const result = runAgent('planner', {
    profile: profile('claude', CLAUDE, binary, { token: secret }), context: 'failure context', cwd: workspace, stderr: 'capture',
    env: { ...process.env, FAKE_CAPTURE: join(root, 'capture.json'), FAKE_FAIL: '1', FAKE_SECRET: secret },
  });
  assert.equal(result.status, 'failed');
  const diagnostics = JSON.stringify(result.diagnostics);
  assert.match(diagnostics, /provider failed/);
  assert.match(diagnostics, /REDACTED/);
  assert.doesNotMatch(diagnostics, new RegExp(secret));
});

test('init provider choices bind Protocol v1 profiles while retaining legacy-compatible commands', () => {
  const claudeRoot = scratch('chalk-init-claude-adapter-');
  const claude = initSpine(claudeRoot, { name: 'claude', executor: 'claude' }).protocol;
  assert.equal(claude.agents.profiles.claude.adapter, 'claude');
  assert.match(claude.agents.profiles.claude.command, /bin\/adapters\/claude\.mjs/);
  assert.deepEqual(claude.agents.roles, { executor: 'claude', planner: 'claude', reviewer: 'claude', retro: 'claude' });
  assert.match(claude.executor.command, /claude -p --agent chalk-executor/, 'older Chalk retains an exact compatible command');

  const openCodeRoot = scratch('chalk-init-opencode-adapter-');
  const opencode = initSpine(openCodeRoot, { name: 'opencode', executor: 'opencode' }).protocol;
  assert.equal(opencode.agents.profiles.opencode.adapter, 'opencode');
  assert.match(opencode.agents.profiles.opencode.command, /bin\/adapters\/opencode\.mjs/);
  assert.equal(opencode.agents.roles.executor, 'opencode');
  assert.match(opencode.executor.command, /opencode-exec\.mjs$/, 'older Chalk retains its executable bridge');
});

test('core runner, config, cost, and doctor contain no provider command inspection', () => {
  for (const file of ['lib/agent-runner.mjs', 'lib/config.mjs', 'lib/cost.mjs', 'lib/doctor.mjs']) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(source, /CHALK_(?:CLAUDE|OPENCODE)|opencode-(?:exec|json)|['"]claude['"]|--output-format/, `${file} has no provider binary, flag, asset, or environment inspection`);
  }
});

test('all first-party runtime adapter assets ship in the npm package', () => {
  const cache = scratch('chalk-npm-cache-');
  const packed = launchCommand('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120_000, env: { ...process.env, npm_config_cache: cache },
  });
  assert.equal(packed.status, 0, packed.stderr);
  const files = JSON.parse(packed.stdout)[0].files.map((item) => item.path);
  for (const asset of [
    'bin/adapters/claude.mjs', 'bin/adapters/opencode.mjs',
    'lib/agent-adapter-transport.mjs', 'lib/adapters/shared.mjs',
    'lib/adapters/claude.mjs', 'lib/adapters/opencode.mjs',
  ]) assert.ok(files.includes(asset), `${asset} missing from package`);
});
