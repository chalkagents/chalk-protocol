import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertStorage, assertStorageAsync, exactStatIdentity, exactStatMetadata, storageIdentity } from '../lib/verification-record.mjs';

test('exact filesystem metadata distinguishes adjacent identifiers above the safe integer range', () => {
  const base = 9_007_199_254_740_992n;
  const metadata = value => exactStatMetadata({ ino: value, dev: base + 10n, mtimeNs: base + 20n, ctimeNs: base + 30n });
  assert.equal(metadata(base).inode, '9007199254740992');
  assert.equal(metadata(base + 1n).inode, '9007199254740993');
  assert.notDeepEqual(metadata(base), metadata(base + 1n));
  assert.notDeepEqual(exactStatIdentity({ ino: base, dev: 1n }), exactStatIdentity({ ino: base + 1n, dev: 1n }));
});

test('verification storage retains exact filesystem identifiers as strings', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-storage-identity-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const identity = storageIdentity(root);
  assert.equal(typeof identity.inode, 'string');
  assert.equal(typeof identity.device, 'string');
  assert.doesNotThrow(() => assertStorage(root, identity));
  await assert.doesNotReject(() => assertStorageAsync(root, identity));
});
