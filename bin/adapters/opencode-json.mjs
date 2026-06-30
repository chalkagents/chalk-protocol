#!/usr/bin/env node
// Chalk Protocol — opencode JSON-CONTRACT adapter (review/discovery/feedback roles). Reads the
// prompt from STDIN, appends a strict "JSON only" instruction, runs opencode, and prints PURE JSON.
// On parse success: clean JSON on stdout, exit 0. On failure: raw stdout passed through, exit 1.
// Config via env: CHALK_OPENCODE_BIN (default "opencode"), CHALK_OPENCODE_MODEL, CHALK_OPENCODE_ATTACH.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildRunArgs, extractJson } from '../../lib/opencode.mjs';

const prompt = readFileSync(0, 'utf8');
const wrappedPrompt = prompt +
  '\n\nIMPORTANT: Respond with ONLY a single JSON object. No prose, no explanation, no markdown code fences.';

const bin = process.env.CHALK_OPENCODE_BIN || 'opencode';
const model = process.env.CHALK_OPENCODE_MODEL;
const attach = process.env.CHALK_OPENCODE_ATTACH;

const args = buildRunArgs(wrappedPrompt, { model, attach });
const res = spawnSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const stdout = res.stdout || '';
const obj = extractJson(stdout);
if (obj !== null) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
} else {
  process.stdout.write(stdout);
  process.exit(1);
}
