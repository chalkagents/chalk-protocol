// Release notes — the product-facing record of a release, assembled from the merged work the dev
// cycle produced. These cover the three pure pieces: which done tasks are still unreleased, the
// semver bump implied by their types, and the grouped markdown notes.
import { test } from 'node:test';
import assert from 'node:assert';
import { releasableTasks, bumpVersion, renderReleaseNotes, latestSemverTag } from '../lib/release.mjs';

test('latestSemverTag — highest vX.Y.Z among tags; ignores non-semver; null when none', () => {
  assert.equal(latestSemverTag('v0.1.0\nv0.2.0\nv0.1.9'), '0.2.0');
  assert.equal(latestSemverTag('v1.0.0\nv0.9.9\nrelease-2\nnightly'), '1.0.0', 'numeric compare, junk ignored');
  assert.equal(latestSemverTag(''), null);
  assert.equal(latestSemverTag('v0.0.10\nv0.0.9'), '0.0.10', 'numeric, not lexical');
});

test('releasableTasks — done tasks with no released marker, oldest-first', () => {
  const store = { tasks: () => [
    { id: 'a', state: 'done', doneAt: '2026-01-02', branchType: 'feat' },
    { id: 'b', state: 'done', doneAt: '2026-01-01' },
    { id: 'c', state: 'done', doneAt: '2026-01-03', released: '1.0.0' }, // already shipped
    { id: 'd', state: 'in-progress' },                                    // not done
  ] };
  assert.deepEqual(releasableTasks(store).map((t) => t.id), ['b', 'a'], 'unreleased done tasks, oldest-first');
});

test('bumpVersion — explicit/level wins; else breaking>feat>patch; missing current → 0.0.0 base', () => {
  assert.equal(bumpVersion('1.2.3', [], { version: '9.9.9' }), '9.9.9', 'explicit version wins');
  assert.equal(bumpVersion('1.2.3', [{ branchType: 'fix' }], { level: 'major' }), '2.0.0', 'explicit level wins');
  assert.equal(bumpVersion('1.2.3', [{ branchType: 'feat' }, { branchType: 'fix' }]), '1.3.0', 'any feat → minor');
  assert.equal(bumpVersion('1.2.3', [{ branchType: 'fix' }, { branchType: 'chore' }]), '1.2.4', 'no feat → patch');
  assert.equal(bumpVersion('1.2.3', [{ branchType: 'feat', labels: ['breaking'] }]), '2.0.0', 'breaking → major');
  assert.equal(bumpVersion('1.2.3', [{ branchType: 'feat!' }]), '2.0.0', 'a ! type → major');
  assert.equal(bumpVersion(undefined, [{ branchType: 'fix' }]), '0.0.1', 'missing current starts from 0.0.0');
});

test('renderReleaseNotes — grouped by type under a version+date header, with PR links, empties skipped', () => {
  const notes = renderReleaseNotes([
    { title: 'feat: add sort', branchType: 'feat', pr: { number: 11 } },
    { title: 'fix: off-by-one', branchType: 'fix', pr: { number: 12 } },
    { title: 'chore: bump deps', branchType: 'chore' },
  ], '1.3.0', '2026-06-29');

  assert.match(notes, /## v1\.3\.0 — 2026-06-29/);
  assert.match(notes, /### Features\n- .*add sort.*\(#11\)/);
  assert.match(notes, /### Fixes\n- .*off-by-one.*\(#12\)/);
  assert.match(notes, /bump deps/, 'a chore is listed under its own/other group');
  assert.doesNotMatch(notes, /### Docs/, 'empty groups are skipped');
});
