// opencode adapter — lets Chalk drive opencode (SST) as a BYO executor + JSON-contract agent.
// Chalk's executor contract pipes `chalk context` on STDIN; opencode's `run` takes the prompt as
// an ARGV element. buildRunArgs bridges that (no shell-quoting risk). extractJson robustly pulls
// the JSON object out of opencode's conversational stdout for the review/discovery/feedback roles
// (the Phase-3 risk: log lines with braces must not fool a greedy regex). Two thin bin/ adapters
// wire stdin → opencode using these. These are the LOCKED red→green spec for the integration.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRunArgs, extractJson } from '../lib/opencode.mjs';

const EXEC_ADAPTER = resolve('bin/adapters/opencode-exec.mjs');
const JSON_ADAPTER = resolve('bin/adapters/opencode-json.mjs');

// Write an executable fake `opencode` so the adapters spawn it instead of the real binary.
// `body` is the JS run after a shebang; it can read process.argv / stdin and write files.
function fakeOpencode(dir, body) {
  const p = join(dir, 'opencode');
  writeFileSync(p, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

// ── buildRunArgs: stdin prompt → opencode argv (flags first, prompt always last) ─────────────
test('buildRunArgs — defaults to `run --auto <prompt>` with the prompt as the final argv element', () => {
  assert.deepEqual(buildRunArgs('do the thing'), ['run', '--auto', 'do the thing']);
});

test('buildRunArgs — adds -m for a model and --attach for a warm server, before the prompt', () => {
  assert.deepEqual(
    buildRunArgs('hi', { model: 'anthropic/claude-opus-4-8' }),
    ['run', '--auto', '-m', 'anthropic/claude-opus-4-8', 'hi'],
  );
  assert.deepEqual(
    buildRunArgs('hi', { attach: 'http://localhost:4096' }),
    ['run', '--auto', '--attach', 'http://localhost:4096', 'hi'],
  );
  assert.deepEqual(
    buildRunArgs('hi', { model: 'm', attach: 'a' }),
    ['run', '--auto', '-m', 'm', '--attach', 'a', 'hi'],
  );
});

test('buildRunArgs — passes the prompt verbatim (quotes/newlines), never shell-split', () => {
  const nasty = 'fix `foo()`; add "bar"\nwith a newline & $VAR';
  const args = buildRunArgs(nasty, { model: 'm' });
  assert.equal(args[args.length - 1], nasty); // exactly one argv element, unmodified
});

// ── extractJson: opencode's chatty stdout → the JSON object the contract roles expect ─────────
test('extractJson — returns the parsed object for clean JSON', () => {
  assert.deepEqual(extractJson('{"verdict":"pass","findings":[]}'), { verdict: 'pass', findings: [] });
});

test('extractJson — strips surrounding prose', () => {
  assert.deepEqual(extractJson('Sure!\n{"verdict":"block","findings":["x"]}\nDone.'), { verdict: 'block', findings: ['x'] });
});

test('extractJson — strips ```json code fences', () => {
  assert.deepEqual(extractJson('```json\n{"a":1,"b":[2,3]}\n```'), { a: 1, b: [2, 3] });
});

test('extractJson — ignores brace-bearing log lines and returns the real object', () => {
  // a greedy /\{[\s\S]*\}/ would over-capture from the first stray "{"; the scanner must not.
  assert.deepEqual(extractJson('[debug] entering {scope}\n{"verdict":"pass","findings":[]}'), { verdict: 'pass', findings: [] });
});

test('extractJson — returns null when there is no JSON object', () => {
  assert.equal(extractJson('no json here at all'), null);
  assert.equal(extractJson(''), null);
});

// ── executor adapter: STDIN context → `opencode run --auto <context>` ─────────────────────────
test('opencode-exec adapter — pipes stdin context to opencode as the prompt argv, verbatim', () => {
  const d = mkdtempSync(join(tmpdir(), 'oc-exec-'));
  const argsFile = join(d, 'argv.json');
  fakeOpencode(d, `require('fs').writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)))`);
  const context = 'TASK: implement X\nCRITERIA:\n- "X" does Y\n- run `verify`';
  execFileSync('node', [EXEC_ADAPTER], {
    input: context,
    env: { ...process.env, CHALK_OPENCODE_BIN: join(d, 'opencode'), CHALK_OPENCODE_MODEL: 'anthropic/claude-opus-4-8' },
  });
  const argv = JSON.parse(readFileSync(argsFile, 'utf8'));
  assert.deepEqual(argv, ['run', '--auto', '-m', 'anthropic/claude-opus-4-8', context]);
});

// ── json adapter: STDIN prompt → opencode → CLEAN JSON on stdout (for review/discovery/etc) ───
test('opencode-json adapter — wraps the prompt, runs opencode, prints only parseable JSON', () => {
  const d = mkdtempSync(join(tmpdir(), 'oc-json-'));
  // fake opencode answers with prose + a fenced JSON block (the realistic, messy case)
  fakeOpencode(d, `process.stdout.write('Here is my verdict:\\n\\u0060\\u0060\\u0060json\\n{"verdict":"pass","findings":[]}\\n\\u0060\\u0060\\u0060\\nHope that helps!')`);
  const out = execFileSync('node', [JSON_ADAPTER], {
    input: 'Review this diff and return {"verdict":..,"findings":..}',
    env: { ...process.env, CHALK_OPENCODE_BIN: join(d, 'opencode') },
    encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(out), { verdict: 'pass', findings: [] }); // stdout is pure JSON, no prose/fences
});
