// Reviewer independence is explicit adapter identity, never command parsing.
import { test } from 'node:test';
import assert from 'node:assert';
import { compareReviewerIndependence } from '../lib/config.mjs';

const protocol = (executorKey, reviewerKey) => ({
  agents: {
    version: 1,
    profiles: {
      executor: { adapter: 'provider-a', command: 'opaque adapter command', identity: executorKey ? { independenceKey: executorKey } : {} },
      reviewer: { adapter: 'provider-b', command: 'another opaque command', identity: reviewerKey ? { independenceKey: reviewerKey } : {} },
    },
    roles: { executor: 'executor', reviewer: 'reviewer' },
  },
});

test('reviewer independence compares only adapter identity keys', () => {
  assert.equal(compareReviewerIndependence(protocol('family-a', 'family-a')).status, 'same');
  assert.equal(compareReviewerIndependence(protocol('family-a', 'family-b')).status, 'distinct');
  assert.equal(compareReviewerIndependence(protocol('', 'family-b')).status, 'unverified');
});

test('command text cannot invent or change reviewer identity', () => {
  const value = protocol('', '');
  value.agents.profiles.executor.command = 'same-provider --model same';
  value.agents.profiles.reviewer.command = 'same-provider --model same';
  assert.equal(compareReviewerIndependence(value).status, 'unverified');
});
