import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runVerificationTests } from '../scripts/verify-tests.mjs';

test('scheduled verification includes every repository test exactly once and isolates conformance', () => {
  const batches = [];
  assert.equal(runVerificationTests({ launch: (_node, args) => { batches.push(args); return { status: 0 }; } }), 0);
  const actual = batches.flatMap(args => args.filter(arg => arg.startsWith('test/')));
  const expected = [];
  const walk = path => { for (const entry of fs.readdirSync(path, { withFileTypes: true })) { const file = `${path}/${entry.name}`; if (entry.isDirectory()) walk(file); else expected.push(file); } };
  walk('test'); assert.deepEqual(actual.sort(), expected.sort());
  assert.equal(new Set(actual).size, actual.length);
  assert.ok(batches[0].includes('--test-concurrency=1'));
  assert.ok(batches[0].includes('test/adapter-conformance.test.mjs'));
  assert.ok(batches[0].includes('test/codex-gemini-adapters.test.mjs'));
});

test('either failed batch, a lost child, or unknown test layout keeps scheduled verification closed', t => {
  for (const failed of [0, 1]) {
    let call = 0;
    assert.equal(runVerificationTests({ launch: () => ({ status: call++ === failed ? 7 : 0 }) }), 7);
  }
  assert.equal(runVerificationTests({ launch: () => ({ status: null, signal: 'SIGTERM' }) }), 1);
  assert.equal(runVerificationTests({ launch: () => ({ error: new Error('spawn failed') }) }), 1);
  const root = fs.mkdtempSync(join(tmpdir(), 'chalk-test-layout-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(join(root, 'test')); fs.mkdirSync(join(root, 'test/new-tests'));
  assert.throws(() => runVerificationTests({ root, launch: () => assert.fail('must not run an incomplete suite') }), /unrecognized test layout/);
});

test('real scheduled children preserve pipeline order and propagate assertion failure', t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'chalk-real-test-schedule-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); fs.mkdirSync(join(root, 'test'));
  fs.writeFileSync(join(root, 'test/adapter-conformance.test.mjs'), "import {test} from 'node:test';test('serial probe',()=>{});");
  fs.writeFileSync(join(root, 'test/aaa.test.mjs'), "import {test} from 'node:test';test('short integration',()=>{});");
  fs.writeFileSync(join(root, 'test/pipeline.test.mjs'), "import {test} from 'node:test';test('long pipeline',()=>{});");
  for (const failure of [false, true]) {
    fs.writeFileSync(join(root, 'test/zzz.test.mjs'), `import {test} from 'node:test';import assert from 'node:assert/strict';test('last integration',()=>assert.equal(${failure},false));`);
    const outputs = [];
    const status = runVerificationTests({ root, launch: (node, args, options) => {
      const result = spawnSync(node, args, { ...options, stdio: 'pipe', encoding: 'utf8' });
      outputs.push(result.stdout + result.stderr); return result;
    } });
    assert.equal(status, failure ? 1 : 0, outputs.join('\n'));
    assert.equal(outputs.length, 2); assert.match(outputs[0], /ok 1 - serial probe/);
    assert.match(outputs[1], /ok 1 - long pipeline/); assert.match(outputs[1], /ok 2 - short integration/);
    assert.match(outputs[1], failure ? /not ok 3 - last integration/ : /ok 3 - last integration/);
  }
});
