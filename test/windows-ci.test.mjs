// Windows is a required platform, not a best-effort afterthought. This contract pins the CI lane,
// the complete suite command, platform-neutral executable discovery, and accountable exclusions.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandOnPath } from '../lib/doctor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const testFiles = (base) => {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(path);
    }
  };
  visit(base);
  return files;
};

const exclusions = (source) => {
  const lines = source.split('\n');
  const aliases = [...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*process\.platform/g)].map((match) => match[1]);
  const aliasUse = aliases.length ? new RegExp(`\\b(?:${aliases.join('|')})\\b`) : /$a/;
  const matches = [];
  for (let index = 0; index < lines.length; index++) {
    const neighborhood = lines.slice(Math.max(0, index - 2), index + 4).join('\n');
    const line = lines[index];
    const platformNearby = /process\.platform/.test(neighborhood) || aliasUse.test(neighborhood);
    const skip = /\b(?:test|it|describe)\.skip\s*\(|\bskip\s*:|[{,]\s*skip\s*[,}]/.test(line)
      || (platformNearby && /\b[A-Za-z_$][\w$]*\.skip\s*\(/.test(line));
    const guardedReturn = /\bif\s*\(/.test(line) && /\breturn\b/.test(neighborhood)
      && platformNearby;
    const platformGatedTest = /\bif\s*\(/.test(line) && /\b(?:test|it|describe)\s*\(/.test(neighborhood)
      && platformNearby;
    if (skip || guardedReturn || platformGatedTest) matches.push({ index, neighborhood });
  }
  return matches;
};

test('CI runs the complete suite on Ubuntu and Windows without changing cancellation semantics', () => {
  const workflow = read('.github/workflows/test.yml');
  assert.match(workflow, /os:\s*\[ubuntu-latest, windows-latest\]/);
  assert.match(workflow, /runs-on:\s*\$\{\{ matrix\.os \}\}/);
  assert.match(workflow, /node-version:\s*['"]20['"]/);
  assert.match(workflow, /- run:\s*node --test(?:\s|$)/m);
  assert.match(workflow, /cancel-in-progress:\s*true/);
});

test('doctor executable discovery uses Node lookup rather than POSIX shell built-ins', () => {
  assert.equal(commandOnPath(process.execPath), true);
  assert.equal(commandOnPath('chalk-command-that-does-not-exist-056bac99'), false);
  assert.doesNotMatch(read('lib/doctor.mjs'), /command -v/);
});

test('Windows test exclusions must cite a tracked follow-up issue', () => {
  const tests = testFiles(join(ROOT, 'test'));
  const issue = /https:\/\/github\.com\/chalkagents\/chalk-protocol\/issues\/\d+/;
  const platform = 'process' + '.platform';
  const skipOption = 'sk' + 'ip:';
  const skipShorthand = 'sk' + 'ip';
  const skippedTest = 'test' + '.skip';
  const skippedContext = 't' + '.skip';
  for (const bypass of [
    `test('x', { ${skipOption} ${platform} === 'win32' }, () => {});`,
    `if (${platform} !== 'linux') return;`,
    `const isWindows = ${platform} === 'win32';\nif (isWindows) return;`,
    `${skippedTest}('x', () => {});`,
    `const ${skipShorthand} = ${platform} === 'win32';\ntest('x', { ${skipShorthand} }, () => {});`,
    `if (${platform} === 'win32') ${skippedContext}('reason');`,
  ]) assert.ok(exclusions(bypass).length, `contract missed exclusion form: ${bypass}`);

  const fixture = mkdtempSync(join(tmpdir(), 'chalk-windows-scan-'));
  try {
    mkdirSync(join(fixture, 'nested'), { recursive: true });
    writeFileSync(join(fixture, 'top.test.mjs'), '');
    writeFileSync(join(fixture, 'nested', 'deep.test.mjs'), '');
    assert.deepEqual(testFiles(fixture).map((path) => relative(fixture, path)).sort(), ['nested/deep.test.mjs', 'top.test.mjs']);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }

  for (const path of tests) {
    const name = relative(join(ROOT, 'test'), path).split('\\').join('/');
    const source = readFileSync(path, 'utf8');
    for (const exclusion of exclusions(source)) {
      assert.match(exclusion.neighborhood, /process\.platform/, `${name}:${exclusion.index + 1} exclusion lacks an explicit process.platform guard`);
      assert.match(exclusion.neighborhood, issue, `${name}:${exclusion.index + 1} exclusion lacks an adjacent tracked follow-up issue`);
    }
  }
});

test('README states the continuously verified platform boundary', () => {
  const readme = read('README.md');
  assert.match(readme, /complete `node --test` suite runs on both/);
  assert.match(readme, /`ubuntu-latest` and `windows-latest`/);
  assert.match(readme, /macOS is supported on a best-effort basis/);
});
