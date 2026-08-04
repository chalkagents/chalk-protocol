// Provider-neutral profiles: reusable role bindings, opaque model/identity values, legacy command
// normalization, versioned migration, and credential-safe doctor JSON.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareReviewerIndependence, resolveAgentConfiguration, resolveAgentRole } from '../lib/config.mjs';
import { runAgent } from '../lib/agent-runner.mjs';
import { SCHEMA_VERSION } from '../lib/store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const FAKE = join(ROOT, 'examples', 'agent-runner', 'fake-raw-agent.mjs');
const fake = (fixture = 'text') => `${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE)} ${fixture}`;
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-agent-profiles-'));
const chalk = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};

test('one named profile serves planner and executor and carries opaque model/identity', () => {
  const d = scratch();
  assert.equal(chalk(d, 'init', '--name', 'profiles', '--bare').code, 0);
  const configFile = join(d, '.chalk', 'chalk.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  config.protocol.planner.command = '';
  config.protocol.executor.command = '';
  config.protocol.agents.profiles.shared = {
    adapter: 'raw-command',
    command: fake('text'),
    model: 'opaque://model value --provider=never-parse-this',
    identity: { displayName: 'Shared fake', independenceKey: 'shared-family' },
    options: { endpoint: 'opaque' },
  };
  config.protocol.agents.roles = { planner: 'shared', executor: 'shared' };
  writeFileSync(configFile, JSON.stringify(config, null, 2));

  const resolved = resolveAgentConfiguration(config.protocol);
  assert.strictEqual(resolved.roles.planner, resolved.roles.executor, 'both bindings reuse one normalized profile object');
  assert.equal(resolved.roles.executor.model, 'opaque://model value --provider=never-parse-this');
  const result = runAgent('planner', { profile: resolved.roles.planner, input: 'shared input', output: { kind: 'text' } });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.identity, {
    displayName: 'Shared fake',
    model: 'opaque://model value --provider=never-parse-this',
    independenceKey: 'shared-family',
  });

  assert.equal(chalk(d, 'task', 'add', 'chore: shared profile').code, 0);
  const taskId = JSON.parse(readFileSync(join(d, '.chalk', 'tasks.json'), 'utf8'))[0].id.slice(0, 12);
  assert.equal(chalk(d, 'spec', taskId, '--criterion', 'shared profile works').code, 0);
  assert.equal(chalk(d, 'plan', taskId).code, 0, 'planner resolves the named profile');
  assert.equal(chalk(d, 'run', '--max', '1').code, 0, 'executor resolves the same named profile');
});

test('reviewer independence uses only explicit keys and otherwise stays unverified', () => {
  const base = {
    agents: {
      version: 1,
      profiles: {
        author: { adapter: 'raw-command', command: 'agent-a', model: 'same display', identity: { independenceKey: 'family-a' } },
        reviewer: { adapter: 'raw-command', command: 'agent-b', model: 'same display', identity: { independenceKey: 'family-b' } },
      },
      roles: { executor: 'author', reviewer: 'reviewer' },
    },
  };
  assert.equal(compareReviewerIndependence(base).status, 'distinct', 'different explicit keys verify independence even when model display matches');
  base.agents.profiles.reviewer.identity.independenceKey = 'family-a';
  assert.equal(compareReviewerIndependence(base).status, 'same');
  delete base.agents.profiles.reviewer.identity.independenceKey;
  assert.equal(compareReviewerIndependence(base).status, 'unverified', 'unknown is not guessed from commands or models');
});

test('legacy commands normalize into live compatibility profiles', () => {
  const protocol = {
    executor: { command: fake('text') },
    planner: { command: '' }, review: {}, discovery: {}, feedback: {}, retro: {}, handoff: {}, prbody: {}, regression: {},
    agents: { version: 1, profiles: {}, roles: {} },
  };
  const first = resolveAgentRole(protocol, 'executor');
  assert.equal(first.name, 'legacy/executor');
  assert.equal(first.source, 'legacy');
  assert.equal(first.identity, null, 'legacy commands do not invent identity');
  protocol.executor.command = 'user-edited-command --still-authoritative';
  assert.equal(resolveAgentRole(protocol, 'executor').command, protocol.executor.command, 'normalization follows later user edits');
});

test('schema 1.1 migration is additive, preserves commands, and is idempotent', () => {
  const d = scratch();
  assert.equal(chalk(d, 'init', '--name', 'migration', '--bare').code, 0);
  const configFile = join(d, '.chalk', 'chalk.json');
  const before = JSON.parse(readFileSync(configFile, 'utf8'));
  before.version = '1.1';
  delete before.protocol.agents;
  before.protocol.executor.command = 'user-edited-command --keep-exactly';
  writeFileSync(configFile, JSON.stringify(before, null, 2));

  const migrated = chalk(d, 'migrate');
  assert.equal(migrated.code, 0, migrated.out);
  const after = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(after.version, SCHEMA_VERSION);
  assert.deepEqual(after.protocol.agents, { version: 1, profiles: {}, roles: {} });
  assert.equal(after.protocol.executor.command, 'user-edited-command --keep-exactly');
  assert.match(chalk(d, 'migrate').out, /already current|nothing to migrate/i);
});

test('doctor JSON reports resolved bindings and explicit identity without connection secrets', () => {
  const d = scratch();
  assert.equal(chalk(d, 'init', '--name', 'doctor-profiles', '--bare').code, 0);
  const configFile = join(d, '.chalk', 'chalk.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  config.protocol.review.requiredAt = ['per-task'];
  config.protocol.agents.profiles = {
    author: {
      adapter: 'raw-command', command: 'fake-agent --token=COMMAND_SECRET', model: 'opaque-author',
      identity: { displayName: 'Author', independenceKey: 'author-key' }, options: { apiKey: 'OPTIONS_SECRET' },
    },
    reviewer: {
      adapter: 'raw-command', command: 'fake-reviewer', model: 'opaque-reviewer',
      identity: { displayName: 'Reviewer', independenceKey: 'reviewer-key' }, options: { bearerToken: 'BEARER_SECRET' },
    },
  };
  config.protocol.agents.roles = { executor: 'author', reviewer: 'reviewer' };
  writeFileSync(configFile, JSON.stringify(config, null, 2));

  const r = chalk(d, 'doctor', '--json');
  const report = JSON.parse(r.out);
  assert.equal(report.agents.roles.executor.profile, 'author');
  assert.equal(report.agents.roles.reviewer.identity.independenceKey, 'reviewer-key');
  assert.ok(report.results.some((x) => /independence verified/i.test(x.msg)), 'doctor reports the explicit distinct identity verdict');
  for (const secret of ['COMMAND_SECRET', 'OPTIONS_SECRET', 'BEARER_SECRET']) assert.doesNotMatch(r.out, new RegExp(secret));
  assert.equal(report.agents.roles.executor.command, undefined);
  assert.equal(report.agents.roles.executor.options, undefined);
});
