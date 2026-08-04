#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runClaudeAdapter } from '../../lib/adapters/claude.mjs';
import { conformanceFixtureOutcome, emitConformanceFixture } from '../../lib/adapters/conformance-fixtures.mjs';

const raw = readFileSync(0, 'utf8');
if (!emitConformanceFixture(conformanceFixtureOutcome(raw, 'claude'))) {
  const response = runClaudeAdapter(raw);
  process.stdout.write(`${JSON.stringify(response)}\n`);
  process.exitCode = response.status === 'ok' || response.status === 'unsupported' ? 0 : 1;
}
