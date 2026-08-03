#!/usr/bin/env node
// Protocol v1 conformance face for the in-process raw-command compatibility adapter.
import { readFileSync } from 'node:fs';
import { conformanceFixtureOutcome, emitConformanceFixture } from '../../lib/adapters/conformance-fixtures.mjs';
import { failureResponse } from '../../lib/adapters/shared.mjs';

const raw = readFileSync(0, 'utf8');
if (!emitConformanceFixture(conformanceFixtureOutcome(raw, 'raw-command'))) {
  let requestId = 'unknown';
  try { requestId = JSON.parse(raw).requestId || requestId; } catch { /* normalized below */ }
  process.stdout.write(`${JSON.stringify(failureResponse(requestId, 'unsupported', 'conformance-only', 'use Chalk core for raw-command runtime compatibility'))}\n`);
}
