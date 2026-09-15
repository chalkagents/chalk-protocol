import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

test('an ignore rule restored between Git classification queries records stale without observer failure', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-ignore-race-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const cli = fileURLToPath(new URL('../bin/chalk.mjs', import.meta.url));
  execFileSync(process.execPath, [cli, 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, '.gitignore'), '/ephemeral.js\n.chalk/local/\n');
  writeFileSync(join(root, 'check.cjs'), 'const fs=require("node:fs");fs.writeFileSync("ephemeral.js","used");setTimeout(()=>fs.unlinkSync("ephemeral.js"),150);setTimeout(()=>{},300);');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' };
  store.saveMeta(meta);

  const shim = join(root, '.chalk', 'local', 'git-shim');
  mkdirSync(shim, { recursive: true });
  const script = join(shim, 'git-shim.cjs'), log = join(root, '.chalk', 'local', 'git-shim.log');
  writeFileSync(script, `const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),args=process.argv.slice(2);
if(args[0]==='check-ignore'&&args.includes('-v')){fs.appendFileSync(${JSON.stringify(log)},'verbose\\n');process.stdin.resume();process.stdin.on('end',()=>process.exit(1));}
else if(args[0]==='check-ignore'&&args[args.length-1]==='ephemeral.js'){fs.appendFileSync(${JSON.stringify(log)},'first\\n');process.stdout.write('ephemeral.js\\n');process.exit(0);}
else{const env={...process.env};env.PATH=env.PATH.split(path.delimiter).filter(p=>p!==env.CHALK_GIT_SHIM_DIR).join(path.delimiter);const r=spawnSync('git',args,{env,stdio:'inherit'});process.exit(r.status??1);}
`);
  const executable = join(shim, 'git');
  writeFileSync(executable, `#!/usr/bin/env node\nrequire(${JSON.stringify(script)});\n`);
  chmodSync(executable, 0o755);
  writeFileSync(join(shim, 'git.cmd'), `@"${process.execPath}" "${script}" %*\r\n`);

  const originalPath = process.env.PATH;
  let result;
  try {
    process.env.CHALK_GIT_SHIM_DIR = shim;
    process.env.PATH = `${shim}${delimiter}${originalPath}`;
    result = verify(store);
  } finally {
    process.env.PATH = originalPath;
    delete process.env.CHALK_GIT_SHIM_DIR;
  }
  assert.equal(result.toolchainGreen, true);
  assert.equal(result.green, false);
  assert.equal(result.freshness, 'stale');
  const command = result.toolchain.find(gate => gate.gate === 'test');
  assert.equal(command.monitorError, null);
  assert.ok(command.inputChanges.includes('ephemeral.js'), JSON.stringify(command));
  assert.match(readFileSync(log, 'utf8'), /first[\s\S]*verbose/);
});
