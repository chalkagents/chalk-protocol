// Stakeholder portal — map the chalk spine to the Chalk Projects portal schema. The whole loop's
// state (tasks, milestones, updates) becomes client-facing portal data, deterministically. These
// cover the scope-state mapping, milestone roll-up, and the update allow-list filtering.
import { test } from 'node:test';
import assert from 'node:assert';
import { portalModel, scopeState } from '../lib/portal.mjs';

const store = (over = {}) => ({
  root: '/nonexistent-no-git',
  meta: () => ({ project: { name: 'Habit Tracker', description: 'Track daily habits.' } }),
  tasks: () => over.tasks || [],
  updates: () => over.updates || [],
});

test('scopeState — done→delivered, in-progress→approved, else→defined', () => {
  assert.equal(scopeState('done'), 'delivered');
  assert.equal(scopeState('in-progress'), 'approved');
  assert.equal(scopeState('specd'), 'defined');
  assert.equal(scopeState('todo'), 'defined');
  assert.equal(scopeState('blocked'), 'defined');
});

test('portalModel — scope items: state map, title cleanup, criteria, verify-on-release', () => {
  const m = portalModel(store({ tasks: [
    { id: 'task-a', title: 'feat: add habit sorting', state: 'done', released: '1.2.0', acceptanceCriteria: [{ text: 'streak desc' }] },
    { id: 'task-b', title: 'Habit reminders', state: 'in-progress', acceptanceCriteria: [] },
  ] }));
  assert.equal(m.slug, 'habit-tracker');
  const a = m.scope[0], b = m.scope[1];
  assert.equal(a.title, 'add habit sorting', 'conventional prefix stripped');
  assert.equal(a.state, 'delivered');
  assert.deepEqual(a.acceptanceCriteria, [{ text: 'streak desc' }]);
  assert.match(a.verify, /1\.2\.0/, 'released → a verify note citing the version');
  assert.equal(b.state, 'approved');
  assert.ok(!('verify' in b), 'unreleased → no verify note');
  assert.ok(!('acceptanceCriteria' in b), 'no empty criteria key');
});

test('portalModel — milestones roll up from task.milestone with a completion status', () => {
  const m = portalModel(store({ tasks: [
    { id: 't1', title: 'A', state: 'done', milestone: 'core', doneAt: '2026-06-01' },
    { id: 't2', title: 'B', state: 'specd', milestone: 'core', createdAt: '2026-06-02' },
    { id: 't3', title: 'C', state: 'done', milestone: 'polish', doneAt: '2026-06-03' },
  ] }));
  const core = m.milestones.find((x) => x.title === 'core');
  const polish = m.milestones.find((x) => x.title === 'polish');
  assert.equal(core.status, 'in-progress', '1 of 2 done');
  assert.equal(core.project, 'habit-tracker');
  assert.match(core.id, /^ms-habit-tracker-core$/);
  assert.ok(core.dueDate, 'a best-effort dueDate is set');
  assert.equal(polish.status, 'completed', 'all done');
});

test('portalModel — updates filtered to the client-safe allow-list; internal events DROPPED, not leaked', () => {
  const m = portalModel(store({ updates: [
    { id: 'evt-1', at: '2026-06-01T00:00:00Z', type: 'work-item-accepted', title: 'Merged sort', actorRole: 'agent' },
    { id: 'evt-2', at: '2026-06-02T00:00:00Z', type: 'lesson-learned', title: 'INTERNAL NOTE' }, // not client-safe → dropped
    { id: 'evt-3', at: '2026-06-03T00:00:00Z', type: 'milestone-hit', title: 'v1 shipped' },
  ] }));
  assert.equal(m.updates.length, 2, 'the internal lesson-learned event is dropped');
  assert.deepEqual(m.updates.map((u) => u.type), ['work-item-accepted', 'milestone-hit']);
  assert.ok(!JSON.stringify(m.updates).includes('INTERNAL NOTE'), 'no internal title leaks to the client');
  assert.ok(m.updates.every((u) => u.id && u.project === 'habit-tracker' && u.at && u.title && u.actorRole), 'required fields present');
});
