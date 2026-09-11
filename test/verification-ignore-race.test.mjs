import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGitIgnoreRule } from '../lib/verification-command.mjs';

test('an ignore rule restored between Git classification queries becomes a source change', () => {
  assert.deepEqual(classifyGitIgnoreRule({ status: 1, stdout: '' }), { kind: 'source-change' });
  assert.deepEqual(
    classifyGitIgnoreRule({ status: 0, stdout: 'policy\0' + '1\0/ephemeral.js\0ephemeral.js\0' }),
    { kind: 'ignored', pattern: '/ephemeral.js' },
  );
  assert.throws(
    () => classifyGitIgnoreRule({ status: null, stdout: '' }),
    /cannot establish changed input ignore rule/,
  );
});
