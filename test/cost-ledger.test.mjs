// Token-level cost ledger (#99) — the ledger recorded only THAT an agent was called (ms); now
// claude-shaped commands get `--output-format json` injected, the envelope (usage tokens /
// total_cost_usd / num_turns) is harvested into .chalk/local/cost.jsonl, and the inner result is
// unwrapped BEFORE the existing parsers see it. Every wired stage is pinned END-TO-END through a
// fake `claude` on PATH that emits the envelope ONLY when the flag was injected — so reverting the
// injection or the unwrap at any single call site (review/retro/plan/discovery/feedback/executor)
// fails this suite. Commands that pin their own --output-format are left untouched; non-claude
// runners stay ms-only; a malformed envelope never fails a stage; `chalk cost` reports per-stage
// and per-task tokens, overhead share, and tokens-per-accepted-task while still rendering a legacy
// ms-only ledger. Locked contract for task-a8aa7559.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isClaudeShaped, withJsonOutput, parseEnvelope, unwrapAgentOutput } from '../lib/cost.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, env, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const ledger = (d) => readFileSync(join(d, '.chalk/local/cost.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const TOKENS = { in: 100, out: 50, cacheRead: 7, cacheWrite: 3 };

const ENVELOPE = (result, over = {}) => JSON.stringify({
  type: 'result', subtype: 'success', is_error: false, result,
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 },
  total_cost_usd: 0.12, num_turns: 4, ...over,
});

// A spine plus a fake `claude` on PATH. The shim consumes stdin, then emits the ENVELOPE wrapping
// `innerResult` ONLY when `--output-format json` is present in argv (else a sentinel) — so every
// stage configured as `claude -p` proves BOTH halves: the injection and the unwrap. `extraJs` lets
// a test add behavior (exit codes, stderr noise, oversized output).
function repoWithFakeClaude(innerResult, { extraJs = '' } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-cost-'));
  chalk(d, {}, 'init', '--name', 'demo');
  const bin = join(d, 'fakebin'); mkdirSync(bin);
  writeFileSync(join(bin, 'claude'), [
    '#!/usr/bin/env node',
    "import { readFileSync } from 'node:fs';",
    'readFileSync(0);',
    "if (process.argv.includes('--output-format') && process.argv.includes('json')) console.log(" + JSON.stringify(ENVELOPE(innerResult)) + ');',
    "else console.log('NO-FLAG-INJECTED');",
    extraJs,
  ].join('\n'));
  chmodSync(join(bin, 'claude'), 0o755);
  const env = { PATH: `${bin}:${process.env.PATH}` };
  const conf = (fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
  const seedTask = (extra = {}) => writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', acceptanceCriteria: [{ text: 'x' }], tests: [], reviews: [], pipeline: { stage: 'pr-open', at: '2026-01-01T00:00:00Z' }, pr: { number: 1, recorded: true }, ...extra }]));
  return { d, env, conf, seedTask };
}
const stageTokens = (d, stage) => ledger(d).filter((x) => x.stage === stage).pop();

test('isClaudeShaped / withJsonOutput — inject only into claude print-mode commands without a pinned format', () => {
  assert.equal(withJsonOutput('claude -p --agent chalk-reviewer'), 'claude -p --agent chalk-reviewer --output-format json');
  assert.equal(withJsonOutput('claude --print --max-turns 20'), 'claude --print --max-turns 20 --output-format json');
  // A pinned --output-format is the user's choice — untouched (both spellings).
  assert.equal(withJsonOutput('claude -p --output-format stream-json'), 'claude -p --output-format stream-json');
  assert.equal(withJsonOutput('claude -p --output-format=json'), 'claude -p --output-format=json');
  // Non-claude runners and non-print invocations are untouched.
  assert.equal(withJsonOutput('node adapter.mjs -p'), 'node adapter.mjs -p');
  assert.equal(withJsonOutput('claude mcp list'), 'claude mcp list');
  assert.equal(isClaudeShaped(''), false);
});

test('parseEnvelope / unwrapAgentOutput — harvest a real envelope; never mis-unwrap or throw on anything else', () => {
  const env = parseEnvelope(ENVELOPE('inner text'));
  assert.deepEqual(env.tokens, TOKENS);
  assert.equal(env.costUsd, 0.12);
  assert.equal(env.turns, 4);
  assert.equal(env.result, 'inner text');
  const un = unwrapAgentOutput(ENVELOPE('{"verdict":"pass","findings":[]}'));
  assert.equal(un.text, '{"verdict":"pass","findings":[]}', 'the inner result reaches the parsers');
  assert.equal(un.usage.tokens.in, 100);
  // A prepended banner/warning line must not hide the envelope (it is single-line JSON).
  const banner = unwrapAgentOutput('some MCP warning banner\n' + ENVELOPE('after banner'));
  assert.equal(banner.text, 'after banner', 'the last JSON line is still recognized as the envelope');
  // A bare agent JSON payload (no type:result envelope) passes through untouched — no mis-unwrap.
  const bare = unwrapAgentOutput('{"verdict":"block","findings":[]}');
  assert.equal(bare.text, '{"verdict":"block","findings":[]}');
  assert.equal(bare.usage, null);
  // Garbage / prose / empty: passthrough, usage null, no throw.
  for (const raw of ['not json at all', '', null, '{"type":"result"}', ENVELOPE(42).replace('"inner', '"broken')]) {
    const u = unwrapAgentOutput(raw);
    assert.equal(typeof u.text, 'string');
  }
});

test('review via claude — flag injected, verdict parsed from the inner result, tokens in the ledger', () => {
  const { d, env, conf, seedTask } = repoWithFakeClaude('Verdict follows.\n{"verdict":"pass","findings":[]}');
  conf((p) => { p.review = { command: 'claude -p', requiredAt: ['per-task'] }; });
  seedTask();
  const r = chalk(d, env, 'review', 'task-aaaaaaaa');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /review PASS/i, 'the parser saw the INNER result');
  assert.doesNotMatch(r.out, /NO-FLAG-INJECTED/, 'the flag was injected at the review call site');
  assert.deepEqual(stageTokens(d, 'review').tokens, TOKENS, 'review usage harvested');
  assert.equal(stageTokens(d, 'review').costUsd, 0.12);
});

