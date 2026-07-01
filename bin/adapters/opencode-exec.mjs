#!/usr/bin/env node
// Chalk Protocol — opencode EXECUTOR adapter. Pipes `chalk context` (STDIN) into `opencode run`
// as the prompt argv, letting opencode edit the working tree directly (stdout/stderr pass through).
// Config via env: CHALK_OPENCODE_BIN (default "opencode"), CHALK_OPENCODE_MODEL, CHALK_OPENCODE_ATTACH.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildRunArgs } from '../../lib/opencode.mjs';

const prompt = readFileSync(0, 'utf8');
const bin = process.env.CHALK_OPENCODE_BIN || 'opencode';
const model = process.env.CHALK_OPENCODE_MODEL;
const attach = process.env.CHALK_OPENCODE_ATTACH;

const args = buildRunArgs(prompt, { model, attach, auto: true }); // the executor edits the working tree
const res = spawnSync(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] });
// A missing binary (ENOENT) leaves status null → exit 0 would be a SILENT no-op that only surfaces later
// as a misleading "verify RED after executor". Fail loudly so the operator sees the real cause.
if (res.error) { console.error(`opencode-exec: could not run '${bin}': ${res.error.message}`); process.exit(127); }
process.exit(res.status ?? 0);
