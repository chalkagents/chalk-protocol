import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'AGENT_ADAPTER_PROTOCOL.md');
const FAKE = join(ROOT, 'examples', 'agent-adapter-v1', 'fake-adapter.mjs');
const md = readFileSync(DOC, 'utf8');

function example(name) {
  const fence = '```';
  const match = md.match(new RegExp(`<!-- example:${name} -->\\n${fence}json\\n([\\s\\S]*?)\\n${fence}`));
  assert.ok(match, `missing JSON example: ${name}`);
  return JSON.parse(match[1]);
}

function invoke(request) {
  const result = spawnSync(process.execPath, [FAKE], {
    cwd: ROOT,
    input: JSON.stringify(request),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const request = (overrides = {}) => ({
  protocolVersion: 'chalk-agent-adapter/1',
  requestId: 'req-test-1',
  role: 'planner',
  instructions: 'Plan the task.',
  context: 'A task context with `backticks`, $VARS, quotes, and\nnewlines.',
  access: 'read-only',
  output: { kind: 'text' },
  timeoutMs: 60_000,
  workingDirectory: ROOT,
  adapterOptions: {},
  ...overrides,
});

test('Agent Adapter Protocol v1 is normative, versioned, and defines the seam', () => {
  assert.match(md, /Protocol identifier:\*\* `chalk-agent-adapter\/1`/);
  for (const term of ['MUST', 'MUST NOT', 'SHOULD', 'SHOULD NOT', 'MAY']) {
    assert.match(md, new RegExp(`\\*\\*${term}\\*\\*`), `${term} is defined normatively`);
  }
  assert.match(md, /## 10\. Raw-command compatibility/);
  assert.match(md, /## 11\. Responsibility split/);
  assert.match(md, /Chalk core owns \| Adapter owns/);
  assert.match(readFileSync(join(ROOT, 'README.md'), 'utf8'), /AGENT_ADAPTER_PROTOCOL\.md/);
});

test('the protocol maps every current agent-backed stage to access and output contracts', () => {
  const roles = [
    ['executor', 'workspace-write', 'text'],
    ['planner', 'read-only', 'text'],
    ['reviewer', 'read-only', 'json'],
    ['discovery', 'read-only', 'json'],
    ['feedback', 'read-only', 'json'],
    ['retro', 'read-only', 'json'],
    ['handoff', 'read-only', 'text'],
    ['pr-narrative', 'read-only', 'text'],
    ['regression-author', 'workspace-write', 'none'],
  ];
  for (const [role, access, output] of roles) {
    const row = md.split('\n').find((line) => line.startsWith('| `' + role + '` |'));
    assert.ok(row, `missing role row: ${role}`);
    assert.ok(row.includes('| `' + access + '` | `' + output), `wrong contract for ${role}: ${row}`);
  }
  assert.match(md, /independenceKey[\s\S]+opaque, case-sensitive string/);
  assert.match(md, /MUST NOT derive or parse it from provider names/);
});

test('all required request/response examples are valid Protocol v1 JSON', () => {
  const textRequest = example('text-request');
  const textResponse = example('text-response');
  const jsonRequest = example('json-request');
  const jsonResponse = example('json-response');
  const failure = example('failure-response');

  assert.equal(textRequest.output.kind, 'text');
  assert.equal(textResponse.status, 'ok');
  assert.equal(typeof textResponse.text, 'string');
  assert.ok(textResponse.usage.inputTokens > 0, 'usage-reporting example is populated');
  assert.equal(jsonRequest.output.kind, 'json');
  assert.equal(jsonResponse.structured.verdict, 'pass');
  assert.equal(failure.status, 'failed');
  assert.ok(failure.diagnostics.length);
  for (const value of [textRequest, textResponse, jsonRequest, jsonResponse, failure]) {
    assert.equal(value.protocolVersion, 'chalk-agent-adapter/1');
  }
});

test('standalone fake adapter implements text, structured, failure, and usage responses', () => {
  const source = readFileSync(FAKE, 'utf8');
  assert.doesNotMatch(source, /(?:\.\.\/)+(?:lib|bin)\//, 'fixture imports no Chalk internals');
  assert.doesNotMatch(source, /from ['"]chalk-protocol['"]/, 'fixture imports no Chalk package');

  const text = invoke(request());
  assert.equal(text.status, 'ok');
  assert.match(text.text, /backticks.*\$VARS.*newlines/s, 'multiline context reaches the adapter verbatim');
  assert.deepEqual(text.usage, { inputTokens: 12, outputTokens: 5, turns: 1 });
  assert.equal(text.identity.independenceKey, 'fake-adapter-family');
  assert.equal(text.capabilities.accessEnforced, 'read-only');

  const structured = invoke(request({
    role: 'reviewer',
    output: { kind: 'json', schema: 'chalk/reviewer-result/1' },
  }));
  assert.deepEqual(structured.structured, { verdict: 'pass', findings: [], decisions: [] });

  const failure = invoke(request({ adapterOptions: { fixture: 'failure' } }));
  assert.equal(failure.status, 'failed');
  assert.equal(failure.diagnostics[0].retryable, true);
});
