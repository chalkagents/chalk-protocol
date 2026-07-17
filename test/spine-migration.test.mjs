// Spine/protocol migration + version-skew detection (#159). chalk is a stateful CLI: a `.chalk/` spine
// is written by whatever package version the user had. The spine now stamps `writerVersion` (the
// chalk-protocol version that last wrote it); Store.open REFUSES a spine written by a newer binary
// (unsafe to read), and `chalk migrate` carries an older-schema spine forward — gated, backed up, and
// idempotent — instead of silently mutating it. Locked contract for #159.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHALK_VERSION, SCHEMA_VERSION } from '../lib/store.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const metaPath = (d) => join(d, '.chalk/chalk.json');
const readMeta = (d) => JSON.parse(readFileSync(metaPath(d), 'utf8'));
const writeMeta = (d, m) => writeFileSync(metaPath(d), JSON.stringify(m, null, 2));
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-migrate-'));
  execSync('git init -q', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  return d;
}
// Rewind a freshly-init'd spine to the pre-#159 shape: schema 1.0, no writerVersion.
function makeOld(d) { const m = readMeta(d); m.version = '1.0'; delete m.writerVersion; writeMeta(d, m); }

test('a fresh spine self-describes its writer + current schema', () => {
  const m = readMeta(repo());
  assert.equal(m.version, SCHEMA_VERSION, 'init stamps the current schema version');
  assert.equal(m.writerVersion, CHALK_VERSION, 'init stamps the writing chalk-protocol version');
});

test('opening a spine written by a NEWER chalk is refused (non-zero, clear upgrade message)', () => {
  const d = repo();
  const m = readMeta(d); m.writerVersion = '99.0.0'; writeMeta(d, m); // pretend a future chalk wrote it
  const r = chalk(d, 'status');
  assert.notEqual(r.code, 0, 'a newer spine must be refused, not misread');
  assert.match(r.out, /99\.0\.0/, 'the message names the writer version');
  assert.match(r.out, /upgrade|npm i/i, 'and points at the remedy');
});

test('chalk migrate --dry-run shows the plan and mutates NOTHING', () => {
  const d = repo();
  makeOld(d);
  const before = readFileSync(metaPath(d), 'utf8');
  const r = chalk(d, 'migrate', '--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1\.0 → 1\.1|dry run/i, 'the plan is shown');
  assert.equal(readFileSync(metaPath(d), 'utf8'), before, 'dry-run must not write the spine');
  assert.ok(!existsSync(join(d, '.chalk/backups')), 'dry-run must not create a backup');
});

test('chalk migrate upgrades an old spine, backs it up, records a decision, and is idempotent', () => {
  const d = repo();
  makeOld(d);
  const r = chalk(d, 'migrate');
  assert.equal(r.code, 0, r.out);
  const m = readMeta(d);
  assert.equal(m.version, SCHEMA_VERSION, 'schema is carried forward to current');
  assert.equal(m.writerVersion, CHALK_VERSION, 'the writer stamp is added');
  // Backup exists and preserves the pre-migration (1.0) spine.
  const backups = existsSync(join(d, '.chalk/backups')) ? readdirSync(join(d, '.chalk/backups')) : [];
  assert.equal(backups.length, 1, 'exactly one backup was taken');
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/backups', backups[0], 'chalk.json'), 'utf8')).version, '1.0', 'the backup holds the original 1.0 spine');
  assert.match(readFileSync(join(d, '.chalk/decisions.md'), 'utf8'), /Migrated spine 1\.0 → 1\.1/, 'the migration is logged as a decision');
  // Idempotent: a second run is a no-op and leaves no second backup.
  const r2 = chalk(d, 'migrate');
  assert.equal(r2.code, 0);
  assert.match(r2.out, /already current|nothing to migrate/i, 'a current spine is a no-op');
  assert.equal(readdirSync(join(d, '.chalk/backups')).length, 1, 'no redundant backup on the idempotent re-run');
});

test('a same-version spine opens with no prompt and no mutation; migrate is a no-op', () => {
  const d = repo(); // current schema + current writerVersion
  const before = readFileSync(metaPath(d), 'utf8');
  const st = chalk(d, 'status');
  assert.equal(st.code, 0, 'a current spine opens cleanly');
  assert.doesNotMatch(st.out, /migrate|skew/i, 'no migration prompt for a current spine');
  assert.equal(readFileSync(metaPath(d), 'utf8'), before, 'opening a current spine mutates nothing');
  assert.match(chalk(d, 'migrate').out, /already current|nothing to migrate/i);
});

test('chalk doctor surfaces skew — warn for an old schema, fail for a newer writer', () => {
  const old = repo(); makeOld(old);
  assert.match(chalk(old, 'doctor').out, /run `?chalk migrate`?|schema 1\.0/i, 'old schema → a migrate warning');
  const newer = repo(); const m = readMeta(newer); m.writerVersion = '99.0.0'; writeMeta(newer, m);
  // A newer spine refuses at Store.open, so doctor never runs — the refusal IS the surfaced skew.
  assert.notEqual(chalk(newer, 'doctor').code, 0, 'a newer spine is refused before doctor can run');
});
