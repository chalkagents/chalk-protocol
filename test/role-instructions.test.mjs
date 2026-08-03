// Provider-neutral canonical role instructions and generated native convenience assets.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLE_INSTRUCTIONS, GENERATED_NATIVE_ROLES, renderClaudeAgent } from '../lib/role-instructions.mjs';
import { runAgent } from '../lib/agent-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = join(ROOT, 'examples', 'agent-runner', 'fake-raw-agent.mjs');
const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE)} text`;

test('canonical provider-neutral instructions cover every Protocol v1 role', () => {
  assert.deepEqual(Object.keys(ROLE_INSTRUCTIONS).sort(), ['discovery', 'executor', 'feedback', 'handoff', 'planner', 'pr-narrative', 'regression-author', 'retro', 'reviewer']);
  for (const [role, instructions] of Object.entries(ROLE_INSTRUCTIONS)) {
    assert.ok(instructions.trim().length > 40, `${role} has substantive instructions`);
    assert.doesNotMatch(instructions, /claude|gemini|codex|opencode|anthropic|openai|--model|tools:|model:|^---$/im, `${role} is provider neutral`);
  }
  assert.match(ROLE_INSTRUCTIONS.executor, /chalk raise/i, 'executor raise behavior remains canonical');
  assert.match(ROLE_INSTRUCTIONS.reviewer, /decision digest/i, 'reviewer decision digest remains canonical');
});

test('Agent Runner keeps instructions and context separate, and raw commands combine them', () => {
  const result = runAgent('planner', {
    profile: { name: 'raw', command, identity: null }, cwd: mkdtempSync(join(tmpdir(), 'chalk-role-input-')),
    instructions: 'CUSTOM ROLE INSTRUCTION', context: 'CUSTOM RUN CONTEXT',
  });
  assert.equal(result.status, 'ok');
  assert.match(result.text, /# Role instructions[\s\S]*CUSTOM ROLE INSTRUCTION[\s\S]*# Run context[\s\S]*CUSTOM RUN CONTEXT/);
});

test('native agent assets are generated conveniences and cannot drift from canonical content', () => {
  assert.deepEqual(GENERATED_NATIVE_ROLES, ['executor', 'planner', 'reviewer', 'retro']);
  for (const role of GENERATED_NATIVE_ROLES) {
    assert.equal(readFileSync(join(ROOT, 'share', 'agents', `chalk-${role}.md`), 'utf8'), renderClaudeAgent(role));
    assert.equal(readFileSync(join(ROOT, '.claude', 'agents', `chalk-${role}.md`), 'utf8'), renderClaudeAgent(role, { dogfood: true }));
  }
  assert.doesNotMatch(readFileSync(join(ROOT, 'lib', 'role-instructions.mjs'), 'utf8'), /readFileSync|share\/agents/, 'runtime canonical source does not depend on generated assets');
});
