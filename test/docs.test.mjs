// Docs drift gates. Prose rots silently, so the load-bearing docs are pinned to the code:
//   - docs/CONFIG.md ↔ initSpine(): every default protocol key has a `### `key`` section and every
//     section is a real key — the reference cannot drift from the config it documents;
//   - README leads with the runnable proof (npx chalk-protocol demo), an Install section, the
//     comparison table, and the one-line thesis;
//   - QUICKSTART walks manual mode (including the deliberate locked-test tamper) and names the
//     friction-report feedback path;
//   - QUICKSTART ships in the npm tarball (files[]).
// Locked contract for task-46471f9.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSpine } from '../lib/store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Every RELATIVE markdown link target in a doc must exist — onboarding docs with dead links are
// worse than no docs. External (http/mailto) links are out of scope.
function assertLinksResolve(doc) {
  const md = read(doc);
  for (const m of md.matchAll(/\]\(([^)]+)\)/g)) {
    const target = m[1].split('#')[0].trim();
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    assert.ok(existsSync(join(ROOT, dirname(doc), target)), `${doc} links to ${m[1]} — target missing`);
  }
}

test('docs/CONFIG.md ↔ initSpine — bidirectional drift gate on protocol keys', () => {
  const meta = initSpine(mkdtempSync(join(tmpdir(), 'docs-')), {});
  const keys = Object.keys(meta.protocol);
  const config = read('docs/CONFIG.md');
  for (const k of keys) {
    assert.match(config, new RegExp(`^### \`${k}\`$`, 'm'), `docs/CONFIG.md is missing a section for protocol.${k}`);
  }
  const documented = [...config.matchAll(/^### `([^`]+)`$/gm)].map((m) => m[1]);
  for (const d of documented) {
    assert.ok(keys.includes(d), `docs/CONFIG.md documents protocol.${d}, which initSpine no longer writes`);
  }
});

test('README — leads with the runnable proof, install, comparison, and the thesis', () => {
  const readme = read('README.md');
  assert.match(readme, /npx chalk-protocol demo/);
  assert.match(readme, /^## Install$/m);
  assert.match(readme, /Spec-Kit/, 'the how-is-this-different comparison names prior art');
  assert.match(readme, /the gate decides/i);
  assert.match(readme, /QUICKSTART\.md/);
  assert.match(readme, /docs\/CONFIG\.md/);
});

test('QUICKSTART — manual mode first-class, the deliberate tamper, and the feedback path', () => {
  const q = read('QUICKSTART.md');
  assert.match(q, /Manual mode/);
  assert.match(q, /test-integrity VIOLATED/, 'the reader is told to trip P6 on purpose');
  assert.match(q, /amend-spec/, 'and shown the sanctioned path');
  assert.match(q, /friction report/i);
  assert.match(q, /chalk doctor --json/);
});

test('QUICKSTART ships in the npm tarball', () => {
  assert.ok(JSON.parse(read('package.json')).files.includes('QUICKSTART.md'));
});

test('no dead relative links in the onboarding docs (claude-code.md, opencode.md, CONFIG.md, …)', () => {
  for (const doc of ['README.md', 'QUICKSTART.md', 'docs/CONFIG.md', 'docs/integrations/claude-code.md']) {
    assertLinksResolve(doc);
  }
});

test('docs/assets/demo.tape — the reproducible GIF recipe exists and targets the demo', () => {
  const tape = read('docs/assets/demo.tape');
  assert.match(tape, /^Output docs\/assets\/demo\.gif$/m);
  assert.match(tape, /chalk-protocol demo/);
});
