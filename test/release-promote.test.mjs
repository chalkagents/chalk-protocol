// `chalk release --promote` (#98) — the protected-deploy release flow. Branch protection on the
// deploy branch rejects the direct push `--commit` makes, so: the release commit lands on the
// integration branch (github.base), a promotion PR carries it to github.deployBase (merged with a
// MERGE commit so the SHA survives), CI is awaited with the merge gate's poll knobs, the tag lands
// on the deploy TIP (tag pushes bypass branch protection), and the work is marked released ONLY
// after the tag is on the remote. A failed step marks nothing; a re-run resumes from the existing
// release commit via the #91 orphan detection. Locked contract for task-2563a7a0.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const git = (cwd, args) => execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-promote-'));
const taskOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
const ghLog = (d) => (existsSync(join(d, 'gh.log')) ? readFileSync(join(d, 'gh.log'), 'utf8') : '');

// A work repo on `dev` whose origin is a local bare repo carrying main+dev, with one done task,
// package.json 0.0.0, github.base=dev / deployBase=main, and a stub gh: `pr create` prints a PR
// URL and drops a marker (so `pr list` honestly reports the open PR, like real gh), `pr checks`
// replays the payload from ci.json, and `pr merge --merge` builds a REAL MERGE COMMIT via
// commit-tree and pushes it to the remote main — the deploy tip is NOT dev's HEAD, exactly like
// GitHub's --merge, so tagging local HEAD instead of the fetched tip fails the assertions.
function promoteRepo({ ci = '[{"bucket":"pass"}]' } = {}) {
  const bare = scratch();
  execSync('git init --bare -b main', { cwd: bare, stdio: 'pipe' });
  const d = scratch();
  const g = (a) => git(d, a);
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'ci.json'), ci);
  writeFileSync(join(d, 'gh-stub.mjs'), [
    "import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';",
    "import { execSync } from 'node:child_process';",
    "const args = process.argv.slice(2).join(' ');",
    `const D = ${JSON.stringify(d)}, MARKER = ${JSON.stringify(join(d, 'pr-open.marker'))};`,
    `appendFileSync(${JSON.stringify(join(d, 'gh.log'))}, args + '\\n');`,
    "if (args.startsWith('pr list')) console.log(existsSync(MARKER) ? '[{\"number\":7}]' : '[]');",
    "else if (args.startsWith('pr create')) { writeFileSync(MARKER, '7'); console.log('https://github.com/x/y/pull/7'); }",
    `else if (args.startsWith('pr checks')) console.log(readFileSync(${JSON.stringify(join(d, 'ci.json'))}, 'utf8'));`,
    "else if (args.startsWith('pr merge')) {",
    "  execSync(`M=$(git commit-tree -p $(git rev-parse origin/main) -p $(git rev-parse dev) -m 'Merge dev into main' $(git rev-parse 'dev^{tree}')) && git push -q origin $M:main`, { cwd: D, stdio: 'pipe', shell: '/bin/bash' });",
    "  try { execSync('rm -f ' + MARKER); } catch {}",
    "}",
  ].join('\n'));
  const cf = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.github = { ...(o.protocol.github || {}), command: `node ${join(d, 'gh-stub.mjs')}`, base: 'dev', deployBase: 'main', ciPollIntervalMs: 1, ciPollAttempts: 2 };
  writeFileSync(cf, JSON.stringify(o, null, 2));
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: 'feat: a thing', state: 'done', doneAt: '2026-01-01T00:00:00Z', branchType: 'feat' },
  ]));
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2) + '\n');
  g('add -A'); g('commit -qm init');
  g(`remote add origin ${bare}`); g('push -qu origin main');
  g('checkout -qb dev'); g('push -qu origin dev');
  return { d, bare };
}

