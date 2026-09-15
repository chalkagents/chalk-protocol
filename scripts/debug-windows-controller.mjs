import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = mkdtempSync(join(tmpdir(), 'chalk-controller-debug-'));
execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
writeFileSync(join(root, 'worker.cjs'), 'console.log("debug worker started");require("fs").writeFileSync(".chalk/local/worker.pid",String(process.pid));setTimeout(()=>{},10000);');
writeFileSync(join(root, 'check.cjs'), 'require("child_process").spawn(process.execPath,["worker.cjs"],{detached:true,stdio:["ignore",1,2]}).unref();');
const request = { cwd: root, gate: 'test', cmd: 'node check.cjs', timeoutMs: 20000,
  stdoutPath: join(root, '.chalk/local/out.log'), stderrPath: join(root, '.chalk/local/err.log') };
const module = pathToFileURL(resolve('lib/verification-command.mjs')).href;
const source = `import {runVerificationCommand} from ${JSON.stringify(module)};try{console.log(JSON.stringify(runVerificationCommand(${JSON.stringify(request)})))}catch(error){console.error(error.stack);process.exitCode=1}`;
const controller = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] });
controller.stdout.pipe(process.stdout); controller.stderr.pipe(process.stderr);
const deadline = Date.now() + 8000;
let workerPid = 0;
while (Date.now() < deadline && !workerPid) {
  try { workerPid = Number(readFileSync(join(root, '.chalk/local/worker.pid'), 'utf8')); } catch { /* not ready */ }
  await new Promise(resolveWait => setTimeout(resolveWait, 25));
}
console.error(JSON.stringify({ root, controllerPid: controller.pid, controllerExitCode: controller.exitCode, workerPid,
  verification: (() => { try { return readdirSync(join(root, '.chalk/local/verification')); } catch (error) { return error.message; } })() }));
if (controller.pid) try { execFileSync('taskkill', ['/pid', String(controller.pid), '/T', '/F']); } catch { /* diagnostic cleanup */ }
if (!workerPid) process.exitCode = 1;
