import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReviewFailure,
  REVIEW_TRANSIENT_EXIT,
  reviewFailureIsTransient,
  reviewResultFromAgent,
  TRANSIENT_REVIEW_DIAGNOSTICS,
} from '../lib/review.mjs';

const diagnostic = (code, message, retryable) => ({ level: 'error', code, message, retryable });
const failed = (code, { retryable = false, status = 'failed', usage } = {}) => reviewResultFromAgent({
  status,
  text: 'partial reviewer response',
  structured: null,
  diagnostics: [diagnostic(code, `${code} detail`, retryable)],
  usage: usage || null,
}, { durationMs: 37 });

test('review failures preserve typed diagnostics, duration, and available usage without a verdict', () => {
  for (const code of ['provider-timeout', 'invalid-output', 'permission-denied', 'read-only-mutation']) {
    const result = failed(code, {
      retryable: code === 'provider-timeout',
      status: code === 'provider-timeout' ? 'timeout' : 'failed',
      usage: { inputTokens: 12, outputTokens: 3 },
    });
    assert.equal(result.status, 'error');
    assert.equal(result.verdict, undefined, `${code} cannot become a verdict`);
    assert.equal(result.diagnostics[0].code, code);
    assert.deepEqual(result.invocation, {
      status: code === 'provider-timeout' ? 'timeout' : 'failed',
      durationMs: 37,
      usage: { inputTokens: 12, outputTokens: 3 },
    });
    const rendered = formatReviewFailure(result);
    assert.match(rendered, new RegExp(`\\[${code}\\] ${code} detail`));
    assert.match(rendered, /37 ms/);
    assert.match(rendered, /12 input tokens/);
    assert.match(rendered, /No verdict was accepted/);
  }
});

test('only the documented, explicitly retryable reviewer diagnostic set is transient', () => {
  assert.equal(REVIEW_TRANSIENT_EXIT, 4, 'the subprocess boundary has a distinct transient exit');
  for (const code of TRANSIENT_REVIEW_DIAGNOSTICS) {
    assert.equal(reviewFailureIsTransient(failed(code, { retryable: true })), true, code);
    assert.equal(reviewFailureIsTransient(failed(code, { retryable: false })), false, `${code} must opt in`);
  }
  for (const code of ['invalid-output', 'schema-invalid', 'permission-denied', 'unsupported-capability', 'read-only-mutation', 'approval-inputs', 'unknown-retryable']) {
    assert.equal(reviewFailureIsTransient(failed(code, { retryable: true })), false, `${code} is terminal even if mislabeled retryable`);
  }
  const mixed = failed('provider-timeout', { retryable: true });
  mixed.diagnostics.push(diagnostic('permission-denied', 'credentials cannot be used', false));
  assert.equal(reviewFailureIsTransient(mixed), false, 'one terminal diagnostic prevents retry');
});

test('schema-invalid structured output stays terminal while a valid verdict records invocation metadata', () => {
  const invalid = reviewResultFromAgent({
    status: 'failed', text: '', structured: null,
    diagnostics: [diagnostic('schema-invalid', 'wrong reviewer shape', false)],
    usage: { inputTokens: 4 },
  }, { durationMs: 11 });
  assert.equal(reviewFailureIsTransient(invalid), false);
  assert.equal(invalid.verdict, undefined);

  const valid = reviewResultFromAgent({
    status: 'ok', text: '', structured: { verdict: 'pass', findings: [] }, diagnostics: [],
    usage: { inputTokens: 8, outputTokens: 2 },
  }, { durationMs: 19, approval: { status: 'known' }, inputs: { diff: 'secret body', files: ['lib/a.mjs'] } });
  assert.equal(valid.status, 'ok');
  assert.equal(valid.verdict, 'pass');
  assert.deepEqual(valid.invocation, { status: 'ok', durationMs: 19, usage: { inputTokens: 8, outputTokens: 2 } });
  assert.deepEqual(valid.inputs, { files: ['lib/a.mjs'] }, 'the captured diff body is still not persisted');
});

test('source-integrity failures dominate otherwise valid reviewer output', () => {
  const mutation = reviewResultFromAgent({
    status: 'failed', text: '', structured: null,
    diagnostics: [diagnostic('read-only-mutation', 'read-only reviewer changed: source.mjs', false)],
  }, { freshness: { current: false, reason: 'source changed during review' }, durationMs: 5 });
  assert.equal(mutation.status, 'error');
  assert.equal(mutation.verdict, undefined);
  assert.equal(mutation.diagnostics[0].code, 'read-only-mutation');
  assert.equal(reviewFailureIsTransient(mutation), false);
});
