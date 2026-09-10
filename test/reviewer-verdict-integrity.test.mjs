import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewResultFromAgent } from '../lib/review.mjs';

const verdict = { verdict: 'pass', findings: [] };
const diag = (code, retryable = false) => ({ level: 'error', code, message: code, retryable });

test('timeout and permission failures cannot smuggle a structured verdict into review admission', () => {
  for (const [status, diagnostic] of [['timeout', diag('provider-timeout', true)], ['failed', diag('permission-denied')]]) {
    const result = reviewResultFromAgent({
      status,
      text: JSON.stringify(verdict),
      structured: verdict,
      diagnostics: [diagnostic],
      usage: { inputTokens: 9 },
    }, { durationMs: 23 });
    assert.equal(result.status, 'error');
    assert.equal(result.verdict, undefined);
    assert.equal(result.diagnostics[0].code, diagnostic.code);
    assert.deepEqual(result.invocation.usage, { inputTokens: 9 });
  }
});

test('raw-command compatibility still accepts a complete verdict emitted with a non-zero exit', () => {
  const result = reviewResultFromAgent({
    status: 'failed',
    text: JSON.stringify(verdict),
    structured: verdict,
    diagnostics: [diag('nonzero-exit', true), diag('stderr', true)],
  }, { durationMs: 7 });
  assert.equal(result.status, 'ok');
  assert.equal(result.verdict, 'pass');
});

test('a non-zero exit plus any independent terminal diagnostic cannot admit a verdict', () => {
  const result = reviewResultFromAgent({
    status: 'failed',
    text: JSON.stringify(verdict),
    structured: verdict,
    diagnostics: [diag('nonzero-exit', true), diag('read-only-mutation')],
  }, { durationMs: 7 });
  assert.equal(result.status, 'error');
  assert.equal(result.verdict, undefined);
});
