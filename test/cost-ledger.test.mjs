// Token-level cost ledger (#99) — the ledger recorded only THAT an agent was called (ms); now
// claude-shaped commands get `--output-format json` injected, the envelope (usage tokens /
// total_cost_usd / num_turns) is harvested into .chalk/local/cost.jsonl, and the inner result is
// unwrapped BEFORE the existing parsers see it. Commands that pin their own --output-format are
// left untouched; non-claude runners stay ms-only; a malformed envelope never fails a stage; the
// executor path captures usage without losing its narrative output; `chalk cost` reports per-stage
// and per-task tokens, overhead share, and tokens-per-accepted-task while still rendering a
// legacy ms-only ledger. Locked contract for task-a8aa7559.
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

const ENVELOPE = (result, over = {}) => JSON.stringify({
  type: 'result', subtype: 'success', is_error: false, result,
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 },
  total_cost_usd: 0.12, num_turns: 4, ...over,
});

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
  assert.deepEqual(env.tokens, { in: 100, out: 50, cacheRead: 7, cacheWrite: 3 });
  assert.equal(env.costUsd, 0.12);
  assert.equal(env.turns, 4);
  assert.equal(env.result, 'inner text');
  const un = unwrapAgentOutput(ENVELOPE('{"verdict":"pass","findings":[]}'));
  assert.equal(un.text, '{"verdict":"pass","findings":[]}', 'the inner result reaches the parsers');
  assert.equal(un.usage.tokens.in, 100);
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

// A spine with one in-progress task; the reviewer stub emits an ENVELOPE wrapping the verdict —
// the opportunistic unwrap path (a node stub is not claude-shaped, so nothing was injected).
test('review through an envelope — verdict parsed from the inner result, tokens land in the ledger', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-cost-'));
  chalk(d, {}, 'init', '--name', 'demo');
  writeFileSync(join(d, 'rev.mjs'), `console.log(${JSON.stringify(ENVELOPE('Verdict follows.\\n{"verdict":"pass","findings":[]}'))});`);
  const cf = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] };
  writeFileSync(cf, JSON.stringify(o, null, 2));
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', acceptanceCriteria: [{ text: 'x' }], tests: [], reviews: [], pipeline: { stage: 'pr-open', at: '2026-01-01T00:00:00Z' }, pr: { number: 1, recorded: true } }]));
  const r = chalk(d, {}, 'review', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `the envelope-wrapped verdict passes: ${r.out}`);
  assert.match(r.out, /review PASS/i, 'the parser saw the INNER result, not the envelope');
  const rec = ledger(d).filter((x) => x.stage === 'review').pop();
  assert.deepEqual(rec.tokens, { in: 100, out: 50, cacheRead: 7, cacheWrite: 3 }, 'usage harvested into the ledger');
  assert.equal(rec.costUsd, 0.12);
  assert.equal(rec.turns, 4);
  assert.ok(rec.ms >= 0, 'wall-clock still recorded');
});

test('a NON-claude reviewer stays ms-only, and a malformed envelope never fails the stage', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-cost-'));
  chalk(d, {}, 'init', '--name', 'demo');
  // Bare verdict (no envelope): the stage works exactly as before, record is ms-only.
  writeFileSync(join(d, 'rev.mjs'), `console.log('{"verdict":"pass","findings":[]}');`);
  const cf = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] };
  writeFileSync(cf, JSON.stringify(o, null, 2));
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', acceptanceCriteria: [{ text: 'x' }], tests: [], reviews: [], pipeline: { stage: 'pr-open', at: '2026-01-01T00:00:00Z' }, pr: { number: 1, recorded: true } }]));
  const r = chalk(d, {}, 'review', 'task-aaaaaaaa');
  assert.equal(r.code, 0, r.out);
  const rec = ledger(d).filter((x) => x.stage === 'review').pop();
  assert.equal(rec.tokens, undefined, 'no fabricated usage — ms-only, like the legacy shape');
  assert.ok(rec.ms >= 0);
});

