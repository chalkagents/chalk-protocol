// `chalk evidence` push honesty — the evidence commit's blob-SHA URLs only resolve if the commit
// reaches the remote. The push used to be swallowed (`catch {}`), so a failed push surfaced as 404
// image links in the PR body with no warning at the source (harness review, finding 7). Contract:
// a failed push warns LOUD and the PR body edit is SKIPPED (screenshots stay committed on the
// branch); a working push attaches the blob URLs exactly as before. Exercises the REAL push path
// via a local bare remote + a stub gh. Locked contract for task-459bc18 (#88).
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const scratch = () => mkdtempSync(join(tmpdir(), 'evpush-'));

// A 1×1 red PNG — a real decodable base64 payload for the screenshot data URL.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// A working repo whose origin is a local bare repo (`git push` really works, offline), carrying a
// chalk spine, a task with an open PR + a locked browser spec, a stub e2e runner that writes a
// run.json with one screenshot step, and a stub gh that logs every invocation.
function evidenceRepo() {
  const bare = scratch();
  execSync('git init --bare -b main', { cwd: bare, stdio: 'pipe' });
  const d = scratch();
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  chalk(d, 'init', '--name', 'demo');
  // Stub e2e runner: parse --out, write a passing run.json with one screenshotted step.
  writeFileSync(join(d, 'e2e-stub.mjs'), [
    "import { writeFileSync, mkdirSync } from 'node:fs';",
    "const out = process.argv[process.argv.indexOf('--out') + 1];",
    'mkdirSync(out, { recursive: true });',
    `writeFileSync(out + '/run.json', JSON.stringify({ status: 'passed', steps: [{ stepId: 's1', afterScreenshot: 'data:image/png;base64,${PNG_B64}' }] }));`,
  ].join('\n'));
  // Stub gh: append every invocation to gh.log; `pr view` prints a body, everything else succeeds.
  writeFileSync(join(d, 'gh-stub.mjs'), [
    "import { appendFileSync } from 'node:fs';",
    "const args = process.argv.slice(2).join(' ');",
    `appendFileSync(${JSON.stringify(join(d, 'gh.log'))}, args + '\\n');`,
    "if (args.includes('pr view')) console.log('original body');",
  ].join('\n'));
  const conf = JSON.parse(readFileSync(join(d, '.chalk/chalk.json'), 'utf8'));
  conf.protocol.e2e = { command: 'node e2e-stub.mjs', baseUrl: '', runsDir: '.chalk/runs' };
  conf.protocol.github = { ...conf.protocol.github, command: `node ${join(d, 'gh-stub.mjs')}` };
  writeFileSync(join(d, '.chalk/chalk.json'), JSON.stringify(conf, null, 2));
  writeFileSync(join(d, 'ui.test.yaml'), 'id: ui-spec\nsteps: []\n');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-eeeeeeee', title: 'feat: ui', state: 'in-progress',
    acceptanceCriteria: [{ text: 'ui works' }], tests: [{ path: 'ui.test.yaml' }],
    pr: { number: 7 }, pipeline: { stage: 'reviewed', at: '2026-01-01T00:00:00Z' },
  }]));
  g('add -A'); g('commit -qm init');
  g(`remote add origin ${bare}`); g('push -qu origin main');
  return d;
}
const ghLog = (d) => (existsSync(join(d, 'gh.log')) ? readFileSync(join(d, 'gh.log'), 'utf8') : '');

test('evidence — a working push attaches commit-SHA blob URLs to the PR body (unchanged happy path)', () => {
  const d = evidenceRepo();
  const r = chalk(d, 'evidence', 'task-eeeeeeee');
  assert.equal(r.code, 0, `evidence succeeds: ${r.out}`);
  assert.doesNotMatch(r.out, /push failed/i, 'no push warning on the happy path');
  const log = ghLog(d); // the pr-edit body arg is multi-line, so assert on the whole log
  assert.match(log, /^pr edit 7 /m, 'the PR body was edited');
  const sha = execSync('git rev-parse HEAD', { cwd: d, encoding: 'utf8' }).trim();
  assert.ok(log.includes(`/blob/${sha}/`), `the body embeds commit-SHA blob URLs: ${log}`);
  assert.match(log, /after-s1\.png/, 'the screenshot is referenced');
  assert.match(log, /original body/, 'the existing PR body is preserved');
});

test('evidence — a FAILED push warns loud and SKIPS the PR body edit (no 404 images)', () => {
  const d = evidenceRepo();
  execSync(`git remote set-url origin ${join(d, 'no-such-remote')}`, { cwd: d, stdio: 'pipe' });
  const r = chalk(d, 'evidence', 'task-eeeeeeee');
  assert.equal(r.code, 0, `evidence still completes (the stage is best-effort): ${r.out}`);
  assert.match(r.out, /⚠.*push failed/i, 'the push failure is named, not swallowed');
  // The CAUSE (git's stderr), not just the command: execSync's message line 0 is only
  // "Command failed: git push", so a warning built from it would be vacuous.
  assert.match(r.out, /does not appear to be a git repository|Could not read from remote/i, 'the warning carries git\'s actual error, not just "Command failed"');
  assert.match(r.out, /NOT attached/i, 'the status line says the screenshots were not attached');
  assert.doesNotMatch(ghLog(d), /pr edit/, 'the PR body was NOT edited — no blob URLs that would 404');
  // The evidence itself is not lost: committed on the branch, recorded on the task.
  const files = execSync('git show --name-only --format= HEAD', { cwd: d, encoding: 'utf8' });
  assert.match(files, /\.chalk\/evidence\/.*after-s1\.png/, 'the screenshot commit still exists locally');
  const t = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
  assert.equal(t.pipeline.stage, 'tested', 'the stage still advances — a re-run must not duplicate the commit');
});
