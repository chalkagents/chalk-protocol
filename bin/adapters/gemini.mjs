#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runGeminiAdapter } from '../../lib/adapters/gemini.mjs';
import { conformanceFixtureOutcome, emitConformanceFixture } from '../../lib/adapters/conformance-fixtures.mjs';

const raw = readFileSync(0, 'utf8');
if (!emitConformanceFixture(conformanceFixtureOutcome(raw, 'gemini'))) {
  const response = runGeminiAdapter(raw);
  process.stdout.write(`${JSON.stringify(response)}\n`);
  process.exitCode = response.status === 'ok' || response.status === 'unsupported' ? 0 : 1;
}
