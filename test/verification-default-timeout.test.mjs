import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VERIFICATION_TIMEOUT_MS } from '../lib/verify.mjs';

test('source-bound verification defaults to a fifteen-minute command budget', () => {
  assert.equal(DEFAULT_VERIFICATION_TIMEOUT_MS, 15 * 60 * 1000);
});
