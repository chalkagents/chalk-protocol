// Provider environment conventions remain adapter-owned and cannot affect core identity comparison.
import { test } from 'node:test';
import assert from 'node:assert';
import { compareReviewerIndependence } from '../lib/config.mjs';

test('environment model values do not become Protocol v1 reviewer identity', () => {
  const before = process.env.CHALK_OPENCODE_MODEL;
  process.env.CHALK_OPENCODE_MODEL = 'opaque/model';
  try {
    const protocol = {
      executor: { command: 'node adapter-a.mjs' }, review: { command: 'node adapter-b.mjs' },
      agents: { version: 1, profiles: {}, roles: {} },
    };
    assert.equal(compareReviewerIndependence(protocol).status, 'unverified');
  } finally {
    if (before === undefined) delete process.env.CHALK_OPENCODE_MODEL;
    else process.env.CHALK_OPENCODE_MODEL = before;
  }
});
