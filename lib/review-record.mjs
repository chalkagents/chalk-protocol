import { requireCurrentApproval } from './approval-inputs.mjs';
import { digest } from './verification-record.mjs';

// A completed review may outlive publication/network I/O. Append it only when
// its predecessor history still stands, and preserve unrelated current fields.
export function persistReview(store, snapshot, update = () => {}) {
  const review = snapshot.reviews?.at(-1), previous = snapshot.reviews?.slice(0, -1) || [];
  return store.upsertTask(snapshot, { admit(current) {
    if (!current || (current.specRevision || 0) !== (snapshot.specRevision || 0)) throw new Error(`specification changed before review admission — run chalk review ${snapshot.id}`);
    if (digest(current.reviews || []) !== digest(previous)) throw new Error(`review history changed before admission — run chalk review ${snapshot.id}`);
    if (current.pr?.number !== snapshot.pr?.number) throw new Error(`PR changed before review admission — run chalk review ${snapshot.id}`);
    requireCurrentApproval(store, 'review', review, current);
    const accepted = { ...current, reviews: [...(current.reviews || []), review] };
    update(accepted);
    return accepted;
  } });
}
