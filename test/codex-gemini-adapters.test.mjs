// Codex and Gemini prove that Protocol v1 portability is real: the same role contracts,
// readiness, transport, conformance, and package boundary work without workflow branches.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAdapterConformance, conformanceAdapterCommand, CONFORMANCE_FIXTURES } from '../lib/adapter-conformance.mjs';
import { runAgent } from '../lib/agent-runner.mjs';
import { checkRoleCapabilities } from '../lib/agent-contracts.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { launchCommand } from '../lib/process.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = {
  codex: join(ROOT, 'bin', 'adapters', 'codex.mjs'),
  gemini: join(ROOT, 'bin', 'adapters', 'gemini.mjs'),
};
const scratch = (name = 'chalk-portability-') => mkdtempSync(join(tmpdir(), name));
const command = (file) => `${JSON.stringify(process.execPath)} ${JSON.stringify(file)}`;
const capabilities = {
  roles: ['executor', 'planner', 'reviewer'],
  access: ['read-only', 'workspace-write'],
  output: ['text', 'json'],
};

function fakeProvider(root) {
  const file = join(root, 'fake-provider.mjs');
  writeFileSync(file, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const stdin = readFileSync(0, 'utf8');
writeFileSync(process.env.FAKE_CAPTURE, JSON.stringify({ args, stdin }));
if (process.env.FAKE_KIND === 'codex') {
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'thread-test' }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: process.env.FAKE_RESULT || 'codex text' } }) + '\\n');
  if (process.env.FAKE_NO_USAGE !== '1') process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 22, cached_input_tokens: 4, output_tokens: 7 } }) + '\\n');
} else {
  const models = process.env.FAKE_NO_USAGE === '1' ? {} : { 'gemini-reported': { api: { totalRequests: 2 }, tokens: { input: 30, candidates: 9, cached: 5 } } };
  process.stdout.write(JSON.stringify({ response: process.env.FAKE_RESULT || 'gemini text', stats: { models } }));
}
`);
  chmodSync(file, 0o755);
  return file;
}

function profile(adapter, binary, options = {}) {
  return {
    name: adapter,
    adapter,
    command: command(ASSETS[adapter]),
    identity: null,
    capabilities,
    options: { binary, ...options },
  };
}

function invocation(root, kind, result, extra = {}) {
  const capture = join(root, `${kind}-capture.json`);
  return {
    capture,
    env: { ...process.env, FAKE_CAPTURE: capture, FAKE_KIND: kind, FAKE_RESULT: result, ...extra },
  };
}

test('Codex maps all three roles, preserves stdin, normalizes reviewer JSON, usage, and opaque model identity', () => {
  const root = scratch();
  const workspace = scratch('chalk-codex-workspace-');
  const binary = fakeProvider(root);
  const model = 'opaque://codex model; $NEVER_INTERPRET';
  const context = 'line one\n`backticks` $VARS "quotes"\nline three';
  const call = invocation(root, 'codex', JSON.stringify({ verdict: 'pass', findings: [], decisions: [] }));
  const reviewer = runAgent('reviewer', {
    profile: profile('codex', binary, { model }), context, cwd: workspace, env: call.env,
  });
  assert.equal(reviewer.status, 'ok', JSON.stringify(reviewer.diagnostics));
  assert.deepEqual(reviewer.structured, { verdict: 'pass', findings: [], decisions: [] });
  assert.deepEqual(reviewer.usage, { inputTokens: 22, outputTokens: 7, cacheReadTokens: 4, turns: 1 });
  assert.deepEqual(reviewer.identity, { displayName: 'Codex CLI', model });

  const captured = JSON.parse(readFileSync(call.capture, 'utf8'));
  assert.equal(captured.stdin, context, 'multiline run context is verbatim stdin');
  assert.equal(captured.args[0], 'exec');
  assert.ok(captured.args.includes('--json'));
  assert.deepEqual(captured.args.slice(captured.args.indexOf('--sandbox'), captured.args.indexOf('--sandbox') + 2), ['--sandbox', 'read-only']);
  assert.deepEqual(captured.args.slice(captured.args.indexOf('--ask-for-approval'), captured.args.indexOf('--ask-for-approval') + 2), ['--ask-for-approval', 'never']);
  assert.deepEqual(captured.args.slice(captured.args.indexOf('--model'), captured.args.indexOf('--model') + 2), ['--model', model], 'model remains one opaque argv value');
  assert.ok(captured.args.includes('--output-schema'));
  assert.match(captured.args.at(-1), /decision digest/i, 'canonical reviewer instructions are the native prompt');

  const executorCall = invocation(root, 'codex', 'executor complete');
  const executor = runAgent('executor', {
    profile: profile('codex', binary), context: 'write this', cwd: workspace, env: executorCall.env, stream: false,
  });
  assert.equal(executor.status, 'ok', JSON.stringify(executor.diagnostics));
  const executorArgs = JSON.parse(readFileSync(executorCall.capture, 'utf8')).args;
  assert.deepEqual(executorArgs.slice(executorArgs.indexOf('--sandbox'), executorArgs.indexOf('--sandbox') + 2), ['--sandbox', 'workspace-write']);
  assert.equal(checkRoleCapabilities('planner', profile('codex', binary)).ok, true);
});

test('Gemini maps all three roles, preserves stdin, normalizes reviewer JSON, usage, and reported identity', () => {
  const root = scratch();
  const workspace = scratch('chalk-gemini-workspace-');
  const binary = fakeProvider(root);
  const model = 'opaque://gemini model; $NEVER_INTERPRET';
  const context = 'first line\n$(not a command) `nor this`\nlast line';
  const call = invocation(root, 'gemini', JSON.stringify({ verdict: 'pass', findings: [], decisions: [] }));
  const reviewer = runAgent('reviewer', {
    profile: profile('gemini', binary, { model }), context, cwd: workspace, env: call.env,
  });
  assert.equal(reviewer.status, 'ok', JSON.stringify(reviewer.diagnostics));
  assert.deepEqual(reviewer.structured, { verdict: 'pass', findings: [], decisions: [] });
  assert.deepEqual(reviewer.usage, { inputTokens: 30, outputTokens: 9, cacheReadTokens: 5, turns: 2 });
  assert.deepEqual(reviewer.identity, { displayName: 'Gemini CLI', model });

  const captured = JSON.parse(readFileSync(call.capture, 'utf8'));
  assert.equal(captured.stdin, context, 'multiline run context is verbatim stdin');
  assert.deepEqual(captured.args.slice(captured.args.indexOf('--output-format'), captured.args.indexOf('--output-format') + 2), ['--output-format', 'json']);
  assert.deepEqual(captured.args.slice(captured.args.indexOf('--approval-mode'), captured.args.indexOf('--approval-mode') + 2), ['--approval-mode', 'plan']);
  assert.deepEqual(captured.args.slice(captured.args.indexOf('--model'), captured.args.indexOf('--model') + 2), ['--model', model], 'model remains one opaque argv value');
  assert.match(captured.args[captured.args.indexOf('--prompt') + 1], /decision digest/i);

  const executorCall = invocation(root, 'gemini', 'executor complete');
  const executor = runAgent('executor', {
    profile: profile('gemini', binary), context: 'write this', cwd: workspace, env: executorCall.env, stream: false,
  });
  assert.equal(executor.status, 'ok', JSON.stringify(executor.diagnostics));
  const executorArgs = JSON.parse(readFileSync(executorCall.capture, 'utf8')).args;
  assert.deepEqual(executorArgs.slice(executorArgs.indexOf('--approval-mode'), executorArgs.indexOf('--approval-mode') + 2), ['--approval-mode', 'yolo']);
  assert.ok(executorArgs.includes('--sandbox'));
  assert.equal(checkRoleCapabilities('planner', profile('gemini', binary)).ok, true);
});

test('both adapters degrade honestly and reject unsupported roles before provider invocation', () => {
  for (const adapter of ['codex', 'gemini']) {
    const root = scratch();
    const workspace = scratch(`chalk-${adapter}-honesty-`);
    const binary = fakeProvider(root);
    const call = invocation(root, adapter, 'plain result', { FAKE_NO_USAGE: '1' });
    const planner = runAgent('planner', { profile: profile(adapter, binary), context: 'read', cwd: workspace, env: call.env });
    assert.equal(planner.status, 'ok', JSON.stringify(planner.diagnostics));
    assert.equal(planner.usage, null, `${adapter} does not invent usage`);
    assert.deepEqual(planner.identity, { displayName: adapter === 'codex' ? 'Codex CLI' : 'Gemini CLI' }, `${adapter} does not invent a model identity`);

    const unsupported = checkRoleCapabilities('discovery', profile(adapter, binary));
    assert.equal(unsupported.ok, false);
    assert.match(unsupported.problems.join('\n'), /not supported/);
    const refusedCapture = join(root, 'must-not-exist.json');
    const refused = runAgent('discovery', {
      profile: profile(adapter, binary), context: 'discover', cwd: workspace,
      env: { ...process.env, FAKE_CAPTURE: refusedCapture, FAKE_KIND: adapter },
    });
    assert.equal(refused.status, 'failed');
    assert.equal(refused.diagnostics[0].code, 'unsupported-capability');

    const protocol = {
      github: {}, verify: { test: 'node --test' }, review: {}, regression: {}, plan: {}, worktree: { enabled: false },
      agents: { version: 1, profiles: { [adapter]: profile(adapter, binary) }, roles: { discovery: adapter } },
    };
    const checks = runDoctor({ root: workspace, protocol: () => protocol, tasks: () => [] });
    assert.ok(checks.some((item) => item.area === 'agents' && item.level === 'fail' && /not supported/.test(item.msg)), `${adapter} doctor readiness is explicit`);
  }
});

test('Codex and Gemini pass the identical complete offline conformance suite', () => {
  for (const adapter of ['codex', 'gemini']) {
    const report = runAdapterConformance({ adapter, command: conformanceAdapterCommand(adapter) });
    assert.equal(report.ok, true, `${adapter}: ${JSON.stringify(report.results.filter((item) => item.status === 'fail'))}`);
    assert.equal(report.mode, 'offline');
    assert.equal(report.networkAllowed, false);
    assert.equal(report.passed, CONFORMANCE_FIXTURES.length);
    assert.deepEqual(report.results.map((item) => item.name), [...CONFORMANCE_FIXTURES]);
  }
});

test('provider auth stays CLI-owned and workflow modules have no Codex or Gemini branch', () => {
  for (const adapter of ['codex', 'gemini']) {
    const source = readFileSync(join(ROOT, 'lib', 'adapters', `${adapter}.mjs`), 'utf8');
    assert.doesNotMatch(source, /(?:OPENAI|CODEX|GEMINI|GOOGLE)_API_KEY|accessToken|bearerToken|oauth/i, `${adapter} adapter does not read credentials`);
  }
  for (const file of ['lib/agent-runner.mjs', 'lib/run.mjs', 'lib/planning.mjs', 'lib/review.mjs', 'lib/reviewloop.mjs']) {
    assert.doesNotMatch(readFileSync(join(ROOT, file), 'utf8'), /\b(?:codex|gemini)\b/i, `${file} remains provider-neutral`);
  }
  assert.match(readFileSync(join(ROOT, 'docs', 'integrations', 'codex.md'), 'utf8'), /authenticate Codex CLI separately[\s\S]+never reads, copies, or stores/i);
  assert.match(readFileSync(join(ROOT, 'docs', 'integrations', 'gemini-cli.md'), 'utf8'), /authenticate Gemini CLI separately[\s\S]+stores no API key/i);
});

test('installed package includes both public adapters, implementation modules, and integration docs', () => {
  const cache = scratch('chalk-portability-npm-cache-');
  const packed = launchCommand('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120_000, env: { ...process.env, npm_config_cache: cache },
  });
  assert.equal(packed.status, 0, packed.stderr);
  const files = JSON.parse(packed.stdout)[0].files.map((item) => item.path);
  for (const asset of [
    'bin/adapters/codex.mjs', 'bin/adapters/gemini.mjs',
    'lib/adapters/codex.mjs', 'lib/adapters/gemini.mjs',
    'docs/integrations/codex.md', 'docs/integrations/gemini-cli.md',
  ]) assert.ok(files.includes(asset), `${asset} missing from package`);
});
