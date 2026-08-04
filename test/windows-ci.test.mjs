// Windows is a required platform, not a best-effort afterthought. This contract pins the CI lane,
// the complete suite command, platform-neutral executable discovery, and accountable exclusions.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandOnPath } from '../lib/doctor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

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
  const tests = readdirSync(join(ROOT, 'test')).filter((name) => name.endsWith('.test.mjs'));
  const issue = /https:\/\/github\.com\/chalkagents\/chalk-protocol\/issues\/\d+/;
  const exclusions = (source) => {
    const lines = source.split('\n');
    const aliases = [...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*process\.platform/g)].map((match) => match[1]);
    const aliasUse = aliases.length ? new RegExp(`\\b(?:${aliases.join('|')})\\b`) : /$a/;
    const matches = [];
    for (let index = 0; index < lines.length; index++) {
      const neighborhood = lines.slice(Math.max(0, index - 1), index + 4).join('\n');
      const line = lines[index];
      const skip = /\b(?:test|it|describe)\.skip\s*\(|\bskip\s*:/.test(line);
      const guardedReturn = /\bif\s*\(/.test(line) && /\breturn\b/.test(neighborhood)
        && (/process\.platform/.test(neighborhood) || aliasUse.test(neighborhood));
      const platformGatedTest = /\bif\s*\(/.test(line) && /\b(?:test|it|describe)\s*\(/.test(neighborhood)
        && (/process\.platform/.test(neighborhood) || aliasUse.test(neighborhood));
      if (skip || guardedReturn || platformGatedTest) matches.push({ index, neighborhood });
    }
    return matches;
  };

  const platform = 'process' + '.platform';
  const skipOption = 'sk' + 'ip:';
  const skippedTest = 'test' + '.skip';
  for (const bypass of [
    `test('x', { ${skipOption} ${platform} === 'win32' }, () => {});`,
    `if (${platform} !== 'linux') return;`,
    `const isWindows = ${platform} === 'win32';\nif (isWindows) return;`,
    `${skippedTest}('x', () => {});`,
  ]) assert.ok(exclusions(bypass).length, `contract missed exclusion form: ${bypass}`);

  for (const name of tests) {
    const source = read(`test/${name}`);
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
