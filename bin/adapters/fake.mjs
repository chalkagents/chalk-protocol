#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { conformanceFixtureOutcome, emitConformanceFixture } from '../../lib/adapters/conformance-fixtures.mjs';
import { parseAdapterRequest, responseBase } from '../../lib/adapters/shared.mjs';
import { AGENT_ROLES } from '../../lib/config.mjs';

const raw = readFileSync(0, 'utf8');
const fixture = conformanceFixtureOutcome(raw, 'fake');
if (!emitConformanceFixture(fixture)) {
  const parsed = parseAdapterRequest(raw, AGENT_ROLES);
  const response = parsed.request
    ? { ...responseBase(parsed.request, { displayName: 'Chalk fake adapter', independenceKey: 'fake' }), status: 'ok', text: `fake ${parsed.request.role}: ${parsed.request.context}` }
    : parsed.response;
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
