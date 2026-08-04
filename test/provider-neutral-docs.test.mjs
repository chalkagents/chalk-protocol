import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ADAPTER_MANIFESTS } from '../lib/adapter-registry.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

function manifestRecord(markdown, id) {
  const match = markdown.match(new RegExp(`<!-- adapter-manifest ${id} roles=([^ ]+) access=([^ ]+) output=([^ ]+) -->`));
  assert.ok(match, `missing machine-checkable ${id} manifest record`);
  return { roles: match[1].split(','), access: match[2].split(','), output: match[3].split(',') };
}

test('autonomous quickstart leads with init, connect, doctor, run and preserves manual no-model mode', () => {
  const quickstart = read('QUICKSTART.md');
  const autonomous = quickstart.slice(quickstart.indexOf('## 1. Autonomous happy path'), quickstart.indexOf('## 2. Manual mode'));
  const commands = ['chalk init', 'chalk connect', 'chalk doctor', 'chalk run'];
  let cursor = -1;
  for (const command of commands) {
    const next = autonomous.indexOf(command);
    assert.ok(next > cursor, `${command} must follow the preceding autonomous setup command`);
    cursor = next;
  }
  const manual = quickstart.slice(quickstart.indexOf('## 2. Manual mode'), quickstart.indexOf('## 3. Verify configuration'));
  assert.match(manual, /first-class workflow/i);
  assert.match(manual, /Skip `chalk connect`/);
  assert.match(manual, /chalk start <id>[\s\S]*chalk verify[\s\S]*chalk done <id>/);
});

test('provider pages and capability matrix are checked against adapter manifests', () => {
  const paths = {
    claude: 'docs/integrations/claude-code.md',
    opencode: 'docs/integrations/opencode.md',
    codex: 'docs/integrations/codex.md',
    gemini: 'docs/integrations/gemini-cli.md',
  };
  const matrix = read('docs/PROVIDER_MATRIX.md');
  for (const [id, manifest] of Object.entries(ADAPTER_MANIFESTS)) {
    const expected = { roles: [...manifest.roles], access: [...manifest.capabilities.access], output: [...manifest.capabilities.output] };
    assert.deepEqual(manifestRecord(read(paths[id]), id), expected, `${id} provider page drifted from its manifest`);
    assert.deepEqual(manifestRecord(matrix, id), expected, `${id} matrix row drifted from its manifest`);
  }
});

test('migration guide covers every legacy field and keeps migration explicit', () => {
  const guide = read('docs/MIGRATING_TO_AGENT_PROFILES.md');
  for (const field of [
    'protocol.executor.command', 'protocol.planner.command', 'protocol.review.command',
    'protocol.discovery.command', 'protocol.feedback.command', 'protocol.retro.command',
    'protocol.handoff.command', 'protocol.prbody.command', 'protocol.regression.authorCommand',
  ]) assert.match(guide, new RegExp(field.replaceAll('.', '\\.') ));
  assert.match(guide, /chalk init --executor claude/);
  assert.match(guide, /chalk init --executor opencode/);
  assert.match(guide, /raw-command/);
  assert.match(guide, /do not need an immediate rewrite/i);
  assert.match(guide, /--replace/);
  assert.match(guide, /--migrate-legacy/);
  assert.match(guide, /No legacy removal date is scheduled/);
});

test('adapter author guide covers the complete Protocol v1 authoring contract', () => {
  const guide = read('docs/ADAPTER_AUTHOR_GUIDE.md');
  for (const term of [
    'chalk-agent-adapter/1', 'stdin', 'stdout', 'stderr', 'pack',
    'chalk adapter conformance --command', 'Diagnostics', 'Identity', 'Usage',
    'Security and permissions', 'independenceKey', 'read-only', 'workspace-write',
  ]) assert.ok(guide.includes(term), `adapter author guide must document ${term}`);
});

test('canonical config example and help stay provider-neutral', () => {
  const readme = read('README.md');
  const configSection = readme.slice(readme.indexOf('## Configuration'), readme.indexOf('## Telemetry'));
  const example = configSection.match(/```jsonc\n([\s\S]*?)```/)?.[1] || '';
  assert.match(example, /"adapter": "raw-command"/);
  assert.doesNotMatch(example, /claude|opencode|codex|gemini/i);

  const help = spawnSync(process.execPath, ['bin/chalk.mjs', 'help'], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /chalk connect/);
  assert.match(help.stdout, /provider-neutral agents/);
  assert.match(read('docs/CONFIG.md'), /migration guide/);
});

test('release notes preserve compatibility and state the deprecation timeline', () => {
  const changelog = read('CHANGELOG.md').slice(0, read('CHANGELOG.md').indexOf('## v0.3.0'));
  assert.match(changelog, /raw-command compatibility adapter/);
  assert.match(changelog, /continue to work without[\s\S]*forced migration/);
  assert.match(changelog, /No legacy command field or `--executor` option is removed or scheduled for removal/);
});

test('relative links in provider-neutral documentation resolve', () => {
  const paths = [
    'README.md', 'QUICKSTART.md', 'docs/CONFIG.md', 'docs/CONNECT.md', 'docs/PROVIDER_MATRIX.md',
    'docs/MIGRATING_TO_AGENT_PROFILES.md', 'docs/ADAPTER_AUTHOR_GUIDE.md',
    'docs/integrations/claude-code.md', 'docs/integrations/opencode.md',
    'docs/integrations/codex.md', 'docs/integrations/gemini-cli.md',
  ];
  for (const path of paths) {
    for (const match of read(path).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      const relative = decodeURIComponent(target.split('#')[0]);
      assert.ok(existsSync(resolve(root, dirname(path), relative)), `${path} has dead relative link ${target}`);
    }
  }
});
