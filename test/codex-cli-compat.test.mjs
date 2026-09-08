import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runAgent } from '../lib/agent-runner.mjs';

test('Codex reviewer passes a CLI-contract fixture enforcing global approval flags and strict schemas', t => {
  const root = mkdtempSync(join(tmpdir(), 'chalk-codex-cli-'));
  const workspace = mkdtempSync(join(tmpdir(), 'chalk-codex-review-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(workspace, { recursive: true, force: true }); });
  const binary = join(root, 'provider.mjs'), capture = join(root, 'capture.json');
  writeFileSync(binary, `
    import assert from 'node:assert/strict';
    import {readFileSync,writeFileSync} from 'node:fs';
    const args=process.argv.slice(2), exec=args.indexOf('exec');
    assert.ok(exec > 0, 'global options must precede exec');
    assert.deepEqual(args.slice(0,exec), ['--ask-for-approval','never']);
    assert.equal(args[args.indexOf('--sandbox')+1], 'read-only');
    const schema=JSON.parse(readFileSync(args[args.indexOf('--output-schema')+1]));
    function strict(s) {
      if(s.type==='object') { assert.equal(s.additionalProperties,false); assert.deepEqual([...s.required].sort(),Object.keys(s.properties).sort()); Object.values(s.properties).forEach(strict); }
      if(s.type==='array') { assert.ok(s.items); strict(s.items); }
    }
    strict(schema);
    assert.deepEqual(schema.properties.verdict.enum,['pass','block']);
    assert.deepEqual(schema.properties.findings.items.properties.severity.enum,['high','med','low']);
    assert.ok(schema.properties.decisions.items.properties.rationale);
    writeFileSync(${JSON.stringify(capture)},JSON.stringify({args,input:readFileSync(0,'utf8'),schema}));
    console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({verdict:'block',findings:[{severity:'high',area:'correctness',note:'real finding'}],decisions:[]})}}));
  `);
  const result = runAgent('reviewer', {
    cwd: workspace, context: 'line one\nline two',
    profile: { adapter: 'codex', command: `${JSON.stringify(process.execPath)} ${JSON.stringify(resolve('bin/adapters/codex.mjs'))}`, options: { binary }, capabilities: { roles: ['reviewer'], access: ['read-only'], output: ['json'] } },
  });
  assert.equal(result.status, 'ok', JSON.stringify(result.diagnostics));
  assert.equal(result.structured.verdict, 'block', 'a blocking verdict must survive normalization');
  assert.equal(result.structured.findings[0].note, 'real finding');
  assert.equal(JSON.parse(readFileSync(capture)).input, 'line one\nline two');
});