test('retro through an envelope — the {lessons,issues} parser sees the inner result, tokens land in the ledger', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-cost-'));
  chalk(d, {}, 'init', '--name', 'demo');
  writeFileSync(join(d, 'retro.mjs'), `console.log(${JSON.stringify(ENVELOPE('{"lessons":["a durable lesson"],"issues":[]}'))});`);
  const cf = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.retro = { command: `node ${join(d, 'retro.mjs')}` };
  writeFileSync(cf, JSON.stringify(o, null, 2));
  const r = chalk(d, {}, 'retro', '--dry-run');
  assert.equal(r.code, 0, `retro parses the envelope-wrapped payload: ${r.out}`);
  assert.match(r.out, /a durable lesson/, 'the inner JSON reached the retro parser');
  const rec = ledger(d).filter((x) => x.stage === 'retro').pop();
  assert.deepEqual(rec.tokens, { in: 100, out: 50, cacheRead: 7, cacheWrite: 3 }, 'retro usage harvested');
});

test('plan through an envelope — the stored plan is the INNER text, tokens land in the ledger', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-cost-'));
  chalk(d, {}, 'init', '--name', 'demo');
  writeFileSync(join(d, 'plan.mjs'), `console.log(${JSON.stringify(ENVELOPE('THE PLAN: do the thing.'))});`);
  const cf = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.planner = { command: `node ${join(d, 'plan.mjs')}` };
  writeFileSync(cf, JSON.stringify(o, null, 2));
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'feat: a', state: 'specd', acceptanceCriteria: [{ text: 'x' }], tests: [], reviews: [], pipeline: { stage: 'branched', at: '2026-01-01T00:00:00Z' } }]));
  const r = chalk(d, {}, 'plan', 'task-aaaaaaaa');
  assert.equal(r.code, 0, r.out);
  const t = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
  assert.equal(t.plan, 'THE PLAN: do the thing.', 'the stored plan is the unwrapped text, not the envelope JSON');
  const rec = ledger(d).filter((x) => x.stage === 'plan').pop();
  assert.deepEqual(rec.tokens, { in: 100, out: 50, cacheRead: 7, cacheWrite: 3 }, 'planner usage harvested');
});

test('executor capture — a claude-shaped executor gets the flag injected, usage recorded, narrative re-emitted', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-cost-'));
  chalk(d, {}, 'init', '--name', 'demo');
  // A fake `claude` on PATH: proves injection (emits the envelope ONLY when --output-format json is
  // present), does the "work" the verify gate will accept, and narrates via the envelope result.
  const bin = join(d, 'fakebin'); mkdirSync(bin);
  writeFileSync(join(bin, 'claude'), [
    '#!/usr/bin/env node',
    "import { readFileSync } from 'node:fs';",
    'readFileSync(0);',
    "if (process.argv.includes('--output-format') && process.argv.includes('json')) console.log(" + JSON.stringify(ENVELOPE('EXEC-NARRATIVE: did the work')) + ');',
    "else console.log('NO-FLAG-INJECTED');",
  ].join('\n'));
  chmodSync(join(bin, 'claude'), 0o755);
  const cf = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.executor = { command: 'claude -p' };
  writeFileSync(cf, JSON.stringify(o, null, 2));
  // branchType chore → exempt from the test-enforcement gate; verify unconfigured → vacuous green.
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'chore: a', state: 'specd', branchType: 'chore', acceptanceCriteria: [{ text: 'x' }], tests: [], reviews: [] }]));
  const r = chalk(d, { PATH: `${bin}:${process.env.PATH}` }, 'run', '--max', '1');
  assert.match(r.out, /EXEC-NARRATIVE: did the work/, 'the executor narrative is re-emitted — live output is not lost');
  assert.doesNotMatch(r.out, /NO-FLAG-INJECTED/, '--output-format json was injected');
  const rec = ledger(d).filter((x) => x.stage === 'work').pop();
  assert.deepEqual(rec.tokens, { in: 100, out: 50, cacheRead: 7, cacheWrite: 3 }, 'executor usage captured');
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
