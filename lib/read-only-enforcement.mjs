// One production refusal seam shared by Agent Runner and adapter conformance. Callers own workspace
// snapshotting; this module owns the normalized result that no read-only mutation may escape.
export function refuseReadOnlyMutation(role, normalized, changed = []) {
  if (!changed.length) return normalized;
  return {
    ...normalized,
    status: 'failed',
    text: '',
    structured: null,
    diagnostics: [
      ...(Array.isArray(normalized?.diagnostics) ? normalized.diagnostics : []),
      {
        level: 'error',
        code: 'read-only-mutation',
        message: `read-only ${role} changed: ${changed.join(', ')}`,
        retryable: false,
      },
    ],
  };
}
