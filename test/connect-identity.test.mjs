// Reviewer independence is explicit: connect and adapters must never infer it from provider/model names.
import { test } from 'node:test';
import assert from 'node:assert';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compareReviewerIndependence } from '../lib/config.mjs';
import { runAgent } from '../lib/agent-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const scratch = (name = 'chalk-connect-identity-') => mkdtempSync(join(tmpdir(), name));
const chalk = (cwd, args) => {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
};

function fakeCli(root, name) {
  const file = join(root, name);
  writeFileSync(file, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log(${JSON.stringify(`${name} test-version`)}); process.exit(0); }
if (args[0] === 'login' && args[1] === 'status') { console.log('authenticated'); process.exit(0); }
console.log('{"response":"ok","stats":{"models":{}}}');
`);
  chmodSync(file, 0o755);
  return file;
}

function connectedProject() {
  const root = scratch();
  const codex = fakeCli(root, 'codex-test');
  const gemini = fakeCli(root, 'gemini-test');
  assert.equal(chalk(root, ['init', '--bare', '--executor', 'none', '--no-agents', '--no-telemetry']).code, 0);
  const args = [
    'connect', '--preset', 'assisted', '--builder', 'codex', '--reviewer', 'gemini',
    '--binary', `codex=${codex}`, '--binary', `gemini=${gemini}`,
    '--builder-profile', 'builder', '--reviewer-profile', 'reviewer',
    '--builder-model', 'opaque-builder-model', '--reviewer-model', 'opaque-reviewer-model',
  ];
  const connected = chalk(root, args);
  assert.equal(connected.code, 0, connected.out);
  const configPath = join(root, '.chalk', 'chalk.json');
  return { root, args, connected, configPath };
}

test('real chalk connect keeps distinct providers unverified until opaque keys are explicit', () => {
  const project = connectedProject();
  let meta = JSON.parse(readFileSync(project.configPath, 'utf8'));
  assert.equal(meta.protocol.agents.profiles.builder.identity.independenceKey, undefined);
  assert.equal(meta.protocol.agents.profiles.reviewer.identity.independenceKey, undefined);
  assert.equal(compareReviewerIndependence(meta.protocol).status, 'unverified');
  assert.match(project.connected.out, /independence cannot be verified/i);
  assert.match(project.connected.out, /identity\.independenceKey/i);
  assert.match(project.connected.out, /accept an unverified reviewer/i);

  meta.protocol.agents.profiles.builder.identity.independenceKey = 'opaque-family-a';
  meta.protocol.agents.profiles.reviewer.identity.independenceKey = 'opaque-family-a';
  writeFileSync(project.configPath, `${JSON.stringify(meta, null, 2)}\n`);
  const same = chalk(project.root, project.args);
  assert.equal(same.code, 0, same.out);
  meta = JSON.parse(readFileSync(project.configPath, 'utf8'));
  assert.equal(compareReviewerIndependence(meta.protocol).status, 'same');
  assert.match(same.out, /same configured identity/i);

  meta.protocol.agents.profiles.reviewer.identity.independenceKey = 'opaque-family-b';
  writeFileSync(project.configPath, `${JSON.stringify(meta, null, 2)}\n`);
  const distinct = chalk(project.root, project.args);
  assert.equal(distinct.code, 0, distinct.out);
  meta = JSON.parse(readFileSync(project.configPath, 'utf8'));
  assert.equal(compareReviewerIndependence(meta.protocol).status, 'distinct');
  assert.match(distinct.out, /distinct configured identities/i);
});

test('adapter-reported identity fills missing display metadata without replacing explicit keys', () => {
  const root = scratch('chalk-reported-identity-');
  const adapter = join(root, 'reported-identity.mjs');
  writeFileSync(adapter, `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const request = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify({
  protocolVersion: request.protocolVersion,
  requestId: request.requestId,
  status: 'ok',
  text: 'done',
  identity: { displayName: 'Adapter Reported Name', model: 'opaque://reported model' },
  capabilities: { accessEnforced: request.access, structuredOutput: 'none' },
  diagnostics: [],
}));
`);
  chmodSync(adapter, 0o755);
  const result = runAgent('planner', {
    cwd: scratch('chalk-reported-workspace-'),
    context: 'plan',
    profile: {
      name: 'reported', adapter: 'external', command: `${JSON.stringify(process.execPath)} ${JSON.stringify(adapter)}`,
      identity: { independenceKey: 'explicit-profile-key' },
      capabilities: { roles: ['planner'], access: ['read-only'], output: ['text'] }, options: {},
    },
  });
  assert.equal(result.status, 'ok', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.identity, {
    independenceKey: 'explicit-profile-key',
    displayName: 'Adapter Reported Name',
    model: 'opaque://reported model',
  });
});
