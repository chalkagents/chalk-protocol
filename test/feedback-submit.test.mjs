// Downstream → upstream feedback channel (#157). `chalk feedback` collects signals into the CURRENT
// project and files to the CURRENT repo — maintainer-facing. A user who `npm i`-d chalk had no path
// to reach the chalk-protocol maintainers. `chalk feedback --submit "<msg>"` prints a prefilled GitHub
// new-issue URL for chalk's OWN repo — no auth, no spine required — the standard OSS report-a-bug flow.
// URL generation is a pure, percent-encoded function. Locked contract for #157.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUpstreamFeedbackUrl, UPSTREAM_REPO } from '../lib/feedback.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const run = (cwd, env, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };

test('buildUpstreamFeedbackUrl percent-encodes into a valid new-issue URL with version + label', () => {
  const url = buildUpstreamFeedbackUrl({ message: 'demo failed & broke <path> on win', version: '1.2.3', repo: UPSTREAM_REPO });
  const u = new URL(url); // throws if the encoding produced an invalid URL
  assert.equal(u.hostname, 'github.com');
  assert.equal(u.pathname, `/${UPSTREAM_REPO}/issues/new`);
  assert.equal(u.searchParams.get('labels'), 'user-feedback');
  assert.match(u.searchParams.get('title'), /demo failed & broke <path> on win/, 'title decodes back to the message');
  assert.match(u.searchParams.get('body'), /demo failed & broke <path> on win/, 'body carries the message');
  assert.match(u.searchParams.get('body'), /1\.2\.3/, 'body carries the chalk version');
  // The raw string must be percent-encoded, not raw (no literal spaces/brackets in the query).
  assert.doesNotMatch(url.split('?')[1], /[ <>]/, 'query is percent-encoded');
});

test('--submit prints an upstream issue URL, needs no spine, and never touches .chalk/feedback', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-fbsub-')); // a BARE dir — no `chalk init`, no .chalk/
  const r = run(d, {}, 'feedback', '--submit', 'the release notes rendered wrong');
  assert.equal(r.code, 0, `--submit must work without a spine: ${r.out}`);
  assert.match(r.out, new RegExp(`https://github.com/${UPSTREAM_REPO.replace('/', '\\/')}/issues/new\\?`), 'prints the upstream new-issue URL');
  assert.match(r.out, /the%20release%20notes%20rendered%20wrong/, 'the message is encoded into the URL');
  assert.equal(existsSync(join(d, '.chalk')), false, 'no spine is created and the local feedback path is untouched');
});

test('CHALK_UPSTREAM_REPO overrides the target repo (forks)', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-fbsub-'));
  const r = run(d, { CHALK_UPSTREAM_REPO: 'acme/chalk-fork' }, 'feedback', '--submit', 'hello');
  assert.match(r.out, /github\.com\/acme\/chalk-fork\/issues\/new/, 'the fork repo is targeted');
});

test('--submit with no message is a clear usage error', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-fbsub-'));
  const r = run(d, {}, 'feedback', '--submit');
  assert.notEqual(r.code, 0);
  assert.match(r.out, /usage|feedback/i);
});
