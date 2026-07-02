// Chalk Protocol — `chalk demo`: the whole lifecycle on a THROWAWAY project in ~1 minute, no LLM,
// no gh, no network. Tiny stub agents (node one-liners that emit the JSON contracts) stand in for
// the real executor/reviewer/etc., so a first-time user can WATCH the loop — including the part
// that makes chalk chalk: gates REFUSING to advance. Two refusals are staged deliberately:
//   1. `chalk work` before the plan is approved (the human checkpoint holds), and
//   2. a locked acceptance test is tampered with → verify goes RED on P6 test-integrity.
// Every stage self-asserts (an expected refusal that DOESN'T refuse throws), so this doubles as a
// hermetic end-to-end canary under `node --test`. Swap the stubs for `claude -p` and it's real.
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/chalk.mjs', import.meta.url));
const C = { dim: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m` };

// Stub agents — each reads stdin and prints its contract. Kept as string constants so they cannot
// drift from the code that writes them (and never need a `files`-array entry of their own).
const STUBS = {
  'a-discovery.mjs': `process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(JSON.stringify({
  spec:'A widget app that lists and adds widgets.',
  tasks:[{title:'List widgets', criteria:['shows all widgets','empty state when none'], milestone:'mvp'}]
})));\n`,
  'a-planner.mjs': `process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(\`## Plan
1. Add a widgets module and render the list.

## Questions
- Should widgets persist across restarts?\`));\n`,
  'a-executor.mjs': `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{}
writeFileSync('widgets.mjs','export const list = () => [];\\n');
writeFileSync('widgets.test.mjs',"import {test} from 'node:test'; import a from 'node:assert'; import {list} from './widgets.mjs'; test('empty',()=>a.deepEqual(list(),[]));\\n");\n`,
  'a-reviewer.mjs': `process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(JSON.stringify({verdict:'pass',findings:[]})));\n`,
  'a-feedback.mjs': `process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(JSON.stringify({issues:[{title:'feat: search widgets', severity:'high', body:'Users keep asking to search.'}]})));\n`,
  'a-gh.mjs': `const a=process.argv.slice(2), has=(...x)=>x.every(y=>a.includes(y));
if(has('issue','create')) console.log('https://github.com/demo/widget/issues/1');
else console.log('[]');\n`,
};

