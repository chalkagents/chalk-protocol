// Guided connection: adapter-owned offline discovery, provider-neutral/idempotent writes, role
// presets, independence guidance, exact remediation, and an explicit-only live model smoke call.
import { test } from 'node:test';
import assert from 'node:assert';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ADAPTER_MANIFESTS } from '../lib/adapter-registry.mjs';
import {
  configureConnections, connectionReadiness, discoverConnections, promptConnection,
} from '../lib/connect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const scratch = (name = 'chalk-connect-') => mkdtempSync(join(tmpdir(), name));
const baseMeta = () => ({
  version: '1.2', project: { name: 'connect-test' },
  protocol: {
    agents: { version: 1, profiles: {}, roles: {} }, review: { command: '', requiredAt: [] },
    executor: { command: '' }, planner: { command: '' }, retro: { command: '' },
  },
});
const chalk = (cwd, args, env = process.env) => {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
};

function shellCli(root, name, { auth = true, modelMarker = '' } = {}) {
  const file = join(root, name);
  writeFileSync(file, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "${name} test-version"; exit 0; fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then ${auth ? 'echo authenticated; exit 0' : 'echo "not logged in" >&2; exit 1'}; fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then ${auth ? 'echo authenticated; exit 0' : 'echo "not logged in" >&2; exit 1'}; fi
${modelMarker ? `printf model-called > "${modelMarker}"` : ':'}
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"live result"}}'
printf '%s\\n' '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
`);
  chmodSync(file, 0o755);
  return file;
}

test('all first-party manifests own an offline probe and discovery never sends a prompt', () => {
  assert.deepEqual(Object.keys(ADAPTER_MANIFESTS).sort(), ['claude', 'codex', 'gemini', 'opencode']);
  const calls = [];
  const spawn = (binary, args) => {
    calls.push({ binary, args });
    return { status: 0, stdout: `${binary} 1.0\n`, stderr: '' };
  };
  const found = discoverConnections({ spawn });
  assert.ok(found.every((item) => item.installed));
  assert.ok(found.every((item) => ['ready', 'warning'].includes(item.status)));
  assert.ok(calls.every((item) => item.args.includes('--version') || item.args.join(' ') === 'auth status' || item.args.join(' ') === 'login status'));
  assert.ok(calls.every((item) => !item.args.includes('exec') && !item.args.includes('--prompt')), 'offline discovery cannot invoke a model prompt');
});

test('interactive setup offers manual, assisted, and autonomous presets', async () => {
  const discoveries = [
    { adapter: 'codex', installed: true }, { adapter: 'gemini', installed: true },
  ];
  for (const preset of ['manual', 'assisted', 'autonomous']) {
    const prompts = [];
    const answers = [preset, 'codex', preset === 'manual' ? '' : 'gemini'];
    const result = await promptConnection({ discoveries, ask: async (prompt) => { prompts.push(prompt); return answers.shift(); } });
    assert.equal(result.preset, preset);
    assert.equal(result.builder, 'codex');
    assert.match(prompts[0], /manual\|assisted\|autonomous/);
    assert.match(prompts[1], /codex\|gemini/);
  }
});

test('presets write provider-neutral profiles, allow distinct builder/reviewer, and explain independence', () => {
  const planned = configureConnections(baseMeta(), {
    preset: 'assisted', builder: 'codex', reviewer: 'gemini',
    builderProfile: 'primary-builder', reviewerProfile: 'independent-reviewer',
    builderModel: 'opaque builder model', reviewerModel: 'opaque reviewer model',
  });
  const protocol = planned.meta.protocol;
  assert.equal(protocol.agents.roles.executor, 'primary-builder');
  assert.equal(protocol.agents.roles.planner, 'primary-builder');
  assert.equal(protocol.agents.roles.reviewer, 'independent-reviewer');
  assert.equal(protocol.agents.profiles['primary-builder'].adapter, 'codex');
  assert.equal(protocol.agents.profiles['primary-builder'].options.model, 'opaque builder model');
  assert.equal(protocol.agents.profiles['independent-reviewer'].adapter, 'gemini');
  assert.deepEqual(protocol.review.requiredAt, ['per-task']);
  const readiness = connectionReadiness(protocol, [
    { adapter: 'codex', status: 'ready', message: 'Codex ready' },
    { adapter: 'gemini', status: 'ready', message: 'Gemini ready' },
  ]);
  assert.equal(readiness.ok, true);
  assert.match(readiness.checks.map((item) => item.message).join('\n'), /distinct configured identities/);

  const same = configureConnections(baseMeta(), { preset: 'assisted', builder: 'codex', reviewer: 'codex' });
  const sameReadiness = connectionReadiness(same.meta.protocol, [{ adapter: 'codex', status: 'ready', message: 'ready' }]);
  const warning = sameReadiness.checks.find((item) => /same configured identity/.test(item.message));
  assert.match(warning.nextAction, /--reviewer <different-adapter>/);
});

test('retrofit preserves legacy/manual values, reruns idempotently, and migrates only by explicit opt-in', () => {
  const meta = baseMeta();
  meta.protocol.executor.command = 'user-edited-builder --keep';
  meta.protocol.agents.profiles.codex = { adapter: 'codex', command: 'user-edited-adapter', capabilities: null, options: { hand: 'edited' } };
  meta.protocol.agents.roles.executor = 'codex';
  const first = configureConnections(meta, { preset: 'manual', builder: 'codex' });
  assert.equal(first.meta.protocol.executor.command, 'user-edited-builder --keep');
  assert.deepEqual(first.meta.protocol.agents.profiles.codex, meta.protocol.agents.profiles.codex, 'manual profile edits are preserved');
  assert.deepEqual(first.meta.protocol.agents.roles, meta.protocol.agents.roles, 'manual role edits are preserved');
  assert.match(first.warnings.join('\n'), /legacy commands preserved/);
  const rerun = configureConnections(first.meta, { preset: 'manual', builder: 'codex' });
  assert.deepEqual(rerun.meta, first.meta, 'same connect command is a configuration no-op');

  const migrated = configureConnections(first.meta, { preset: 'manual', builder: 'codex', migrateLegacy: true });
  assert.equal(migrated.meta.protocol.executor.command, '', 'explicit migration clears only the rebound legacy command');
});

test('non-interactive connect is offline; only agent test --live invokes the provider model path', () => {
  const root = scratch();
  const marker = join(root, 'model-called');
  const binary = shellCli(root, 'codex-test', { modelMarker: marker });
  assert.equal(chalk(root, ['init', '--bare', '--executor', 'none', '--no-agents', '--no-telemetry']).code, 0);
  const connected = chalk(root, [
    'connect', '--preset', 'assisted', '--builder', 'codex', '--reviewer', 'codex',
    '--binary', `codex=${binary}`, '--builder-profile', 'builder', '--reviewer-profile', 'reviewer',
  ]);
  assert.equal(connected.code, 0, connected.out);
  assert.match(connected.out, /offline; no model call/);
  assert.equal(existsSync(marker), false, 'connect performs version/auth probes only');
  const config = JSON.parse(readFileSync(join(root, '.chalk', 'chalk.json'), 'utf8')).protocol;
  assert.equal(config.agents.roles.executor, 'builder');
  assert.equal(config.agents.roles.reviewer, 'reviewer');
  assert.equal(config.executor.command, '', 'connect writes no legacy provider command');

  const offline = chalk(root, ['agent', 'test', 'builder']);
  assert.equal(offline.code, 0, offline.out);
  assert.match(offline.out, /15\/15 passed/);
  assert.equal(existsSync(marker), false, 'offline conformance is fixture-backed');
  const live = chalk(root, ['agent', 'test', 'builder', '--live']);
  assert.equal(live.code, 0, live.out);
  assert.match(live.out, /explicit live smoke/);
  assert.match(live.out, /1\/1 passed/);
  assert.equal(readFileSync(marker, 'utf8'), 'model-called');
});

test('missing binary, authentication, unsupported role, and ambiguity include exact next actions', () => {
  const missingRoot = scratch();
  assert.equal(chalk(missingRoot, ['init', '--bare', '--executor', 'none', '--no-agents', '--no-telemetry']).code, 0);
  const missing = chalk(missingRoot, ['connect', '--preset', 'manual', '--builder', 'codex', '--binary', 'codex=/definitely/missing/codex']);
  assert.equal(missing.code, 2);
  assert.match(missing.out, /was not found/);
  assert.match(missing.out, /next: npm install -g @openai\/codex/);

  const authRoot = scratch();
  const noAuth = shellCli(authRoot, 'codex-no-auth', { auth: false });
  assert.equal(chalk(authRoot, ['init', '--bare', '--executor', 'none', '--no-agents', '--no-telemetry']).code, 0);
  const auth = chalk(authRoot, ['connect', '--preset', 'manual', '--builder', 'codex', '--binary', `codex=${noAuth}`]);
  assert.equal(auth.code, 2);
  assert.match(auth.out, /authentication is missing or expired/);
  assert.match(auth.out, /next: codex login; then run chalk agent test codex --live/);

  const incapable = {
    tiny: {
      id: 'tiny', displayName: 'Tiny', roles: ['executor'], command: 'tiny',
      capabilities: { access: ['workspace-write'], output: ['text'] },
    },
  };
  assert.throws(
    () => configureConnections(baseMeta(), { preset: 'assisted', builder: 'tiny', reviewer: 'tiny' }, incapable),
    /does not support reviewer; choose chalk connect --reviewer/,
  );

  const ambiguousRoot = scratch();
  shellCli(ambiguousRoot, 'claude');
  shellCli(ambiguousRoot, 'codex');
  assert.equal(chalk(ambiguousRoot, ['init', '--bare', '--executor', 'none', '--no-agents', '--no-telemetry']).code, 0);
  const ambiguous = chalk(ambiguousRoot, ['connect'], { ...process.env, PATH: ambiguousRoot });
  assert.equal(ambiguous.code, 1);
  assert.match(ambiguous.out, /multiple agent CLIs detected \(claude, codex\)/);
  assert.match(ambiguous.out, /Select one explicitly: chalk connect --preset assisted --builder <adapter> --reviewer <adapter>/);
});

test('connect documentation promises CLI-owned auth, safe reruns, scripts, and explicit live cost', () => {
  const docs = readFileSync(join(ROOT, 'docs', 'CONNECT.md'), 'utf8');
  assert.match(docs, /manual`[\s\S]+assisted`[\s\S]+autonomous`/);
  assert.match(docs, /additive and idempotent/);
  assert.match(docs, /--replace[\s\S]+--migrate-legacy/);
  assert.match(docs, /never stores their credentials/);
  assert.match(docs, /Only `--live` permits one real model call/);
});
