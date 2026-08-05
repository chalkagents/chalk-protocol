// `chalk init --executor opencode` scaffolding. Wires protocol.executor.command to the bundled
// opencode-exec adapter via an ABSOLUTE path, so it resolves when chalk is linked/installed and
// the executor runs from an arbitrary project cwd (not this repo). Locked red→green spec.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { initSpine } from '../lib/store.mjs';
import { commandWords } from '../lib/process.mjs';

const readProtocol = (root) => JSON.parse(readFileSync(join(root, '.chalk', 'chalk.json'), 'utf8')).protocol;

test('initSpine — executor:"opencode" scaffolds an absolute-path command to the opencode-exec adapter', () => {
  const d = mkdtempSync(join(tmpdir(), 'init-oc-'));
  initSpine(d, { name: 'app', goal: 'g', executor: 'opencode' });
  const cmd = readProtocol(d).executor.command;
  const [binary, path] = commandWords(cmd);
  assert.equal(binary, 'node');
  assert.ok(isAbsolute(path), `adapter path must be absolute: ${path}`);
  assert.match(path, /bin\/adapters\/opencode-exec\.mjs$/); // points at the bundled adapter
  assert.ok(existsSync(path), `scaffolded adapter path must exist: ${path}`); // not a dangling ref
});

test('initSpine — no executor option leaves executor.command empty (unchanged default)', () => {
  const d = mkdtempSync(join(tmpdir(), 'init-noop-'));
  initSpine(d, { name: 'app', goal: 'g' });
  assert.equal(readProtocol(d).executor.command, '');
});