test('review via claude that exits NONZERO — stdout-first parse still finds the enveloped verdict', () => {
  const { d, env, conf, seedTask } = repoWithFakeClaude('{"verdict":"pass","findings":[]}', { extraJs: "console.error('transient stderr noise'); process.exit(1);" });
  conf((p) => { p.review = { command: 'claude -p', requiredAt: ['per-task'] }; });
  seedTask();
  const r = chalk(d, env, 'review', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `stderr appended after the envelope must not hide the verdict: ${r.out}`);
  assert.match(r.out, /review PASS/i);
  assert.deepEqual(stageTokens(d, 'review').tokens, TOKENS);
});

test('retro via claude — flag injected, {lessons,issues} parsed from the inner result, tokens in the ledger', () => {
  const { d, env, conf } = repoWithFakeClaude('{"lessons":["a durable lesson"],"issues":[]}');
  conf((p) => { p.retro = { command: 'claude -p' }; });
  const r = chalk(d, env, 'retro', '--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /a durable lesson/, 'the inner JSON reached the retro parser');
  assert.deepEqual(stageTokens(d, 'retro').tokens, TOKENS, 'retro usage harvested');
});

test('plan via claude — flag injected, the stored plan is the INNER text, tokens in the ledger', () => {
  const { d, env, conf, seedTask } = repoWithFakeClaude('THE PLAN: do the thing.');
  conf((p) => { p.planner = { command: 'claude -p' }; });
  seedTask({ state: 'specd', pipeline: { stage: 'branched', at: '2026-01-01T00:00:00Z' }, pr: undefined });
  const r = chalk(d, env, 'plan', 'task-aaaaaaaa');
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].plan, 'THE PLAN: do the thing.', 'the plan is the unwrapped text, not the envelope JSON');
  assert.deepEqual(stageTokens(d, 'plan').tokens, TOKENS, 'planner usage harvested');
});

