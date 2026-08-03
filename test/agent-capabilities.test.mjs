// Canonical access/output contracts, honest capability readiness, read-only mutation refusal, and
// provider-neutral structured diagnostics. Malicious changes are identified but never deleted.
import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLE_CONTRACTS, checkRoleCapabilities } from '../lib/agent-contracts.mjs';
import { runAgent } from '../lib/agent-runner.mjs';
import { runDoctor } from '../lib/doctor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = join(ROOT, 'examples', 'agent-runner', 'fake-raw-agent.mjs');
const fake = (fixture) => `${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE)} ${fixture}`;
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-agent-capabilities-'));
const profile = (fixture, over = {}) => ({ name: `fake-${fixture}`, adapter: 'fake-provider', command: fake(fixture), identity: null, capabilities: null, ...over });

test('every canonical role declares access and output', () => {
  assert.deepEqual(Object.keys(ROLE_CONTRACTS).sort(), ['discovery', 'executor', 'feedback', 'handoff', 'planner', 'pr-narrative', 'regression-author', 'retro', 'reviewer']);
  for (const [role, contract] of Object.entries(ROLE_CONTRACTS)) {
    assert.ok(['read-only', 'workspace-write'].includes(contract.access), `${role} access`);
    assert.ok(['text', 'json', 'none'].includes(contract.output.kind), `${role} output`);
    if (contract.output.kind === 'json') assert.match(contract.output.schema, /^chalk\//);
  }
});

test('an incapable adapter fails readiness and is not executed', () => {
  const d = scratch();
  const incapable = profile('executor-write', { capabilities: { access: ['read-only'], output: ['text'] } });
  const support = checkRoleCapabilities('executor', incapable);
  assert.equal(support.ok, false);
  const result = runAgent('executor', { profile: incapable, cwd: d });
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics[0].code, 'unsupported-capability');
  assert.equal(existsSync(join(d, 'executor-created.txt')), false, 'capability refusal happens before invocation');

  const protocol = {
    github: {}, verify: { test: 'node --test' }, review: {}, regression: {}, plan: {}, worktree: { enabled: false },
    agents: { version: 1, profiles: { incapable }, roles: { executor: 'incapable' } },
  };
  const checks = runDoctor({ root: d, protocol: () => protocol, tasks: () => [] });
  assert.ok(checks.some((x) => x.area === 'agents' && x.level === 'fail' && /workspace-write/.test(x.msg)));
});

test('a malicious read-only role is refused, names paths, and leaves user data untouched', () => {
  const d = scratch();
  const result = runAgent('reviewer', { profile: profile('malicious-reviewer'), cwd: d, stderr: 'capture' });
  assert.equal(result.status, 'failed');
  assert.equal(result.structured, null, 'a valid verdict is not accepted after mutation');
  const mutation = result.diagnostics.find((x) => x.code === 'read-only-mutation');
  assert.match(mutation.message, /mutated-by-reviewer\.txt/);
  const path = join(d, 'mutated-by-reviewer.txt');
  assert.equal(readFileSync(path, 'utf8'), 'user data remains here\n', 'Chalk reports but never deletes the mutation');
});

test('structured roles decode once and return consistent malformed/schema diagnostics', () => {
  const valid = runAgent('reviewer', { profile: profile('reviewer'), cwd: scratch(), stderr: 'capture' });
  assert.equal(valid.status, 'ok');
  assert.deepEqual(valid.structured, { verdict: 'pass', findings: [], decisions: [] });
  assert.equal(valid.capabilities.structuredOutput, 'chalk-decoded-and-validated');

  const invalid = runAgent('reviewer', { profile: profile('schema-invalid'), cwd: scratch(), stderr: 'capture' });
  assert.equal(invalid.status, 'failed');
  assert.equal(invalid.diagnostics.find((x) => x.code === 'schema-invalid')?.code, 'schema-invalid');

  for (const adapter of ['provider-a', 'provider-b']) {
    const truncated = runAgent('reviewer', { profile: profile('truncated-json', { adapter }), cwd: scratch(), stderr: 'capture' });
    assert.equal(truncated.status, 'failed');
    assert.equal(truncated.diagnostics.find((x) => x.code === 'malformed-structured-output')?.code, 'malformed-structured-output');
  }
});

test('executor workspace-write behavior is unaffected', () => {
  const d = scratch();
  const result = runAgent('executor', { profile: profile('executor-write'), cwd: d });
  assert.equal(result.status, 'ok');
  assert.equal(readFileSync(join(d, 'executor-created.txt'), 'utf8'), 'allowed executor write\n');
  assert.equal(result.capabilities.accessEnforced, 'workspace-write');
});
