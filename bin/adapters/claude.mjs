#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runClaudeAdapter } from '../../lib/adapters/claude.mjs';

const response = runClaudeAdapter(readFileSync(0, 'utf8'));
process.stdout.write(`${JSON.stringify(response)}\n`);
process.exitCode = response.status === 'ok' || response.status === 'unsupported' ? 0 : 1;
