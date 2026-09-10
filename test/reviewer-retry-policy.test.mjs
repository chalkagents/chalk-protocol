import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReviewWithRetry } from '../lib/review.mjs';

const error = (code, retryable) => ({
  status: 'error',
  diagnostics: [{ level: 'error', code, message: code, retryable }],
});

test('review attempts retry one documented transient failure and remain bounded', () => {
  let calls = 0, notices = 0;
  const result = runReviewWithRetry(() => {
    calls++;
    return error('provider-timeout', true);
  }, { onRetry: () => notices++ });
  assert.equal(result.status, 'error');
  assert.equal(calls, 2);
  assert.equal(notices, 1);
});

test('invalid output, permission refusal, and read-only mutation never retry', () => {
  for (const code of ['schema-invalid', 'invalid-output', 'permission-denied', 'read-only-mutation']) {
    let calls = 0;
    const result = runReviewWithRetry(() => {
      calls++;
      return error(code, true);
    });
    assert.equal(result.status, 'error');
    assert.equal(result.verdict, undefined);
    assert.equal(calls, 1, code);
  }
});

test('a valid second result is accepted only after a transient first result', () => {
  let calls = 0;
  const pass = { status: 'ok', verdict: 'pass', findings: [] };
  const recovered = runReviewWithRetry(() => ++calls === 1 ? error('malformed-structured-output', true) : pass);
  assert.strictEqual(recovered, pass);
  assert.equal(calls, 2);

  calls = 0;
  const invalid = runReviewWithRetry(() => ++calls === 1 ? error('schema-invalid', false) : pass);
  assert.equal(invalid.status, 'error');
  assert.equal(invalid.verdict, undefined);
  assert.equal(calls, 1, 'a later pass cannot be reached by retrying terminal invalid output');
});

test('the pipeline-owned no-retry mode makes exactly one attempt', () => {
  let calls = 0;
  runReviewWithRetry(() => {
    calls++;
    return error('provider-timeout', true);
  }, { retry: false });
  assert.equal(calls, 1);
});