test('discovery via claude — flag injected, the tasks parse from the inner result, tokens in the ledger', () => {
  const { d, env, conf } = repoWithFakeClaude('{"tasks":[{"title":"feat: discovered thing","criteria":["it works"]}]}');
  conf((p) => { p.discovery = { command: 'claude -p' }; });
  const r = chalk(d, env, 'discover', 'a product brief', '--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /discovered thing/, 'the inner JSON reached the discovery parser');
  assert.deepEqual(stageTokens(d, 'discovery').tokens, TOKENS, 'discovery usage harvested');
});

test('feedback via claude — flag injected, the issues parse from the inner result, tokens in the ledger', () => {
  const { d, env, conf } = repoWithFakeClaude('{"issues":[{"title":"fix: reported friction","body":"from a signal","severity":"med"}]}');
  conf((p) => { p.feedback = { command: 'claude -p' }; });
  mkdirSync(join(d, '.chalk/feedback'), { recursive: true });
  writeFileSync(join(d, '.chalk/feedback/signal.md'), 'users report friction\n');
  const r = chalk(d, env, 'feedback', '--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /reported friction/, 'the inner JSON reached the feedback parser');
  assert.deepEqual(stageTokens(d, 'feedback').tokens, TOKENS, 'feedback usage harvested');
});

test('a NON-claude reviewer stays ms-only; a self-emitted envelope is still unwrapped opportunistically', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-cost-'));
  chalk(d, {}, 'init', '--name', 'demo');
  const conf = (fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
  const seed = () => writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', acceptanceCriteria: [{ text: 'x' }], tests: [], reviews: [], pipeline: { stage: 'pr-open', at: '2026-01-01T00:00:00Z' }, pr: { number: 1, recorded: true } }]));
  // Bare verdict from a node stub: the stage works exactly as before, record is ms-only.
  writeFileSync(join(d, 'rev.mjs'), `console.log('{"verdict":"pass","findings":[]}');`);
  conf((p) => { p.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; });
  seed();
  assert.equal(chalk(d, {}, 'review', 'task-aaaaaaaa').code, 0);
  const rec = ledger(d).filter((x) => x.stage === 'review').pop();
  assert.equal(rec.tokens, undefined, 'no fabricated usage — ms-only, like the legacy shape');
  assert.ok(rec.ms >= 0);
  // The same non-claude stub emitting an ENVELOPE gets harvested anyway (opportunistic fallback).
  writeFileSync(join(d, 'rev.mjs'), `console.log(${JSON.stringify(ENVELOPE('{"verdict":"pass","findings":[]}'))});`);
  seed();
  assert.equal(chalk(d, {}, 'review', 'task-aaaaaaaa').code, 0);
  assert.deepEqual(ledger(d).filter((x) => x.stage === 'review').pop().tokens, TOKENS);
});

test('executor capture — flag injected, usage recorded, a >1MiB narrative survives and is re-emitted', () => {
  // The narrative exceeds execSync's 1MiB default buffer — pins the widened capture buffer.
  const big = 'EXEC-NARRATIVE: did the work. ' + 'x'.repeat(2 * 1024 * 1024);
  const { d, env, conf } = repoWithFakeClaude(big);
  conf((p) => { p.executor = { command: 'claude -p' }; });
  // branchType chore → exempt from the test-enforcement gate; verify unconfigured → vacuous green.
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'chore: a', state: 'specd', branchType: 'chore', acceptanceCriteria: [{ text: 'x' }], tests: [], reviews: [] }]));
  const r = chalk(d, env, 'run', '--max', '1');
  assert.match(r.out, /EXEC-NARRATIVE: did the work/, 'the executor narrative is re-emitted — output is not lost');
  assert.doesNotMatch(r.out, /NO-FLAG-INJECTED/, '--output-format json was injected');
  const rec = ledger(d).filter((x) => x.stage === 'work').pop();
  assert.deepEqual(rec.tokens, TOKENS, 'executor usage captured despite the oversized payload');
  assert.equal(rec.taskId, 'task-aaaaaaaa');
});

test('chalk cost — tokens per stage/task, overhead share, tokens-per-accepted-task; legacy-only ledger still renders', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-cost-'));
  chalk(d, {}, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'feat: a', state: 'done', doneAt: '2026-01-01T00:00:00Z' }]));
  mkdirSync(join(d, '.chalk/local'), { recursive: true });
  const t = (stage, tokens, extra = {}) => JSON.stringify({ at: '2026-01-01T00:00:00Z', taskId: 'task-aaaaaaaa', stage, agent: stage, ms: 1000, tokens, ...extra });
  writeFileSync(join(d, '.chalk/local/cost.jsonl'), [
    JSON.stringify({ at: '2025-12-01T00:00:00Z', taskId: 'task-aaaaaaaa', stage: 'review', agent: 'reviewer', ms: 500 }), // legacy ms-only
    t('work', { in: 700, out: 200, cacheRead: 50, cacheWrite: 50 }, { costUsd: 0.5, turns: 10 }),
    t('review', { in: 200, out: 50, cacheRead: 0, cacheWrite: 0 }, { costUsd: 0.1, turns: 2 }),
    t('plan', { in: 100, out: 100, cacheRead: 0, cacheWrite: 0 }),
  ].join('\n') + '\n');
  const r = chalk(d, {}, 'cost');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /work\s+1\.0k tokens/i, 'per-stage token totals');
  assert.match(r.out, /overhead share.*31%/i, 'gate tokens (450) vs total (1450) tokens');
  assert.match(r.out, /tokens per accepted task/i);
  assert.match(r.out, /task-aaaaaaa/i, 'per-task tokens listed');
  assert.match(r.out, /\$0\.60/, 'costUsd totalled');
  // Legacy-only ledger: the classic view, no tokens section, no crash.
  writeFileSync(join(d, '.chalk/local/cost.jsonl'), JSON.stringify({ at: '2025-12-01T00:00:00Z', stage: 'review', agent: 'reviewer', ms: 500 }) + '\n');
  const r2 = chalk(d, {}, 'cost');
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.out, /reviewer.*1 call/i);
  assert.doesNotMatch(r2.out, /overhead share/i, 'the tokens section only appears when usage exists');
});