export function runDemo({ keep = false, log = console.log } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'chalk-demo-'));
  let refusals = 0;

  const banner = (t) => log('\n' + C.b(`═══ ${t} ═══`));
  const sh = (c) => execSync(c, { cwd: dir, stdio: 'pipe' });
  // One demo step = one chalk command, streamed live. Self-asserting: a step that should refuse
  // but exits 0 (or should pass but doesn't) throws — so the demo is also an end-to-end canary.
  const step = (args, { expectFail = false } = {}) => {
    log(C.dim(`$ chalk ${args.join(' ')}`));
    const r = spawnSync('node', [CLI, ...args], { cwd: dir, stdio: 'inherit', timeout: 5 * 60 * 1000 });
    // A null status is a crash/timeout/spawn failure, not a gate verdict — it must never be
    // presented as a refusal (the GATE REFUSED label has to mean the gate actually spoke).
    if (r.status == null) throw new Error(`demo: \`chalk ${args.join(' ')}\` crashed or timed out (${r.signal || r.error?.code || 'no exit status'})`);
    if (expectFail && r.status === 0) throw new Error(`demo: expected \`chalk ${args.join(' ')}\` to be REFUSED, but it passed — a gate is broken`);
    if (!expectFail && r.status !== 0) throw new Error(`demo: \`chalk ${args.join(' ')}\` failed (exit ${r.status}) — see output above`);
    if (expectFail) { refusals++; log(C.r(`⛔ GATE REFUSED (exit ${r.status})`) + C.dim(' — expected: the refusal is the product')); }
  };

  try {
    log(`Throwaway demo project: ${C.b(dir)}`);
    banner('0. INIT — temp project, stub agents wired in place of real LLMs');
    sh('git init -b main'); sh('git config user.email demo@chalk.dev'); sh('git config user.name chalk-demo');
    step(['init', '--name', 'Widget App', '--goal', 'A little widget app']);
    writeFileSync(join(dir, 'package.json'), '{"name":"widget-app","version":"0.0.0"}\n');
    for (const [name, body] of Object.entries(STUBS)) writeFileSync(join(dir, '.chalk', name), body);
    // Test-only hook: sabotage the first stub so the failure path (keep dir + print path + nonzero
    // exit) is pinnable by the locked test without a network or flaky dependency.
    if (process.env.CHALK_DEMO_SABOTAGE) writeFileSync(join(dir, '.chalk', 'a-discovery.mjs'), 'process.exit(2);\n');
    const confPath = join(dir, '.chalk', 'chalk.json');
    const conf = JSON.parse(readFileSync(confPath, 'utf8'));
    Object.assign(conf.protocol, {
      verify: { test: 'node --test widgets.test.mjs' },
      executor: { command: 'node .chalk/a-executor.mjs' },
      planner: { command: 'node .chalk/a-planner.mjs' },
      review: { command: 'node .chalk/a-reviewer.mjs', requiredAt: ['per-task'] },
      discovery: { command: 'node .chalk/a-discovery.mjs' },
      feedback: { command: 'node .chalk/a-feedback.mjs' },
      plan: { required: true },
      github: { ...(conf.protocol.github || {}), command: 'node .chalk/a-gh.mjs' },
    });
    writeFileSync(confPath, JSON.stringify(conf, null, 2));

    banner('1. DISCOVER — a brief becomes a scoped backlog (specd tasks with criteria)');
    step(['discover', 'Build a widget app']);
    const id = JSON.parse(readFileSync(join(dir, '.chalk', 'tasks.json'), 'utf8'))[0].id.slice(0, 12);

    banner('2. PLAN — a read-only planner emits a plan AND scoping questions');
    step(['plan', id]);
    step(['question']);

    banner('3. THE FIRST REFUSAL — work is GATED until a human approves the plan');
    step(['work', id], { expectFail: true });

    banner('4. APPROVE-PLAN — the human checkpoint (--force past the open question, for the demo)');
    step(['approve-plan', id, '--force', '--why', 'demo: persistence deferred']);

    banner('5. WORK — the executor implements; verify + test-gate run');
    step(['work', id]);

    banner('6. LOCK the acceptance test (P2) and commit the work');
    step(['spec', id, '--test', 'widgets.test.mjs']);
    sh('git add -A'); sh('git commit -m "feat: list widgets"');

    banner('7. THE SECOND REFUSAL — a "sneaky agent" edits the LOCKED test → P6 catches it');
    const lockedPath = join(dir, 'widgets.test.mjs');
    const original = readFileSync(lockedPath);
    writeFileSync(lockedPath, original.toString() + '\n// weakened by a sneaky agent\n');
    step(['verify'], { expectFail: true });
    writeFileSync(lockedPath, original);
    log(C.g('  ↺ restored the locked test — the only sanctioned edit path is `chalk amend-spec`'));
    step(['verify']);

    banner('8. REVIEW (adversarial) then DONE — the gate decides, not the agent');
    step(['review', id]);
    step(['done', id]);

    banner('9. RELEASE — notes + semver bump + git tag from the shipped work');
    step(['release', '--dry-run']);
    step(['release']);

    banner('10. FEEDBACK — a user signal becomes an improvement issue in the backlog');
    mkdirSync(join(dir, '.chalk', 'feedback'), { recursive: true });
    writeFileSync(join(dir, '.chalk', 'feedback', 'users.md'), 'Users keep asking for a search box.\n');
    step(['feedback']);

    banner('11. PORTAL — client-facing status straight from the spine');
    step(['portal']);
    const scope = join(dir, '.project', 'scope', 'defined.yaml');
    if (existsSync(scope)) log(C.dim('--- .project/scope/defined.yaml ---\n') + readFileSync(scope, 'utf8').trimEnd());

    banner(`LOOP COMPLETE — ${refusals} gates refused, 0 self-certifications accepted`);
    log(`Next: run ${C.b('chalk init')} in YOUR project (QUICKSTART.md walks the first real task),`);
    log(`or swap the stubs in .chalk/chalk.json for \`claude -p\` / \`opencode run\` and re-run for real.`);
    if (keep) { log(`\nKept the demo project at: ${C.b(dir)}`); return { dir, kept: true, refusals }; }
    rmSync(dir, { recursive: true, force: true });
    log(C.dim(`\n(cleaned up ${dir} — pass --keep to poke around next time)`));
    return { dir, kept: false, refusals };
  } catch (e) {
    log(C.y(`\ndemo project kept for inspection: ${dir}`));
    throw e;
  }
}