test('release --promote — commit on dev, promotion PR to main, tag on the deploy tip, marked released last', () => {
  const { d, bare } = promoteRepo();
  const r = chalk(d, 'release', '--promote');
  assert.equal(r.code, 0, `promote succeeds: ${r.out}`);
  assert.match(r.out, /promoted dev→main via PR #7/, 'the flow is narrated');
  // The release commit exists on dev and reached the remote.
  assert.equal(git(d, 'log -1 --format=%s'), 'chore(release): v0.1.0', 'the release commit is on dev');
  assert.equal(git(d, "tag --list 'v0.1.0'"), 'v0.1.0', 'the tag exists locally');
  // The remote main moved to a MERGE COMMIT carrying the release commit; the tag points at that
  // deploy TIP — which is NOT dev's HEAD, so tagging local HEAD would fail here.
  const remoteMain = git(bare, 'rev-parse main');
  const devHead = git(d, 'rev-parse HEAD');
  assert.notEqual(remoteMain, devHead, 'the deploy tip is a merge commit, not dev HEAD');
  assert.equal(git(bare, `rev-parse ${remoteMain}^2`), devHead, 'whose second parent is the release commit');
  assert.equal(git(bare, 'rev-parse v0.1.0^{commit}'), remoteMain, 'the pushed tag points at the deploy TIP');
  assert.equal(JSON.parse(git(bare, 'show main:package.json')).version, '0.1.0', 'the deployed tree carries the bump');
  // The gh choreography: PR created dev→main, merged with a MERGE commit, checks consulted.
  const log = ghLog(d);
  assert.match(log, /pr create --base main --head dev/, 'the promotion PR targets the deploy branch');
  assert.match(log, /pr checks 7/, 'CI was consulted before merging');
  assert.match(log, /pr merge 7 --merge/, 'merged with a MERGE commit, not squash');
  assert.equal(taskOf(d).released, '0.1.0', 'the work is marked released');
});

test('release --promote — RED CI on the promotion PR aborts before merge/tag/marking', () => {
  const { d, bare } = promoteRepo({ ci: '[{"bucket":"fail"}]' });
  const r = chalk(d, 'release', '--promote');
  assert.notEqual(r.code, 0, 'a red promotion PR fails the release');
  assert.match(r.out, /CI on promotion PR #7 is RED/i, 'the cause is named');
  assert.doesNotMatch(ghLog(d), /pr merge/, 'no merge was attempted');
  assert.equal(git(bare, "tag --list 'v*'") || '', '', 'no tag reached the remote');
  assert.notEqual(git(bare, 'rev-parse main'), git(d, 'rev-parse HEAD'), 'remote main did not move');
  assert.ok(!taskOf(d).released, 'nothing was marked released');
});

test('release --promote — a re-run after a failed promotion RESUMES the existing release commit (no re-bump)', () => {
  const { d, bare } = promoteRepo({ ci: '[{"bucket":"fail"}]' });
  assert.notEqual(chalk(d, 'release', '--promote').code, 0, 'first run dies at RED CI, after committing');
  writeFileSync(join(d, 'ci.json'), '[{"bucket":"pass"}]'); // CI is fixed…
  // …and meanwhile a NEW task finished — the resume must not swallow it into the frozen v0.1.0 notes.
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  tasks.push({ id: 'task-bbbbbbbb', title: 'feat: late arrival', state: 'done', doneAt: '2030-01-01T00:00:00Z', branchType: 'feat' });
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(tasks));
  const r = chalk(d, 'release', '--promote'); // the operator simply re-runs
  assert.equal(r.code, 0, `the re-run completes the promotion: ${r.out}`);
  const releaseCommits = git(d, 'log --format=%s').split('\n').filter((s) => /^chore\(release\):/.test(s));
  assert.deepEqual(releaseCommits, ['chore(release): v0.1.0'], 'exactly ONE release commit — resumed, not re-bumped');
  const creates = ghLog(d).split('\n').filter((l) => l.startsWith('pr create'));
  assert.equal(creates.length, 1, 'the pre-merge re-run FOUND the open PR (pr list) instead of re-creating it — real gh rejects a duplicate');
  assert.equal(git(bare, 'rev-parse v0.1.0^{commit}'), git(bare, 'rev-parse main'), 'the tag landed on the deploy tip');
  const byId = Object.fromEntries(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8')).map((t) => [t.id, t]));
  assert.equal(byId['task-aaaaaaaa'].released, '0.1.0', 'the interrupted release set ships at the original version');
  assert.ok(!byId['task-bbbbbbbb'].released, 'the late arrival is deferred to the next cycle, not absorbed');
  assert.match(r.out, /left for the next release/i, 'the deferral is reported');
});

test('release --promote — a tag-push failure AFTER the merge resumes to completion without re-running the PR choreography', () => {
  const { d, bare } = promoteRepo();
  git(bare, `update-ref refs/tags/v0.1.0/block ${git(bare, 'rev-parse main')}`); // the REMOTE rejects the tag push (ref lock)
  const r1 = chalk(d, 'release', '--promote');
  assert.notEqual(r1.code, 0, 'the run dies at the tag push, after the merge');
  assert.match(r1.out, /pushing tag v0\.1\.0 failed/i);
  assert.ok(!taskOf(d).released, 'nothing was marked released');
  assert.equal(git(d, "tag --list 'v0.1.0'"), 'v0.1.0', 'the LOCAL tag was left behind — the resume must survive it');
  git(bare, 'update-ref -d refs/tags/v0.1.0/block'); // the operator clears the obstruction…
  const r2 = chalk(d, 'release', '--promote'); // …and simply re-runs
  assert.equal(r2.code, 0, `the re-run finishes the promotion: ${r2.out}`);
  assert.match(r2.out, /already merged/i, 'the resume recognizes the merged promotion');
  const creates = ghLog(d).split('\n').filter((l) => l.startsWith('pr create'));
  assert.equal(creates.length, 1, 'the PR choreography ran ONCE — the re-run skipped straight to tagging');
  assert.equal(git(bare, 'rev-parse v0.1.0^{commit}'), git(bare, 'rev-parse main'), 'the tag reached the remote, on the deploy tip');
  assert.equal(taskOf(d).released, '0.1.0', 'and the work is marked released');
  assert.deepEqual(git(d, 'log --format=%s').split('\n').filter((s) => /^chore\(release\):/.test(s)), ['chore(release): v0.1.0'], 'exactly one release commit');
});

test('release --promote — a stale pre-existing tag fails BEFORE anything is written (collision safety kept)', () => {
  const { d, bare } = promoteRepo();
  git(d, 'tag v0.1.0'); // stale tag pointing at the wrong commit
  const head = git(d, 'rev-parse HEAD');
  const mainBefore = git(bare, 'rev-parse main');
  const r = chalk(d, 'release', '--promote');
  assert.notEqual(r.code, 0, 'the collision fails loudly');
  assert.match(r.out, /tag v0\.1\.0 already exists/i);
  assert.equal(git(d, 'rev-parse HEAD'), head, 'no release commit was created');
  assert.ok(!existsSync(join(d, 'CHANGELOG.md')), 'no CHANGELOG was written');
  assert.doesNotMatch(ghLog(d), /pr create|pr merge/, 'no PR was opened, nothing merged');
  assert.equal(git(bare, 'rev-parse main'), mainBefore, 'remote main did not move');
  assert.ok(!taskOf(d).released, 'nothing was marked released');
});

test('release --promote — CI stuck at pending exhausts the poll and aborts without merging', () => {
  const { d } = promoteRepo({ ci: '[{"bucket":"pending"}]' });
  const r = chalk(d, 'release', '--promote');
  assert.notEqual(r.code, 0);
  assert.match(r.out, /still pending/i, 'the pending exhaustion is named');
  assert.doesNotMatch(ghLog(d), /pr merge/, 'no merge was attempted');
  assert.ok(!taskOf(d).released, 'nothing was marked released');
});

test('release --promote — refuses off the integration branch and refuses base==deployBase', () => {
  const { d } = promoteRepo();
  git(d, 'checkout -q main');
  const off = chalk(d, 'release', '--promote');
  assert.notEqual(off.code, 0);
  assert.match(off.out, /integration branch/i, 'names the expected branch');
  git(d, 'checkout -q dev');
  const cf = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.github.deployBase = 'dev';
  writeFileSync(cf, JSON.stringify(o, null, 2));
  const same = chalk(d, 'release', '--promote');
  assert.notEqual(same.code, 0);
  assert.match(same.out, /nothing to promote across/i, 'base==deployBase is a config error, not a silent self-promote');
});
