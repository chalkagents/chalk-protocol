// Raw-command compatibility is byte-for-byte; Protocol v1 keeps instructions/context separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgent } from '../lib/agent-runner.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-raw-prompt-compat-'));

function captureCommand(root) {
  const file = join(root, 'capture-raw.mjs');
  writeFileSync(file, `
    import { readFileSync, writeFileSync } from 'node:fs';
    writeFileSync(process.env.CHALK_CAPTURE_FILE, readFileSync(0));
    process.stdout.write(process.env.CHALK_CAPTURE_OUTPUT || 'ok');
  `);
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(file)}`;
}

const outputFor = {
  reviewer: JSON.stringify({ verdict: 'pass', findings: [], decisions: [] }),
  discovery: JSON.stringify({ tasks: [] }),
  feedback: JSON.stringify({ issues: [] }),
  retro: JSON.stringify({ lessons: [], issues: [] }),
};

test('every raw-command role receives production context bytes without canonical instruction prefixing', () => {
  const root = scratch();
  const command = captureCommand(root);
  const roles = [
    'executor', 'planner', 'reviewer', 'discovery', 'feedback', 'retro', 'handoff',
    'pr-narrative', 'regression-author',
  ];
  for (const role of roles) {
    const capture = `${root}.${role}.stdin`;
    const context = `legacy ${role}\n\0-safe-ish text with \`ticks\`, $VARS, "quotes", and }{\n`;
    const result = runAgent(role, {
      profile: { name: `legacy/${role}`, adapter: 'raw-command', command, identity: null },
      context,
      instructions: `NEW CANONICAL INSTRUCTIONS FOR ${role}`,
      cwd: root,
      stream: false,
      env: {
        ...process.env,
        CHALK_CAPTURE_FILE: capture,
        CHALK_CAPTURE_OUTPUT: outputFor[role] || 'plain output',
      },
    });
    assert.equal(result.status, 'ok', `${role}: ${JSON.stringify(result.diagnostics)}`);
    assert.equal(readFileSync(capture, 'utf8'), context, `${role} stdin must remain byte-for-byte compatible`);
  }
});

test('Protocol v1 adapters receive canonical instructions and context as separate envelope fields', () => {
  const root = scratch();
  const capture = `${root}.protocol-request.json`;
  const file = join(root, 'capture-protocol.mjs');
  writeFileSync(file, `
    import { readFileSync, writeFileSync } from 'node:fs';
    const request = JSON.parse(readFileSync(0, 'utf8'));
    writeFileSync(process.env.CHALK_CAPTURE_FILE, JSON.stringify(request));
    process.stdout.write(JSON.stringify({
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
      status: 'ok',
      text: 'planned',
      diagnostics: [],
    }));
  `);
  const result = runAgent('planner', {
    profile: {
      name: 'protocol-capture', adapter: 'capture',
      command: `${JSON.stringify(process.execPath)} ${JSON.stringify(file)}`,
      capabilities: { roles: ['planner'], access: ['read-only'], output: ['text'] },
      options: {},
    },
    instructions: 'canonical instructions',
    context: 'task context',
    cwd: root,
    env: { ...process.env, CHALK_CAPTURE_FILE: capture },
  });
  assert.equal(result.status, 'ok', JSON.stringify(result.diagnostics));
  const request = JSON.parse(readFileSync(capture, 'utf8'));
  assert.equal(request.instructions, 'canonical instructions');
  assert.equal(request.context, 'task context');
});
