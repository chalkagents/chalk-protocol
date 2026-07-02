// npm publish readiness — the shipped artifact is a contract too. Pins:
//   - the packed tarball carries everything the CLI resolves at runtime (adapters, share/agents,
//     QUICKSTART/PROTOCOL/RESEARCH, LICENSE) — a files[] regression ENOENTs for npm users;
//   - the registry metadata a stranger sees (repository/bugs/homepage/keywords) and the
//     provenance-by-default publishConfig;
//   - the release workflow publishes via OIDC trusted publishing on v* tags, runs the suite
//     first, and normalizes the version from the tag (chalk tags before the bump lands).
// Locked contract for task-76eda7a.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('the packed tarball carries the runtime-resolved and onboarding files', () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, `npm pack --dry-run failed: ${r.stderr}`);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const must of [
    'bin/chalk.mjs',
    'bin/adapters/opencode-exec.mjs',
    'bin/adapters/opencode-json.mjs',
    'lib/demo.mjs',
    'share/agents/chalk-executor.md',
    'share/agents/chalk-reviewer.md',
    'LICENSE',
    'QUICKSTART.md',
    'PROTOCOL.md',
    'RESEARCH.md',
    'package.json',
  ]) assert.ok(files.includes(must), `${must} missing from the npm tarball`);
  assert.ok(!files.some((f) => f.startsWith('.chalk/')), 'the dogfood spine must never ship in the package');
  assert.ok(!files.some((f) => f.startsWith('test/')), 'tests are repo-only');
});

test('registry metadata — what a stranger sees on npmjs.com', () => {
  assert.match(pkg.repository.url, /github\.com\/chalkagents\/chalk-protocol/);
  assert.match(pkg.bugs, /issues/);
  assert.match(pkg.homepage, /chalk-protocol/);
  assert.ok(Array.isArray(pkg.keywords) && pkg.keywords.length >= 5, 'discoverable keywords');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.bin.chalk, 'bin/chalk.mjs');
  assert.match(pkg.engines.node, />=\s*18/);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});

test('publishConfig — public access + provenance by default', () => {
  assert.equal(pkg.publishConfig.access, 'public');
  assert.equal(pkg.publishConfig.provenance, true);
});

test('release workflow — OIDC trusted publishing on v* tags, suite-gated, tag-normalized version', () => {
  const wf = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(wf, /tags:\s*\['v\*'\]/, 'triggers on version tags');
  assert.match(wf, /id-token:\s*write/, 'OIDC permission for trusted publishing (no NPM_TOKEN secret)');
  assert.doesNotMatch(wf, /secrets\.|NODE_AUTH_TOKEN/, 'no long-lived token wired — trusted publishing only');
  assert.match(wf, /node --test/, 'the suite gates the publish');
  assert.match(wf, /npm pkg set version="\$\{GITHUB_REF_NAME#v\}"/, 'version normalized from the tag (chalk tags before the bump lands)');
  assert.match(wf, /npm publish --provenance --access public/);
  const testIdx = wf.indexOf('node --test');
  const pubIdx = wf.indexOf('npm publish');
  assert.ok(testIdx !== -1 && testIdx < pubIdx, 'tests run BEFORE publish');
});
