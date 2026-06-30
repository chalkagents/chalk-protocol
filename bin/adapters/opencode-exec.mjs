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

const args = buildRunArgs(prompt, { model, attach });
const res = spawnSync(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] });
process.exit(res.status ?? 0);
