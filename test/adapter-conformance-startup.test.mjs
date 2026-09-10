import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAdapterConformance, conformanceAdapterCommand } from '../lib/adapter-conformance.mjs';

test('ordinary conformance allows bounded adapter startup while the timeout fixture still enforces its deadline', t => {
  const dir = mkdtempSync(join(tmpdir(), 'chalk-conformance-startup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const adapter = join(dir, 'adapter.cjs');
  writeFileSync(adapter, 'const q=JSON.parse(require("fs").readFileSync(0,"utf8"));setTimeout(()=>console.log(JSON.stringify({protocolVersion:q.protocolVersion,requestId:q.requestId,status:"ok",text:"ready"})),2250);');
  const report = runAdapterConformance({ command: `${JSON.stringify(process.execPath)} ${JSON.stringify(adapter)}`, live: true });
  assert.equal(report.ok, true, JSON.stringify(report.results));
  const offline = runAdapterConformance({ command: conformanceAdapterCommand('fake') });
  assert.equal(offline.results.find(result => result.name === 'timeout').status, 'pass');
});
